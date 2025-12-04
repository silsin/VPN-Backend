import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirebaseConfig } from '../../config/firebase.config';
import { DeviceLogin } from '../device-logins/entities/device-login.entity';
import {
  DialogDelivery,
  DeliveryStatus,
} from '../dialogs/entities/dialog-delivery.entity';
import { Dialog, DialogTarget } from '../dialogs/entities/dialog.entity';

interface PushNotificationPayload {
  title: string;
  message: string;
  imageUrl?: string;
  actionUrl?: string;
  dialogId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly firebaseConfig: FirebaseConfig,
    @InjectRepository(DeviceLogin)
    private readonly deviceLoginRepository: Repository<DeviceLogin>,
    @InjectRepository(DialogDelivery)
    private readonly dialogDeliveryRepository: Repository<DialogDelivery>,
  ) {}

  /**
   * Send push notification to specific device tokens
   */
  async sendPushNotification(
    tokens: string[],
    payload: PushNotificationPayload,
    dialogId?: string,
  ): Promise<{ success: number; failed: number; invalidTokens: string[] }> {
    if (!this.firebaseConfig.isInitialized()) {
      this.logger.warn('Firebase not initialized, skipping push notification');
      return { success: 0, failed: tokens.length, invalidTokens: [] };
    }

    if (tokens.length === 0) {
      this.logger.warn('No tokens provided for push notification');
      return { success: 0, failed: 0, invalidTokens: [] };
    }

    const messaging = this.firebaseConfig.getMessaging();
    const invalidTokens: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Build FCM message
    const message = {
      notification: {
        title: payload.title,
        body: payload.message,
        ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
      },
      data: {
        ...(payload.actionUrl && { actionUrl: payload.actionUrl }),
        ...(payload.dialogId && { dialogId: payload.dialogId }),
      },
    };

    // Send in batches of 500 (FCM limit)
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);

      try {
        const response = await messaging.sendEachForMulticast({
          tokens: batch,
          ...message,
        });

        successCount += response.successCount;
        failedCount += response.failureCount;

        // Collect invalid tokens
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error;
            if (
              error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(batch[idx]);
            }
          }
        });

        this.logger.log(
          `Batch ${i / batchSize + 1}: ${response.successCount} success, ${response.failureCount} failed`,
        );
      } catch (error) {
        this.logger.error(`Failed to send batch: ${error.message}`);
        failedCount += batch.length;
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      await this.cleanupInvalidTokens(invalidTokens);
    }

    return { success: successCount, failed: failedCount, invalidTokens };
  }

  /**
   * Send push notification to all devices based on dialog target
   */
  async sendToDevices(
    dialog: Dialog,
  ): Promise<{ success: number; failed: number }> {
    const devices = await this.getDevicesByTarget(dialog.target);

    if (devices.length === 0) {
      this.logger.warn(`No devices found for target: ${dialog.target}`);
      return { success: 0, failed: 0 };
    }

    const tokens = devices
      .filter((d) => d.pushId)
      .map((d) => d.pushId);

    if (tokens.length === 0) {
      this.logger.warn('No valid push tokens found');
      return { success: 0, failed: 0 };
    }

    this.logger.log(
      `Sending push notification to ${tokens.length} devices for dialog ${dialog.id}`,
    );

    const result = await this.sendPushNotification(
      tokens,
      {
        title: dialog.title,
        message: dialog.message,
        imageUrl: dialog.imageUrl,
        actionUrl: dialog.actionUrl,
        dialogId: dialog.id,
      },
      dialog.id,
    );

    // Track deliveries
    await this.trackDeliveries(dialog.id, devices, result);

    return { success: result.success, failed: result.failed };
  }

  /**
   * Get devices based on target filter
   */
  private async getDevicesByTarget(
    target: DialogTarget,
  ): Promise<DeviceLogin[]> {
    const queryBuilder = this.deviceLoginRepository
      .createQueryBuilder('device')
      .where('device.isActive = :isActive', { isActive: true })
      .andWhere('device.pushId IS NOT NULL');

    if (target === DialogTarget.ANDROID) {
      queryBuilder.andWhere('device.platform = :platform', {
        platform: 'android',
      });
    } else if (target === DialogTarget.IOS) {
      queryBuilder.andWhere('device.platform = :platform', { platform: 'ios' });
    }

    return queryBuilder.getMany();
  }

  /**
   * Track delivery status for analytics
   */
  private async trackDeliveries(
    dialogId: string,
    devices: DeviceLogin[],
    result: { success: number; failed: number; invalidTokens: string[] },
  ): Promise<void> {
    const deliveries: Partial<DialogDelivery>[] = devices.map((device) => ({
      dialogId,
      deviceId: device.deviceId,
      platform: device.platform,
      deliveryStatus: result.invalidTokens.includes(device.pushId)
        ? DeliveryStatus.FAILED
        : DeliveryStatus.SENT,
      sentAt: new Date(),
      errorMessage: result.invalidTokens.includes(device.pushId)
        ? 'Invalid or unregistered token'
        : null,
    }));

    try {
      await this.dialogDeliveryRepository.save(deliveries);
      this.logger.log(`Tracked ${deliveries.length} deliveries for dialog ${dialogId}`);
    } catch (error) {
      this.logger.error(`Failed to track deliveries: ${error.message}`);
    }
  }

  /**
   * Clean up invalid device tokens
   */
  private async cleanupInvalidTokens(tokens: string[]): Promise<void> {
    try {
      await this.deviceLoginRepository
        .createQueryBuilder()
        .update(DeviceLogin)
        .set({ pushId: null, isActive: false })
        .where('pushId IN (:...tokens)', { tokens })
        .execute();

      this.logger.log(`Cleaned up ${tokens.length} invalid tokens`);
    } catch (error) {
      this.logger.error(`Failed to cleanup invalid tokens: ${error.message}`);
    }
  }

  /**
   * Update delivery status (called from mobile app)
   */
  async updateDeliveryStatus(
    dialogId: string,
    deviceId: string,
    action: 'click' | 'dismiss',
  ): Promise<void> {
    const delivery = await this.dialogDeliveryRepository.findOne({
      where: { dialogId, deviceId },
    });

    if (!delivery) {
      this.logger.warn(
        `Delivery not found for dialog ${dialogId} and device ${deviceId}`,
      );
      return;
    }

    if (action === 'click') {
      delivery.clicked = true;
      delivery.clickedAt = new Date();
    } else if (action === 'dismiss') {
      delivery.dismissed = true;
      delivery.dismissedAt = new Date();
    }

    await this.dialogDeliveryRepository.save(delivery);
  }
}
