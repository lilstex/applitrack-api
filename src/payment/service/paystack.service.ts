import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PaystackService {
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
        },
      );

      return response.data.data; // Contains authorization_url and reference
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Paystack initialization failed');
    }
  }

  async verifyTransaction(reference: string) {
    const response = await axios.get(
      `${this.baseUrl}/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      },
    );
    return response.data.data;
  }
}
