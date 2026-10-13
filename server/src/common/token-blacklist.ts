/**
 * 退出登录黑名单:用户主动登出后,jti 被加入此表,jwt 校验时直接拒绝
 * - 内存版:适用于单进程部署(demo)
 * - 生产环境应换 Redis(本版本保持简单,够用)
 */
export class TokenBlacklist {
  static revoked = new Map<string, number>() // jti -> expiresAt(ms)

  static add(jti: string, exp: number): void {
    if (!jti || exp <= Date.now()) return
    this.revoked.set(jti, exp)
    // 过期后自动清理(不需要持久化)
    setTimeout(() => {
      const e = this.revoked.get(jti)
      if (e && e <= Date.now()) this.revoked.delete(jti)
    }, Math.max(1000, exp - Date.now()))
  }

  static isRevoked(jti: string): boolean {
    if (!jti) return false
    const exp = this.revoked.get(jti)
    if (exp == null) return false
    if (exp <= Date.now()) {
      this.revoked.delete(jti)
      return false
    }
    return true
  }

  /** 主动登出:把 access + refresh 的 jti 都加入黑名单 */
  static revokePair(jti: string, refreshJti: string, accessExp: number, refreshExp: number): void {
    this.add(jti, accessExp)
    this.add(refreshJti, refreshExp)
  }
}
