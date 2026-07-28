import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Horizon } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';
import { HorizonCursor } from '../entities/horizon-cursor.entity';
import { PaymentsService } from '../payments/payments.service';
import { backoff } from '../utils/backoff';

@Injectable()
export class HorizonPollerService {
    private readonly logger = new Logger(HorizonPollerService.name);
    private server: Horizon.Server;
    private retryCount = 0;
    private lastLedger = 0;

    constructor(
        private readonly stellarService: StellarService,
        private readonly paymentsService: PaymentsService,
        @InjectRepository(HorizonCursor)
        private readonly cursorRepository: Repository<HorizonCursor>,
        private readonly eventEmitter?: EventEmitter2,
    ) {
        this.server = new Horizon.Server(
            process.env.STELLAR_NETWORK === 'mainnet'
                ? 'https://horizon.stellar.org'
                : 'https://horizon-testnet.stellar.org',
        );
    }

    @Cron(CronExpression.EVERY_MINUTE)
    async pollPayments() {
        this.logger.log('Polling Horizon for new payments...');

        const monitoredAccount = process.env.MONITORED_STELLAR_ACCOUNT;
        if (!monitoredAccount) {
            this.logger.warn('No monitored Stellar account configured');
            return;
        }

        try {
            const cursorRecord = await this.cursorRepository.findOne({ where: { accountId: monitoredAccount } });
            const lastCursor = cursorRecord ? cursorRecord.cursor : 'now';

            const payments = await this.server
                .payments()
                .forAccount(monitoredAccount)
                .cursor(lastCursor)
                .order('asc')
                .call();

            for (const payment of payments.records) {
                if (payment.type === 'payment' || payment.type === 'path_payment_strict_receive' || payment.type === 'path_payment_strict_send') {
                    await this.processPayment(payment);
                }

                await this.cursorRepository.save({
                    accountId: monitoredAccount,
                    cursor: payment.paging_token,
                });
            }

            this.retryCount = 0;
        } catch (error) {
            this.logger.error('Error polling Horizon:', error);
            await this.waitBeforeRetry();
        }
    }

    private async waitBeforeRetry() {
        const delay = backoff(this.retryCount++, 1000, 60000);
        this.logger.warn(`Retrying Horizon poll in ${delay}ms`, { attempt: this.retryCount });
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    async handleStreamRecord(record: { paging_token?: string; ledger?: number }) {
        const receivedLedger = this.getLedgerValue(record);
        if (receivedLedger !== undefined && receivedLedger > this.lastLedger + 1) {
            const gap = receivedLedger - this.lastLedger - 1;
            this.eventEmitter?.emit('stellar.ledger.gap', {
                expected: this.lastLedger + 1,
                received: receivedLedger,
                gap,
            });
            this.logger.error('Ledger gap detected', { gap });
        }

        this.lastLedger = receivedLedger ?? this.lastLedger;
        this.retryCount = 0;
    }

    private getLedgerValue(record: { paging_token?: string; ledger?: number }): number | undefined {
        if (typeof record.ledger === 'number') {
            return record.ledger;
        }

        if (typeof record.paging_token === 'string' && record.paging_token) {
            const parsed = Number(record.paging_token);
            return Number.isFinite(parsed) ? parsed : undefined;
        }

        return undefined;
    }

    private async processPayment(payment: any) {
        // Fetch transaction to get memo
        const tx = await this.server.transactions().transaction(payment.transaction_hash).call();
        const memo = tx.memo;

        if (!memo) return;

        this.logger.log(`Processing payment with memo: ${memo}`);

        // Assuming memo contains splitId:participantId or similar
        // The requirement says "Filter payments by memo field matching split ID"
        // We'll try to find an active payment entry matching this memo
        try {
            await this.paymentsService.autoConfirmPayment(payment.transaction_hash, memo);
        } catch (error) {
            this.logger.error(`Failed to auto-confirm payment ${payment.transaction_hash}:`, error);
        }
    }
}
