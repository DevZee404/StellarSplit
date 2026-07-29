import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { LedgerGapListener } from './ledger-gap.listener';

@Module({
  providers: [StellarService, LedgerGapListener],
  exports: [StellarService],
})
export class StellarModule {}