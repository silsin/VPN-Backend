import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SubscriptionJobService } from '../services/subscription-job.service';

/**
 * Background Job Processor for subscription tasks
 * Processes jobs from the 'subscription-jobs' queue
 */
@Processor('subscription-jobs')
export class SubscriptionProcessor extends WorkerHost {
  private logger = new Logger(SubscriptionProcessor.name);

  constructor(private subscriptionJobService: SubscriptionJobService) {
    super();
  }

  /**
   * Process job - main handler for all jobs in the queue
   */
  async process(job: Job<any, any, string>): Promise<any> {
    try {
      this.logger.log(`Processing job: ${job.name}`);

      switch (job.name) {
        case 'check-expiring':
          return await this.checkExpiring(job);
        case 'process-renewals':
          return await this.processRenewals(job);
        case 'suspend-expired':
          return await this.suspendExpired(job);
        case 'reset-usage':
          return await this.resetUsage(job);
        case 'send-warnings':
          return await this.sendUsageWarnings(job);
        case 'retry-payments':
          return await this.retryPayments(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check expiring subscriptions
   */
  private async checkExpiring(job: Job) {
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
  private async processRenewals(job: Job) {
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
  private async suspendExpired(job: Job) {
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
  private async resetUsage(job: Job) {
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
  private async sendUsageWarnings(job: Job) {
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
  private async retryPayments(job: Job) {
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
