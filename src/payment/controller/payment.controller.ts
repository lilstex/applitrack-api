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
} from '@nestjs/common';
import { Request, Response as ExpressResponse } from 'express';
import { StripeService } from '../service/stripe.service';
import { PaymentService } from '../service/payment.service';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { createHmac } from 'crypto';
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

interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

@Controller('payment')
export class PaymentController {
  private readonly stripeWebhookSecret: string;
  private readonly paystackSecret: string;

  constructor(
    private readonly stripeService: StripeService,
    private readonly paystackService: PaystackService,
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {
    this.stripeWebhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    this.paystackSecret = this.configService.get<string>('PAYSTACK_SECRET_KEY');
  }

  @Post('webhook/stripe')
  async handleStripeWebhook(
    @NestHeaders('stripe-signature') signature: string,
    @Req() request: RequestWithRawBody,
    @Res() response: ExpressResponse,
  ) {
    console.log('STRIPE WEBHOOK');
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature');
    }

    let event: Stripe.Event;

    try {
      event = this.stripeService.verifyWebhook(
        request.rawBody,
        signature,
        this.stripeWebhookSecret,
      );
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { userId, creditAmount, amount } = session.metadata;

      await this.paymentService.fulfillOrder(
        userId,
        parseInt(amount),
        parseInt(creditAmount),
        session.id,
        'stripe',
      );
    }

    response.status(200).send({ received: true });
  }

  @Post('webhook/paystack')
  async handlePaystackWebhook(
    @NestHeaders('x-paystack-signature') signature: string,
    @Req() request: Request,
    @Res() response: ExpressResponse,
  ) {
    console.log('PAYSTACK WEBHOOK');
    if (!signature) {
      throw new BadRequestException('Missing Paystack signature');
    }

    const body = request.body;
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
        parseInt(amount),
        parseInt(creditAmount),
        body.data.reference,
        'paystack',
      );
    }

    return response.status(200).send({ received: true });
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get all active credit purchase plans' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of available plans fetched successfully.',
  })
  async getPlans() {
    return this.paymentService.findAllPlans();
  }

  @Post('plans')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: Create a new credit plan' })
  @ApiBody({ type: CreateCreditPlanDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Plan created successfully.',
  })
  async createPlan(@Body() dto: CreateCreditPlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Patch('plans/:id')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: Update an existing credit plan' })
  @ApiParam({ name: 'id', description: 'The MongoDB ObjectID of the plan' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plan updated successfully.',
  })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdateCreditPlanDto) {
    return this.paymentService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @ApiBearerAuth()
  @UseGuards(UserGuard, RoleGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: Delete a credit plan' })
  @ApiParam({ name: 'id', description: 'The MongoDB ObjectID of the plan' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plan deleted successfully.',
  })
  async deletePlan(@Param('id') id: string) {
    return this.paymentService.deletePlan(id);
  }

  @Post('top-up')
  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Initialize a credit purchase transaction' })
  @ApiBody({ type: TopUpDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Returns a redirect URL or authorization data for the gateway.',
    schema: {
      example: { url: 'https://checkout.stripe.com/pay/c_test_...' },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid plan slug or gateway.',
  })
  async initializeTopUp(@Req() req, @Body() topUpDto: TopUpDto) {
    const userId = req.user._id;
    const email = req.user.email;

    const plan = await this.paymentService.getPlanBySlug(topUpDto.planId);

    if (topUpDto.gateway === PaymentGateway.PAYSTACK) {
      return this.paystackService.initializeTransaction(
        String(userId),
        email,
        plan.priceNgn,
        plan.credits,
      );
    }

    if (topUpDto.gateway === PaymentGateway.STRIPE) {
      return this.stripeService.createCheckoutSession(
        String(userId),
        email,
        plan.stripePriceId,
        plan.credits,
        plan.priceUsd,
      );
    }
  }
}
