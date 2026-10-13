import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { ArapService } from './arap.service';
import { InvoiceService } from './invoice.service';
import { FundService } from './fund.service';
import { ExpenseService } from './expense.service';
import { AssetService } from './asset.service';
import { DashboardService } from './dashboard.service';
import { BalanceService } from '../ledger/balance.service';
import { VoucherService } from '../ledger/voucher.service';
import { ReportService } from '../report/report.service';

@Module({
  controllers: [BusinessController],
  providers: [
    ArapService,
    InvoiceService,
    FundService,
    ExpenseService,
    AssetService,
    DashboardService,
    BalanceService,
    VoucherService,
    ReportService,
  ],
})
export class BusinessModule {}
