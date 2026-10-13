import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { BalanceService } from '../ledger/balance.service';

@Module({
  controllers: [ReportController],
  providers: [ReportService, BalanceService],
})
export class ReportModule {}
