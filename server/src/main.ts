import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './app.module';
import { attachAuthGuardDeps } from './common/guards';
import { attachOpLogDeps } from './common/interceptors';
import { PrismaService } from './prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  // 生产硬化:检测演示用弱 JWT 密钥,避免带着默认密钥上生产
  const jwtSecret = process.env.JWT_SECRET ?? '';
  const isWeakSecret = !jwtSecret || jwtSecret.includes('change-me') || jwtSecret.length < 32;
  if (isWeakSecret) {
    const msg =
      '[FM-Server] 安全告警: JWT_SECRET 未设置/过短(<32)/仍是演示值(change-me)。' +
      '生产环境请在 .env 配置高强度随机密钥(如 openssl rand -base64 48 生成)。';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg + ' 检测到 NODE_ENV=production,拒绝启动。');
    }
    // eslint-disable-next-line no-console
    console.warn(msg);
  }

  // 关键:绕过 tsx 运行时 constructor 注入失效的坑(沙箱 100% 复现),
  // 在 app.listen() 之前显式把 JwtService / Reflector / PrismaService
  // 注入到 Guard / Interceptor 的模块级单例。
  attachAuthGuardDeps(
    app.get(JwtService, { strict: false }),
    app.get(Reflector, { strict: false }),
  );
  attachOpLogDeps(
    app.get(PrismaService, { strict: false }),
    app.get(Reflector, { strict: false }),
  );

  app.setGlobalPrefix('api/v1');
  // CORS:默认仅同源(开发态由 Vite 代理 /api,无跨域);需要跨域时用 CORS_ORIGIN 显式放开
  const corsOrigin = (process.env.CORS_ORIGIN ?? '').trim();
  app.enableCors(
    corsOrigin
      ? { origin: corsOrigin.split(',').map((s) => s.trim()), credentials: true }
      : { origin: false },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: true,
      exceptionFactory: (errors) => {
        const messages = errors.map((e) => Object.values(e.constraints ?? {}).join(',')).filter(Boolean);
        return new BadRequestException(messages.join(';') || '参数校验失败');
      },
    }),
  );
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[FM-Server] 财务管理系统后端已启动: http://127.0.0.1:${port}/api/v1`);
}

void bootstrap();
