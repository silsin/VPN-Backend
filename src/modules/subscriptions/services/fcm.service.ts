import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { DeviceToken } from '../entities/device-token.entity';

@Injectable()
export class FcmService {
  private logger = new Logger(FcmService.name);
  private fcmInitialized = false;

  constructor(
    private configService: ConfigService,
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
  ) {
    this.initializeFcm();
  }

  private initializeFcm() {
    try {
      const projectId = this.configService.get('FCM_PROJECT_ID');
      const privateKey = this.configService.get('FCM_PRIVATE_KEY');
      const clientEmail = this.configService.get('FCM_CLIENT_EMAIL');

      if (!projectId || !privateKey || !clientEmail) {
        this.logger.warn('FCM configuration incomplete. Push notifications disabled.');
        return;
      }

      // Initialize Firebase Admin SDK
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey: privateKey.replace(/\\n/g, '\n'),
            clientEmail,
          } as any),
        });
      }

      this.fcmInitialized = true;
      this.logger.log('Firebase Cloud Messaging initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize FCM: ${error.message}`);
    }
  }

  /**
   * Register device token for user
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    deviceName?: string,
    deviceType?: string,
    osVersion?: string,
    appVersion?: string,
  ): Promise<DeviceToken> {
    // Deactivate old token if exists
    const existing = await this.deviceTokenRepository.findOne({
      where: { token },
    });

    if (existing) {
      existing.isActive = true;
      existing.lastUsedAt = new Date();
      if (deviceName) existing.deviceName = deviceName;
      if (deviceType) existing.deviceType = deviceType;
      if (osVersion) existing.osVersion = osVersion;
      if (appVersion) existing.appVersion = appVersion;
      return this.deviceTokenRepository.save(existing);
    }

    const deviceToken = this.deviceTokenRepository.create({
      userId,
      token,
      deviceName,
      deviceType,
      osVersion,
      appVersion,
      isActive: true,
      lastUsedAt: new Date(),
    });

    return this.deviceTokenRepository.save(deviceToken);
  }

  /**
   * Unregister device token
   */
  async unregisterDeviceToken(token: string): Promise<void> {
    await this.deviceTokenRepository.update(
      { token },
      { isActive: false },
    );
  }

  /**
   * Send push notification to user
   */
  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<number> {
    if (!this.fcmInitialized) {
      this.logger.warn('FCM not initialized. Skipping push notification.');
      return 0;
    }

    const tokens = await this.deviceTokenRepository.find({
      where: {
        userId,
        isActive: true,
      },
    });

    if (tokens.length === 0) {
      this.logger.debug(`No active device tokens for user ${userId}`);
      return 0;
    }

    return this.sendToTokens(
      tokens.map(t => t.token),
      title,
      body,
      data,
    );
  }

  /**
   * Send push notification to multiple tokens
   */
  async sendToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<number> {
    if (!this.fcmInitialized || tokens.length === 0) {
      return 0;
    }

    try {
      const message = {
        notification: {
          title,
          body,
        },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channel_id: 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            title,
            body,
            icon: 'https://flyvpn.com/icon.png',
          },
        },
      };

      let successCount = 0;
      const invalidTokens: string[] = [];

      for (const token of tokens) {
        try {
          await admin.messaging().send({
            ...message,
            token,
          } as any);
          successCount++;
        } catch (error: any) {
          this.logger.error(`Failed to send FCM message to token ${token}: ${error.message}`);

          // Mark invalid tokens as inactive
          if (
            error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(token);
          }
        }
      }

      // Deactivate invalid tokens
      if (invalidTokens.length > 0) {
        await this.deviceTokenRepository.update(
          { token: invalidTokens as any },
          { isActive: false },
        );
      }

      this.logger.log(`Sent FCM message to ${successCount}/${tokens.length} devices`);
      return successCount;
    } catch (error) {
      this.logger.error(`Failed to send FCM messages: ${error.message}`);
      return 0;
    }
  }

  /**
   * Send expiration reminder push
   */
  async sendExpirationReminder(userId: string, daysRemaining: number, planName: string): Promise<number> {
    return this.sendToUser(
      userId,
      `${planName} Subscription Expiring`,
      `Your subscription expires in ${daysRemaining} days. Renew now to avoid interruption.`,
      { type: 'expiration_reminder', days: String(daysRemaining) },
    );
  }

  /**
   * Send subscription expired push
   */
  async sendSubscriptionExpired(userId: string): Promise<number> {
    return this.sendToUser(
      userId,
      'Subscription Expired',
      'Your subscription has expired. Renew now to restore VPN access.',
      { type: 'subscription_expired' },
    );
  }

  /**
   * Send data usage warning push
   */
  async sendDataUsageWarning(userId: string, usagePercent: number): Promise<number> {
    return this.sendToUser(
      userId,
      'Data Usage Warning',
      `You have used ${usagePercent.toFixed(1)}% of your monthly data limit.`,
      { type: 'data_usage_warning', percent: String(usagePercent) },
    );
  }

  /**
   * Send data limit exceeded push
   */
  async sendDataLimitExceeded(userId: string): Promise<number> {
    return this.sendToUser(
      userId,
      'Data Limit Exceeded',
      'You have exceeded your data limit. VPN access is blocked. Upgrade your plan.',
      { type: 'data_limit_exceeded' },
    );
  }

  /**
   * Send payment failed push
   */
  async sendPaymentFailed(userId: string, retryCount: number): Promise<number> {
    return this.sendToUser(
      userId,
      'Payment Failed',
      `Auto-renewal attempt ${retryCount} failed. We will retry automatically.`,
      { type: 'payment_failed', retry_count: String(retryCount) },
    );
  }

  /**
   * Send auto-renewal success push
   */
  async sendAutoRenewalSuccess(userId: string, planName: string): Promise<number> {
    return this.sendToUser(
      userId,
      'Subscription Renewed',
      `Your ${planName} subscription has been renewed successfully.`,
      { type: 'auto_renewal_success' },
    );
  }

  /**
   * Send device limit exceeded push
   */
  async sendDeviceLimitExceeded(userId: string): Promise<number> {
    return this.sendToUser(
      userId,
      'Device Limit Reached',
      'You have reached your maximum concurrent devices. Disconnect one device.',
      { type: 'device_limit_exceeded' },
    );
  }

  /**
   * Get all device tokens for user
   */
  async getUserDeviceTokens(userId: string): Promise<DeviceToken[]> {
    return this.deviceTokenRepository.find({
      where: { userId },
      order: { lastUsedAt: 'DESC' },
    });
  }

  /**
   * Clean up inactive tokens
   */
  async cleanupInactiveTokens(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.deviceTokenRepository.delete({
      isActive: false,
      updatedAt: cutoffDate,
    });

    return result.affected || 0;
  }
}
