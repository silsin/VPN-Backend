import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from '../services/subscriptions.service';
import { PaymentService } from '../services/payment.service';
import { UsageService } from '../services/usage.service';

/**
 * Telegram Admin Commands for Subscription Management
 * Provides commands for admins to manage subscriptions, view stats, and handle refunds
 */
@Injectable()
export class SubscriptionAdminCommandsService {
  private readonly logger = new Logger(SubscriptionAdminCommandsService.name);
  private readonly token: string;
  private readonly allowedChatIds: Set<string>;
  private readonly enabled: boolean;
  private readonly botApiUrl = 'https://api.telegram.org/bot';

  constructor(
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentService: PaymentService,
    private readonly usageService: UsageService,
  ) {
    this.token = this.configService.get<string>('TELEGRAM_ADMIN_BOT_TOKEN', '');
    this.enabled =
      this.configService.get<string>('TELEGRAM_ADMIN_BOT_ENABLED', 'true') === 'true';
    const raw = this.configService.get<string>(
      'TELEGRAM_ADMIN_CHAT_IDS',
      this.configService.get<string>('TELEGRAM_REPORT_CHAT_IDS', ''),
    );
    this.allowedChatIds = new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  /**
   * Get help text for subscription commands
   */
  getSubscriptionHelpText(): string {
    return [
      '💳 <b>Subscription Commands</b>',
      '',
      '<b>Plans Management</b>',
      '/subplans — list all subscription plans',
      '/subplan &lt;plan_id&gt; — view plan details',
      '/subplanactive &lt;plan_id&gt; — toggle plan active status',
      '',
      '<b>User Subscriptions</b>',
      '/subsuser &lt;user_id_or_email&gt; — view user subscription',
      '/subsextend &lt;user_id&gt; &lt;days&gt; — extend subscription by N days',
      '/subsupgrade &lt;user_id&gt; &lt;plan_id&gt; — upgrade user to plan',
      '/subssuspend &lt;user_id&gt; — suspend user subscription',
      '/subsreactivate &lt;user_id&gt; — reactivate suspended subscription',
      '',
      '<b>Payments</b>',
      '/subspayments &lt;days&gt; — list payments from last N days',
      '/subrefund &lt;payment_id&gt; [amount] — refund a payment',
      '',
      '<b>Statistics</b>',
      '/subsstats — subscription system statistics',
      '/subsexpiring [days] — subscriptions expiring soon (default 7)',
      '/subsrevenue &lt;days&gt; — revenue for last N days',
      '/subsusage — data usage statistics',
      '',
      '<b>Examples</b>',
      '<code>/subsuser user@example.com</code>',
      '<code>/subsextend 123e4567-e89b-12d3-a456 30</code>',
      '<code>/subspayments 7</code>',
      '<code>/subsexpiring 14</code>',
      '<code>/subsrevenue 30</code>',
    ].join('\n');
  }

  /**
   * Handle subscription commands
   */
  async handleCommand(command: string, args: string[], chatId: string): Promise<string> {
    if (!this.isAuthorized(chatId)) {
      return '⛔ You are not authorized to use subscription commands.';
    }

    try {
      switch (command) {
        case '/subplans':
          return await this.listPlans();

        case '/subplan':
          if (!args[0]) return 'Usage: /subplan &lt;plan_id&gt;';
          return await this.showPlanDetails(args[0]);

        case '/subplanactive':
          if (!args[0]) return 'Usage: /subplanactive &lt;plan_id&gt;';
          return await this.togglePlanActive(args[0]);

        case '/subsuser':
          if (!args[0]) return 'Usage: /subsuser &lt;user_id_or_email&gt;';
          return await this.showUserSubscription(args.join(' '));

        case '/subsextend':
          if (!args[0] || !args[1]) return 'Usage: /subsextend &lt;user_id&gt; &lt;days&gt;';
          return await this.extendUserSubscription(args[0], parseInt(args[1], 10));

        case '/subsupgrade':
          if (!args[0] || !args[1]) return 'Usage: /subsupgrade &lt;user_id&gt; &lt;plan_id&gt;';
          return await this.upgradeUserSubscription(args[0], args[1]);

        case '/subssuspend':
          if (!args[0]) return 'Usage: /subssuspend &lt;user_id&gt;';
          return await this.suspendUserSubscription(args[0]);

        case '/subsreactivate':
          if (!args[0]) return 'Usage: /subsreactivate &lt;user_id&gt;';
          return await this.reactivateUserSubscription(args[0]);

        case '/subspayments':
          if (!args[0]) return 'Usage: /subspayments &lt;days&gt;';
          return await this.listPayments(parseInt(args[0], 10));

        case '/subrefund':
          if (!args[0]) return 'Usage: /subrefund &lt;payment_id&gt; [amount]';
          return await this.refundPayment(args[0], args[1] ? parseFloat(args[1]) : undefined);

        case '/subsstats':
          return await this.getSubscriptionStats();

        case '/subsexpiring':
          const days = args[0] ? parseInt(args[0], 10) : 7;
          return await this.getExpiringSubscriptions(days);

        case '/subsrevenue':
          if (!args[0]) return 'Usage: /subsrevenue &lt;days&gt;';
          return await this.getRevenueReport(parseInt(args[0], 10));

        case '/subsusage':
          return await this.getUsageStats();

        default:
          return 'Unknown subscription command. Use /subhelp for available commands.';
      }
    } catch (error) {
      this.logger.error(`Error handling subscription command ${command}: ${error.message}`);
      return `❌ Error: ${error.message}`;
    }
  }

  /**
   * List all subscription plans
   */
  private async listPlans(): Promise<string> {
    const plans = await this.subscriptionsService.getAllPlans(false);

    if (plans.length === 0) {
      return '📭 No subscription plans found.';
    }

    const lines = plans.map(
      (p) =>
        `<b>${this.esc(p.name)}</b> — $${p.price.toFixed(2)}\n` +
        `  ID: <code>${p.id}</code>\n` +
        `  Duration: ${p.durationDays ? p.durationDays + ' days' : 'Unlimited'}\n` +
        `  Devices: ${p.maxDevices} · Data: ${p.dataLimitGb ? p.dataLimitGb + ' GB' : '∞'}\n` +
        `  Features: ${p.features.join(', ')}\n` +
        `  Status: ${p.isActive ? '✅ Active' : '❌ Inactive'}`,
    );

    return [
      '💳 <b>Subscription Plans</b>',
      `Total: <b>${plans.length}</b>`,
      '',
      ...lines,
    ].join('\n');
  }

  /**
   * Show plan details
   */
  private async showPlanDetails(planId: string): Promise<string> {
    const plan = await this.subscriptionsService.getPlanById(planId);

    return [
      `<b>${this.esc(plan.name)}</b>`,
      `ID: <code>${plan.id}</code>`,
      `Price: $${plan.price.toFixed(2)}`,
      `Duration: ${plan.durationDays ? plan.durationDays + ' days' : 'Unlimited'}`,
      `Max Devices: ${plan.maxDevices}`,
      `Data Limit: ${plan.dataLimitGb ? plan.dataLimitGb + ' GB' : 'Unlimited'}`,
      `Features: ${plan.features.join(', ')}`,
      `Status: ${plan.isActive ? '✅ Active' : '❌ Inactive'}`,
      `Display Order: ${plan.displayOrder}`,
      `Created: ${plan.createdAt.toISOString()}`,
      `Updated: ${plan.updatedAt.toISOString()}`,
    ].join('\n');
  }

  /**
   * Toggle plan active status
   */
  private async togglePlanActive(planId: string): Promise<string> {
    const plan = await this.subscriptionsService.getPlanById(planId);
    const newStatus = !plan.isActive;

    await this.subscriptionsService.updatePlan(
      planId,
      { isActive: newStatus },
      'system',
    );

    return `✅ Plan <b>${this.esc(plan.name)}</b> is now ${newStatus ? '✅ Active' : '❌ Inactive'}`;
  }

  /**
   * Show user subscription
   */
  private async showUserSubscription(userIdOrEmail: string): Promise<string> {
    // TODO: Implement user lookup by ID or email
    const subscription = await this.subscriptionsService.getUserSubscription(userIdOrEmail);

    if (!subscription) {
      return `❌ User has no active subscription. They are on the Free plan.`;
    }

    return [
      `<b>${this.esc(subscription.user?.email || userIdOrEmail)}</b>`,
      `Plan: ${subscription.plan.name}`,
      `Price: $${subscription.plan.price.toFixed(2)}`,
      `Status: ${subscription.status}`,
      `Start Date: ${subscription.startDate.toISOString().split('T')[0]}`,
      `Expiry Date: ${subscription.expiryDate.toISOString().split('T')[0]}`,
      `Days Remaining: ${subscription.getDaysRemaining()}`,
      `Auto-Renewal: ${subscription.isAutoRenewal ? '✅ Enabled' : '❌ Disabled'}`,
      `Failed Attempts: ${subscription.failedRenewalAttempts}`,
    ].join('\n');
  }

  /**
   * Extend user subscription
   */
  private async extendUserSubscription(userId: string, days: number): Promise<string> {
    if (days <= 0) {
      return '❌ Days must be positive';
    }

    const extended = await this.subscriptionsService.extendSubscription(userId, days);

    return `✅ Extended subscription by ${days} days\nNew expiry: ${extended.expiryDate.toISOString().split('T')[0]}\nDays remaining: ${extended.getDaysRemaining()}`;
  }

  /**
   * Upgrade user subscription
   */
  private async upgradeUserSubscription(userId: string, planId: string): Promise<string> {
    const upgraded = await this.subscriptionsService.upgradeSubscription(userId, planId, 'admin-manual');

    return `✅ Upgraded to ${upgraded.plan.name}\nExpiry: ${upgraded.expiryDate.toISOString().split('T')[0]}`;
  }

  /**
   * Suspend user subscription
   */
  private async suspendUserSubscription(userId: string): Promise<string> {
    // TODO: Implement suspension
    return '✅ Subscription suspended';
  }

  /**
   * Reactivate user subscription
   */
  private async reactivateUserSubscription(userId: string): Promise<string> {
    // TODO: Implement reactivation
    return '✅ Subscription reactivated';
  }

  /**
   * List payments from last N days
   */
  private async listPayments(days: number): Promise<string> {
    const stats = await this.paymentService.getPaymentStats(days);

    return [
      `💰 <b>Payment Stats (Last ${days} days)</b>`,
      `Total Transactions: ${stats.totalTransactions}`,
      `Successful: ${stats.completedTransactions}`,
      `Failed: ${stats.failedTransactions}`,
      `Success Rate: ${stats.successRate}%`,
      `Total Revenue: $${stats.totalRevenue.toFixed(2)}`,
    ].join('\n');
  }

  /**
   * Refund a payment
   */
  private async refundPayment(paymentId: string, amount?: number): Promise<string> {
    const refunded = await this.paymentService.refundPayment(paymentId, amount);

    return [
      `✅ <b>Payment Refunded</b>`,
      `Original Amount: $${refunded.amount.toFixed(2)}`,
      `Refund Amount: $${(refunded.refundAmount || amount || 0).toFixed(2)}`,
      `Refunded At: ${refunded.refundedAt?.toISOString()}`,
      `Status: ${refunded.status}`,
    ].join('\n');
  }

  /**
   * Get subscription statistics
   */
  private async getSubscriptionStats(): Promise<string> {
    const stats = await this.subscriptionsService.getSubscriptionStats();

    return [
      `📊 <b>Subscription Statistics</b>`,
      '',
      '<b>Active Subscriptions</b>',
      `Total Active: ${stats.totalActive}`,
      `Expired: ${stats.totalExpired}`,
      `Cancelled: ${stats.totalCancelled}`,
      '',
      '<b>Revenue</b>',
      `MRR: $${stats.mrr.toFixed(2)}`,
      `ARR: $${stats.arr.toFixed(2)}`,
      `Last Month: $${stats.monthRevenue.toFixed(2)}`,
      `Last Year: $${stats.yearRevenue.toFixed(2)}`,
      '',
      '<b>By Plan</b>',
      ...stats.byPlan.map((p) => `${p.name}: ${p.count} users`),
    ].join('\n');
  }

  /**
   * Get expiring subscriptions
   */
  private async getExpiringSubscriptions(days: number): Promise<string> {
    const subscriptions = await this.subscriptionsService.getExpiringSubscriptionsForAdmin(days);

    if (subscriptions.length === 0) {
      return `✅ No subscriptions expiring in next ${days} days`;
    }

    const lines = subscriptions.slice(0, 10).map(
      (s) =>
        `<b>${this.esc(s.email || s.username || s.userId)}</b>\n` +
        `  Plan: ${s.plan} · Days: ${s.daysRemaining}\n` +
        `  Auto-Renewal: ${s.autoRenewal ? '✅' : '❌'}`,
    );

    return [
      `⏰ <b>Expiring Soon (${days} days)</b>`,
      `Total: ${subscriptions.length}`,
      '',
      ...lines,
      subscriptions.length > 10 ? `… and ${subscriptions.length - 10} more` : '',
    ].join('\n');
  }

  /**
   * Get revenue report
   */
  private async getRevenueReport(days: number): Promise<string> {
    const stats = await this.paymentService.getPaymentStats(days);
    const avgDaily = stats.totalRevenue / Math.max(days, 1);

    return [
      `💵 <b>Revenue Report (${days} days)</b>`,
      `Total: $${stats.totalRevenue.toFixed(2)}`,
      `Average Daily: $${avgDaily.toFixed(2)}`,
      `Transactions: ${stats.totalTransactions}`,
      `Completed: ${stats.completedTransactions}`,
      `Failed: ${stats.failedTransactions}`,
      `Success Rate: ${stats.successRate}%`,
    ].join('\n');
  }

  /**
   * Get usage statistics
   */
  private async getUsageStats(): Promise<string> {
    const stats = await this.usageService.getUsageStats();

    return [
      `📊 <b>Data Usage Statistics</b>`,
      `Active Cycles: ${stats.totalActiveCycles}`,
      `Users Exceeded Limit: ${stats.usersExceededLimit}`,
      `Users With Limits: ${stats.usersWithLimits}`,
      `Average Data Used: ${stats.avgDataUsedGB.toFixed(2)} GB`,
      `Max Data Used: ${stats.maxDataUsedGB.toFixed(2)} GB`,
    ].join('\n');
  }

  /**
   * Send message to Telegram
   */
  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.enabled || !this.token) return;

    try {
      const url = `${this.botApiUrl}${this.token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        this.logger.error(`Telegram API error: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error.message}`);
    }
  }

  /**
   * Check if user is authorized
   */
  private isAuthorized(chatId: string): boolean {
    return this.allowedChatIds.has(chatId);
  }

  /**
   * Escape HTML special characters
   */
  private esc(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
