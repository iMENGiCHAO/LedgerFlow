# 架构文档

> **目标读者**:接手的工程师 / 架构师
> **前置**:`HANDOVER.md` 至少读完 §2 核心架构

---

## 1. 总览

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器(桌面 / 手机 H5)                                       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│  Vite Preview(生产) / Vite Dev(开发,代理到 :3100)              │
│  静态 SPA  ──  /api/v1/* 代理  ──  NestJS                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  NestJS 应用 (:3100)                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Middleware: CORS / Helmet / Body Parser               │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Interceptor: EnvelopeInterceptor(统一响应包装)         │  │
│  │             OpLogInterceptor(操作日志)                │  │
│  │ Filter: AllExceptionsFilter(统一错误)                  │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Guard: JwtAuthGuard → PermsGuard                      │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Controllers: 8 模块(详见 §3)                          │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Services: 业务逻辑(纯 TS 函数)                         │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Prisma Client → PostgreSQL 17                         │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  PostgreSQL 17 (单库,多账套以 tenantId 隔离)                  │
│  20+ 表(详见 schema.prisma)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 模块划分

### 2.1 后端 8 个模块

| 模块 | 路径 | 职责 | 关键文件 |
|---|---|---|---|
| **AppModule** | `src/app.module.ts` | 根模块,导入 8 个业务模块 + 全局拦截器/守卫 |  |
| **AuthModule** | `modules/auth/` | 登录/刷新/切账套/登出 | `auth.service.ts`(jti 黑名单 + 限流) |
| **SystemModule** | `modules/system/` | 用户/角色/账套/日志/备份 | `system.service.ts`(账套完整 CRUD) |
| **MasterdataModule** | `modules/masterdata/` | 科目/部门/项目/员工/往来 | `masterdata.service.ts` |
| **LedgerModule** | `modules/ledger/` | 期初/凭证/期末/余额 | `voucher.service.ts`(引擎) `balance.ts` |
| **ReportModule** | `modules/report/` | 资产负债表/利润表/余额表/明细账 | `report.controller.ts` |
| **BusinessModule** | `modules/business/` | 应收应付/发票/资金/报销/资产/看板 | 6 个 service |
| **Common** | `src/common/` | 拦截器/守卫/装饰器/excel | 跨模块复用 |

### 2.2 前端 4 层

```
┌─────────────────────────────────────────────┐
│ views/      业务页(13+ 个)                   │  ← 用户操作
├─────────────────────────────────────────────┤
│ components/ 复用 UI(PageHeader/SectionCard)  │  ← 视觉
├─────────────────────────────────────────────┤
│ stores/     Pinia(auth/tenant)              │  ← 全局状态
│ router/     vue-router 4 + 权限守卫         │
├─────────────────────────────────────────────┤
│ api/        axios 客户端 + 集中式 API 声明  │  ← 数据访问
│ utils/      通用工具(导出/格式化)            │
└─────────────────────────────────────────────┘
```

---

## 3. 数据模型(ER 概览)

```
User ──< UserTenant >── Tenant
                  │
                  ├──< Period(会计期间)
                  │     └──< Voucher(凭证)
                  │              └──< VoucherEntry(分录)
                  │                       └──> Subject
                  ├──< Subject(科目,balanceDir/assist/category)
                  ├──< Partner(往来单位)
                  ├──< Department(部门)
                  ├──< Project(项目)
                  ├──< Employee(员工)
                  ├──< ArApBill(应收/应付/收款/付款)
                  │     └──< Writeoff(核销)
                  ├──< Invoice(发票)
                  ├──< FundAccount(资金账户)
                  │     └──< BankStatement(对账单)
                  ├──< ExpenseClaim(报销单)
                  │     └──< ExpenseItem(明细)
                  ├──< FixedAsset(固定资产)
                  │     └──< DepreciationRecord
                  └──< OperationLog
```

详见 `server/prisma/schema.prisma`(必读)。

---

## 4. 关键数据流

### 4.1 登录流程

```
浏览器 POST /auth/login {username, password}
  → LoginThrottle 限流检查(3次/分,5次/30分)
  → AuthService.login
    → bcrypt 验证
    → JwtService.sign({uid, tc=firstTenantId, jti}) 15min
    → JwtService.sign({uid, tc, jti, type:refresh}) 7d
    → {accessToken, refreshToken, user, tenants, currentTenantId}
  → 前端 setAuth → 存 localStorage
  → 路由跳转
```

### 4.2 凭证创建(最复杂)

```
POST /vouchers { date, word, entries:[{subjectId, debit/credit, summary, aux}] }

VoucherController.create
  → @CurrentTid → tenantId
  → @CurrentUser → user
  → VoucherService.create(tenantId, user, input)
    → tx.$.begin
    → 1. 校验期间开放(期初建账后)
    → 2. 校验借贷平衡(每分录借或贷,合计相等)
    → 3. 校验末级科目(不能是父级)
    → 4. 校验辅助核算(带 ⚠ 标记必须填)
    → 5. 校验跨期(制单日不能早于启用期)
    → 6. 序号生成(word 期内累加 1)
    → 7. tx.voucher.create + tx.voucherEntry.createMany
    → 8. DashboardService.invalidate(tenantId)  // 看板缓存
    → tx.$.commit
  → return voucher(全 include)
```

### 4.3 期末结账

```
POST /closing/close {year, month}

ClosingService.close(tenantId, year, month)
  → 闸门 1: 上一期间 status=closed
  → 闸门 2: 本期无草稿/待审凭证
  → 闸门 3: 损益已结转(检查 4101/4102/4103 余额为 0)
  → 闸门 4: 试算平衡(所有末级科目借贷合计)
  → 任一红 → throw BadRequest
  → Period.update status=closed
  → OpLog 留痕
```

### 4.4 Excel 导出(共 14 个端点)

```
GET /vouchers?format=xlsx  (controller 内分支)

if (q.format === 'xlsx'):
  list = await vouchers.listAll(tenantId, q)  // 不分页
  buf = await buildXlsx({...})                // exceljs
  sendXlsx(res, buf, filename)                 // res.end + throw ResponseSentError
  // ↑ marker 被 EnvelopeInterceptor + AllExceptionsFilter 双重保护,不会再 res.json

兜底: 任何 xlsx 端点都返回 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

---

## 5. 安全模型

### 5.1 认证

- **JWT access**(15 min)+ **refresh**(7 day)
- jti 入黑名单 → 登出立即失效
- refresh 单独签名,黑名单同步

### 5.2 授权

- **三层校验**:
  1. 路由级 `meta.perm`(`router.beforeEach`)
  2. Controller 级 `@Perm('xxx:yyy')` + PermsGuard
  3. Service 级 `prisma.findFirst({ where: { id, tenantId } })` 越权防御

### 5.3 数据隔离

- 所有业务表都有 `tenantId` 字段
- **不带 tenantId 的查询视为 bug**(代码 review 必查)
- 跨账套管理接口只在 `system/*` 走 `isSuper` 检查

### 5.4 输入校验

- 路由 DTO 用 `class-validator`(NestJS 内置)
- 业务层再校验(如期间/辅助核算)
- 附件上传:白名单 mime + 大小限制

### 5.5 限流

- 登录:3次/分,5次/30分(内存,重启清空)
- 后续可上 Redis

---

## 6. 性能优化

| 优化 | 实现 | 位置 |
|---|---|---|
| 凭证列表不分页 entries | `select` 排除 entries,只查主表 + 合计 | `voucher.service.list` |
| 余额计算 | 纯函数,可缓存 | `balance.ts` |
| Dashboard 缓存 | 30s 内存,业务变更时 invalidate | `dashboard.service.ts` |
| 大文件上传 | 流式 `multer` 内存限制 | `system.controller` |
| 前端 | 路由懒加载 / Vite 自动 code split | `router/index.ts` |
| 前端导出 | fetch 流式下载,不占内存 | `utils/exporter.ts` |

---

## 6a. 2026-10 新增架构(本轮交付加固)

### 6a.1 AI 智能体接入(MCP)
独立进程 `server/src/mcp/server.ts`(stdio 传输,`pnpm run mcp` 启动):
官方 @modelcontextprotocol/sdk,暴露 10 个财务工具;**全部调用走既有 REST API**
(登录换 JWT → HTTP),因此鉴权/RBAC/操作日志/借贷平衡/期间锁/制审分离零旁路;
create_voucher 支持 departmentName 按档案名称匹配部门辅助。冒烟:`scripts/mcp-smoke.mjs`(真实 JSON-RPC,已入 CI)。

### 6a.2 附件存储抽象
`server/src/common/attachment-store.ts`:接口 + LocalDiskStore(默认,历史绝对路径兼容)
+ S3Store(动态 require @aws-sdk/client-s3);`ATTACHMENT_DRIVER=local|s3` 切换;
数据库只存逻辑键 `YYYY-MM/uuid.ext`,换后端零迁移。

### 6a.3 令牌安全
- refresh 端点吊销校验(注销后 refresh 立即失效);
- TokenBlacklist 双写(内存热路径 + TokenRevocation 落库,启动恢复,重启不复活);
- 前端 401 静默续期(单飞刷新 + 请求重放一次)。

### 6a.4 工资核算
PayrollBatch/PayrollItem 双模型;计提按员工部门拆分借方(辅助核算强校验);
**红冲工资凭证自动回退批次状态**(计提凭证红冲→编辑中;发放凭证红冲→已计提),
联动点在 voucher.service.redFlush,防账实脱节。

### 6a.5 现金流量表
`constants/cash-flow.ts`(32 行表样 + 科目前缀映射) + `report/cashflow-classify.ts`
(对方科目归集法纯函数:现金↔现金跳过、一对多按比例分摊、未映射落其他经营);
勾稽:净增加额 = 期末现金余额 − 期初(±0.01)。单测 10 项覆盖归集边界。

### 6a.6 观测与 CI
访问日志一行 JSON(>1s 标 slow);health 暴露 runtime/metrics/db 延迟;
GitHub Actions:PG16 service + 单测 31 + E2E 44 + 隔离审计 10 + MCP 冒烟 8 + 双端构建。

## 7. 已知架构决策(为什么这么做)

| 决策 | 取舍 |
|---|---|
| 单库多账套(不是多库) | 运维简单 / 隔离弱,适合 SMB;大型企业建议分库 |
| Prisma Decimal | 财务精度必须,但查询慢;不能换 number |
| Excel 用 exceljs 自写 | 0 第三方 SaaS,数据不出本地;但复杂样式不灵活 |
| Element Plus | 中文生态成熟 / 体积大 |
| 不用微服务 | 一期规模没必要;后续按模块拆 NestJS 应用 |
| JWT 黑名单内存 | 简单,重启失效可接受;生产可换 Redis |
| 内置 jti 黑名单 | 不上 Redis,够用 |

---

## 8. 部署拓扑(参考)

```
单机(开发 / 中小企):
  1 个 Node.js 进程 = 后端
  1 个静态文件服务器(Vite preview) = 前端
  1 个 PostgreSQL

推荐(企业生产):
  Nginx 反向代理(SSL 终止)
    ├─ /api/v1/* → NestJS (PM2 / systemd,多实例)
    └─ /* → 前端静态文件
  PostgreSQL 主从 + 每日 pg_dump 备份
  对象存储(附件)→ MinIO / S3
```

详细见 `DEPLOY.md`。
