/**
 * 令牌吊销黑名单:用户主动登出后,access/refresh token 的 jti 被加入黑名单,校验时直接拒绝。
 *
 * 双写设计:内存 Map 作读缓存(热路径零开销),同时落库 TokenRevocation,
 * 进程重启后从数据库恢复未过期记录 —— 重启不再让「已注销的 token 复活」。
 * 单机部署无外部依赖;生产如需多实例共享,可再引入 Redis(接口不变)。
 */
import { PrismaService } from '../prisma.service';

export class TokenBlacklist {
  private static revoked = new Map<string, number>(); // jti -> expiresAt(ms)
  private static prisma: PrismaService | null = null;

  /** 应用启动时注入 Prisma 并加载未过期吊销记录 */
  static async init(prisma: PrismaService): Promise<void> {
    this.prisma = prisma;
    try {
      const rows = await prisma.tokenRevocation.findMany({
        where: { expAt: { gt: new Date() } },
        select: { jti: true, expAt: true },
      });
      const now = Date.now();
      for (const r of rows) {
        const exp = r.expAt.getTime();
        if (exp > now) this.scheduleCleanup(r.jti, exp);
        this.revoked.set(r.jti, exp);
      }
    } catch {
      // 数据库不可用时不阻塞启动,黑名单退化为内存模式
    }
  }

  static add(jti: string, exp: number): void {
    if (!jti || exp <= Date.now()) return;
    this.revoked.set(jti, exp);
    this.scheduleCleanup(jti, exp);
    // 异步落库(失败不影响响应)
    this.prisma?.tokenRevocation
      .upsert({
        where: { jti },
        create: { jti, expAt: new Date(exp) },
        update: { expAt: new Date(exp) },
      })
      .catch(() => undefined);
  }

  static isRevoked(jti: string): boolean {
    if (!jti) return false;
    const exp = this.revoked.get(jti);
    if (exp == null) return false;
    if (exp <= Date.now()) {
      this.revoked.delete(jti);
      return false;
    }
    return true;
  }

  /** 主动登出:把 access + refresh 的 jti 都加入黑名单 */
  static revokePair(jti: string, refreshJti: string, accessExp: number, refreshExp: number): void {
    this.add(jti, accessExp);
    this.add(refreshJti, refreshExp);
  }

  private static scheduleCleanup(jti: string, exp: number): void {
    const t = setTimeout(() => {
      const e = this.revoked.get(jti);
      if (e && e <= Date.now()) this.revoked.delete(jti);
    }, Math.max(1000, exp - Date.now()));
    t.unref?.();
  }
}
