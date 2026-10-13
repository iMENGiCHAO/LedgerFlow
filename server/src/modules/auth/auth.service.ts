import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { TokenBlacklist } from '../../common/token-blacklist';

/** 登录限流:内存版(单进程适用;集群环境应改 Redis)
 *  - 3 次失败 → 锁定 1 分钟
 *  - 5 次失败 → 锁定 30 分钟 */
class LoginThrottle {
  static attempts = new Map<string, { count: number; lockedUntil: number }>();
}

export interface TenantBrief {
  id: number;
  name: string;
  status: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: number; username: string; realName: string; isSuper: boolean; perms: string[] };
  tenants: TenantBrief[];
  currentTenantId: number | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async buildAuth(userId: number, tenantId?: number | null): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        userTenants: { include: { tenant: true }, orderBy: { tenantId: 'asc' } },
      },
    });
    const perms = [...new Set(user.userRoles.flatMap((ur) => ur.role.permissions))];
    const tenants: TenantBrief[] = user.isSuper
      ? await this.prisma.tenant.findMany({ select: { id: true, name: true, status: true }, orderBy: { id: 'asc' } })
      : user.userTenants.map((ut) => ({ id: ut.tenantId, name: ut.tenant.name, status: ut.tenant.status }));
    const tid = tenantId ?? user.userTenants.find((ut) => ut.isDefault)?.tenantId ?? tenants[0]?.id ?? null;

    const jti = randomUUID();
    const refreshJti = randomUUID();
    const payload = {
      uid: user.id,
      tid,
      jti,
      username: user.username,
      realName: user.realName,
      isSuper: user.isSuper,
      perms,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN || '2h' });
    const refreshToken = this.jwt.sign({ ...payload, jti: refreshJti }, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, realName: user.realName, isSuper: user.isSuper, perms },
      tenants,
      currentTenantId: tid,
    };
  }

  async login(username: string, password: string): Promise<AuthResult> {
    // 业务规则:登录限流(防暴力破解) - 内存版
    const now = Date.now();
    const rec = LoginThrottle.attempts.get(username);
    if (rec) {
      // 锁定中
      if (rec.lockedUntil && rec.lockedUntil > now) {
        const remain = Math.ceil((rec.lockedUntil - now) / 1000);
        throw new UnauthorizedException(`登录失败次数过多,请 ${remain} 秒后再试`);
      }
      // 锁定到期后清零
      if (rec.lockedUntil && rec.lockedUntil <= now) {
        LoginThrottle.attempts.delete(username);
      }
    }
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      const r = LoginThrottle.attempts.get(username) || { count: 0, lockedUntil: 0 };
      r.count += 1;
      if (r.count >= 5) {
        // 5 次失败 → 锁定 30 分钟
        r.lockedUntil = now + 30 * 60 * 1000;
      } else if (r.count >= 3) {
        // 3-4 次 → 锁定 1 分钟
        r.lockedUntil = now + 60 * 1000;
      }
      LoginThrottle.attempts.set(username, r);
      const left = 5 - r.count;
      throw new UnauthorizedException(left > 0 ? `用户名或密码错误,还有 ${left} 次尝试机会` : '用户名或密码错误');
    }
    if (user.status !== 1) throw new UnauthorizedException('账号已被禁用,请联系管理员');
    // 登录成功清零
    LoginThrottle.attempts.delete(username);
    return this.buildAuth(user.id);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken);
      if (!payload?.uid) throw new Error('bad token');
      // 校验用户仍启用
      const u = await this.prisma.user.findUnique({ where: { id: payload.uid }, select: { status: true } });
      if (u?.status !== 1) throw new Error('disabled');
      return this.buildAuth(payload.uid, payload.tid ?? null);
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
  }

  async switchTenant(userId: number, tenantId: number): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userTenants: true },
    });
    if (!user) throw new UnauthorizedException();
    if (!user.isSuper && !user.userTenants.some((ut) => ut.tenantId === tenantId)) {
      throw new BadRequestException('无权访问该账套');
    }
    return this.buildAuth(userId, tenantId);
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
      throw new BadRequestException('原密码不正确');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
    });
  }

  /**
   * 退出登录:把当前 access + refresh token 的 jti 加入黑名单
   * 后续请求即使带这两个 token,也会被 JwtAuthGuard 拒绝
   */
  async logout(userId: number, jti: string, refreshJti: string, accessExp: number, refreshExp: number): Promise<void> {
    // 业务规则:必须是当前用户才能登出
    if (!jti) throw new BadRequestException('无效的令牌');
    TokenBlacklist.revokePair(jti, refreshJti || jti, accessExp * 1000, refreshExp * 1000);
  }
}
