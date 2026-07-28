import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios, { AxiosRequestConfig } from 'axios';
import { Webhook } from './webhook.entity';
import { WebhookDelivery, DeliveryStatus } from './webhook-delivery.entity';
import { WebhookEventType } from './webhook.entity';
import { WebhookRateLimitStore } from './webhook-rate-limit.store';
import * as crypto from 'crypto';

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private readonly TIMEOUT_MS = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 10;

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
    @InjectQueue('webhook_queue')
    private readonly webhookQueue: Queue,
    private readonly rateLimitStore: WebhookRateLimitStore,
  ) {}

  /**
   * Trigger webhook delivery for a specific event
   */
  async triggerEvent(
    eventType: WebhookEventType,
    payload: Record<string, any>,
    userId?: string,
  ): Promise<void> {
    // Find all active webhooks subscribed to this event
    const webhooks = await this.webhookRepository
      .createQueryBuilder('webhook')
      .where('webhook.isActive = :isActive', { isActive: true })
      .andWhere('webhook.events @> :event', {
        event: JSON.stringify([eventType]),
      })
      .getMany();

    // Filter by userId if provided
    const filteredWebhooks = userId
      ? webhooks.filter((w) => w.userId === userId)
      : webhooks;

    this.logger.log(
      `Triggering ${eventType} event for ${filteredWebhooks.length} webhook(s)`,
    );

    // Queue delivery for each webhook
    for (const webhook of filteredWebhooks) {
      await this.queueDelivery(webhook, eventType, payload);
    }
  }

  /**
   * Trigger delivery to a single specific webhook
   */
  async triggerSingleWebhook(
    webhook: Webhook,
    eventType: WebhookEventType,
    payload: Record<string, any>,
  ): Promise<void> {
    this.logger.log(`Triggering isolated ${eventType} event for webhook ${webhook.id}`);
    await this.queueDelivery(webhook, eventType, payload);
  }

  /**
   * Queue a webhook delivery job
   */
  private async queueDelivery(
    webhook: Webhook,
    eventType: WebhookEventType,
    payload: Record<string, any>,
  ): Promise<void> {
    // Check rate limiting
    const withinLimit = await this.rateLimitStore.checkRateLimit(
      webhook.id,
      this.MAX_REQUESTS_PER_WINDOW,
      this.RATE_LIMIT_WINDOW_MS
    );
    
    if (!withinLimit) {
      this.logger.warn(
        `Rate limit exceeded for webhook ${webhook.id}. Skipping delivery.`,
      );
      return;
    }

    // Create delivery record
    const delivery = this.deliveryRepository.create({
      webhookId: webhook.id,
      eventType,
      payload,
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
    });

    const savedDelivery = await this.deliveryRepository.save(delivery);

    // Add to queue with retry configuration
    await this.webhookQueue.add(
      'deliver',
      {
        deliveryId: savedDelivery.id,
        webhookId: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        eventType,
        payload,
      },
      {
        attempts: this.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: 1000, // Start with 1 second, exponential backoff
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  /**
   * Process a webhook delivery job
   */
  async processDelivery(jobData: {
    deliveryId: string;
    webhookId: string;
    url: string;
    secret: string;
    eventType: string;
    payload: Record<string, any>;
  }): Promise<void> {
    const { deliveryId, webhookId, url, secret, eventType, payload } = jobData;

    this.logger.log(
      `Processing webhook delivery ${deliveryId} for webhook ${webhookId}`,
    );

    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new BadRequestException(`Delivery ${deliveryId} not found`);
    }

    // Increment attempt count
    delivery.attemptCount += 1;
    await this.deliveryRepository.save(delivery);

    try {
      // Generate HMAC signature
      const signature = this.generateSignature(JSON.stringify(payload), secret);
      const timestamp = Date.now();

      // Make HTTP request with timeout
      const requestBody = {
        event: eventType,
        data: payload,
        timestamp,
      };

      const axiosConfig: AxiosRequestConfig = {
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Event': eventType,
        },
        data: requestBody,
        timeout: this.TIMEOUT_MS,
        validateStatus: () => true, // Don't throw on any status code
      };

      const response = await axios(axiosConfig);

      // Update delivery record
      delivery.status =
        response.status >= 200 && response.status < 300
          ? DeliveryStatus.SUCCESS
          : DeliveryStatus.FAILED;
      delivery.httpStatus = response.status;
      delivery.statusCode = response.status;
      delivery.deliveredAt = new Date();

      if (response.status >= 200 && response.status < 300) {
        const responseText =
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);
        delivery.responseBody = responseText.substring(0, 1000); // Limit size
        this.logger.log(`Webhook delivery ${deliveryId} succeeded`);
      } else {
        const responseText =
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);
        delivery.responseBody = responseText.substring(0, 1000);
        delivery.errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        this.logger.warn(
          `Webhook delivery ${deliveryId} failed with status ${response.status}`,
        );
      }

      await this.deliveryRepository.save(delivery);

      // Update webhook stats
      const webhook = await this.webhookRepository.findOne({
        where: { id: webhookId },
      });
      if (webhook) {
        if (response.status >= 200 && response.status < 300) {
          webhook.failureCount = 0;
          webhook.lastTriggeredAt = new Date();
          await this.webhookRepository.save(webhook);
        } else if (response.status >= 500) {
          await this.incrementFailureCount(webhook);
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Webhook delivery ${deliveryId} failed: ${error.message}`,
      );

      delivery.status = DeliveryStatus.FAILED;
      delivery.errorMessage = error.message?.substring(0, 500);
      if (error.response?.status) {
        delivery.statusCode = error.response.status;
        delivery.httpStatus = error.response.status;
      }

      await this.deliveryRepository.save(delivery);

      // Update webhook failure count on network error if all retries are exhausted
      const webhook = await this.webhookRepository.findOne({
        where: { id: webhookId },
      });
      if (webhook && delivery.attemptCount >= this.MAX_RETRIES) {
        const isHttpStatus = error.response?.status !== undefined;
        const is5xxOrNetwork = !isHttpStatus || error.response.status >= 500;
        if (is5xxOrNetwork) {
          await this.incrementFailureCount(webhook);
        }
      }

      // Re-throw to trigger retry
      throw error;
    }
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Increment failure count on a webhook and deactivate if threshold reached
   */
  private async incrementFailureCount(webhook: Webhook): Promise<void> {
    webhook.failureCount += 1;
    if (webhook.failureCount >= 10) {
      webhook.isActive = false;
      this.logger.warn(`Webhook ${webhook.id} deactivated due to excessive failures`);
    }
    await this.webhookRepository.save(webhook);
  }

  /**
   * Get recent delivery attempts for a webhook
   */
  async getRecentDeliveries(
    webhookId: string,
    limit: number = 50,
  ): Promise<WebhookDelivery[]> {
    return await this.deliveryRepository.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get delivery logs for a webhook
   */
  async getDeliveryLogs(
    webhookId: string,
    limit: number = 50,
  ): Promise<WebhookDelivery[]> {
    return await this.deliveryRepository.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get delivery statistics for a webhook
   */
  async getDeliveryStats(webhookId: string): Promise<{
    total: number;
    success: number;
    failed: number;
    pending: number;
    successRate: number;
  }> {
    const deliveries = await this.deliveryRepository.find({
      where: { webhookId },
    });

    const total = deliveries.length;
    const success = deliveries.filter(
      (d) => d.status === DeliveryStatus.SUCCESS,
    ).length;
    const failed = deliveries.filter(
      (d) => d.status === DeliveryStatus.FAILED,
    ).length;
    const pending = deliveries.filter(
      (d) => d.status === DeliveryStatus.PENDING,
    ).length;

    return {
      total,
      success,
      failed,
      pending,
      successRate: total > 0 ? (success / total) * 100 : 0,
    };
  }
}
