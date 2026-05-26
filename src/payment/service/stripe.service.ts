import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    this.stripe = new Stripe(this.configService.get<string>('STRIPE_SECRET'));
  }

  verifyWebhook(
    payload: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  async createCheckoutSession(
    userId: string,
    email: string,
    priceId: string,
    creditAmount: number,
    amount: number,
  ) {
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        customer_email: email,
        success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
        metadata: {
          userId,
          amount,
          creditAmount: creditAmount.toString(),
          gateway: 'stripe',
        },
      });

      return { url: session.url };
    } catch (error) {
      this.logger.error(
        `Stripe session creation failed for user ${userId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new InternalServerErrorException('Stripe session creation failed');
    }
  }
}
