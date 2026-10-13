# 财务管理系统 - 开发交接文档

> **目标读者**:接手的工程师
> **阅读时间**:20 分钟上手,2 小时能改 BUG
> **配套文档**:`docs/ARCHITECTURE.md` / `DEPLOY.md` / `DEV-GUIDE.md` / `API-REFERENCE.md` / `系统使用说明.md`

---

## 0. 30 秒项目速览

一套**中小企业财务管理系统**,按《小企业会计准则》设计,覆盖建账 → 凭证 → 账簿 → 报表 → 期末结账 全流程,旁支应收应付 / 发票 / 资金 / 报销 / 资产 / 看板。

| | |
|---|---|
| 前端 | Vue 3 + Vite + Element Plus + ECharts + Pinia |
| 后端 | NestJS 10 + Prisma 6 + PostgreSQL 17 |
| 鉴权 | JWT (access 15 分钟 + refresh 7 天) + jti 黑名单 |
| 部署 | 单机 `bash scripts/start-prod.sh`,前后端同源 |
| 浏览器 | 桌面 Chrome/Edge/Safari + 手机 H5 自适应 |

---

## 1. 代码地图(按读代码顺序)

```
FinancialManagement/
├── README.md                # 项目门面,先看这个
├── docs/                    # 你在这里
│   ├── HANDOVER.md          # 本文档
│   ├── ARCHITECTURE.md      # 架构/模块/数据流
│   ├── DEPLOY.md            # 生产部署/备份恢复
│   ├── DEV-GUIDE.md         # 开发规范/调试/常见坑
│   ├── API-REFERENCE.md     # REST API 全清单
│   ├── 系统使用说明.md       # 用户手册(也集成进 /help 页面)
│   ├── 财务管理系统开发文档.md  # 总体设计
│   ├── 开发详细设计文档.md    # 详细设计(架构/数据模型/算法)
│   ├── 验收报告.md           # 验证数据
│   ├── 不足与优化计划.md     # 已知 P2 改进
│   └── 工作日记.md           # 历次开发要点
├── server/                  # 后端
│   ├── prisma/
│   │   ├── schema.prisma    # 20+ 张表(必读,先看这)
│   │   └── seed.ts          # 种子(幂等)
│   ├── src/
│   │   ├── main.ts          # 启动入口
│   │   ├── app.module.ts    # 根模块,imports 8 个业务模块
│   │   ├── prisma.service.ts
│   │   ├── common/          # 拦截器/守卫/装饰器/通用工具
│   │   │   ├── decorators.ts    # @CurrentUser @CurrentTid @Perm @OpLog
│   │   │   ├── guards.ts        # JwtAuthGuard PermsGuard
│   │   │   ├── interceptors.ts  # EnvelopeInterceptor + AllExceptionsFilter
│   │   │   ├── excel.ts         # exceljs 导出
│   │   │   └── auth.service.ts  # jti 黑名单 + 限流
│   │   ├── constants/       # 预置科目/角色权限/报表公式
│   │   └── modules/
│   │       ├── auth/        # 登录/刷新/切账套
│   │       ├── system/      # 用户/角色/账套/日志/备份
│   │       ├── masterdata/  # 科目/部门/项目/员工/往来
│   │       ├── ledger/      # 期初/凭证/期末/余额
│   │       ├── report/      # 报表(资产负债表/利润表/余额表/明细账)
│   │       └── business/    # 应收应付/发票/资金/报销/资产/看板
│   └── scripts/e2e.mjs      # 端到端 44 断言
├── web/                     # 前端
│   ├── vite.config.ts       # dev proxy /api → :3100
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── style.css        # 全局样式(毛玻璃/渐变/暗色)
│   │   ├── api/
│   │   │   ├── client.ts    # axios 实例 + interceptor
│   │   │   └── modules.ts   # 所有 API 集中定义(必看)
│   │   ├── stores/
│   │   │   ├── auth.ts      # token + user + tenants
│   │   │   └── tenant.ts
│   │   ├── router/index.ts  # 路由 + 权限守卫
│   │   ├── layout/MainLayout.vue
│   │   ├── components/      # PageHeader/SectionCard/...
│   │   ├── views/           # 各业务页
│   │   │   ├── Dashboard.vue
│   │   │   ├── Login.vue
│   │   │   ├── system/      # Tenants/Health/Users/Roles/...
│   │   │   ├── ledger/      # 期初/凭证/期末
│   │   │   ├── base/        # 主数据
│   │   │   ├── arap/        # 应收应付
│   │   │   ├── invoice/     # 发票
│   │   │   ├── fund/        # 资金
│   │   │   ├── expense/     # 报销
│   │   │   ├── asset/       # 资产
│   │   │   ├── report/      # 报表
│   │   │   ├── voucher/     # 录入凭证
│   │   │   └── help/        # 使用说明
│   │   ├── utils/
│   │   │   ├── exporter.ts  # 通用 Excel 导出
│   │   │   └── format.ts
│   │   └── config/demo.ts   # 演示账号开关
│   └── public/
├── scripts/
│   ├── dev.sh              # 开发模式(后端 3100 + 前端 5173 HMR)
│   └── start-prod.sh       # 生产模式(后端 3100 + 前端 vite preview)
└── package.json             # 根(workspaces)
```

---

## 2. 5 分钟核心架构(必懂)

### 2.1 响应统一格式

所有 JSON 走 `EnvelopeInterceptor` 包装:

```json
{ "code": 0, "message": "ok", "data": <业务数据> }
```

- `code: 0` 成功;`code: 4xxxx` 业务错误;`code: 5xxxx` 系统错误
- 业务异常 throw `HttpException`,自动被 `AllExceptionsFilter` 接住并按此格式输出
- 详情看 `server/src/common/interceptors.ts`

### 2.2 多账套隔离

每次请求**必须**带 tenantId。两种方式:

| 方式 | 来源 | 用途 |
|---|---|---|
| JWT payload.tc | 登录时所在账套 | 绝大多数接口 |
| URL 路径 `/:id` | 路径参数 | 仅 `system/*` 的跨账套管理接口 |

装饰器 `@CurrentTid()` 直接取 JWT 里的 tc,**所有业务查询都必须带 tenantId**。**越权防御**:`prisma.findFirst({ where: { id, tenantId } })` 而不是 `findUnique`,杜绝改 URL 跨账套攻击。

### 2.3 权限

```
装饰器 @Perm('voucher:create')
  ↓
PermsGuard: 反射 PERM_KEY 拿 required[]
  ↓
auth.hasPerm(required): 任一命中即过(any-of 语义)
  ↓
isSuper 永远 true
```

- 6 个内置角色见 `server/src/constants/roles.ts`
- 权限目录见 `server/src/constants/perms.ts`
- 路由级 + 按钮级**双层校验**

### 2.4 凭证引擎(`server/src/modules/ledger/voucher.service.ts`)

**最复杂模块**,约 1000 行。核心:
- `create(input)`:校验借贷平衡、辅助核算、期间开放,事务里建 voucher + entries
- `audit(id, userId)`:状态机 草稿→已记账;R7 制单人≠审核人硬约束
- `reverse(id, userId, date)`:R6 已记账只能红冲,生成反向凭证,**不删原凭证**(审计轨迹)
- `update(id, input)`:草稿/待审可改,**entries 用 update 保留 id**(不删建,避免破坏明细账)
- 状态机:0 草稿 / 1 待审核 / 2 已记账 / 6 驳回 / 7 撤回

### 2.5 余额计算(`server/src/modules/ledger/balance.ts`)

- 纯函数式,无副作用
- 期初 + 本期发生 = 期末
- DECIMAL 字符串,JavaScript Decimal.js 兜底(后端用 Prisma Decimal)
- 关键:资产负债表里**未分配利润 = 3103 余额 + 当年未结转损益**,保证任意时刻都平衡

### 2.6 期末结账(`server/src/modules/ledger/closing.service.ts`)

四道闸门(R9):上期已结 / 无草稿待审 / 损益已结 / 试算平衡。任一红 ✗ 不能结。

### 2.7 前端关键机制

| 机制 | 文件 | 说明 |
|---|---|---|
| 路由权限 | `router/index.ts` `beforeEach` | 路由级 `meta.perm` 拦截 |
| Pinia auth | `stores/auth.ts` | `isSuper` getter + `hasPerm(codes)` any-of |
| Axios interceptor | `api/client.ts` | 自动 Bearer + 自动解 envelope |
| 通用导出 | `utils/exporter.ts` | 用 fetch 走 Blob + JSON 错误检测 |
| 演示账号 | `config/demo.ts` | `VITE_ENABLE_DEMO=true` 才显示 |

---

## 3. 演示账号(开发 / 演示用)

| 账号 | 密码 | 角色 | 能做什么 |
|---|---|---|---|
| admin | Admin@123 | 系统管理员 | 全部 19 项权限,跨账套管理 |
| cfo | Cfo@123 | 财务主管 | 14 项,审核/结账/全部报表/大额审批 |
| zhangsan | Acc@123 | 会计 | 7 项,录凭证/红冲/核销/折旧 |
| lisi | Cash@123 | 出纳 | 3 项,银行对账/付款 |
| wangwu | Emp@123 | 员工 | 1 项,我的报销 |
| boss | Boss@123 | 总经理 | 3 项,看板/大额审批 |

**生产环境务必**:
1. `web/.env` 设 `VITE_ENABLE_DEMO=false` 或不设
2. `server/.env` 设 `JWT_SECRET=...` 强随机
3. `DATABASE_URL` 改强密码
4. 用 admin 改掉所有默认密码

---

## 4. 启动 / 验证 / 测试

### 4.1 首次启动

```bash
# 1. 创建数据库
psql -h 127.0.0.1 -U zhouchao -d postgres -c "CREATE DATABASE financial_mgmt ENCODING 'UTF8';"

# 2. 后端
cd server
pnpm install
pnpm exec prisma db push
pnpm run db:seed          # 幂等,可重复跑

# 3. 启动(开发)
bash scripts/dev.sh       # 后端 :3100 + 前端 :5173 HMR

# 4. 启动(生产演示)
bash scripts/start-prod.sh
```

### 4.2 关键验证

```bash
# 单元测试
cd server && pnpm run test

# 端到端(E2E 44 断言,涵盖认证/凭证/红冲/报表/结账/核销/对账/报销/折旧)
cd server && node scripts/e2e.mjs

# 浏览器烟雾测
open http://localhost:5173
# admin / Admin@123 → 应能进入"系统管理"
# 各模块点一遍,看 console 无 error
```

### 4.3 手工冒烟清单

- [ ] admin 登录 → 看到"系统管理"
- [ ] cfo 登录 → 凭证列表 → 审核一张草稿凭证
- [ ] zhangsan 录一张借贷平的凭证 → 提交
- [ ] cfo 期末处理 → 结转损益 → 计提折旧 → 结账
- [ ] wangwu 报销申请 → 提交 → 看状态机
- [ ] 任意业务页 → 点"导出 Excel" → 下到 .xlsx,Mac 双击能开

---

## 5. 接手第一个任务怎么改

### 5.1 加个新权限

1. `server/src/constants/perms.ts` 加 `'expense:export'`
2. `server/src/constants/roles.ts` 角色定义里加
3. `web/src/api/modules.ts` 如有 API 调用,加 `exportXxx`
4. 业务 controller 加 `@Perm('expense:export')`
5. 前端按钮 `v-perm="['expense:export']"` 或 `auth.hasPerm('expense:export')`

### 5.2 加个新业务表

1. `server/prisma/schema.prisma` 加 model
2. `pnpm exec prisma db push`(开发)或 `prisma migrate`(生产)
3. `server/src/modules/<name>/` 建模块(`*.module.ts` `*.service.ts` `*.controller.ts`)
4. `server/src/app.module.ts` 注册
5. `web/src/views/<name>/` 建页面
6. `web/src/api/modules.ts` 加 API
7. `web/src/router/index.ts` 加路由

### 5.3 加个新报表

1. `server/src/constants/reports.ts` 加公式(行/列映射)
2. `server/src/modules/report/` 加查询方法 + xlsx 构建
3. `web/src/views/report/<NewReport>.vue` 页面
4. 路由 + 菜单

### 5.4 改字段

⚠️ **改 schema 必须**:
1. 改 `schema.prisma` → `prisma db push`(开发) / `migrate`(生产)
2. 全局搜旧字段名,改 service / controller / 前端
3. seed.ts 改示例数据
4. `e2e.mjs` 看断言是否还过

---

## 6. 核心不变量(改了会出 BUG)

- ✅ 每张凭证借贷必平且至少两行(R1)
- ✅ 已记账只能红冲不能改(R6)
- ✅ 制单人不审核自己(R7)
- ✅ 反审核需期间未结 + 无下游引用(R8)
- ✅ 结账需四项全过(R9)
- ✅ 当月新增资产不提折旧、提足自停(R14)
- ✅ 全程 DECIMAL 运算,尾差 ≤0.01 自动消化(R15)
- ✅ 跨账套访问必须经 tenantId 过滤(11 处越权防御点)

---

## 7. 紧急排查路径

| 症状 | 先看 |
|---|---|
| 500 Internal Server Error | `bash-29` 后端日志 + Prisma 异常栈 |
| 401 Unauthorized | JWT 过期 / 黑名单 / 没带 token |
| 403 Forbidden | 角色 perm 不够 / 越权防御 reject |
| 前端白屏 | 浏览器 F12 + Vite HMR 是否编译报错 |
| 导出空文件 | 看 `utils/exporter.ts` fetch 是否成功 + response.content-type |
| 凭证不能保存 | 借贷不平 / 末级科目 / 辅助核算必选 / 跨期 |
| 资产负债表不平 | 几乎不可能,先看 `未分配利润` 是不是 0 → 走 3103 科目余额检查 |
| 结账点不动 | 期末处理页检查清单 4 项 |
| 报销状态卡住 | 看审批流配置 `gmExpenseThreshold` 参数 |

**健康检查页**:`http://localhost:5173/system/health`(admin 可见),一键 ping 所有关键接口 + 导出端点 + 给出排查建议。

---

## 8. 文件改动索引(2026-08-29 重大更新)

| 文件 | 改动 | 影响 |
|---|---|---|
| `server/src/common/excel.ts` | SpreadsheetML 2003 → **exceljs OOXML** | 真正 .xlsx,Mac/WPS/Excel 全兼容 |
| `server/src/common/interceptors.ts` | EnvelopeInterceptor 加 ResponseSentError 拦截 + headersSent 二次保护 | controller `res.end` 后不再二次发包 |
| `web/src/utils/exporter.ts` | axios+blob → **原生 fetch** | 内容类型检测,避开 interceptor blob 误判 |
| `web/src/views/system/Tenants.vue` | `validate().catch(()=>Promise.reject())` → `.catch(()=>false)` + 显式提示 | 校验失败不再 silent fail |
| `server/src/modules/system/*` | 账套完整 CRUD + 启停 + 删除 + 越权防御 | 多账套可上线 |
| `web/src/config/demo.ts` | 演示账号集中 + VITE_ENABLE_DEMO 开关 | 生产隐藏演示账号 |
| `web/vite-mock-plugin.ts` | 加 `apply: 'serve'` | 生产 build 绝不再注册 |

**E2E**:44/44 断言通过(最近一次)。

---

## 9. 联系与回滚

| | |
|---|---|
| 仓库 | 当前目录 `FinancialManagement/` |
| 部署 | 见 `docs/DEPLOY.md` |
| 数据备份 | `pg_dump` 自定义格式,恢复见 README |
| 紧急回滚 | `git log --oneline -10` → `git revert <hash>` 或 `git reset --hard <prev>`(慎) |

---

**别忘了读 `docs/ARCHITECTURE.md` 看清模块依赖,再动手改代码**。
