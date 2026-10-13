import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { VoucherService } from './voucher.service';
import { BalanceService } from './balance.service';
import { ClosingService } from './closing.service';
import { TenantSetupService } from './tenant-setup.service';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, VoucherService, BalanceService, ClosingService, TenantSetupService],
  exports: [BalanceService, VoucherService, TenantSetupService, LedgerService],
})
export class LedgerModule {}
