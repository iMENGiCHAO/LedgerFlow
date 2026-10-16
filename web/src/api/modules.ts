import client from './client'
import { Adapters } from '@/utils/api-adapter'

// 说明:响应拦截器已解包 {code,message,data},以下函数直接返回业务 data。
// 适配层(Adapters)在出口把后端 schema 转换成前端约定的字段名,
// 让 24 个页面不用改。详细转换规则见 utils/api-adapter.ts。

// ==================== 认证 ====================
export const login = (data: { username: string; password: string }) => client.post('/auth/login', data)
export const switchTenant = (tenantId: number | string) => client.post('/auth/switch-tenant', { tenantId: Number(tenantId) })
export const changePassword = (data: { oldPassword: string; newPassword: string }) => client.post('/auth/password', data)

// ==================== 经营看板 ====================
export const dashboardSummary = () => client.get('/dashboard/summary').then(Adapters.dashboardSummary)

// ==================== 科目 ====================
export interface SubjectNode {
  id: number
  code: string
  name: string
  parentId: number | null
  category: number
  direction: 'D' | 'C'
  isLeaf: boolean
  status: number
  assist?: Record<string, boolean> | null
  children?: SubjectNode[]
}
export const subjectTree = (): Promise<{ list: SubjectNode[]; tree: SubjectNode[] }> =>
  client.get('/subjects/tree').then(Adapters.subjectTree)
export const createSubject = (data: { code: string; name: string; parentCode?: string }) => client.post('/subjects', data)
export const updateSubject = (id: number, data: Record<string, unknown>) => client.put(`/subjects/${id}`, data)

// ==================== 往来单位 / 部门 / 项目 / 员工 ====================
export const partnerList = (params?: { page?: number; pageSize?: number; type?: number; keyword?: string }) =>
  client.get('/partners', { params }).then(Adapters.partnerList)
export const savePartner = (data: Record<string, unknown>) => client.post('/partners', data)
export const removePartner = (id: number) => client.delete(`/partners/${id}`)

export const departmentList = () => client.get('/departments').then(Adapters.deptList)
export const saveDepartment = (data: Record<string, unknown>) => client.post('/departments', data)

export const projectList = () => client.get('/projects').then(Adapters.projectList)
export const saveProject = (data: Record<string, unknown>) => client.post('/projects', data)

export const employeeList = () => client.get('/employees').then(Adapters.employeeList)
export const saveEmployee = (data: Record<string, unknown>) => client.post('/employees', data)

// ==================== 期间与期初建账 ====================
export interface PeriodRow {
  id: number
  year: number
  month: number
  status: number
  statusName?: string
}
export const periodList = (): Promise<{ tenantStatus: number; startYear: number; startMonth: number; list: PeriodRow[] }> =>
  client.get('/periods').then((d: any) => {
    const list = Adapters.periodList(d)
    return { tenantStatus: pickNumber(d?.tenantStatus, 0), startYear: pickNumber(d?.startYear, 2026), startMonth: pickNumber(d?.startMonth, 1), list }
  })

export const initialBalances = () => client.get('/initial-balances').then(Adapters.initialBalances)
export const saveInitialBalances = (
  items: { subjectCode: string; direction: 'D' | 'C'; amount: number; partnerCode?: string }[],
) => client.put('/initial-balances', { items })
// 旧版 activateTenant() 无参接口已废弃,新接口带 id 参数见下方"账套管理"区块

// ==================== 凭证 ====================
export const voucherList = (params?: Record<string, unknown>) => client.get('/vouchers', { params }).then(Adapters.voucherList)
export const voucherDetail = (id: number | string) => client.get(`/vouchers/${id}`).then(Adapters.voucher)
export const voucherCreate = (data: Record<string, unknown>) => client.post('/vouchers', data)

export const voucherTemplateList = (): Promise<any> => client.get('/vouchers/templates')
export const voucherTemplateSave = (data: Record<string, unknown>): Promise<any> => client.post('/vouchers/templates', data)
export const voucherTemplateRemove = (id: number): Promise<any> => client.delete(`/vouchers/templates/${id}`)
export const voucherSummaryList = (): Promise<any> => client.get('/vouchers/summaries')
export const voucherUpdate = (id: number | string, data: Record<string, unknown>) => client.put(`/vouchers/${id}`, data)
export const voucherDelete = (id: number) => client.delete(`/vouchers/${id}`)
export const voucherSubmit = (id: number) => client.post(`/vouchers/${id}/submit`)
export const voucherApprove = (id: number) => client.post(`/vouchers/${id}/approve`)
export const voucherReject = (id: number, reason: string) => client.post(`/vouchers/${id}/reject`, { reason })
export const voucherCancelAudit = (id: number) => client.post(`/vouchers/${id}/cancel-audit`)
export const voucherVoid = (id: number) => client.post(`/vouchers/${id}/void`)
export const voucherRedFlush = (id: number, date?: string) => client.post(`/vouchers/${id}/red-flush`, { date })
// 凭证附件:后端限 jpg/png/pdf ≤10MB,自动累计 attachmentCount
export const voucherAttachmentUpload = (id: number, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post(`/vouchers/${id}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const voucherAttachmentDownload = (attachmentId: number) =>
  client.get(`/attachments/${attachmentId}/download`, { responseType: 'blob' })

// ==================== 期末处理 ====================
export const closingChecklist = (periodId: number | string) =>
  client.get('/closing/checklist', { params: { periodId } }).then(Adapters.closingChecklist)
export const closingProfitCarryforward = (periodId: number) => client.post('/closing/profit-carryforward', { periodId })
export const closingDepreciation = (periodId: number) => client.post('/closing/depreciation', { periodId })
export const closingClose = (periodId: number) => client.post('/closing/close', { periodId })
export const closingUnClose = (periodId: number) => client.post('/closing/un-close', { periodId })

// ==================== 账簿报表 ====================
export const reportBalanceSummary = (year: number, month: number) =>
  client.get('/reports/balance-summary', { params: { year, month } }).then(Adapters.reportBalanceSummary)
export const reportDetailLedger = (subjectId: number, year: number, fromMonth: number, toMonth: number) =>
  client.get(`/reports/detail-ledger/${subjectId}`, { params: { year, fromMonth, toMonth } })
export const reportBalanceSheet = (periodId?: number) =>
  client.get('/reports/balance-sheet', { params: periodId ? { periodId } : {} }).then(Adapters.reportBalanceSheet)

export const reportCashFlow = (year: number, month: number) =>
  client.get('/reports/cash-flow', { params: { year, month } })
export const reportIncome = (periodId?: number, fromMonth?: number) =>
  client.get('/reports/income', { params: { ...(periodId ? { periodId } : {}), ...(fromMonth ? { fromMonth } : {}) } }).then(Adapters.reportIncome)

// ==================== 应收应付 ====================
export const arapBills = (params?: Record<string, unknown>) => client.get('/arap/bills', { params }).then(Adapters.arapList)
export const arapCreateBill = (data: Record<string, unknown>) => client.post('/arap/bills', data)
export const arapRemoveBill = (id: number) => client.delete(`/arap/bills/${id}`)
export const arapWriteoff = (data: { openBillId: number; settleBillId: number; amount: number }) =>
  client.post('/arap/writeoffs', data)
export const arapAging = (type: 1 | 3) => client.get('/arap/aging', { params: { type } }).then(Adapters.arapAging)

// ==================== 发票台账 ====================
export const invoiceList = (params?: Record<string, unknown>) => client.get('/invoices', { params }).then(Adapters.invoiceList)
export const invoiceSave = (data: Record<string, unknown>) => client.post('/invoices', data)
export const invoiceImportCsv = (csv: string) => client.post('/invoices/import-csv', { csv })
export const invoiceVatSummary = (year: number) => client.get('/invoices/vat-summary', { params: { year } }).then(Adapters.vatSummary)
export const invoiceToReceivable = (id: number) => client.post(`/invoices/${id}/to-receivable`)
export const invoiceRemove = (id: number) => client.delete(`/invoices/${id}`)

// ==================== 资金管理 ====================
export const fundAccounts = () => client.get('/fund/accounts').then(Adapters.fundAccounts)
export const fundSaveAccount = (data: { name: string; bankName?: string; accountNo?: string; subjectCode: string }) =>
  client.post('/fund/accounts', data)
export const fundJournals = (params: Record<string, unknown>) => client.get('/fund/journals', { params }).then(Adapters.fundJournals)
export const fundStatementImport = (accountId: number, csv: string) =>
  client.post('/fund/statements/import', { accountId, csv })
export const fundAutoMatch = (accountId: number) => client.post('/fund/reconciliations/auto-match', { accountId })
export const fundReconciliation = (accountId: number, year: number, month: number) =>
  client.get('/fund/reconciliation', { params: { accountId, year, month } })

// ==================== 费用报销 ====================
export const claimList = (params?: Record<string, unknown>) => client.get('/expense-claims', { params }).then(Adapters.claimList)
/** 当前账套的完整企业信息 */
export const getCurrentTenant = () => client.get('/tenants/current')
/** 我能访问的账套列表(根据用户授权) */
export const getMyTenants = () => client.get('/tenants/my').then(Adapters.tenantList)
/** 全部账套(超管视角) */
export const getAllTenants = () => client.get('/tenants').then(Adapters.tenantList)
export const updateCurrentTenant = (data: { name?: string; taxNo?: string | null; legalRep?: string | null; address?: string | null; startYear?: number; startMonth?: number }) =>
  client.put('/tenants/current', data)
export const updateAnyTenant = (id: number, data: { name?: string; taxNo?: string | null; legalRep?: string | null; address?: string | null }) =>
  client.put(`/tenants/${id}`, data)
/** 启用账套 */
export const activateTenant = (id: number) => client.post(`/tenants/${id}/activate`)
/** 停用账套 */
export const deactivateTenant = (id: number) => client.post(`/tenants/${id}/deactivate`)
/** 删除账套 */
export const deleteTenant = (id: number) => client.delete(`/tenants/${id}`)
export const createNewTenant = (data: { name: string; taxNo?: string | null; legalRep?: string | null; address?: string | null; startYear: number; startMonth: number }) =>
  client.post('/tenants', data)
/** 系统参数 */
export const getCurrentParams = () => client.get('/tenants/current/params').then((r) => r.data)
export const updateCurrentParams = (data: { gmExpenseThreshold?: number; defaultTaxRate?: number }) =>
  client.put('/tenants/current/params', data).then((r) => r.data)
/** 退出登录:后端把 jti 加入黑名单,后续 token 立即失效 */
export const authLogout = (data: { jti: string; accessExp: number }) => client.post('/auth/logout', data).then((r) => r.data)
/** 切换账套(后端发新 token) */
export const switchToTenantApi = (tenantId: number) =>
  client.post('/auth/switch-tenant', { tenantId }).then((r) => r.data)
export const claimDetail = (id: number) => client.get(`/expense-claims/${id}`).then(Adapters.claimDetail)
export const claimCreate = (data: {
  title: string
  deptId?: number
  projectId?: number
  items: { expenseType: string; occurDate: string; amount: number; invoiceCount?: number; remark?: string }[]
}) => client.post('/expense-claims', data)
export const claimUpdate = (id: number, data: {
  title?: string
  items?: { expenseType: string; occurDate: string; amount: number; invoiceCount: number; invoiceTotal?: number; remark?: string }[]
}) => client.put(`/expense-claims/${id}`, data)
export const claimSubmit = (id: number) => client.post(`/expense-claims/${id}/submit`)
export const claimWithdraw = (id: number) => client.post(`/expense-claims/${id}/withdraw`)
export const claimDecide = (id: number, action: 'approve' | 'reject', opinion?: string) =>
  client.post(`/expense-claims/${id}/decide`, { action, opinion })
export const claimPay = (id: number, data: { settleSubjectCode: string; settleType?: string; date?: string }) =>
  client.post(`/expense-claims/${id}/pay`, data)

// ==================== 固定资产 ====================
export const assetList = (params?: Record<string, unknown>) => client.get('/assets', { params }).then(Adapters.assetList)
export const assetCreate = (data: Record<string, unknown>) => client.post('/assets', data)
export const assetDispose = (
  id: number,
  data: { disposeDate: string; disposeType: '出售' | '报废'; disposeAmount?: number; settleSubjectCode?: string },
) => client.post(`/assets/${id}/dispose`, data)

// ==================== 系统管理 ====================
export const userList = (params?: Record<string, unknown>) => client.get('/users', { params }).then(Adapters.userList)
export const userCreate = (data: Record<string, unknown>) => client.post('/users', data)
export const userUpdate = (id: number, data: Record<string, unknown>) => client.put(`/users/${id}`, data)
export const userResetPassword = (id: number, password: string) =>
  client.post(`/users/${id}/reset-password`, { password })

export const roleList = () => client.get('/roles').then(Adapters.roleList)
export const permsCatalog = (): Promise<any> => client.get('/perms-catalog')
export const roleCreate = (data: { code: string; name: string; permissions: string[]; remark?: string }) =>
  client.post('/roles', data)
export const roleUpdate = (id: number, data: { name?: string; permissions?: string[]; remark?: string }) =>
  client.put(`/roles/${id}`, data)

export const logList = (params?: Record<string, unknown>) => client.get('/operation-logs', { params }).then(Adapters.logList)

export const tenantMyList = () => client.get('/tenants/my').then(Adapters.tenantList)
export const tenantAllList = () => client.get('/tenants').then(Adapters.tenantList)
export const tenantCreate = (data: {
  name: string
  taxNo?: string
  address?: string
  legalRep?: string
  startYear: number
  startMonth: number
}) => client.post('/tenants', data)

export const backupList = () => client.get('/backups').then(Adapters.backupList)
export const backupRun = () => client.post('/backups/run')
export const backupDownloadUrl = (fileName: string) => `/api/v1/backups/${encodeURIComponent(fileName)}/download`

// 工具
function pickNumber(v: any, d = 0): number {
  if (v == null || v === '') return d
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
