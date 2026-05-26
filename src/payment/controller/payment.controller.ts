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
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';

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

  @SkipThrottle()
  @Post('webhook/lemonsqueezy')
  @ApiOperation({ summary: 'Lemon Squeezy webhook receiver' })
  async handleLemonSqueezyWebhook(
    @NestHeaders('x-signature') signature: string,
    @Req() request: RequestWithRawBody,
    @Res() response: ExpressResponse,
  ) {
    if (!signature) throw new BadRequestException('Missing X-Signature header');

    try {
      this.lemonSqueezyService.verifyWebhookSignature(
        request.rawBody,
        signature,
      );
    } catch (err) {
      this.logger.warn(`LemonSqueezy signature invalid`);
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = request.body as LemonSqueezyWebhookPayload;
    const eventName = payload?.meta?.event_name;
    this.logger.log(`LemonSqueezy event: ${eventName}`);

    if (
      eventName === 'order_created' &&
      payload.data?.attributes?.status === 'paid'
    ) {
      const { userId, creditAmount, amount } = payload.meta.custom_data ?? {};
      const providerReference = payload.data.attributes.identifier;

      if (!userId || !creditAmount || !amount) {
        this.logger.error('LS webhook missing custom_data');
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

  @SkipThrottle()
  @Post('webhook/paystack')
  @ApiOperation({ summary: 'Paystack webhook receiver' })
  async handlePaystackWebhook(
    @NestHeaders('x-paystack-signature') signature: string,
    @Req() request: RequestWithRawBody,
    @Res() response: ExpressResponse,
  ) {
    if (!signature) throw new BadRequestException('Missing Paystack signature');
    if (!this.paystackSecret) {
      this.logger.error('PAYSTACK_SECRET_KEY not configured');
      throw new BadRequestException('Webhook misconfigured');
    }
    if (!request.rawBody) {
      throw new BadRequestException('Raw body unavailable');
    }

    const hash = createHmac('sha512', this.paystackSecret)
      .update(request.rawBody)
      .digest('hex');

    const a = Buffer.from(hash);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Paystack signature mismatch');
      throw new BadRequestException('Invalid Paystack signature');
    }

    const body = request.body;
    if (body.event === 'charge.success') {
      const { userId, creditAmount, amount } = body.data.metadata ?? {};
      if (userId && creditAmount && amount) {
        await this.paymentService.fulfillOrder(
          userId,
          parseInt(amount, 10),
          parseInt(creditAmount, 10),
          body.data.reference,
          'paystack',
        );
      }
    }

    return response.status(HttpStatus.OK).send({ received: true });
  }

  @Throttle({ long: { ttl: 3600000, limit: 10 } })
  @Post('top-up')
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Initialize a credit purchase transaction' })
  @ApiBody({ type: TopUpDto })
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

    throw new BadRequestException('Unsupported gateway');
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
  async createPlan(@Body() dto: CreateCreditPlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Patch('plans/:id')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdateCreditPlanDto) {
    return this.paymentService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  async deletePlan(@Param('id') id: string) {
    return this.paymentService.deletePlan(id);
  }
}
