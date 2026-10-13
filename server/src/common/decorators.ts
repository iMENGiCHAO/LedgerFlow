import { createParamDecorator, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface SessionUser {
  uid: number;
  tid: number;
  username: string;
  realName: string;
  isSuper: boolean;
  perms: string[];
}

export const IS_PUBLIC_KEY = 'fm:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERM_KEY = 'fm:perm';
/** 接口权限码声明,如 @Perm('voucher:create') */
export const Perm = (...codes: string[]) => SetMetadata(PERM_KEY, codes);

export const OPLOG_KEY = 'fm:oplog';
/** 操作日志描述,如 @OpLog('创建凭证') */
export const OpLog = (desc: string) => SetMetadata(OPLOG_KEY, desc);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** 当前账套 ID(未选择账套时报错) */
export const CurrentTid = createParamDecorator((_data: unknown, ctx: ExecutionContext): number => {
  const req = ctx.switchToHttp().getRequest<{ user?: SessionUser }>();
  const tid = req.user?.tid;
  if (!tid) {
    throw new ForbiddenException('当前账号未绑定账套,请联系管理员');
  }
  return tid;
});

export function getIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip || '';
}
