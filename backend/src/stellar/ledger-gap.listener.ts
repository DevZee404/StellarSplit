import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class LedgerGapListener {
  private readonly logger = new Logger(LedgerGapListener.name);

  @OnEvent('stellar.ledger.gap')
  handleLedgerGap(payload: { expected: number; received: number; gap: number }) {
    this.logger.error('Ledger gap detected', { expected: payload.expected, received: payload.received, gap: payload.gap });
  }
}
