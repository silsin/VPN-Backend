import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { google } from 'googleapis';
import * as fs from 'fs';

/**
 * Google Play Subscription V2 verification result
 */
export interface GooglePlaySubscriptionVerification {
  valid: boolean;
  active: boolean;
  subscriptionState?: string;
  expiryTime?: string;
  productId?: string;
  orderId?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  raw?: any;
}

/**
 * Unified Google Play Billing Service using Subscriptions V2 API
 * Handles Android in-app subscriptions and purchases via Google Play API v3
 * 
 * Credential priority:
 * 1. GOOGLE_PLAY_SERVICE_ACCOUNT_KEY (Base64 encoded JSON)
 * 2. GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH (file path)
 */
@Injectable()
export class GooglePlayBillingV2Service {
  private readonly logger = new Logger(GooglePlayBillingV2Service.name);
  private androidPublisher: any;
  private packageName: string;
  private enabled: boolean = false;
  private serviceAccountEmail: string;
  private projectId: string;

  constructor(
    private configService: ConfigService,
  ) {
    this.packageName = this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME', '').trim();
    this.initializeGooglePlayAPI();
  }

  /**
   * Initialize Google Play API with unified credential loading
   * Credential priority: Base64 KEY > File path
   */
  private initializeGooglePlayAPI(): void {
    try {
      // Validate package name is configured
      if (!this.packageName) {
        this.logger.error('❌ GOOGLE_PLAY_PACKAGE_NAME is not configured');
        this.enabled = false;
        return;
      }

      let auth;
      let credentialSource = 'NONE';

      // Priority 1: Base64 encoded service account key
      const base64Key = this.configService.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY', '').trim();

      if (base64Key) {
        try {
          const credentials = JSON.parse(
            Buffer.from(base64Key, 'base64').toString('utf8'),
          );

          if (!this.isValidServiceAccountKey(credentials)) {
            throw new Error('Invalid service account key format');
          }

          this.serviceAccountEmail = credentials.client_email;
          this.projectId = credentials.project_id;

          auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
          });

          credentialSource = 'BASE64';
          this.logger.log(
            `✅ Google Play: Loaded credentials from GOOGLE_PLAY_SERVICE_ACCOUNT_KEY (Base64)`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Failed to decode/parse Base64 key: ${error.message}`,
          );
          throw error;
        }
      } else {
        // Priority 2: File path
        const keyPath = this.configService.get<string>(
          'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH',
          '',
        ).trim();

        if (!keyPath) {
          this.logger.error(
            '❌ Neither GOOGLE_PLAY_SERVICE_ACCOUNT_KEY nor GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH configured',
          );
          this.enabled = false;
          return;
        }

        if (!fs.existsSync(keyPath)) {
          this.logger.error(
            `❌ Service account key file not found: ${keyPath}`,
          );
          this.enabled = false;
          return;
        }

        try {
          const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));

          if (!this.isValidServiceAccountKey(keyData)) {
            throw new Error('Invalid service account key format');
          }

          this.serviceAccountEmail = keyData.client_email;
          this.projectId = keyData.project_id;

          auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
          });

          credentialSource = 'FILE';
          this.logger.log(
            `✅ Google Play: Loaded credentials from ${keyPath}`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Failed to read/parse key file: ${error.message}`,
          );
          throw error;
        }
      }

      this.androidPublisher = google.androidpublisher({
        version: 'v3',
        auth,
      });

      this.enabled = true;

      // Log safe startup diagnostics
      this.logger.log('📋 ===== Google Play Billing Configuration =====');
      this.logger.log(`✅ Google Play Billing enabled: true`);
      this.logger.log(`📦 Google Play package: ${this.packageName}`);
      this.logger.log(`📝 Credentials source: ${credentialSource}`);
      this.logger.log(`👤 Service account: ${this.serviceAccountEmail}`);
      this.logger.log(`🔑 Project ID: ${this.projectId}`);
      this.logger.log(`🔌 Google Play API v3 (subscriptionsv2) initialized successfully`);
      this.logger.log('=============================================');
    } catch (error) {
      this.logger.error(
        `❌ Failed to initialize Google Play API: ${error.message}`,
      );
      this.enabled = false;
    }
  }

  /**
   * Validate service account key structure
   */
  private isValidServiceAccountKey(key: any): boolean {
    return (
      key &&
      key.type === 'service_account' &&
      key.client_email &&
      key.private_key &&
      key.project_id
    );
  }

  /**
   * Get SHA-256 hash of purchase token (for replay attack prevention)
   */
  static hashPurchaseToken(purchaseToken: string): string {
    return createHash('sha256').update(purchaseToken).digest('hex');
  }

  /**
   * Verify subscription using Google Play API
   * 
   * @param packageName - App package name (must match configured value)
   * @param purchaseToken - Google Play purchase token
   * @param productId - Product ID (subscription ID) to verify
   * @returns Verification result with subscription state and details
   */
  async verifySubscription(
    packageName: string,
    purchaseToken: string,
    productId?: string,
  ): Promise<GooglePlaySubscriptionVerification> {
    if (!this.enabled) {
      this.logger.error('❌ Google Play Billing is not enabled');
      throw new BadRequestException('Google Play Billing not enabled');
    }

    if (!this.androidPublisher) {
      this.logger.error('❌ Android Publisher not initialized - check service account credentials');
      throw new BadRequestException('Google Play service not initialized');
    }

    // Validate package name matches configuration
    if (packageName.trim() !== this.packageName) {
      this.logger.warn(
        `⚠️ Package name mismatch: received "${packageName}", expected "${this.packageName}"`,
      );
      throw new UnauthorizedException(
        'Invalid Google Play package name',
      );
    }

    // productId is required for subscription verification
    if (!productId) {
      this.logger.error('❌ productId is required for subscription verification');
      throw new BadRequestException('Product ID is required');
    }

    try {
      this.logger.debug(
        `🔍 Verifying Google Play subscription: packageName=${packageName}, productId=${productId}, token_prefix=${purchaseToken.substring(0, 20)}...`,
      );

      // Validate token format
      if (!purchaseToken || purchaseToken.length < 10) {
        this.logger.error(
          `❌ Invalid purchase token format: ${purchaseToken}`,
        );
        return {
          valid: false,
          active: false,
        };
      }

      // Call subscriptions.get with proper parameters
      // For V2 data model, we still use the subscriptions endpoint
      // but the response includes V2-style data with lineItems
      this.logger.debug(
        `🔗 Calling Google Play API: purchases.subscriptions.get(packageName=${this.packageName}, subscriptionId=${productId}, token_length=${purchaseToken.length})`,
      );

      const response = await this.androidPublisher.purchases.subscriptions.get({
        packageName: this.packageName,
        subscriptionId: productId || 'unknown', // Use the product ID as subscription ID
        token: purchaseToken,
      });

      if (!response.data) {
        this.logger.error('❌ Google Play returned empty response data');
        throw new Error('No data in Google Play response');
      }

      const data = response.data;
      this.logger.debug(
        `📨 Google Play V2 response received: subscriptionState=${data.subscriptionState}`,
      );

      // Log available line items for debugging
      const lineItemsCount = data.lineItems?.length || 0;
      this.logger.debug(`📋 Available line items: ${lineItemsCount}`);
      
      const availableProductIds: string[] = [];
      if (data.lineItems && data.lineItems.length > 0) {
        data.lineItems.forEach((item: any, idx: number) => {
          this.logger.debug(
            `   [${idx}] productId: ${item.productId}, expiryTime: ${item.expiryTime}`,
          );
          availableProductIds.push(item.productId);
        });
      }

      // Extract line item 
      // Priority:
      // 1. If productId specified, try to find it (but don't fail if not found - use first item instead)
      // 2. Use first line item (purchase is tied to whatever product was actually bought)
      let lineItem = null;
      
      if (productId) {
        this.logger.debug(`🔍 Client requested productId: ${productId}`);
        lineItem = data.lineItems?.find(
          (item: any) => item.productId === productId,
        );

        if (lineItem) {
          this.logger.debug(
            `✅ Found requested product "${productId}" in line items`,
          );
        } else {
          // Product not found in line items - this is OK, use the actual purchased item
          this.logger.warn(
            `⚠️ Requested productId "${productId}" not found, but subscription has items: ${availableProductIds.join(', ')}. Using actual purchased item.`,
          );
          lineItem = data.lineItems?.[0];
        }
      } else {
        // No specific product requested, use first item
        this.logger.debug('ℹ️ No productId specified, using first line item');
        lineItem = data.lineItems?.[0];
      }

      if (!lineItem) {
        this.logger.error(
          `❌ No line items found in subscription response`,
        );
        return {
          valid: false,
          active: false,
          raw: data,
        };
      }

      // Determine if subscription is active based on state
      const subscriptionState = data.subscriptionState || '';
      const activeStates = new Set([
        'SUBSCRIPTION_STATE_ACTIVE',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      ]);

      const isActiveByState = activeStates.has(subscriptionState);
      this.logger.debug(
        `📊 Subscription state: ${subscriptionState}, Active: ${isActiveByState}`,
      );

      // Check expiry time
      const expiryTime = lineItem.expiryTime;
      const notExpired =
        !!expiryTime && new Date(expiryTime).getTime() > Date.now();

      this.logger.debug(
        `⏱️ Expiry time: ${expiryTime}, Not expired: ${notExpired}`,
      );

      const isActive = isActiveByState && notExpired;

      const result: GooglePlaySubscriptionVerification = {
        valid: true,
        active: isActive,
        subscriptionState,
        expiryTime,
        productId: lineItem.productId,
        orderId: data.latestOrderId,
        latestOrderId: data.latestOrderId,
        acknowledgementState: data.acknowledgementState,
        raw: data,
      };

      this.logger.debug(
        `✅ Verification result: valid=${result.valid}, active=${result.active}`,
      );

      return result;
    } catch (error: any) {
      const statusCode = error.status || error.code;
      const errorMessage = error.message || 'Unknown error';

      this.logger.error(
        `❌ Google Play verification failed (status=${statusCode}): ${errorMessage}`,
      );

      // Log full error for debugging
      if (error.errors && error.errors.length > 0) {
        this.logger.error(`📋 Google API Error Details: ${JSON.stringify(error.errors)}`);
      }

      // Map common Google API errors
      if (statusCode === 401 || statusCode === 403) {
        this.logger.error(
          `🔐 AUTHENTICATION/PERMISSION ERROR: Check service account has necessary permissions in Google Play Console. Make sure account has "Admin" or "Financial data" role.`,
        );
      }

      if (statusCode === 404) {
        this.logger.warn(`⚠️ Purchase token not found in Google Play`);
      }

      return {
        valid: false,
        active: false,
        raw: error,
      };
    }
  }

  /**
   * Acknowledge a subscription purchase
   * Must be done within 3 days to avoid automatic refund
   */
  async acknowledgePurchase(
    packageName: string,
    purchaseToken: string,
    productId?: string,
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('⚠️ Google Play Billing is not enabled');
      return false;
    }

    // Validate package name
    if (packageName.trim() !== this.packageName) {
      this.logger.warn('⚠️ Package name mismatch for acknowledgement');
      return false;
    }

    if (!productId) {
      this.logger.warn('⚠️ productId required for acknowledgement');
      return false;
    }

    try {
      this.logger.debug(
        `🔄 Acknowledging purchase: packageName=${packageName}, productId=${productId}, token_prefix=${purchaseToken.substring(0, 20)}...`,
      );

      // Check current acknowledgement state first
      const verification = await this.verifySubscription(
        packageName,
        purchaseToken,
        productId,
      );

      if (
        verification.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
      ) {
        this.logger.debug('ℹ️ Purchase already acknowledged');
        return true;
      }

      // Acknowledge the purchase
      await this.androidPublisher.purchases.subscriptions.acknowledge({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: {},
      });

      this.logger.log(
        `✅ Purchase acknowledged successfully for token_prefix=${purchaseToken.substring(0, 20)}...`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to acknowledge purchase: ${error.message}`,
      );
      // Don't throw - acknowledgement failure should not block subscription
      return false;
    }
  }

  /**
   * Get subscription details for a purchase token
   */
  async getSubscriptionDetails(
    packageName: string,
    purchaseToken: string,
    productId?: string,
  ): Promise<any> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    if (packageName.trim() !== this.packageName) {
      throw new UnauthorizedException('Invalid package name');
    }

    if (!productId) {
      throw new BadRequestException('Product ID is required');
    }

    try {
      const response = await this.androidPublisher.purchases.subscriptions.get({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });

      return response.data;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to get subscription details: ${error.message}`,
      );
      throw new BadRequestException('Failed to retrieve subscription');
    }
  }

  /**
   * Check if Google Play Billing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get configured package name
   */
  getPackageName(): string {
    return this.packageName;
  }

  /**
   * Get service account email (safe for logging)
   */
  getServiceAccountEmail(): string {
    return this.serviceAccountEmail;
  }

  /**
   * Get project ID (safe for logging)
   */
  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Handle Real-time Developer Notifications from Google Play
   * Fetches authoritative state using V2 API
   */
  async handleRealtimeNotification(
    packageName: string,
    purchaseToken: string,
    notificationType: string,
  ): Promise<GooglePlaySubscriptionVerification> {
    if (!this.enabled) {
      throw new BadRequestException('Google Play Billing not enabled');
    }

    this.logger.log(
      `📬 RTDN received: type=${notificationType}, token_prefix=${purchaseToken.substring(0, 20)}...`,
    );

    // Always fetch authoritative state from Google, don't trust notification type alone
    return this.verifySubscription(packageName, purchaseToken);
  }
}
