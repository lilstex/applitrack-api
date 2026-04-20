import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';

export interface LemonSqueezyCheckoutResult {
  url: string;
  checkoutId: string;
}

export interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: string;
    custom_data: {
      userId: string;
      creditAmount: string; // LemonSqueezy custom_data values are always strings
      amount: string; // priceUsd in cents, e.g. "1000" for $10.00
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      status: string;
      order_number: number;
      total: number; // in cents
      identifier: string; // unique order identifier
      first_order_item: {
        variant_id: number;
        product_name: string;
      };
    };
  };
}

@Injectable()
export class LemonSqueezyService {
  private readonly logger = new Logger(LemonSqueezyService.name);
  private readonly baseUrl = 'https://api.lemonsqueezy.com/v1';
  private readonly apiKey = process.env.LEMONSQUEEZY_API_KEY;
  private readonly storeId = process.env.LEMONSQUEEZY_STORE_ID;
  private readonly webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  /**
   * Creates a hosted checkout URL for a credit pack purchase.
   *
   */
  async createCheckout(
    userId: string,
    email: string,
    variantId: string,
    creditAmount: number,
    priceUsd: number,
  ): Promise<LemonSqueezyCheckoutResult> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/checkouts`,
        {
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                email,
                custom: {
                  userId,
                  creditAmount: String(creditAmount),
                  // Store price in cents for consistency with fulfillOrder
                  amount: String(Math.round(priceUsd * 100)),
                },
              },
              product_options: {
                redirect_url: `${process.env.FRONTEND_URL}/billing?payment=success`,
                receipt_link_url: `${process.env.FRONTEND_URL}/billing`,
                receipt_button_text: 'Return to AppliTrack',
              },
              checkout_options: {
                embed: false,
                media: true,
                logo: true,
              },
            },
            relationships: {
              store: {
                data: { type: 'stores', id: this.storeId },
              },
              variant: {
                data: { type: 'variants', id: variantId },
              },
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
          },
        },
      );

      const checkout = response.data.data;
      return {
        url: checkout.attributes.url,
        checkoutId: checkout.id,
      };
    } catch (error) {
      this.logger.error(
        'LemonSqueezy checkout creation failed',
        error?.response?.data ?? error.message,
      );
      throw new InternalServerErrorException(
        'Failed to create checkout session',
      );
    }
  }

  /**
   * Verifies the HMAC-SHA256 signature on an incoming webhook.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): void {
    if (!this.webhookSecret) {
      this.logger.error('LEMONSQUEEZY_WEBHOOK_SECRET is not configured');
      throw new Error('Webhook secret not configured');
    }

    const hmac = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const digest = Buffer.from(hmac, 'utf8');
    const provided = Buffer.from(signature, 'utf8');

    // Buffers must be the same length for timingSafeEqual
    if (
      digest.length !== provided.length ||
      !timingSafeEqual(digest, provided)
    ) {
      throw new Error('Invalid LemonSqueezy webhook signature');
    }
  }
}
