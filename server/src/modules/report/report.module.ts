import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { CashFlowService } from './cashflow.service';
import { BalanceService } from '../ledger/balance.service';

@Module({
  controllers: [ReportController],
  providers: [ReportService, CashFlowService, BalanceService],
})
export class ReportModule {}
