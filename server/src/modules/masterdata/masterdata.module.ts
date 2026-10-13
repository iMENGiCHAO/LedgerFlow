import { Module } from '@nestjs/common';
import { MasterdataController } from './masterdata.controller';
import { MasterdataService } from './masterdata.service';
import { BalanceService } from '../ledger/balance.service';

@Module({
  controllers: [MasterdataController],
  providers: [MasterdataService, BalanceService],
})
export class MasterdataModule {}
