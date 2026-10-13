import { ArgumentsHost, CallHandler, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import type { Response, Request } from 'express';
import { PrismaService } from '../prisma.service';
import { OPLOG_KEY, getIp } from './decorators';
import { ResponseSentError } from './excel';

function wrapBody(body: unknown): unknown {
  if (body && typeof body === 'object' && 'code' in (body as Record<string, unknown>)) return body;
  return { code: 0, message: 'ok', data: body ?? null };
}

/** 统一成功响应包装:{code:0,message:'ok',data} */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      // 1) 拦截 ResponseSentError:controller 已 res.end,不能再包 envelope
      //    关键: 必须 throw 一个 NestJS 不会再 res.json 的特殊异常。
      //    我们的方案: 抛一个特殊 Error 字符串(被 AllExceptionsFilter 识别并跳过 res.json)
      catchError((err) => {
        if (err instanceof ResponseSentError) {
          // 抛 "已发" 标记(AllExceptionsFilter 会识别并跳过)
          const fake = new Error('__RESPONSE_SENT__') as Error & { __skipFilter?: boolean }
          fake.__skipFilter = true
          return Promise.reject(fake)
        }
        return Promise.reject(err);
      }),
      // 2) 正常 JSON 包装
      map((data) => {
        const res = _ctx.switchToHttp().getResponse<Response>();
        if (res.headersSent) {
          // envelope 已发出(其他 interceptor 写过),不要再 json
          return null;
        }
        return wrapBody(data);
      }),
    );
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    // ⚠️ 关键: Controller 已直接 res.end(如 Excel 导出),不能再 res.json
    // 跳过 (否则抛 ERR_HTTP_HEADERS_SENT,导致整个请求挂死)
    if ((exception as any)?.__skipFilter || res.headersSent) {
      return;
    }
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: Record<string, unknown> = {
      code: 50000,
      message: process.env.NODE_ENV !== 'production' ? String((exception as Error)?.message ?? exception) : '系统内部错误',
      data: null,
    };
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        payload = { code: status * 100, message: body, data: null };
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        payload = {
          code: typeof b.code === 'number' ? b.code : status * 100,
          message: Array.isArray(b.message) ? (b.message as string[]).join(';') : (b.message as string) || exception.message,
          data: b.data ?? null,
        };
      }
    }
    res.status(status).json(payload);
    // 调试:输出完整 stack 到 stderr
    if (!(exception instanceof HttpException) || status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[API ERROR]', exception);
    }
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 模块级单例:绕过 tsx 运行时 constructor 注入的 metadata 反射坑
let _opPrisma: PrismaService | null = null;
let _opReflector: Reflector | null = null;
export function attachOpLogDeps(prisma: PrismaService, reflector: Reflector): void {
  _opPrisma = prisma;
  _opReflector = reflector;
}

@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const prisma = _opPrisma;
    const reflector = _opReflector;
    if (!prisma || !reflector) return next.handle();

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: { uid: number; username: string } }>();
    const method = req.method.toUpperCase();
    if (!MUTATING.has(method)) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => {
          const desc = reflector.get(OPLOG_KEY, ctx.getHandler());
          const user = req.user;
          prisma.operationLog
            .create({
              data: {
                userId: user?.uid ?? null,
                username: user?.username ?? null,
                action: desc || `${method}`,
                method,
                path: (req.originalUrl || req.path || '').split('?')[0],
                targetId: req.params?.['id'] ? String(req.params['id']) : undefined,
                detail: truncate(req.body as Record<string, unknown> | undefined),
                ip: getIp(req),
              },
            })
            .catch(() => undefined);
        },
      }),
    );
  }
}

function truncate(body: Record<string, unknown> | undefined, max = 600): object | undefined {
  if (!body || typeof body !== 'object') return undefined;
  try {
    const safe = JSON.parse(
      JSON.stringify(body, (_k, v) => (typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v), ),
      (_k, v) => (/password/i.test(String(_k)) ? '***' : v),
    );
    const s = JSON.stringify(safe);
    if (s.length <= max) return safe;
    return { _truncated: s.slice(0, max) };
  } catch {
    return {};
  }
}
