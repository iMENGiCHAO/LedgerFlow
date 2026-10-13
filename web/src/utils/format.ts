import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

/** 金额千分位格式化(金额字段为 Decimal 序列化后的字符串) */
export function fmtMoney(v: unknown, dash = '-'): string {
  if (v === null || v === undefined || v === '') return dash
  const num = Number(v)
  if (!Number.isFinite(num)) return String(v)
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 转数字(非法值返回 0) */
export function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 日期格式化 */
export function fmtDate(v: unknown, tpl = 'YYYY-MM-DD'): string {
  if (!v) return '-'
  const d = dayjs(v as string)
  return d.isValid() ? d.format(tpl) : '-'
}

/** 时间格式化(含时分秒) */
export function fmtDateTime(v: unknown): string {
  return fmtDate(v, 'YYYY-MM-DD HH:mm:ss')
}

// ==================== 状态字典 ====================

export const VOUCHER_STATUS: Record<number, { label: string; tag: 'info' | 'warning' | 'success' | 'danger' }> = {
  0: { label: '草稿', tag: 'info' },
  1: { label: '待审核', tag: 'warning' },
  2: { label: '已记账', tag: 'success' },
  3: { label: '作废', tag: 'danger' },
}

export const CLAIM_STATUS: Record<number, { label: string; tag: 'info' | 'warning' | 'primary' | 'success' | 'danger' }> = {
  0: { label: '草稿',          tag: 'info' },
  1: { label: '待总经理审批',   tag: 'warning' },
  2: { label: '待财务复核',     tag: 'warning' },
  3: { label: '待财务复核',     tag: 'warning' },  // 老数据兼容
  4: { label: '待付款',         tag: 'primary' },
  5: { label: '已付款',         tag: 'success' },
  6: { label: '已驳回',         tag: 'danger' },
  7: { label: '已撤回',         tag: 'info' },
}

/** 报销单当前阶段(用于详情头部阶段条 / 完结横幅) */
export const CLAIM_PHASE: Record<number, { label: string; tone: 'in-progress' | 'finished' | 'rejected' | 'withdrawn' | 'draft' }> = {
  0: { label: '草稿待提交',           tone: 'draft' },
  1: { label: '总经理审批中',         tone: 'in-progress' },
  2: { label: '财务复核中',           tone: 'in-progress' },
  3: { label: '财务复核中(兼容)',     tone: 'in-progress' },
  4: { label: '出纳付款中',           tone: 'in-progress' },
  5: { label: '流程已完结 · 已付款',  tone: 'finished' },
  6: { label: '流程已驳回',           tone: 'rejected' },
  7: { label: '已被申请人撤回',       tone: 'withdrawn' },
}

export const PERIOD_STATUS: Record<number, string> = {
  0: '未开始',
  1: '进行中',
  2: '已结账',
}

export const SOURCE_TYPES: Record<number, string> = {
  0: '手工录入',
  1: '费用报销',
  2: '应收应付',
  3: '折旧计提',
  4: '结转损益',
  5: '红冲',
  6: '资产处置',
}

export const CATEGORY_NAMES: Record<number, string> = {
  1: '资产',
  2: '负债',
  3: '权益',
  4: '成本',
  5: '损益-收入',
  6: '损益-费用',
}

export const ARAP_TYPE_NAMES: Record<number, string> = {
  1: '应收单',
  2: '收款单',
  3: '应付单',
  4: '付款单',
}

export const INVOICE_STATUS: Record<number, { label: string; tag: 'success' | 'danger' | 'warning' }> = {
  1: { label: '正常', tag: 'success' },
  2: { label: '作废', tag: 'danger' },
  3: { label: '红冲', tag: 'warning' },
}

export const EXPENSE_TYPES = ['差旅费', '交通费', '办公费', '业务招待费', '通讯费', '培训费', '其他']

export const ASSET_CATEGORIES = ['电子设备', '运输工具', '办公家具', '机器设备', '房屋建筑物']

export const SETTLE_TYPES = ['现金', '现金支票', '转账支票', '电汇', '网银', '支付宝', '微信', '其他']

/** 凭证字选项 */
export const VOUCHER_WORDS = ['记', '收', '付', '转']

/** 科目辅助核算 flags(subject.assist 形如 {partner:true} 或 null) */
export function assistFlags(assist: unknown): { partner: boolean; department: boolean; project: boolean } {
  const a = (assist || {}) as Record<string, unknown>
  return { partner: !!a.partner, department: !!a.department, project: !!a.project }
}

/** 是否资金类科目(现金/银行,结算方式输入用) */
export function isCashSubjectCode(code?: string): boolean {
  if (!code) return false
  return code.startsWith('1001') || code.startsWith('1002')
}

/** 凭证号显示:word-no */
export function voucherNo(word?: string, no?: number | string): string {
  if (!word && !no) return '-'
  return `${word ?? ''}-${no ?? ''}`
}

/** 字节大小可读显示 */
export function fmtSize(size: unknown): string {
  const n = toNum(size)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// ==================== 打印与下载 ====================

/** 新窗口打开 HTML 并调起打印 */
export function printHtml(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=1080,height=760')
  if (!win) {
    ElMessage.warning('浏览器拦截了打印窗口,请允许弹出窗口后重试')
    return
  }
  win.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  body { font-family: "PingFang SC","Microsoft YaHei",Arial,sans-serif; padding: 0; margin: 0 auto; max-width: 186mm; color: #111827; }
  h1 { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 3px; margin: 18px 0 2px; color: #111827; }
  .co { text-align: center; font-size: 13px; letter-spacing: 1px; font-weight: 600; color: #374151; }
  .sub { text-align: center; color: #9ca3af; font-size: 11px; letter-spacing: 2px; margin-bottom: 16px; }
  .meta { display: flex; justify-content: space-between; font-size: 12px; color: #374151;
          border-top: 2px solid #111827; border-bottom: 1px solid #e5e7eb; padding: 8px 2px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 9px; text-align: left; word-break: break-all; }
  th { background: #f1f5f9; font-weight: 600; color: #334155; }
  tr.total td { background: #f8fafc; font-weight: 600; }
  .r { text-align: right; }
  .c { text-align: center; }
  .indent-1 { padding-left: 22px !important; } .indent-2 { padding-left: 38px !important; }
  .sign { display: flex; justify-content: space-between; margin-top: 26px; font-size: 12px; color: #374151; }
  .sign span { min-width: 110px; }
  .foot { margin-top: 22px; text-align: right; font-size: 10px; color: #9ca3af; }
</style>
</head>
<body>${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body>
</html>`)
  win.document.close()
}

/** 携带 Authorization 下载文件(blob 方式) */
export async function downloadAuthedFile(url: string, fallbackName = 'download') {
  const token = localStorage.getItem('fm_token') || ''
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    ElMessage.error(`下载失败(HTTP ${res.status})`)
    return
  }
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') || ''
  let name = fallbackName
  const m1 = cd.match(/filename\*=UTF-8''([^;]+)/i)
  const m2 = cd.match(/filename="?([^";]+)"?/i)
  if (m1) name = decodeURIComponent(m1[1])
  else if (m2) name = decodeURIComponent(m2[1])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

/** 前端生成 CSV(BOM 头,Excel 兼容)并下载 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    // 防公式注入 + 逗号引号转义
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return `"${safe.replace(/"/g, '""')}"`
  }
  const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}
