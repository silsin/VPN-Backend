import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SubscriptionJobService } from '../services/subscription-job.service';

/**
 * Background Job Processor for subscription tasks
 * Processes jobs from the 'subscription-jobs' queue
 */
@Processor('subscription-jobs')
export class SubscriptionProcessor {
  private logger = new Logger(SubscriptionProcessor.name);

  constructor(private subscriptionJobService: SubscriptionJobService) {}

  /**
   * Check expiring subscriptions
   */
  async checkExpiring(job: Job) {
    try {
      this.logger.log('Processing: check-expiring subscriptions');
      const result = await this.subscriptionJobService.executeCheckExpiringSubscriptions();
      return { success: true, processed: result };
    } catch (error) {
      this.logger.error(`Failed to check expiring subscriptions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process auto-renewals
   */
  async processRenewals(job: Job) {
    try {
      this.logger.log('Processing: auto-renewals');
      const result = await this.subscriptionJobService.executeProcessAutoRenewals();
      return { success: true, processed: result };
    } catch (error) {
      this.logger.error(`Failed to process auto-renewals: ${error.message}`);
      throw error;
    }
  }

  /**
   * Suspend expired subscriptions
   */
  async suspendExpired(job: Job) {
    try {
      this.logger.log('Processing: suspend-expired subscriptions');
      const result = await this.subscriptionJobService.executeSuspendExpiredSubscriptions();
      return { success: true, processed: result };
    } catch (error) {
      this.logger.error(`Failed to suspend expired subscriptions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset monthly usage
   */
  async resetUsage(job: Job) {
    try {
      this.logger.log('Processing: reset-monthly-usage');
      const result = await this.subscriptionJobService.executeResetMonthlyUsage();
      return { success: true, processed: result };
    } catch (error) {
      this.logger.error(`Failed to reset monthly usage: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send usage warnings
   */
  async sendUsageWarnings(job: Job) {
    try {
      this.logger.log('Processing: send-usage-warnings');
      const result = await this.subscriptionJobService.executeSendUsageWarnings();
      return { success: true, processed: result };
    } catch (error) {
      this.logger.error(`Failed to send usage warnings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retry failed payments
   */
  async retryPayments(job: Job) {
    try {
      this.logger.log('Processing: retry-failed-payments');
      const result = await this.subscriptionJobService.executeRetryFailedPayments();
      return { success: true, processed: result };
    } catch (error) {
      this.logger.error(`Failed to retry payments: ${error.message}`);
      throw error;
    }
  }
}
