import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PayPalService {
  private logger = new Logger(PayPalService.name);
  private clientId: string;
  private clientSecret: string;
  private mode: 'sandbox' | 'production';
  private apiBase: string;
  private accessToken: string;
  private tokenExpires: Date;

  constructor(private configService: ConfigService) {
    this.initializePayPal();
  }

  private initializePayPal() {
    this.clientId = this.configService.get('PAYPAL_CLIENT_ID');
    this.clientSecret = this.configService.get('PAYPAL_CLIENT_SECRET');
    this.mode = (this.configService.get('PAYPAL_MODE') as 'sandbox' | 'production') || 'sandbox';

    this.apiBase =
      this.mode === 'production'
        ? 'https://api.paypal.com'
        : 'https://api.sandbox.paypal.com';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('PayPal credentials not configured. PayPal payments disabled.');
    } else {
      this.logger.log(`PayPal initialized in ${this.mode} mode`);
    }
  }

  /**
   * Get PayPal access token
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpires && new Date() < this.tokenExpires) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `${this.apiBase}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          auth: {
            username: this.clientId,
            password: this.clientSecret,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.accessToken = response.data.access_token;
      // Token expires in 3600 seconds, refresh after 3300 seconds (55 minutes)
      this.tokenExpires = new Date(Date.now() + 3300 * 1000);

      return this.accessToken;
    } catch (error) {
      this.logger.error(`Failed to get PayPal access token: ${error.message}`);
      throw new InternalServerErrorException('Failed to authenticate with PayPal');
    }
  }

  /**
   * Create a PayPal order for subscription
   */
  async createOrder(
    planName: string,
    amount: number,
    description: string,
    userId: string,
  ): Promise<{ id: string; status: string; links: any[] }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new InternalServerErrorException('PayPal not configured');
      }

      const token = await this.getAccessToken();

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: userId,
            description,
            amount: {
              currency_code: 'USD',
              value: amount.toFixed(2),
            },
            custom_id: userId,
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: 'IMMEDIATE',
              brand_name: 'FlyVPN',
              user_action: 'PAY_NOW',
              return_url: `${this.configService.get('FRONTEND_URL')}/payment/success`,
              cancel_url: `${this.configService.get('FRONTEND_URL')}/payment/cancel`,
            },
          },
        },
      };

      const response = await axios.post(
        `${this.apiBase}/v2/checkout/orders`,
        orderData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `${userId}-${Date.now()}`,
          },
        },
      );

      this.logger.log(`Created PayPal order ${response.data.id}`);

      return {
        id: response.data.id,
        status: response.data.status,
        links: response.data.links,
      };
    } catch (error) {
      this.logger.error(`Failed to create PayPal order: ${error.message}`);
      throw new BadRequestException('Failed to create PayPal order');
    }
  }

  /**
   * Capture a PayPal order (complete payment)
   */
  async captureOrder(orderId: string): Promise<{ id: string; status: string; payer: any }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new InternalServerErrorException('PayPal not configured');
      }

      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.apiBase}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'COMPLETED') {
        throw new BadRequestException(`Order capture failed: ${response.data.status}`);
      }

      this.logger.log(`Captured PayPal order ${orderId}`);

      return {
        id: response.data.id,
        status: response.data.status,
        payer: response.data.payer,
      };
    } catch (error) {
      this.logger.error(`Failed to capture PayPal order: ${error.message}`);
      throw new BadRequestException(`Failed to capture payment: ${error.message}`);
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string): Promise<any> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new InternalServerErrorException('PayPal not configured');
      }

      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.apiBase}/v2/checkout/orders/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get PayPal order: ${error.message}`);
      throw new BadRequestException('Failed to retrieve order details');
    }
  }

  /**
   * Refund a captured payment
   */
  async refundPayment(captureId: string, amount?: number): Promise<{ id: string; status: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new InternalServerErrorException('PayPal not configured');
      }

      const token = await this.getAccessToken();

      const refundData = amount && amount > 0 ? {
        amount: {
          currency_code: 'USD',
          value: amount.toFixed(2),
        },
      } : {};

      const response = await axios.post(
        `${this.apiBase}/v2/payments/captures/${captureId}/refund`,
        refundData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Refunded PayPal capture ${captureId}`);

      return {
        id: response.data.id,
        status: response.data.status,
      };
    } catch (error) {
      this.logger.error(`Failed to refund PayPal payment: ${error.message}`);
      throw new BadRequestException(`Failed to refund payment: ${error.message}`);
    }
  }

  /**
   * Check if PayPal is configured
   */
  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }
}
