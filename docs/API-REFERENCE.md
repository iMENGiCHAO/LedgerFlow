# API 接口清单

> **基址**:`http://<host>:3100/api/v1`
> **鉴权**:除 `/auth/login` `/auth/refresh` 外,均需 `Authorization: Bearer <token>`
> **统一响应**:`{ code: 0, message: 'ok', data: <T> }` (code ≠ 0 即错误)
> **错误码**:`code: 4xxxx` 业务错误;`code: 5xxxx` 系统错误
> **多账套**:除 `system/*` 外,所有业务接口都从 JWT 取 `tenantId`,无需显式传

---

## 0. 通用约定

| | |
|---|---|
| 时间 | ISO 8601 字符串(`2026-08-29T12:34:56.000Z`) |
| 金额 | 后端返回 **字符串**(DECIMAL),前端按需转 Number |
| 分页 | `?page=1&pageSize=20`,响应 `{ total, page, pageSize, list }` |
| 导出 | `?format=xlsx`,返回 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| 错误 | `{ code: 4xxxx, message: '人类可读的错误', data: null \| {} }` |

---

## 1. 认证 Auth

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/auth/login` | 公开 | `{username, password}` → `{accessToken, refreshToken, user, tenants, currentTenantId}` |
| POST | `/auth/refresh` | 公开 | `{refreshToken}` → 新 accessToken |
| POST | `/auth/logout` | 已登录 | jti 加入黑名单 |
| GET  | `/auth/profile` | 已登录 | 当前用户信息 |
| POST | `/auth/password` | 已登录 | `{oldPassword, newPassword}` |
| POST | `/auth/switch-tenant` | 已登录 | `{tenantId}` → 新 accessToken(带新 tc) |

### 限流
- 登录:`3 次/分`,`5 次/30 分`,内存限流,重启清空

---

## 2. 系统 System

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/system/params` | 已登录 | `{gmExpenseThreshold, ...}` |
| PUT  | `/system/params` | `system:user` | 改系统参数 |
| GET  | `/system/users` | `system:user` | 用户列表(分页 + keyword) |
| POST | `/system/users` | `system:user` | 新建用户 |
| PUT  | `/system/users/:id` | `system:user` | 改用户(角色/账套/启停) |
| POST | `/system/users/:id/reset-password` | `system:user` | 管理员重置密码 |
| GET  | `/system/roles` | `system:user` | 角色列表(含 perms) |
| POST | `/system/roles` | `system:user` | 新建角色 |
| PUT  | `/system/roles/:id` | `system:user` | 改角色(权限勾选) |
| GET  | `/system/perms-catalog` | 已登录 | 权限目录(前端勾选用) |
| GET  | `/system/operation-logs` | `system:user` | 操作日志(分页 + 筛选) |
| GET  | `/system/backup` | `system:user` | 备份列表 |
| POST | `/system/backup` | `system:user` | 一键 pg_dump,返回下载链接 |
| GET  | `/system/health` | 已登录 | 健康检查端点 |

### 账套(多账套管理)

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/tenants/my` | 已登录 | 我可见的账套列表 |
| GET  | `/tenants` | isSuper | 全部账套 |
| GET  | `/tenants/current` | 已登录 | 当前账套企业信息 + params |
| PUT  | `/tenants/current` | 已登录 | 改当前账套企业信息 |
| POST | `/tenants` | isSuper | 新建账套 |
| PUT  | `/tenants/:id` | isSuper | 改任意账套(超管) |
| POST | `/tenants/:id/activate` | `ledger:init` | 启用账套(校验期初平衡) |
| POST | `/tenants/:id/deactivate` | `ledger:init` | 停用账套 |
| DELETE | `/tenants/:id` | isSuper | 删除账套(需先停用 + 无业务数据) |

---

## 3. 主数据 Masterdata

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/subjects/tree` | 已登录 | 科目树(支持 `?root=1001` 子树) |
| GET  | `/subjects/list` | 已登录 | 末级科目扁平列表(用于凭证录入) |
| POST | `/subjects` | `md:manage` | 新建科目(末级) |
| PUT  | `/subjects/:id` | `md:manage` | 改科目 |
| DELETE | `/subjects/:id` | `md:manage` | 删科目(无引用时) |
| GET  | `/departments` | 已登录 | 部门列表 |
| POST | `/departments` | `md:manage` | 新建 |
| PUT  | `/departments/:id` | `md:manage` | 改 |
| DELETE | `/departments/:id` | `md:manage` | 删 |
| GET  | `/projects` | 已登录 | 项目列表 |
| POST/PUT/DELETE | `/projects` 系列 | `md:manage` | 同上 |
| GET  | `/employees` | 已登录 | 员工列表 |
| POST/PUT/DELETE | `/employees` 系列 | `md:manage` | 同上 |
| GET  | `/partners` | 已登录 | 往来单位(支持 `?type=1` 客户) |
| POST/PUT/DELETE | `/partners` 系列 | `md:manage` | 同上 |

> 所有 GET 都支持 `?format=xlsx` 导出

---

## 4. 账簿 Ledger

### 4.1 凭证

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/vouchers` | `ledger:view` | 列表(分页 + 筛选) |
| GET  | `/vouchers/:id` | `ledger:view` | 详情(完整 entries) |
| POST | `/vouchers` | `voucher:create` | 新建(草稿) |
| PUT  | `/vouchers/:id` | `voucher:create` | 改(草稿/驳回) |
| POST | `/vouchers/:id/submit` | `voucher:create` | 提交(草稿 → 待审) |
| POST | `/vouchers/:id/audit` | `voucher:audit` | 审核记账(制单人 ≠ 审核人) |
| POST | `/vouchers/:id/unaudit` | `voucher:audit` | 反审核(期间未结 + 无下游) |
| POST | `/vouchers/:id/reverse` | `voucher:audit` | 红冲(已记账 → 生成反向凭证) |
| POST | `/vouchers/:id/void` | `voucher:audit` | 作废(草稿/驳回) |
| GET  | `/vouchers?format=xlsx` | `ledger:view` | 导出 Excel |
| GET  | `/vouchers/templates` | `voucher:create` | 凭证模板列表 |
| POST | `/vouchers/templates` | `voucher:create` | 保存模板(名称+分录) |
| DELETE | `/vouchers/templates/:id` | `voucher:create` | 删除模板 |
| GET  | `/vouchers/summaries` | `voucher:create` | 摘要联想(历史摘要 top100) |
| POST | `/vouchers/import` | `voucher:create` | Excel 批量导入(7 列模板;连续同日合张、末级科目强校验、辅助核算按档案名匹配,部分成功+失败明细) |
| GET  | `/vouchers/import-template` | `voucher:create` | 导入模板下载 |

### 4.2 期初

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/initial` | `ledger:init` | 当前账套期初(科目 + 金额) |
| PUT  | `/initial` | `ledger:init` | 批量改期初 |
| POST | `/initial/lock` | `ledger:init` | 锁定(校验借贷平衡) |
| GET  | `/periods` | 已登录 | 期间列表 |
| GET  | `/periods/current` | 已登录 | 当前期间 |

### 4.3 期末

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/closing/carry-forward` | `closing:run` | 结转损益(按科目+辅助维度) |
| POST | `/closing/depreciation` | `closing:run` | 计提折旧 |
| POST | `/closing/close` | `closing:run` | 期末结账(四项闸门) |
| POST | `/closing/unclose` | `closing:run` | 反结账(下期无凭证时) |
| GET  | `/closing/checklist` | 已登录 | 检查清单 4 项状态 |

### 4.4 附件

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/vouchers/:id/attachments` | `voucher:create` | 上传(multipart,≤10MB,单凭证≤20 个) |
| GET  | `/attachments/:id/download` | `ledger:view` | 下载(校验 owner 租户) |

---

## 5. 报表 Report

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/reports/balance-sheet?year=2026&month=2` | `report:view` | 资产负债表(三段式) |
| GET  | `/reports/balance-sheet?format=xlsx` | `report:view` | 导出 |
| GET  | `/reports/income?year=2026&month=2` | `report:view` | 利润表(本期+年累计) |
| GET  | `/reports/balance-summary?year=2026&month=2` | `report:view` | 科目余额表(总账口径) |
| GET  | `/reports/detail-ledger?subjectId=...&from=1&to=2` | `report:view` | 明细分类账 |
| GET  | `/reports/trial-balance?year=2026&month=2` | `report:view` | 试算平衡表 |
| GET  | `/reports/cash-flow?year=2026&month=2` | `report:view` | 现金流量表(对方科目归集法;含期末期初勾稽、未归类明细;`format=xlsx` 导出) |

---

## 6. 业务 Business

### 6.1 应收应付 AR/AP

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/arap/bills?type=1` | `arap:view` | 列表(1=应收/2=收款/3=应付/4=付款) |
| POST | `/arap/bills` | `arap:create` | 新建单据(可勾选"生成凭证") |
| PUT  | `/arap/bills/:id` | `arap:create` | 改 |
| POST | `/arap/writeoff` | `arap:create` | 核销 |
| GET  | `/arap/aging?type=1` | `arap:view` | 账龄分析(0-30/31-60/61-90/90+) |
| GET  | `/arap/bills?format=xlsx` | `arap:view` | 导出 |

### 6.2 发票 Invoice

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/invoices?io=1` | `invoice:manage` | 列表(1=进项,2=销项) |
| POST | `/invoices` | `invoice:manage` | 新建 |
| PUT  | `/invoices/:id` | `invoice:manage` | 改 |
| POST | `/invoices/import` | `invoice:manage` | CSV 批量导入 |
| POST | `/invoices/:id/gen-bill` | `invoice:manage` | 销项发票生成应收单 |
| GET  | `/invoices?format=xlsx` | `invoice:manage` | 导出 |

### 6.2a 增值税申报测算

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/invoices/vat-declaration?year=2026&quarter=1` | `report:view` | 季度测算:按税率分组销项/进项 + 一般纳税人/小规模双口径(`format=xlsx` 三 Sheet 导出;仅供申报参考) |

### 6.3 资金 Fund

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/fund/accounts` | `fund:view` | 账户列表 |
| POST | `/fund/accounts` | `fund:manage` | 新建(绑定 1002 科目) |
| GET  | `/fund/journal?accountId=...&from=...&to=...` | `fund:view` | 现金/银行日记账(自动来自凭证) |
| POST | `/fund/import-statement` | `fund:manage` | 导入对账单 CSV |
| POST | `/fund/reconcile-auto` | `fund:manage` | 自动勾兑(±3 天) |
| POST | `/fund/reconcile-manual` | `fund:manage` | 手工勾兑 |
| GET  | `/fund/reconcile-statement?accountId=...` | `fund:view` | 余额调节表 |

### 6.4 报销 Expense

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/expense-claims?scope=mine` | `expense:create` | 我的报销 |
| GET  | `/expense-claims?status=1` | `expense:audit` | 待审(部门/总经理/财务) |
| POST | `/expense-claims` | `expense:create` | 新建 |
| PUT  | `/expense-claims/:id` | `expense:create` | 改(草稿/驳回) |
| POST | `/expense-claims/:id/submit` | `expense:create` | 提交 |
| POST | `/expense-claims/:id/approve` | `expense:audit` | 部门审批 |
| POST | `/expense-claims/:id/decide` | `expense:audit` | 总经理/财务审批 |
| POST | `/expense-claims/:id/withdraw` | `expense:create` | 撤回 |
| POST | `/expense-claims/:id/pay` | `fund:manage` | 付款(自动生成凭证) |
| GET  | `/expense-claims?format=xlsx` | `expense:view` | 导出 |

> 状态机:0 草稿 / 1 待部门 / 2 待总经理 / 3 待财务 / 4 待付款 / 5 已付款 / 6 驳回 / 7 撤回

### 6.5 资产 Asset

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/assets` | `asset:view` | 卡片列表 |
| POST | `/assets` | `asset:manage` | 新增(联动凭证可选) |
| PUT  | `/assets/:id` | `asset:manage` | 改 |
| POST | `/assets/:id/dispose` | `asset:manage` | 处置(出售/报废,自动凭证) |
| GET  | `/assets?format=xlsx` | `asset:view` | 导出 |

### 6.6 看板 Dashboard

| 方法 | 路径 | 权限 | 说明 |
|

### 6.7 工资核算 Payroll

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET  | `/payrolls?year=2026&month=2` | `payroll:manage` | 月度批次(按在册员工生成行,金额待录) |
| POST | `/payrolls/:id/items` | `payroll:manage` | 批量保存工资行(实发自动计算;员工须为本账套在册) |
| POST | `/payrolls/:id/accrue` | `payroll:manage` | 计提:借 560204(按部门拆分)/贷 2211,凭证提交待审;期间须未结且不早于当前业务期间 |
| POST | `/payrolls/:id/pay` | `payroll:manage` | 发放:借 2211/贷 100201 实发 + 贷 2241 代扣(未缴暂挂) |

> 红冲工资计提/发放凭证会自动把批次状态回退(已发放→已计提 / 已计提→编辑中),保证账实一致。

---|---|---|---|
| GET  | `/dashboard/summary` | 已登录 | 资金头寸/应收逾期/本月利润/趋势 + TOP5 + 待办 |

---

## 7. 错误码字典

| code | 含义 | 常见 |
|---|---|---|
| 0 | 成功 |  |
| 40000 | 通用业务错误 |  |
| 40001 | 参数无效 | DTO 校验失败 |
| 40100 | 未登录 | token 缺失/无效 |
| 40300 | 无权限 | perm 不够 / 越权 |
| 40400 | 资源不存在 |  |
| 40900 | 冲突 | 唯一键冲突 |
| 42000 | 业务规则违反 | 借贷不平 / 跨期 / 制单人不能审核自己 |
| 42001 | 已结账 | 改/反审/反结账 |
| 42006 | 跨期 | 凭证日期不在启用期间 |
| 42009 | 重复核销 | 同一单据已核销过 |
| 50000 | 通用系统错误 | 看 message |
| 50300 | 服务不可用 | 数据库连不上 |

---

## 8. 完整 curl 示例

### 登录
```bash
curl -X POST http://localhost:3100/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'
# 拿 accessToken
```

### 改公司信息
```bash
TOKEN=...
curl -X PUT http://localhost:3100/api/v1/tenants/current \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"新公司名","taxNo":"91110...","startYear":2026,"startMonth":1}'
```

### 录凭证
```bash
curl -X POST http://localhost:3100/api/v1/vouchers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "date": "2026-08-29",
    "word": "付",
    "entries": [
      {"subjectId": 10021, "debit": 1000, "credit": 0, "summary": "付办公费"},
      {"subjectId": 10022, "debit": 0, "credit": 1000, "summary": "出银行"}
    ]
  }'
```

### 导凭证
```bash
curl -o 凭证.xlsx "http://localhost:3100/api/v1/vouchers?format=xlsx" \
  -H "Authorization: Bearer $TOKEN"
```

### 启用账套
```bash
curl -X POST http://localhost:3100/api/v1/tenants/1/activate \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. SDK / 客户端封装

**前端推荐**:用 `web/src/api/modules.ts` 里集中声明的 API,所有方法已封装:
- 自动带 Bearer token
- 自动解 envelope
- 自动 401 跳登录
- 自动错误 toast

**TypeScript 类型**:`@/api/modules` 已导出 `XxxResp` 类型。

---

## 10. 版本与变更

| 版本 | 日期 | 变更 |
|---|---|---|
| 1.0 | 2026-08-29 | 14 个 Excel 导出端点全部 OOXML; 账套完整 CRUD; 健康检查页; 演示账号开关 |
| 0.9 | 2026-08 | E2E 44 断言通过; 多账套切换 |
| 0.8 | 2026-07 | 报销流优化; 红冲支持 |
| 0.7 | 2026-06 | 期末结账向导 |
| 0.5 | 2026-05 | 报表公式驱动 |
| 0.3 | 2026-04 | 凭证引擎 R1-R15 全部硬约束 |
| 0.1 | 2026-03 | 初版(基础 CRUD) |

---

## 9. AI 智能体(MCP)

MCP Server 独立于 REST 运行(stdio),供 Claude / Cursor 等智能体调用,共 10 个工具
(查询 9 个 + 记账 1 个),全部复用上表 API 与鉴权。接入方式见 `docs/MCP-GUIDE.md`。

| 工具 | 对应 API | 说明 |
|---|---|---|
| list_periods / get_dashboard | `/periods` / `/dashboard/summary` | 期间与看板 |
| get_balance_sheet / get_income_statement / get_cash_flow | `/reports/*` | 三大报表 |
| query_subject_balances / query_vouchers / query_arap_aging / query_expense_claims | 余额表/凭证/账龄/报销 | 查询 |
| create_voucher | `POST /vouchers` | 记账(草稿;部门辅助按名称匹配;借贷平衡/期间锁服务端校验) |
