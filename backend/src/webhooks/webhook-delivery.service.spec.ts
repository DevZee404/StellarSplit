import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { Webhook } from './webhook.entity';
import { WebhookDelivery, DeliveryStatus } from './webhook-delivery.entity';
import { WebhookEventType } from './webhook.entity';
import { WebhookRateLimitStore } from './webhook-rate-limit.store';
import axios from 'axios';

jest.mock('axios');

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;
  let webhookRepository: Repository<Webhook>;
  let deliveryRepository: Repository<WebhookDelivery>;
  let webhookQueue: any;
  let rateLimitStore: any;

  const mockWebhookRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockDeliveryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockRateLimitStore = {
    checkRateLimit: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        {
          provide: getRepositoryToken(Webhook),
          useValue: mockWebhookRepository,
        },
        {
          provide: getRepositoryToken(WebhookDelivery),
          useValue: mockDeliveryRepository,
        },
        {
          provide: getQueueToken('webhook_queue'),
          useValue: mockQueue,
        },
        {
          provide: WebhookRateLimitStore,
          useValue: mockRateLimitStore,
        },
      ],
    }).compile();

    service = module.get<WebhookDeliveryService>(WebhookDeliveryService);
    webhookRepository = module.get<Repository<Webhook>>(
      getRepositoryToken(Webhook),
    );
    deliveryRepository = module.get<Repository<WebhookDelivery>>(
      getRepositoryToken(WebhookDelivery),
    );
    webhookQueue = module.get(getQueueToken('webhook_queue'));
    rateLimitStore = module.get(WebhookRateLimitStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerEvent', () => {
    it('should queue delivery for active webhooks subscribed to event', async () => {
      const webhooks = [
        {
          id: 'webhook-1',
          userId: 'user-1',
          url: 'https://example.com/webhook',
          events: [WebhookEventType.SPLIT_CREATED],
          secret: 'secret-1',
          isActive: true,
        },
      ];

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(webhooks),
      };

      mockWebhookRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockDeliveryRepository.create.mockReturnValue({
        id: 'delivery-1',
        webhookId: 'webhook-1',
        eventType: WebhookEventType.SPLIT_CREATED,
        payload: {},
        status: DeliveryStatus.PENDING,
      });
      mockDeliveryRepository.save.mockResolvedValue({
        id: 'delivery-1',
      });
      mockQueue.add.mockResolvedValue({});

      await service.triggerEvent(
        WebhookEventType.SPLIT_CREATED,
        { test: 'data' },
        'user-1',
      );

      expect(mockDeliveryRepository.create).toHaveBeenCalled();
      expect(mockDeliveryRepository.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });
  });

  describe('triggerSingleWebhook', () => {
    it('should queue delivery for a single webhook without querying database', async () => {
      const webhook: any = {
        id: 'webhook-single',
        userId: 'user-1',
        url: 'https://example.com/test',
        events: [WebhookEventType.SPLIT_CREATED],
        secret: 'test-secret',
        isActive: true,
      };

      mockDeliveryRepository.create.mockReturnValue({
        id: 'delivery-test',
        webhookId: 'webhook-single',
        eventType: WebhookEventType.SPLIT_CREATED,
        payload: { test: 'payload' },
        status: DeliveryStatus.PENDING,
      });
      mockDeliveryRepository.save.mockResolvedValue({
        id: 'delivery-test',
      });
      mockQueue.add.mockResolvedValue({});

      await service.triggerSingleWebhook(
        webhook,
        WebhookEventType.SPLIT_CREATED,
        { test: 'payload' },
      );

      expect(mockWebhookRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockDeliveryRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        webhookId: 'webhook-single',
      }));
      expect(mockQueue.add).toHaveBeenCalled();
    });
  });

  describe('getDeliveryLogs', () => {
    it('should return delivery logs for a webhook', async () => {
      const deliveries = [
        {
          id: 'delivery-1',
          webhookId: 'webhook-1',
          status: DeliveryStatus.SUCCESS,
        },
        {
          id: 'delivery-2',
          webhookId: 'webhook-1',
          status: DeliveryStatus.FAILED,
        },
      ];

      mockDeliveryRepository.find.mockResolvedValue(deliveries);

      const result = await service.getDeliveryLogs('webhook-1', 50);

      expect(mockDeliveryRepository.find).toHaveBeenCalledWith({
        where: { webhookId: 'webhook-1' },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      expect(result).toEqual(deliveries);
    });
  });

  describe('getDeliveryStats', () => {
    it('should calculate delivery statistics correctly', async () => {
      const deliveries = [
        {
          id: 'delivery-1',
          status: DeliveryStatus.SUCCESS,
        },
        {
          id: 'delivery-2',
          status: DeliveryStatus.SUCCESS,
        },
        {
          id: 'delivery-3',
          status: DeliveryStatus.FAILED,
        },
        {
          id: 'delivery-4',
          status: DeliveryStatus.PENDING,
        },
      ];

      mockDeliveryRepository.find.mockResolvedValue(deliveries);

      const result = await service.getDeliveryStats('webhook-1');

      expect(result.total).toBe(4);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.pending).toBe(1);
      expect(result.successRate).toBe(50);
    });
  });

  describe('getRecentDeliveries', () => {
    it('should return recent delivery logs for a webhook', async () => {
      const deliveries = [
        {
          id: 'delivery-1',
          webhookId: 'webhook-1',
          status: DeliveryStatus.SUCCESS,
        },
      ];

      mockDeliveryRepository.find.mockResolvedValue(deliveries);

      const result = await service.getRecentDeliveries('webhook-1', 50);

      expect(mockDeliveryRepository.find).toHaveBeenCalledWith({
        where: { webhookId: 'webhook-1' },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      expect(result).toEqual(deliveries);
    });
  });

  describe('processDelivery', () => {
    let mockAxios: jest.MockedFunction<typeof axios>;

    beforeEach(() => {
      mockAxios = axios as any;
    });

    it('should reset failureCount to 0 on 200 OK', async () => {
      const delivery = { id: 'delivery-123', attemptCount: 1, status: DeliveryStatus.PENDING };
      const webhook = { id: 'webhook-123', failureCount: 3, isActive: true };

      mockDeliveryRepository.findOne.mockResolvedValue(delivery);
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockAxios.mockResolvedValue({
        status: 200,
        data: 'success',
        statusText: 'OK',
      } as any);

      await service.processDelivery({
        deliveryId: 'delivery-123',
        webhookId: 'webhook-123',
        url: 'https://example.com',
        secret: 'secret',
        eventType: WebhookEventType.SPLIT_CREATED,
        payload: {},
      });

      expect(webhook.failureCount).toBe(0);
      expect(mockWebhookRepository.save).toHaveBeenCalledWith(webhook);
      expect(mockDeliveryRepository.save).toHaveBeenCalled();
    });

    it('should not increment failureCount on 404 Not Found', async () => {
      const delivery = { id: 'delivery-123', attemptCount: 1, status: DeliveryStatus.PENDING };
      const webhook = { id: 'webhook-123', failureCount: 3, isActive: true };

      mockDeliveryRepository.findOne.mockResolvedValue(delivery);
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockAxios.mockResolvedValue({
        status: 404,
        data: 'Not Found',
        statusText: 'Not Found',
      } as any);

      await service.processDelivery({
        deliveryId: 'delivery-123',
        webhookId: 'webhook-123',
        url: 'https://example.com',
        secret: 'secret',
        eventType: WebhookEventType.SPLIT_CREATED,
        payload: {},
      });

      expect(webhook.failureCount).toBe(3); // unchanged!
      expect(mockWebhookRepository.save).not.toHaveBeenCalled();
      expect(mockDeliveryRepository.save).toHaveBeenCalled();
    });

    it('should increment failureCount on 500 Internal Error', async () => {
      const delivery = { id: 'delivery-123', attemptCount: 1, status: DeliveryStatus.PENDING };
      const webhook = { id: 'webhook-123', failureCount: 3, isActive: true };

      mockDeliveryRepository.findOne.mockResolvedValue(delivery);
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockAxios.mockResolvedValue({
        status: 500,
        data: 'Server Error',
        statusText: 'Internal Server Error',
      } as any);

      await service.processDelivery({
        deliveryId: 'delivery-123',
        webhookId: 'webhook-123',
        url: 'https://example.com',
        secret: 'secret',
        eventType: WebhookEventType.SPLIT_CREATED,
        payload: {},
      });

      expect(webhook.failureCount).toBe(4);
      expect(mockWebhookRepository.save).toHaveBeenCalledWith(webhook);
    });

    it('should increment failureCount on network error when retries are exhausted', async () => {
      const delivery = { id: 'delivery-123', attemptCount: 3, status: DeliveryStatus.PENDING }; // 3 is MAX_RETRIES
      const webhook = { id: 'webhook-123', failureCount: 3, isActive: true };

      mockDeliveryRepository.findOne.mockResolvedValue(delivery);
      mockWebhookRepository.findOne.mockResolvedValue(webhook);
      mockAxios.mockRejectedValue(new Error('Network connection timeout'));

      await expect(service.processDelivery({
        deliveryId: 'delivery-123',
        webhookId: 'webhook-123',
        url: 'https://example.com',
        secret: 'secret',
        eventType: WebhookEventType.SPLIT_CREATED,
        payload: {},
      })).rejects.toThrow('Network connection timeout');

      expect(webhook.failureCount).toBe(4);
      expect(mockWebhookRepository.save).toHaveBeenCalledWith(webhook);
    });
  });
});
