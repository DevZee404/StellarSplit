import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Webhook } from './webhook.entity';

export enum DeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('webhook_deliveries')
@Index(['webhookId'])
@Index(['status'])
@Index(['webhookId', 'status'])
@Index(['createdAt'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  webhookId!: string;

  @Column({ type: 'varchar' })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, any>;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status!: DeliveryStatus;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'integer', nullable: true })
  httpStatus?: number;

  @Column({ type: 'integer', nullable: true })
  statusCode?: number;

  @Column({ type: 'text', nullable: true })
  responseBody?: string;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Webhook, (webhook) => webhook.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'webhookId' })
  webhook?: Webhook;
}
