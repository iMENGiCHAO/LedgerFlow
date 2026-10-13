/**
 * API 适配层
 *
 * 真实后端 schema 与前端期望的字段名存在差异,这里集中做转换,
 * 让 24 个页面不用改 — 改这一个文件就完成全栈字段对齐。
 *
 * 关键转换:
 *   - 凭证: { word:'收', no:1 } -> { voucherNo:'1-001', summary, total, statusName, ... }
 *   - 看板: 嵌套结构 -> 平铺
 *   - 应收应付: { type:1/2/3 } -> { typeName:'应收'/'应付'/'其他' }
 *   - 发票: { io:1/2, invoiceNo } -> { type:'in'/'out', code, typeName }
 *   - 报表: { rowKey,rowName,periodValue,ytdValue } -> { code,name,monthAmount,yearAmount }
 *   - 角色: { permissions: string[] } -> { permissions: string[] } (透传)
 *   - 报销: { status,statusName,... } (透传,后端字段对齐)
 */
import { fmtDate, fmtDateTime } from './format'

// ==================== 工具 ====================
function pickNumber(v: any, d = 0): number {
  if (v == null || v === '') return d
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
function pickStr(v: any, d = ''): string {
  if (v == null) return d
  return String(v)
}
function asDateStr(v: any): string {
  if (!v) return ''
  try { return fmtDate(v) } catch { return String(v).slice(0, 10) }
}
function asDateTimeStr(v: any): string {
  if (!v) return ''
  try { return fmtDateTime(v) } catch { return String(v).replace('T', ' ').slice(0, 19) }
}

// ==================== 字典 ====================
const ARAP_TYPE_NAMES: Record<number, string> = { 1: '应收', 2: '应付', 3: '其他应收' }
const ARAP_STATUS_NAMES: Record<number, string> = { 0: '未核销', 1: '部分核销', 2: '已核销' }
const INVOICE_IO_NAMES: Record<number, string> = { 1: '销项', 2: '进项' }
const INVOICE_STATUS_NAMES: Record<number, string> = { 0: '草稿', 1: '已登记', 2: '已认证', 3: '已作废' }
const VOUCHER_WORD_NAMES: Record<string, string> = { 收: '收', 付: '付', 转: '转', 记: '记' }
const VOUCHER_STATUS_NAMES: Record<number, string> = { 0: '草稿', 1: '待审核', 2: '已审核', 3: '已记账', 4: '已驳回' }
const ASSET_STATUS_NAMES: Record<number, string> = { 1: '在用', 2: '已处置' }
const PARTNER_TYPE_NAMES: Record<number, string> = { 1: '客户', 2: '供应商', 3: '其他' }
const FUND_DIR_NAMES: Record<string, string> = { D: '收入', C: '支出', IN: '收入', OUT: '支出' }

// ==================== 看板 ====================
export function adaptDashboardSummary(d: any): any {
  if (!d || typeof d !== 'object') return d
  const cp = d.currentPeriod || {}
  return {
    cashPosition: pickNumber(d.cashPosition),
    cashChange: pickNumber(d.cashChange, 0),
    arOverdue: pickNumber(d.receivable?.overdue),
    arOverdueChange: pickNumber(d.arOverdueChange, 0),
    monthProfit: pickNumber(cp.netProfit),
    monthProfitChange: pickNumber(cp.profitChange, 0),
    pendingTodos: pickNumber(d.pendingTodos, 0),
    monthlyTrend: Array.isArray(d.trend)
      ? d.trend.map((t: any) => ({
          month: pickStr(t.month),
          income: pickNumber(t.revenue),
          expense: pickNumber(t.expense),
        }))
      : Array.isArray(d.monthlyTrend)
        ? d.monthlyTrend
        : [],
    topExpenses: Array.isArray(d.topExpenses) ? d.topExpenses : [],
  }
}

// ==================== 凭证 ====================
export function adaptVoucher(v: any): any {
  if (!v) return v
  return {
    ...v,
    id: v.id,
    voucherNo: `${v.periodId || 0}-${String(v.no).padStart(3, '0')}`,
    word: pickStr(v.word, '记'),
    no: pickNumber(v.no),
    date: asDateStr(v.date),
    periodId: pickNumber(v.periodId),
    summary: pickStr(v.memo),
    total: pickNumber(v.totalDebit),
    totalDebit: pickNumber(v.totalDebit),
    totalCredit: pickNumber(v.totalCredit),
    status: pickNumber(v.status),
    statusName: VOUCHER_STATUS_NAMES[pickNumber(v.status)] || '未知',
    creator: v.creator,
    auditor: v.auditor,
    auditedAt: v.auditedAt,
    createdAt: asDateTimeStr(v.createdAt),
    attachmentCount: pickNumber(v.attachmentCount, 0),
    // 分录: 后端 entries[] -> items[]
    items: Array.isArray(v.entries)
      ? v.entries.map((e: any) => ({
          id: e.id,
          subjectId: e.subjectId,
          subjectCode: e.subject?.code,
          subjectName: e.subject?.name,
          summary: pickStr(e.summary, pickStr(e.memo)),
          debit: pickNumber(e.debit),
          credit: pickNumber(e.credit),
          partnerId: e.partnerId,
          partner: e.partner,
          deptId: e.deptId,
          dept: e.dept,
          projectId: e.projectId,
          project: e.project,
          employeeId: e.employeeId,
          employee: e.employee,
        }))
      : [],
  }
}

export function adaptVoucherList(d: any): any {
  if (!d) return d
  const list = Array.isArray(d.list) ? d.list.map(adaptVoucher) : Array.isArray(d) ? d.map(adaptVoucher) : []
  return {
    list,
    total: pickNumber(d.total, list.length),
    page: pickNumber(d.page, 1),
    pageSize: pickNumber(d.pageSize, 20),
  }
}

// ==================== 科目 ====================
export function adaptSubject(s: any): any {
  if (!s) return s
  return {
    ...s,
    id: s.id,
    code: pickStr(s.code),
    name: pickStr(s.name),
    parentId: s.parentId ?? null,
    category: pickNumber(s.category),
    direction: pickStr(s.direction, 'D') as 'D' | 'C',
    isLeaf: !!s.isLeaf,
    status: pickNumber(s.status, 1),
    assist: s.assist || null,
    children: Array.isArray(s.children) ? s.children.map(adaptSubject) : undefined,
  }
}

export function adaptSubjectTree(d: any): any {
  if (!d) return d
  if (Array.isArray(d)) return { list: d.map(adaptSubject), tree: [] }
  return {
    list: Array.isArray(d.list) ? d.list.map(adaptSubject) : [],
    tree: Array.isArray(d.tree) ? d.tree.map(adaptSubject) : [],
  }
}

// ==================== 往来单位 ====================
export function adaptPartner(p: any): any {
  if (!p) return p
  return {
    ...p,
    typeName: PARTNER_TYPE_NAMES[pickNumber(p.type)] || '其他',
    code: pickStr(p.code),
    name: pickStr(p.name),
    contact: pickStr(p.contact, '-'),
    phone: pickStr(p.phone, '-'),
    taxNo: pickStr(p.taxNo, '-'),
    status: pickNumber(p.status, 1),
  }
}

export function adaptPartnerList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptPartner) : Array.isArray(d) ? d.map(adaptPartner) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

// ==================== 部门 / 项目 / 员工 (透传 + 字段规范) ====================
export function adaptDept(d: any): any {
  if (!d) return d
  return { ...d, employeeCount: pickNumber(d.employeeCount, 0) }
}
export function adaptSimpleList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  return { list, total: list.length }
}

// ==================== 期间 ====================
export function adaptPeriodList(d: any): any[] {
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  return list.map((p: any) => ({
    id: p.id,
    year: pickNumber(p.year),
    month: pickNumber(p.month),
    status: pickNumber(p.status),
    statusName: PERIOD_STATUS_NAME(pickNumber(p.status, 0)),
  }))
}
const PERIOD_STATUS_NAME = (s: number) => ({ 0: '未开始', 1: '进行中', 2: '已结账' } as any)[s] || '未知'

// ==================== 期初余额 ====================
export function adaptInitialBalances(d: any): any {
  if (!d) return d
  const rows = Array.isArray(d.list) ? d.list : []
  return {
    rows: rows.map((r: any) => ({
      subjectId: r.subjectId,
      code: pickStr(r.code),
      name: pickStr(r.name),
      category: pickNumber(r.category),
      direction: pickStr(r.direction, 'D'),
      assist: r.assist,
      // 后端把金额放在 balances[{ periodId, debit, credit }]
      // 默认取起始期间
      _debit: r.balances?.[0]?.debit != null ? pickNumber(r.balances[0].debit) : 0,
      _credit: r.balances?.[0]?.credit != null ? pickNumber(r.balances[0].credit) : 0,
      _partnerId: undefined,
    })),
    tenantStatus: pickNumber(d.tenantStatus, 0),
    startYear: pickNumber(d.startYear, 2026),
    startMonth: pickNumber(d.startMonth, 1),
    totalDebit: pickNumber(d.totalDebit),
    totalCredit: pickNumber(d.totalCredit),
    balanced: !!d.balanced,
  }
}

// ==================== 应收应付 ====================
export function adaptArapBill(b: any): any {
  if (!b) return b
  const type = pickNumber(b.type)
  return {
    ...b,
    type,
    typeName: ARAP_TYPE_NAMES[type] || '其他',
    billNo: pickStr(b.billNo),
    date: asDateStr(b.date),
    dueDate: asDateStr(b.dueDate),
    amount: pickNumber(b.amount),
    settled: pickNumber(b.writtenOff),
    balance: pickNumber(b.outstanding ?? (pickNumber(b.amount) - pickNumber(b.writtenOff))),
    status: pickNumber(b.status),
    statusName: ARAP_STATUS_NAMES[pickNumber(b.status)] || '未知',
    partner: b.partner || { code: '-', name: pickStr(b.partnerName, '-') },
    voucher: b.voucher ? { id: b.voucher.id, word: b.voucher.word, no: b.voucher.no } : null,
    overdue: b.dueDate ? new Date(b.dueDate).getTime() < Date.now() : false,
  }
}

export function adaptArapList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptArapBill) : Array.isArray(d) ? d.map(adaptArapBill) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

// 账龄分析: 后端 list[{ partnerId, partnerName, b0_30, b31_60, ... }]
// 转前端期望: { total, buckets: [...] }
export function adaptAging(d: any): any {
  if (!d) return { total: 0, buckets: [] }
  // d 已经是解包后的 data(可能含 list)
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  if (!list.length) return { total: 0, buckets: [] }

  const receivable = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0, total: 0, overdueTotal: 0 }
  const payable    = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0, total: 0, overdueTotal: 0 }
  list.forEach((row: any) => {
    // 后端 type=1 应收, type=2 应付, type=3 其他应收(也算应收)
    // 1=应收 2=应付 3=其他应收
    const t = pickNumber(row.type, 0)
    const isReceivable = t === 1 || t === 3 || t === 0 /* 无 type 字段时按应收处理,后续可优化 */
    const target = isReceivable ? receivable : payable
    target.b0_30 += pickNumber(row.b0_30)
    target.b31_60 += pickNumber(row.b31_60)
    target.b61_90 += pickNumber(row.b61_90)
    target.b90p += pickNumber(row.b90p)
    target.total += pickNumber(row.total)
  })
  receivable.overdueTotal = receivable.b31_60 + receivable.b61_90 + receivable.b90p
  payable.overdueTotal = payable.b31_60 + payable.b61_90 + payable.b90p
  return {
    receivable,
    payable,
    total: receivable.total,
    buckets: [
      { label: '0-30 天', receivable: receivable.b0_30, payable: payable.b0_30 },
      { label: '31-60 天', receivable: receivable.b31_60, payable: payable.b31_60 },
      { label: '61-90 天', receivable: receivable.b61_90, payable: payable.b61_90 },
      { label: '90+ 天',  receivable: receivable.b90p,  payable: payable.b90p  },
    ],
  }
}

// ==================== 发票 ====================
export function adaptInvoice(inv: any): any {
  if (!inv) return inv
  const io = pickNumber(inv.io)
  return {
    ...inv,
    io,
    type: io === 2 ? 'in' : 'out',
    typeName: INVOICE_IO_NAMES[io] || '销项',
    code: pickStr(inv.invoiceNo),
    invoiceNo: pickStr(inv.invoiceNo),
    date: asDateStr(inv.date),
    amount: pickNumber(inv.amount),
    tax: pickNumber(inv.taxAmount),
    taxAmount: pickNumber(inv.taxAmount),
    taxRate: pickNumber(inv.taxRate),
    total: pickNumber(inv.total),
    status: pickNumber(inv.status),
    statusName: INVOICE_STATUS_NAMES[pickNumber(inv.status)] || '未知',
    partner: inv.partner?.name || '-',
    itemName: pickStr(inv.itemName, '-'),
    voucher: inv.voucher ? { id: inv.voucher.id, word: inv.voucher.word, no: inv.voucher.no } : null,
  }
}

export function adaptInvoiceList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptInvoice) : Array.isArray(d) ? d.map(adaptInvoice) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

// VAT 汇总: 后端可能有 { output, input, payable } 或 { outputTax, inputTax, payableTax }
export function adaptVatSummary(d: any): any {
  if (!d) return { output: 0, input: 0, payable: 0 }
  return {
    output: pickNumber(d.output ?? d.outputTax ?? d.salesTax),
    input: pickNumber(d.input ?? d.inputTax ?? d.purchaseTax),
    payable: pickNumber(d.payable ?? d.payableTax ?? d.net),
  }
}

// ==================== 资金 ====================
export function adaptFundAccount(a: any): any {
  if (!a) return a
  return {
    ...a,
    id: a.id,
    code: pickStr(a.subject?.code, `FUND-${a.id}`),
    name: pickStr(a.name),
    bankName: pickStr(a.bankName, '-'),
    accountNo: pickStr(a.accountNo, '-'),
    type: pickNumber(a.type, 2), // 1=现金 2=银行
    typeName: pickNumber(a.type) === 1 ? '现金' : '银行',
    balance: pickNumber(a.balance ?? a.openingBalance),
    openingBalance: pickNumber(a.openingBalance),
    active: pickNumber(a.status, 1) === 1,
    lastSyncAt: '-',
    subject: a.subject,
  }
}

export function adaptFundAccountList(d: any): any[] {
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  return list.map(adaptFundAccount)
}

export function adaptFundJournal(j: any): any {
  if (!j) return j
  // 后端 dir: 'D'/'C' 方向, 前端用 in/out
  const dirStr = pickStr(j.dir, 'D').toUpperCase()
  const isIn = dirStr === 'D' || dirStr === 'IN'
  return {
    ...j,
    id: j.id,
    date: asDateStr(j.date),
    account: j.account ? adaptFundAccount(j.account) : null,
    dir: isIn ? 'D' : 'C',
    dirName: isIn ? '收入' : '支出',
    summary: pickStr(j.summary, pickStr(j.memo)),
    amount: pickNumber(j.amount),
    voucher: j.voucher ? { id: j.voucher.id, word: j.voucher.word, no: j.voucher.no } : null,
    settleType: pickStr(j.settleType, '-'),
    status: pickNumber(j.status, 1),
    statusName: pickNumber(j.status, 1) === 2 ? '已对账' : '未对账',
  }
}

export function adaptFundJournalList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptFundJournal) : Array.isArray(d) ? d.map(adaptFundJournal) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

// ==================== 资产 ====================
export function adaptAsset(a: any): any {
  if (!a) return a
  return {
    ...a,
    id: a.id,
    code: pickStr(a.cardNo, `FA-${a.id}`),
    cardNo: pickStr(a.cardNo),
    name: pickStr(a.name),
    category: a.category || { id: 0, name: '-' },
    model: pickStr(a.model, '-'),
    dept: a.useDept || { id: 0, name: '-' },
    originalValue: pickNumber(a.originalValue),
    netValue: pickNumber(a.netValue),
    depreciationMonth: pickNumber(a.monthlyDepreciation),
    useMonth: pickNumber(a.useMonth, 0),
    purchaseDate: asDateStr(a.acquiredDate),
    status: pickNumber(a.status, 1),
    statusName: ASSET_STATUS_NAMES[pickNumber(a.status)] || '在用',
  }
}

export function adaptAssetList(d: any): any[] {
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  return list.map(adaptAsset)
}

// ==================== 报销 ====================
/** 报销阶段标签(用于详情头部"阶段"条 / 流程已完结横幅) */
function claimPhaseLabel(c: any): string {
  if (!c) return '-'
  const s = pickNumber(c.status)
  // 优先用后端 currentNode(描述更精确)
  if (c.currentNode) return pickStr(c.currentNode)
  // 兜底
  if (s === 0) return '草稿'
  if (s === 5) return '流程已完结'
  if (s === 6) return '已驳回'
  if (s === 7) return '已撤回'
  return CLAIM_STATUS_NAME(s)
}

export function adaptClaim(c: any): any {
  if (!c) return c
  const st = pickNumber(c.status)
  return {
    ...c,
    id: c.id,
    claimNo: pickStr(c.claimNo),
    title: pickStr(c.title, pickStr(c.memo)),
    applicant: c.applicant || { id: 0, realName: pickStr(c.applicantName, '-') },
    dept: c.dept || { id: 0, name: pickStr(c.deptName, '-') },
    total: pickNumber(c.total ?? c.amount),
    status: st,
    statusName: CLAIM_STATUS_NAME(st),
    currentNode: pickStr(c.currentNode, '-'),
    phaseLabel: claimPhaseLabel(c),
    // 业务流程是否完结(已付款 / 已驳回 / 已撤回) — 用于前端"完结横幅"
    isFinished: st === 5 || st === 6 || st === 7,
    // 驳回原因
    rejectReason: c.rejectReason || null,
    // 付款信息
    paidAt: c.paidAt || null,
    payVoucher: c.payVoucher ? { id: c.payVoucher.id, word: c.payVoucher.word, no: c.payVoucher.no, status: c.payVoucher.status } : null,
    createdAt: asDateTimeStr(c.createdAt),
    items: Array.isArray(c.items) ? c.items.map((it: any) => ({
      ...it,
      id: it.id,
      expenseType: pickStr(it.expenseType),
      occurDate: asDateStr(it.occurDate),
      amount: pickNumber(it.amount),
      invoiceCount: pickNumber(it.invoiceCount, 0),
      invoiceTotal: it.invoiceTotal != null ? pickNumber(it.invoiceTotal) : null,
      remark: pickStr(it.remark, '-'),
    })) : c.items,
    // 审批轨迹(后端 ApprovalRecord 表)
    approvals: Array.isArray(c.approvals) ? c.approvals.map((a: any) => ({
      ...a,
      approverName: pickStr(a.approverName, '-'),
      action: pickStr(a.action, '-'),
      actionName: ({
        submit: '提交申请',
        approve: '审批通过',
        reject: '驳回',
        pay: '完成付款',
        withdraw: '撤回',
      } as Record<string, string>)[a.action] || a.action,
      opinion: a.opinion || '',
      createdAt: asDateTimeStr(a.createdAt),
    })) : (c.approvals || []),
  }
}
const CLAIM_STATUS_NAME = (s: number) =>
  ({ 0: '草稿', 1: '待部门审批', 2: '待总经理审批', 3: '待财务复核', 4: '待付款', 5: '已付款' } as any)[s] || '未知'

export function adaptClaimList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptClaim) : Array.isArray(d) ? d.map(adaptClaim) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

export function adaptClaimDetail(d: any): any {
  if (!d) return d
  return {
    ...adaptClaim(d),
    items: Array.isArray(d.items)
      ? d.items.map((it: any) => ({
          id: it.id,
          expenseType: pickStr(it.expenseType),
          occurDate: asDateStr(it.occurDate),
          amount: pickNumber(it.amount),
          invoiceCount: pickNumber(it.invoiceCount, 0),
          summary: pickStr(it.summary, '-'),
        }))
      : [],
    flow: Array.isArray(d.flow) ? d.flow : [],
    rejectReason: d.rejectReason,
  }
}

// ==================== 期末 ====================
export function adaptClosingChecklist(d: any): any {
  if (!d) return { items: [] }
  // 后端返回 { period, items: [{ key,name,pass,blocking,detail }] }
  // 适配成 { items: [{ key,name,pass,blocking,detail }] } - 透传
  if (Array.isArray(d)) return { items: d }
  if (Array.isArray(d.items)) {
    return {
      ...d,
      items: d.items.map((it: any) => ({
        key: pickStr(it.key),
        name: pickStr(it.name),
        pass: !!it.pass,
        blocking: !!it.blocking,
        detail: pickStr(it.detail, ''),
      })),
    }
  }
  return { items: [] }
}

// ==================== 报表 ====================
// 资产负债表行按 section 分类(asset / liability / equity)
const BS_ASSET_KEYS = new Set([
  'cash', 'st_invest', 'note_recv', 'ar', 'prepaid', 'div_recv', 'int_recv',
  'other_recv', 'inventory', 'other_ca', 'total_ca',
  'lt_invest', 'lt_recv', 'fa', 'acc_dep', 'fa_net', 'intangible', 'other_nca', 'total_nca',
  'total_asset',
])
const BS_LIAB_KEYS = new Set([
  'st_loan', 'ap', 'prepaid_recv', 'acc_payable', 'acc_emp', 'tax_payable', 'div_payable',
  'other_cl', 'total_cl', 'lt_loan', 'lt_payable', 'other_ncl', 'total_ncl', 'total_liab',
])
const BS_EQUITY_KEYS = new Set([
  'paid_in', 'capital_reserve', 'surplus_reserve', 'retained', 'profit_year', 'other_eq', 'total_eq',
])

function reportCodeToDirection(rowKey: string, rowName: string): 'D' | 'C' {
  if (BS_ASSET_KEYS.has(rowKey) || rowName?.includes('资产') || rowName?.includes('成本') || rowName?.includes('费用')) return 'D'
  return 'C'
}

export function adaptReportRows(d: any, kind: 'balance-sheet' | 'income' | 'summary'): any {
  if (!d) return { rows: [] }
  const raw = Array.isArray(d.rows) ? d.rows : Array.isArray(d) ? d : []

  if (kind === 'balance-sheet') {
    const assets: any[] = []
    const liab: any[] = []
    const equity: any[] = []
    let assetsTotal = 0, liabTotal = 0, equityTotal = 0
    raw.forEach((r: any) => {
      const key = pickStr(r.rowKey)
      const v = pickNumber(r.periodValue)
      const item = {
        code: key,
        name: pickStr(r.rowName).trim(),
        direction: BS_ASSET_KEYS.has(key) ? 'D' : 'C',
        endBalance: v,
        isTotal: !!r.bold,
      }
      if (BS_ASSET_KEYS.has(key)) { assets.push(item); if (!r.bold) assetsTotal = v }
      else if (BS_LIAB_KEYS.has(key)) { liab.push(item); if (!r.bold) liabTotal = v }
      else if (BS_EQUITY_KEYS.has(key)) { equity.push(item); if (!r.bold) equityTotal = v }
    })
    // 优先用后端 balanceCheck 算的总额
    const bc = d.balanceCheck || {}
    const aT = pickNumber(bc.asset, assetsTotal)
    const leT = pickNumber(bc.liabilityEquity, liabTotal + equityTotal)
    return {
      period: '2026-02-28',
      assets,
      liab,
      equity,
      assetsTotal: aT,
      liabTotal,
      equityTotal: leT - liabTotal,
      liabEquityTotal: leT,
      balanced: !!bc.balanced,
    }
  }

  if (kind === 'income') {
    const rows = raw.map((r: any) => ({
      code: pickStr(r.rowKey),
      name: pickStr(r.rowName),
      direction: reportCodeToDirection(pickStr(r.rowKey), pickStr(r.rowName)),
      monthAmount: pickNumber(r.periodValue),
      yearAmount: pickNumber(r.ytdValue),
      isHeader: !!r.bold,
      isItem: !r.bold,
    }))
    return { period: '2026-02', rows }
  }

  return d
}

export function adaptBalanceSummary(d: any): any {
  if (!d) return { period: '', rows: [] }
  if (Array.isArray(d.rows)) return d
  return d
}

// ==================== 系统 ====================
export function adaptUser(u: any): any {
  if (!u) return u
  return {
    ...u,
    id: u.id,
    username: pickStr(u.username),
    realName: pickStr(u.realName, '-'),
    phone: pickStr(u.phone, '-'),
    email: pickStr(u.email, '-'),
    isSuper: !!u.isSuper,
    status: pickNumber(u.status, 1),
    userRoles: u.userRoles || [],
    userTenants: u.userTenants || [],
  }
}

export function adaptUserList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptUser) : Array.isArray(d) ? d.map(adaptUser) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

export function adaptRole(r: any): any {
  if (!r) return r
  return {
    ...r,
    id: r.id,
    code: pickStr(r.code),
    name: pickStr(r.name),
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
    remark: pickStr(r.remark, '-'),
  }
}

export function adaptRoleList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptRole) : Array.isArray(d) ? d.map(adaptRole) : []
  return { list, total: list.length }
}

export function adaptLog(l: any): any {
  if (!l) return l
  return {
    ...l,
    id: l.id,
    createdAt: asDateTimeStr(l.createdAt),
    username: pickStr(l.username, '-'),
    action: pickStr(l.action, '-'),
    method: pickStr(l.method, '-'),
    path: pickStr(l.path, '-'),
    targetId: l.targetId ?? null,
    ip: pickStr(l.ip, '-'),
    detail: l.detail || null,
  }
}

export function adaptLogList(d: any): any {
  const list = Array.isArray(d?.list) ? d.list.map(adaptLog) : Array.isArray(d) ? d.map(adaptLog) : []
  return { list, total: pickNumber(d?.total, list.length) }
}

export function adaptTenant(t: any): any {
  if (!t) return t
  return {
    ...t,
    id: t.id,
    name: pickStr(t.name),
    taxNo: pickStr(t.taxNo, '-'),
    address: pickStr(t.address, '-'),
    legalRep: pickStr(t.legalRep, '-'),
    status: pickNumber(t.status, 1),
    startYear: pickNumber(t.startYear, 2026),
    startMonth: pickNumber(t.startMonth, 1),
    _count: t._count || { vouchers: pickNumber(t._count?.vouchers, 0) },
  }
}

export function adaptTenantList(d: any): any[] {
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  return list.map(adaptTenant)
}

export function adaptBackup(b: any): any {
  if (!b) return b
  return {
    id: b.id,
    fileName: pickStr(b.fileName),
    size: pickNumber(b.size),
    createdAt: asDateTimeStr(b.createdAt),
  }
}

export function adaptBackupList(d: any): any[] {
  const list = Array.isArray(d?.list) ? d.list : Array.isArray(d) ? d : []
  return list.map(adaptBackup)
}

// ==================== 导出集中入口 ====================
export const Adapters = {
  dashboardSummary: adaptDashboardSummary,
  voucherList: adaptVoucherList,
  voucher: adaptVoucher,
  subjectTree: adaptSubjectTree,
  partnerList: adaptPartnerList,
  deptList: adaptSimpleList,
  projectList: adaptSimpleList,
  employeeList: adaptSimpleList,
  periodList: adaptPeriodList,
  initialBalances: adaptInitialBalances,
  arapList: adaptArapList,
  arapBill: adaptArapBill,
  arapAging: adaptAging,
  invoiceList: adaptInvoiceList,
  invoice: adaptInvoice,
  vatSummary: adaptVatSummary,
  fundAccounts: adaptFundAccountList,
  fundJournals: adaptFundJournalList,
  assetList: adaptAssetList,
  claimList: adaptClaimList,
  claimDetail: adaptClaimDetail,
  closingChecklist: adaptClosingChecklist,
  reportBalanceSheet: (d: any) => adaptReportRows(d, 'balance-sheet'),
  reportIncome: (d: any) => adaptReportRows(d, 'income'),
  reportBalanceSummary: adaptBalanceSummary,
  userList: adaptUserList,
  roleList: adaptRoleList,
  logList: adaptLogList,
  tenantList: adaptTenantList,
  backupList: adaptBackupList,
}
