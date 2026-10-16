import { defineStore } from 'pinia'
import { authLogout } from '@/api/modules'

export interface AuthUser {
  id: number
  username: string
  realName: string
  isSuper: boolean
  perms: string[]
}

export interface TenantBrief {
  id: number
  name: string
  status: number
}

interface LoginPayload {
  accessToken: string
  refreshToken: string
  user: AuthUser
  tenants: TenantBrief[]
  currentTenantId: number | null
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('fm_token') || '',
    user: loadJson<AuthUser | null>('fm_user', null),
    tenants: loadJson<TenantBrief[]>('fm_tenants', []),
    currentTenantId: localStorage.getItem('fm_tenant_id') || '',
  }),

  getters: {
    isSuper: (s) => !!s.user?.isSuper,
    perms: (s): string[] => s.user?.perms ?? [],
    realName: (s) => s.user?.realName || s.user?.username || '未知用户',
    currentTenant(): TenantBrief | undefined {
      return this.tenants.find((t) => String(t.id) === String(this.currentTenantId))
    },
    currentTenantName(): string {
      return this.currentTenant?.name || ''
    },
  },

  actions: {
    /** 权限判断:isSuper 拥有全部;codes 为任一满足即可(any-of) */
    hasPerm(codes?: string | string[] | null): boolean {
      if (!codes || (Array.isArray(codes) && codes.length === 0)) return true
      if (this.isSuper) return true
      const list = Array.isArray(codes) ? codes : [codes]
      return list.some((c) => this.perms.includes(c))
    },

    setAuth(payload: LoginPayload) {
      this.token = payload.accessToken
      this.refreshToken = payload.refreshToken || ''
      if (payload.refreshToken) localStorage.setItem('fm_refresh', payload.refreshToken)
      this.user = payload.user
      this.tenants = payload.tenants || []
      this.currentTenantId = payload.currentTenantId != null ? String(payload.currentTenantId) : ''
      localStorage.setItem('fm_token', payload.accessToken)
      localStorage.setItem('fm_user', JSON.stringify(payload.user))
      localStorage.setItem('fm_tenants', JSON.stringify(payload.tenants || []))
      if (payload.currentTenantId != null) localStorage.setItem('fm_tenant_id', String(payload.currentTenantId))
    },

    async logout() {
      // 调后端 revoke(jti 加入黑名单) — 即使 token 被截也无法再使用
      try {
        const token = this.token
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1] || 'eyJ9'))
          const rt = this.refreshToken || localStorage.getItem('fm_refresh') || ''
          let refreshJti = ''
          let refreshExp = 0
          if (rt) {
            try {
              const rp = JSON.parse(atob(rt.split('.')[1] || 'eyJ9'))
              refreshJti = rp.jti || ''
              refreshExp = rp.exp || 0
            } catch { /* 坏 token 忽略 */ }
          }
          await authLogout({
            jti: payload.jti,
            accessExp: payload.exp || 0,
            refreshJti,
            refreshExp,
          })
        }
      } catch {
        /* 忽略,本地仍要清 */
      }
      this.token = ''
      this.refreshToken = ''
      this.user = null
      this.tenants = []
      this.currentTenantId = ''
      localStorage.removeItem('fm_token')
      localStorage.removeItem('fm_refresh')
      localStorage.removeItem('fm_user')
      localStorage.removeItem('fm_tenants')
      localStorage.removeItem('fm_tenant_id')
    },
  },
})
