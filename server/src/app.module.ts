import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, PermsGuard } from './common/guards';
import { AllExceptionsFilter, EnvelopeInterceptor, OperationLogInterceptor } from './common/interceptors';
import { AuthModule } from './modules/auth/auth.module';
import { SystemModule } from './modules/system/system.module';
import { MasterdataModule } from './modules/masterdata/masterdata.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ReportModule } from './modules/report/report.module';
import { BusinessModule } from './modules/business/business.module';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermsGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [PrismaService],
})
export class CommonModule {}

@Module({
  imports: [
    CommonModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'fm-dev-secret',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '2h' },
      }),
    }),
    AuthModule,
    SystemModule,
    MasterdataModule,
    LedgerModule,
    ReportModule,
    BusinessModule,
  ],
})
export class AppModule {}
