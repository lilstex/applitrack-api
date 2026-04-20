import {
  Controller,
  Post,
  Req,
  Headers as NestHeaders,
  BadRequestException,
  Res,
  UseGuards,
  Body,
  Get,
  HttpStatus,
  Patch,
  Param,
  Delete,
  Logger,
} from '@nestjs/common';
import { Request, Response as ExpressResponse } from 'express';
import { PaymentService } from '../service/payment.service';
import { UserGuard } from 'src/security/guards/auth.guard';
import {
  CreateCreditPlanDto,
  PaymentGateway,
  TopUpDto,
  UpdateCreditPlanDto,
} from '../dto/payment.dto';
import { PaystackService } from '../service/paystack.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { RoleGuard } from 'src/security/guards/role.guard';
import { Roles } from 'src/security/guards/roles.decorator';
import {
  LemonSqueezyService,
  LemonSqueezyWebhookPayload,
} from '../service/lemonsqueezy.service';

interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  private readonly paystackSecret = process.env.PAYSTACK_SECRET_KEY;

  constructor(
    private readonly lemonSqueezyService: LemonSqueezyService,
    private readonly paystackService: PaystackService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Lemon Squeezy sends webhooks
   */
  @Post('webhook/lemonsqueezy')
  @ApiOperation({ summary: 'Lemon Squeezy webhook receiver' })
  async handleLemonSqueezyWebhook(
    @NestHeaders('x-signature') signature: string,
    @Req() request: RequestWithRawBody,
    @Res() response: ExpressResponse,
  ) {
    if (!signature) {
      this.logger.warn('LemonSqueezy webhook received without X-Signature');
      throw new BadRequestException('Missing X-Signature header');
    }

    // Verify signature
    try {
      this.lemonSqueezyService.verifyWebhookSignature(
        request.rawBody,
        signature,
      );
    } catch (err) {
      this.logger.warn(
        `LemonSqueezy webhook signature invalid: ${err.message}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = request.body as LemonSqueezyWebhookPayload;
    const eventName = payload?.meta?.event_name;

    this.logger.log(`LemonSqueezy webhook received: ${eventName}`);

    // Only process paid orders
    if (
      eventName === 'order_created' &&
      payload.data?.attributes?.status === 'paid'
    ) {
      const { userId, creditAmount, amount } = payload.meta.custom_data;
      const providerReference = payload.data.attributes.identifier;

      if (!userId || !creditAmount || !amount) {
        this.logger.error(
          'LemonSqueezy webhook missing required custom_data fields',
          payload.meta.custom_data,
        );
        return response.status(HttpStatus.OK).send({ received: true });
      }

      await this.paymentService.fulfillOrder(
        userId,
        parseInt(amount, 10),
        parseInt(creditAmount, 10),
        providerReference,
        'lemonsqueezy',
      );
    }

    return response.status(HttpStatus.OK).send({ received: true });
  }

  /**
   * Paystack sends a webhook for successful transactions
   */
  @Post('webhook/paystack')
  @ApiOperation({ summary: 'Paystack webhook receiver' })
  async handlePaystackWebhook(
    @NestHeaders('x-paystack-signature') signature: string,
    @Req() request: Request,
    @Res() response: ExpressResponse,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Paystack signature');
    }

    const body = request.body;

    // Verify HMAC-SHA512
    const { createHmac } = await import('crypto');
    const hash = createHmac('sha512', this.paystackSecret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (hash !== signature) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    if (body.event === 'charge.success') {
      const { userId, creditAmount, amount } = body.data.metadata;

      await this.paymentService.fulfillOrder(
        userId,
        parseInt(amount, 10),
        parseInt(creditAmount, 10),
        body.data.reference,
        'paystack',
      );
    }

    return response.status(HttpStatus.OK).send({ received: true });
  }

  /**
   * POST /payment/top-up
   *
   */
  @Post('top-up')
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Initialize a credit purchase transaction' })
  @ApiBody({ type: TopUpDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a checkout URL for the selected gateway.',
    schema: {
      example: { url: 'https://app.lemonsqueezy.com/checkout/buy/...' },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid plan slug or gateway.',
  })
  async initializeTopUp(@Req() req, @Body() topUpDto: TopUpDto) {
    const userId = String(req.user._id);
    const email = req.user.email;

    const plan = await this.paymentService.getPlanBySlug(topUpDto.planId);

    if (topUpDto.gateway === PaymentGateway.PAYSTACK) {
      const data = await this.paystackService.initializeTransaction(
        userId,
        email,
        plan.priceNgn,
        plan.credits,
      );
      return { url: data.authorization_url };
    }

    if (topUpDto.gateway === PaymentGateway.LEMONSQUEEZY) {
      const { url } = await this.lemonSqueezyService.createCheckout(
        userId,
        email,
        plan.lemonSqueezyVariantId,
        plan.credits,
        plan.priceUsd,
      );
      return { url };
    }
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get all active credit purchase plans' })
  async getPlans() {
    return this.paymentService.findAllPlans();
  }

  @Post('plans')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: Create a new credit plan' })
  @ApiBody({ type: CreateCreditPlanDto })
  async createPlan(@Body() dto: CreateCreditPlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Patch('plans/:id')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: Update an existing credit plan' })
  @ApiParam({ name: 'id', description: 'The MongoDB ObjectID of the plan' })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdateCreditPlanDto) {
    return this.paymentService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: Delete a credit plan' })
  @ApiParam({ name: 'id', description: 'The MongoDB ObjectID of the plan' })
  async deletePlan(@Param('id') id: string) {
    return this.paymentService.deletePlan(id);
  }
}
