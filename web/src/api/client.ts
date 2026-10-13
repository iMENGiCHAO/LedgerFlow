import axios, { type AxiosError } from 'axios'
import { ElMessage } from 'element-plus'

/** 统一清除本地登录态 */
export function clearAuthStorage() {
  localStorage.removeItem('fm_token')
  localStorage.removeItem('fm_user')
  localStorage.removeItem('fm_tenants')
  localStorage.removeItem('fm_tenant_id')
}

function gotoLogin() {
  clearAuthStorage()
  if (!location.pathname.startsWith('/login')) {
    const redirect = location.pathname + location.search
    location.href = '/login?redirect=' + encodeURIComponent(redirect)
  }
}

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截:附带 Bearer Token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('fm_token')
  if (token) {
    config.headers = config.headers || {}
    ;(config.headers as Record<string, unknown>).Authorization = `Bearer ${token}`
  }
  return config
})

/* ------------------------------------------------------------------
 * 全局错误提示防刷屏:
 * 1. 同一文案 500ms 内只弹 1 次(去重)
 * 2. 单例 message 实例(后到的提示直接顶掉前者,而不是叠加排队)
 * 3. 401 仍只弹一次(避免多次 401 雪崩式弹窗)
 * ------------------------------------------------------------------ */
let activeMsg: ReturnType<typeof ElMessage> | null = null
const recentMsgCache = new Map<string, number>()  // msg -> lastShownAt
const DEDUPE_WINDOW = 500
let lastUnauthShownAt = 0

function showOnce(type: 'error' | 'warning' | 'info', text: string, duration = 2500) {
  const now = Date.now()
  const last = recentMsgCache.get(text) || 0
  if (now - last < DEDUPE_WINDOW) return
  recentMsgCache.set(text, now)
  // 关闭前一个,避免堆叠
  if (activeMsg) {
    try { activeMsg.close() } catch { /* ignore */ }
  }
  activeMsg = ElMessage({ type, message: text, duration, showClose: false, grouping: true })
}

// 响应拦截:解包 {code,message,data};code!==0 弹错并 reject;401 清登录态回登录页
client.interceptors.response.use(
  (response) => {
    // blob 等非标准包装直接返回
    if (!(response.data && typeof response.data === 'object' && 'code' in response.data)) {
      return response.data
    }
    const body = response.data
    if (body.code === 401 || body.code === 40100) {
      const now = Date.now()
      if (now - lastUnauthShownAt > 1000) {
        showOnce('error', body.message || '登录已失效,请重新登录', 2000)
        lastUnauthShownAt = now
        gotoLogin()
      }
      return Promise.reject(new Error(body.message || '未授权'))
    }
    if (body.code !== 0) {
      showOnce('error', body.message || '操作失败')
      return Promise.reject(new Error(body.message || 'error'))
    }
    return body.data
  },
  (error: AxiosError<any>) => {
    const status = error?.response?.status
    const body = error?.response?.data as { code?: number; message?: string } | undefined
    const msg = body?.message || error.message || '网络请求失败'
    if (status === 401 || body?.code === 401 || body?.code === 40100) {
      const now = Date.now()
      if (now - lastUnauthShownAt > 1000) {
        showOnce('error', msg, 2000)
        lastUnauthShownAt = now
        gotoLogin()
      }
    } else {
      showOnce('error', msg)
    }
    return Promise.reject(error)
  },
)

export default client
