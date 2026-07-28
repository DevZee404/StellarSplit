import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookPolicyService } from './webhook-policy.service';
import { TestWebhookDispatcher } from './test-webhook-dispatcher';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { TestWebhookDto } from './dto/test-webhook.dto';
import { Webhook } from './webhook.entity';
import { WebhookDelivery } from './webhook-delivery.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.interface';

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly deliveryService: WebhookDeliveryService,
    private readonly policyService: WebhookPolicyService,
    private readonly testDispatcher: TestWebhookDispatcher,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new webhook' })
  @ApiResponse({
    status: 201,
    description: 'Webhook created successfully',
    type: Webhook,
  })
  @ApiResponse({ status: 400, description: 'Invalid webhook data' })
  async create(
    @Body(ValidationPipe) createWebhookDto: CreateWebhookDto,
    @CurrentUser() user: AuthUser,
  ) {
    createWebhookDto.userId = user.id;
    return await this.webhooksService.create(createWebhookDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all webhooks for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of webhooks',
    type: [Webhook],
  })
  async findAll(@CurrentUser() user: AuthUser) {
    return await this.webhooksService.findByUserId(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook by ID' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: 200,
    description: 'Webhook details',
    type: Webhook,
  })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const webhook = await this.webhooksService.findOne(id);
    this.policyService.assertOwnership(user, webhook);
    return webhook;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: 200,
    description: 'Webhook updated successfully',
    type: Webhook,
  })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateWebhookDto: UpdateWebhookDto,
    @CurrentUser() user: AuthUser,
  ) {
    const webhook = await this.webhooksService.findOne(id);
    this.policyService.assertOwnership(user, webhook);
    return await this.webhooksService.update(id, updateWebhookDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({ status: 204, description: 'Webhook deleted successfully' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const webhook = await this.webhooksService.findOne(id);
    this.policyService.assertOwnership(user, webhook);
    await this.webhooksService.remove(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a webhook with a sample event' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: 200,
    description: 'Test webhook triggered successfully',
  })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async testWebhook(
    @Param('id') id: string,
    @Body(ValidationPipe) testDto: TestWebhookDto,
    @CurrentUser() user: AuthUser,
  ) {
    const webhook = await this.webhooksService.findOne(id);
    this.policyService.assertOwnership(user, webhook);

    // Use the direct dispatcher to send only to this webhook
    const payload = testDto.payload || {
      test: true,
      message: 'This is a test webhook',
      timestamp: new Date().toISOString(),
    };

    await this.testDispatcher.dispatchTest(
      webhook,
      testDto.eventType,
      payload,
    );

    return {
      message: 'Test webhook triggered',
      webhookId: id,
      eventType: testDto.eventType,
    };
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get delivery logs for a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: 200,
    description: 'List of webhook deliveries',
    type: [WebhookDelivery],
  })
  async getDeliveries(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const webhook = await this.webhooksService.findOne(id);
    this.policyService.assertOwnership(user, webhook);
    return await this.deliveryService.getRecentDeliveries(id, 50);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get delivery statistics for a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID' })
  @ApiResponse({
    status: 200,
    description: 'Webhook delivery statistics',
    schema: {
      example: {
        total: 100,
        success: 95,
        failed: 5,
        pending: 0,
        successRate: 95.0,
      },
    },
  })
  async getStats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const webhook = await this.webhooksService.findOne(id);
    this.policyService.assertOwnership(user, webhook);
    return await this.deliveryService.getDeliveryStats(id);
  }
}
