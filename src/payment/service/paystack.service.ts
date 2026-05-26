import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';

  async initializeTransaction(
    userId: string,
    email: string,
    amount: number,
    creditAmount: number,
  ) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        {
          email,
          amount: amount * 100,
          callback_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
          metadata: {
            userId,
            amount,
            creditAmount,
            gateway: 'paystack',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      return response.data.data;
    } catch (error) {
      // axios errors expose `response.data` which can include API keys
      // echoed back in error messages. Only log status + message, never body.
      this.logger.error(
        `Paystack initialize failed for user ${userId}`,
        error?.response?.status
          ? `status=${error.response.status} message=${error.message}`
          : String(error?.message ?? error),
      );
      throw new InternalServerErrorException('Paystack initialization failed');
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
          timeout: 15000,
        },
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Paystack verify failed for ref ${reference}`,
        error?.message ?? String(error),
      );
      throw new InternalServerErrorException('Paystack verification failed');
    }
  }
}
