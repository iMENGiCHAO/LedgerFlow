import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ERR } from './errors';
import { IS_PUBLIC_KEY, PERM_KEY, SessionUser } from './decorators';
import { TokenBlacklist } from './token-blacklist';

/**
 * 关键设计:tsx 运行时 constructor 依赖注入(基于 reflect-metadata)有坑
 * (在 Harness 沙箱里 100% 复现 undefined),所以 Guard 不再用 NestJS DI,
 * 而是 main.ts 在 app.listen() 之前调用 attachAuthGuardDeps(jwt, reflector)
 * 把依赖注入到模块级单例,Guard 直接读这些单例。
 * 这是经过沙箱反复验证最稳的写法,不要改成 constructor 注入。
 */
let _jwt: JwtService | null = null;
let _reflector: Reflector | null = null;

export function attachAuthGuardDeps(jwt: JwtService, reflector: Reflector): void {
  _jwt = jwt;
  _reflector = reflector;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const reflector = _reflector;
    if (!reflector) throw new Error('JwtAuthGuard: 依赖未初始化,请检查 main.ts');
    const jwt = _jwt;
    if (!jwt) throw new Error('JwtAuthGuard: JwtService 未初始化,请检查 main.ts');

    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException({ code: ERR.UNAUTHORIZED, message: '未登录或令牌缺失', data: null });
    try {
      const payload = await jwt.verifyAsync(token);
      // 黑名单检查:已主动登出(jti 已被 revoke)的 token 一律拒绝
      const jti = (payload as { jti?: string }).jti;
      if (jti && TokenBlacklist.isRevoked(jti)) {
        throw new Error('token revoked');
      }
      req.user = payload as SessionUser;
      return true;
    } catch {
      throw new UnauthorizedException({ code: ERR.UNAUTHORIZED, message: '登录已过期,请重新登录', data: null });
    }
  }
}

@Injectable()
export class PermsGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const reflector = _reflector;
    if (!reflector) throw new Error('PermsGuard: 依赖未初始化,请检查 main.ts');

    const required = reflector.getAllAndOverride<string[] | undefined>(PERM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException({ code: ERR.UNAUTHORIZED, message: '未登录', data: null });
    if (user.isSuper) return true;
    const owned = new Set(user.perms || []);
    // any-of 语义:用户拥有任一所需权限即可(对齐前端 hasPerm 的 some 语义)
    const has = required.some((code) => owned.has(code));
    if (!has) {
      throw new ForbiddenException({
        code: ERR.FORBIDDEN,
        message: `无操作权限(需要其中之一:${required.join('/')}),请联系管理员分配角色`,
        data: null,
      });
    }
    return true;
  }
}
