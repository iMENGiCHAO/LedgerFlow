/**
 * 一键导出 Excel 工具
 * 用法:
 *   const exportExcel = useExcelExporter()
 *   exportExcel({ url: '/vouchers', filename: '凭证', params: q })
 *
 * 原理: 给 url 加 ?format=xlsx,axios 用 responseType:'blob' 拿 buffer,
 *       创建 a[download] 触发浏览器下载。
 */
import { ElMessage } from 'element-plus'
import client from '@/api/client'

export interface ExportOptions {
  /** 后端 list 端点路径,如 /vouchers */
  url: string
  /** 下载文件名(不带扩展名),默认用时间戳 */
  filename?: string
  /** 额外 query 参数 */
  params?: Record<string, unknown>
  /** 提示文字 */
  loadingText?: string
}

export async function exportExcel(opts: ExportOptions): Promise<void> {
  const filename = (opts.filename || 'export') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx'
  const params = { ...(opts.params || {}), format: 'xlsx' as const }
  // 简单 loading(不阻塞 UI)
  const loading = opts.loadingText ? `正在生成 ${opts.loadingText}…` : '正在导出…'
  // eslint-disable-next-line no-console
  console.log(`[excel] ${loading}`)
  try {
    // 关键: 不要走 client interceptor 的解包(它会把 blob 当字符串)——
    // 直接用原生 fetch,保证拿到真正的二进制流
    const params = { ...(opts.params || {}), format: 'xlsx' as const }
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    const token = localStorage.getItem('fm_token') || ''
    const url = `/api/v1${opts.url.startsWith('/') ? opts.url : '/' + opts.url}${qs ? '?' + qs : ''}`
    console.log('[excel] GET', url)
    const resp = await fetch(url, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
    if (!resp.ok) {
      const text = await resp.text()
      try { const j = JSON.parse(text); ElMessage.error(j.message || `HTTP ${resp.status}`) }
      catch { ElMessage.error(`HTTP ${resp.status}: ${text.slice(0, 200)}`) }
      return
    }
    const blob = await resp.blob()
    console.log('[excel] blob size:', blob.size, 'type:', blob.type)
    if (!blob || blob.size === 0) {
      ElMessage.warning('导出为空,没有数据可下载')
      return
    }
    // 检查是不是 JSON 错误(后端 200 但 content-type 是 application/json)
    if (blob.type.includes('application/json')) {
      const text = await blob.text()
      try { const j = JSON.parse(text); ElMessage.error(j.message || '导出失败') }
      catch { ElMessage.error('导出失败: ' + text.slice(0, 200)) }
      return
    }
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    }, 200)
    ElMessage.success(`已导出: ${filename} (${(blob.size / 1024).toFixed(1)} KB)`)
  } catch (err: any) {
    console.error('[excel] export failed:', err)
    ElMessage.error(err?.message || '导出失败')
  }
}
