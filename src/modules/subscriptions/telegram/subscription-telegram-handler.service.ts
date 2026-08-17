import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionTelegramKeyboardService } from './subscription-telegram-keyboard.service';
import { SubscriptionAdminCommandsService } from './subscription-admin-commands.service';
import { SubscriptionsService } from '../services/subscriptions.service';
import { PaymentService } from '../services/payment.service';
import { UsageService } from '../services/usage.service';

/**
 * Keyboard Event Handler for Subscription Admin
 * Handles callback queries from inline keyboards
 */
@Injectable()
export class SubscriptionTelegramHandlerService {
  private readonly logger = new Logger(SubscriptionTelegramHandlerService.name);
  private pendingActions = new Map<string, { action: string; data: any; timestamp: number }>();

  constructor(
    private readonly keyboardService: SubscriptionTelegramKeyboardService,
    private readonly commandsService: SubscriptionAdminCommandsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentService: PaymentService,
    private readonly usageService: UsageService,
  ) {
    // Clean up old pending actions every 5 minutes (timeout after 30 mins)
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.pendingActions.entries()) {
        if (now - value.timestamp > 30 * 60 * 1000) {
          this.pendingActions.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Handle callback query from keyboard buttons
   */
  async handleCallback(
    queryId: string,
    chatId: string,
    messageId: number,
    data: string,
  ): Promise<void> {
    const [action, ...params] = data.split(':');

    try {
      switch (action) {
        // Main menu navigation
        case 'menu':
          await this.handleMenuNavigation(chatId, messageId, params[0]);
          break;

        // Plans management
        case 'plans':
          await this.handlePlansAction(chatId, messageId, params[0], params[1]);
          break;

        case 'plan':
          await this.handlePlanAction(chatId, messageId, params[0], params[1]);
          break;

        // Users management
        case 'users':
          await this.handleUsersAction(chatId, messageId, params[0]);
          break;

        case 'user':
          await this.handleUserAction(chatId, messageId, params[0], params[1]);
          break;

        // Payments
        case 'payments':
          await this.handlePaymentsAction(chatId, messageId, params[0]);
          break;

        // Analytics
        case 'analytics':
          await this.handleAnalyticsAction(chatId, messageId, params[0], params[1]);
          break;

        // Expiring subscriptions
        case 'expiring':
          await this.handleExpiringAction(chatId, messageId, parseInt(params[0]));
          break;

        // Usage
        case 'usage':
          await this.handleUsageAction(chatId, messageId, params[0]);
          break;

        // Quick actions
        case 'quick':
          await this.handleQuickAction(chatId, messageId, params[0]);
          break;

        // Date range
        case 'range':
          await this.handleDateRangeAction(chatId, messageId, parseInt(params[0]));
          break;

        default:
          await this.keyboardService.answerCallbackQuery(queryId, '❓ Unknown action');
      }

      await this.keyboardService.answerCallbackQuery(queryId, '✅ Done');
    } catch (error) {
      this.logger.error(`Error handling callback: ${error.message}`);
      await this.keyboardService.answerCallbackQuery(
        queryId,
        `❌ Error: ${error.message}`,
        true,
      );
    }
  }

  /**
   * Handle main menu navigation
   */
  private async handleMenuNavigation(
    chatId: string,
    messageId: number,
    menuName: string,
  ): Promise<void> {
    let text = '';
    let keyboard: any = null;

    switch (menuName) {
      case 'main':
        text = [
          '🤖 <b>FlyVPN Subscription Admin</b>',
          '',
          'Select an action:',
        ].join('\n');
        keyboard = this.keyboardService.getMainMenuKeyboard();
        break;

      case 'plans':
        text = [
          '💳 <b>Plan Management</b>',
          '',
          'Manage subscription plans:',
        ].join('\n');
        keyboard = this.keyboardService.getPlansMenuKeyboard();
        break;

      case 'users':
        text = [
          '👥 <b>User Management</b>',
          '',
          'Manage user subscriptions:',
        ].join('\n');
        keyboard = this.keyboardService.getUsersMenuKeyboard();
        break;

      case 'payments':
        text = [
          '💰 <b>Payment Management</b>',
          '',
          'Handle payments and refunds:',
        ].join('\n');
        keyboard = this.keyboardService.getPaymentsMenuKeyboard();
        break;

      case 'analytics':
        text = [
          '📊 <b>Analytics</b>',
          '',
          'View system analytics:',
        ].join('\n');
        keyboard = this.keyboardService.getAnalyticsMenuKeyboard();
        break;

      case 'expiring':
        text = [
          '⏰ <b>Expiring Subscriptions</b>',
          '',
          'Select time range:',
        ].join('\n');
        keyboard = this.keyboardService.getExpiringMenuKeyboard();
        break;

      case 'usage':
        text = [
          '📈 <b>Usage Statistics</b>',
          '',
          'View data usage information:',
        ].join('\n');
        keyboard = this.keyboardService.getUsageMenuKeyboard();
        break;

      case 'help':
        text = this.commandsService.getSubscriptionHelpText();
        keyboard = this.keyboardService.getMainMenuKeyboard();
        break;
    }

    if (keyboard && text) {
      await this.keyboardService.editMessageWithKeyboard(chatId, messageId, text, keyboard);
    }
  }

  /**
   * Handle plans submenu actions
   */
  private async handlePlansAction(
    chatId: string,
    messageId: number,
    action: string,
    planId?: string,
  ): Promise<void> {
    switch (action) {
      case 'list':
        const plans = await this.subscriptionsService.getAllPlans(false);
        const text = this.formatPlansList(plans);
        const keyboard = await this.keyboardService.getPlansListKeyboard();
        await this.keyboardService.editMessageWithKeyboard(chatId, messageId, text, keyboard);
        break;

      case 'create':
        const createText = [
          '📝 <b>Create New Plan</b>',
          '',
          'Send plan details in this format:',
          '',
          '<code>name|price|dataLimitGb|renewalPeriod</code>',
          '',
          'Example:',
          '<code>Premium Monthly|9.99|100|monthly</code>',
          '',
          'Renewal periods: monthly, quarterly, annual',
          'Data limit in GB (e.g. 100 for 100GB)',
          '',
          'Reply with plan details to create.',
        ].join('\n');
        const createKeyboard = [
          [{ text: '⬅️ Back', callback_data: 'menu:plans' }],
        ];
        await this.keyboardService.editMessageWithKeyboard(chatId, messageId, createText, createKeyboard);
        break;

      case 'search':
        const searchText = [
          '🔍 <b>Search Plan</b>',
          '',
          'Search functionality requires REST API.',
          'Use <code>GET /subscriptions/admin/plans?search=NAME</code>',
          '',
          'Or select a plan from the list:',
        ].join('\n');
        const plansForSearch = await this.subscriptionsService.getAllPlans(false);
        const searchKeyboard = await this.keyboardService.getPlansListKeyboard();
        await this.keyboardService.editMessageWithKeyboard(chatId, messageId, searchText, searchKeyboard);
        break;

      case 'view':
        if (planId) {
          const plan = await this.subscriptionsService.getPlanById(planId);
          const planText = this.formatPlanDetails(plan);
          const planKeyboard = this.keyboardService.getPlanActionsKeyboard(planId);
          await this.keyboardService.editMessageWithKeyboard(
            chatId,
            messageId,
            planText,
            planKeyboard,
          );
        }
        break;

      case 'toggle':
        if (planId) {
          const plan = await this.subscriptionsService.getPlanById(planId);
          await this.subscriptionsService.updatePlan(
            planId,
            { isActive: !plan.isActive },
            'telegram',
          );
          const updatedPlan = await this.subscriptionsService.getPlanById(planId);
          const updatedKeyboard = await this.keyboardService.getPlansListKeyboard();
          await this.keyboardService.editMessageWithKeyboard(
            chatId,
            messageId,
            this.formatPlansList(
              await this.subscriptionsService.getAllPlans(false),
            ),
            updatedKeyboard,
          );
        }
        break;
    }
  }

  /**
   * Handle plan details actions
   */
  private async handlePlanAction(
    chatId: string,
    messageId: number,
    action: string,
    planId: string,
  ): Promise<void> {
    switch (action) {
      case 'stats':
        // TODO: Get plan statistics
        break;
      case 'users':
        // TODO: Get plan users
        break;
    }
  }

  /**
   * Handle users submenu actions
   */
  private async handleUsersAction(
    chatId: string,
    messageId: number,
    action: string,
  ): Promise<void> {
    switch (action) {
      case 'search':
        // Request user ID/email from user
        const text = [
          '🔍 <b>Search User</b>',
          '',
          'Send user ID or email in next message:',
          '<code>/user &lt;id_or_email&gt;</code>',
        ].join('\n');
        await this.keyboardService.sendMessageWithKeyboard(
          chatId,
          text,
          this.keyboardService.getUsersMenuKeyboard(),
        );
        break;
    }
  }

  /**
   * Handle user detail actions
   */
  private async handleUserAction(
    chatId: string,
    messageId: number,
    action: string,
    userId: string,
  ): Promise<void> {
    switch (action) {
      case 'extend':
        // Prompt for days
        const extendText = [
          `➕ <b>Extend Subscription</b>`,
          `User: <code>${userId}</code>`,
          '',
          'Reply with number of days:',
          '<code>/extend 30</code>',
        ].join('\n');
        await this.keyboardService.sendMessageWithKeyboard(
          chatId,
          extendText,
          [[{ text: '⬅️ Back', callback_data: 'menu:users' }]],
        );
        break;

      case 'upgrade':
        // Show available plans
        const plans = await this.subscriptionsService.getAllPlans(true);
        const upgradeText = [
          `⬆️ <b>Upgrade User</b>`,
          `User: <code>${userId}</code>`,
          '',
          'Select new plan:',
        ].join('\n');

        const planButtons = plans.map((p) => [
          {
            text: `${p.name} ($${p.price.toFixed(2)})`,
            callback_data: `user:upgrade_confirm:${userId}:${p.id}`,
          },
        ]);
        planButtons.push([{ text: '⬅️ Back', callback_data: 'menu:users' }]);

        await this.keyboardService.sendMessageWithKeyboard(
          chatId,
          upgradeText,
          planButtons,
        );
        break;
    }
  }

  /**
   * Handle payments actions
   */
  private async handlePaymentsAction(
    chatId: string,
    messageId: number,
    action: string,
  ): Promise<void> {
    switch (action) {
      case 'recent':
        const stats = await this.paymentService.getPaymentStats(7);
        const recentText = this.formatPaymentStats(stats);
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          recentText,
          [[{ text: '⬅️ Back', callback_data: 'menu:payments' }]],
        );
        break;

      case 'stats':
        const allStats = await this.paymentService.getPaymentStats(30);
        const statsText = this.formatPaymentStats(allStats, 30);
        const statsKeyboard = this.keyboardService.getPeriodKeyboard('payments:period');
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          statsText,
          statsKeyboard,
        );
        break;
    }
  }

  /**
   * Handle analytics actions
   */
  private async handleAnalyticsAction(
    chatId: string,
    messageId: number,
    action: string,
    period?: string,
  ): Promise<void> {
    switch (action) {
      case 'stats':
        const stats = await this.subscriptionsService.getSubscriptionStats();
        const statsText = this.formatSubscriptionStats(stats);
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          statsText,
          this.keyboardService.getAnalyticsMenuKeyboard(),
        );
        break;

      case 'revenue':
        const days = period ? parseInt(period) : 30;
        const paymentStats = await this.paymentService.getPaymentStats(days);
        const revenueText = this.formatRevenueReport(paymentStats, days);
        const revenueKeyboard = this.keyboardService.getPeriodKeyboard('analytics:revenue');
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          revenueText,
          revenueKeyboard,
        );
        break;
    }
  }

  /**
   * Handle expiring subscriptions
   */
  private async handleExpiringAction(
    chatId: string,
    messageId: number,
    days: number,
  ): Promise<void> {
    const expiring = await this.subscriptionsService.getExpiringSubscriptionsForAdmin(days);
    const text = this.formatExpiringSubscriptions(expiring, days);
    await this.keyboardService.editMessageWithKeyboard(
      chatId,
      messageId,
      text,
      this.keyboardService.getExpiringMenuKeyboard(),
    );
  }

  /**
   * Handle usage actions
   */
  private async handleUsageAction(
    chatId: string,
    messageId: number,
    action: string,
  ): Promise<void> {
    switch (action) {
      case 'stats':
        const stats = await this.usageService.getUsageStats();
        const statsText = this.formatUsageStats(stats);
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          statsText,
          this.keyboardService.getUsageMenuKeyboard(),
        );
        break;

      case 'top':
        const topUsers = await this.usageService.getTopDataConsumers(10);
        const topText = this.formatTopConsumers(topUsers);
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          topText,
          this.keyboardService.getUsageMenuKeyboard(),
        );
        break;

      case 'near':
        const nearLimit = await this.usageService.getUsersNearLimit(0.8);
        const nearText = this.formatUsersNearLimit(nearLimit);
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          nearText,
          this.keyboardService.getUsageMenuKeyboard(),
        );
        break;
    }
  }

  /**
   * Handle quick actions
   */
  private async handleQuickAction(
    chatId: string,
    messageId: number,
    action: string,
  ): Promise<void> {
    switch (action) {
      case 'expiring':
        const expiring = await this.subscriptionsService.getExpiringSubscriptionsForAdmin(7);
        const text = [
          `⏰ <b>Expiring Soon (Next 7 Days)</b>`,
          `Count: <b>${expiring.length}</b>`,
          '',
          ...expiring.slice(0, 5).map((e) => `• ${e.email || e.username}: ${e.daysRemaining}d`),
        ].join('\n');
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          text,
          this.keyboardService.getQuickActionsKeyboard(),
        );
        break;

      case 'revenue':
        const revenueStats = await this.paymentService.getPaymentStats(1);
        const revenueText = this.formatPaymentStats(revenueStats, 1);
        await this.keyboardService.editMessageWithKeyboard(
          chatId,
          messageId,
          revenueText,
          this.keyboardService.getQuickActionsKeyboard(),
        );
        break;
    }
  }

  /**
   * Handle date range selection
   */
  private async handleDateRangeAction(
    chatId: string,
    messageId: number,
    days: number,
  ): Promise<void> {
    const stats = await this.paymentService.getPaymentStats(days);
    const text = this.formatPaymentStats(stats, days);
    await this.keyboardService.editMessageWithKeyboard(
      chatId,
      messageId,
      text,
      this.keyboardService.getDateRangeKeyboard(),
    );
  }

  // ========== Formatting Helpers ==========

  private formatPlansList(plans: any[]): string {
    const lines = plans.map(
      (p) => {
        const durationText = p.durationDays 
          ? p.durationDays === 30 ? 'Monthly' 
            : p.durationDays === 90 ? 'Quarterly'
            : p.durationDays === 365 ? 'Annual'
            : `${p.durationDays}d`
          : 'Lifetime';
        
        return `${p.isActive ? '✅' : '❌'} <b>${this.keyboardService.escapeHtml(p.name)}</b> - $${p.price.toFixed(2)}\n` +
               `   ${durationText} • ${p.maxDevices} devices • ${p.dataLimitGb ? p.dataLimitGb + 'GB' : '∞'}`;
      }
    );

    return ['💳 <b>Subscription Plans</b>', '', ...lines].join('\n');
  }

  private formatPlanDetails(plan: any): string {
    return [
      `💳 <b>${this.keyboardService.escapeHtml(plan.name)}</b>`,
      `Price: $${plan.price.toFixed(2)}`,
      `Duration: ${plan.durationDays ? plan.durationDays + ' days' : 'Unlimited'}`,
      `Devices: ${plan.maxDevices}`,
      `Data: ${plan.dataLimitGb ? plan.dataLimitGb + ' GB' : '∞'}`,
      `Status: ${plan.isActive ? '✅ Active' : '❌ Inactive'}`,
      `Features: ${plan.features.join(', ')}`,
    ].join('\n');
  }

  private formatPaymentStats(stats: any, days: number = 30): string {
    return [
      `💰 <b>Payment Statistics (${days} days)</b>`,
      `Total: ${stats.totalTransactions}`,
      `✅ Successful: ${stats.completedTransactions}`,
      `❌ Failed: ${stats.failedTransactions}`,
      `📊 Success Rate: ${stats.successRate}%`,
      `💵 Revenue: $${stats.totalRevenue.toFixed(2)}`,
    ].join('\n');
  }

  private formatSubscriptionStats(stats: any): string {
    return [
      `📊 <b>Subscription Statistics</b>`,
      `Active: ${stats.totalActive}`,
      `Expired: ${stats.totalExpired}`,
      `Cancelled: ${stats.totalCancelled}`,
      ``,
      `💰 <b>Revenue</b>`,
      `MRR: $${stats.mrr.toFixed(2)}`,
      `ARR: $${stats.arr.toFixed(2)}`,
    ].join('\n');
  }

  private formatRevenueReport(stats: any, days: number): string {
    const avgDaily = stats.totalRevenue / Math.max(days, 1);
    return [
      `💵 <b>Revenue Report</b>`,
      `Period: ${days} days`,
      `Total: $${stats.totalRevenue.toFixed(2)}`,
      `Daily Average: $${avgDaily.toFixed(2)}`,
      `Transactions: ${stats.totalTransactions}`,
    ].join('\n');
  }

  private formatExpiringSubscriptions(expiring: any[], days: number): string {
    const lines = expiring.slice(0, 10).map((e) => `• ${e.email || e.username}: ${e.daysRemaining}d`);
    return [
      `⏰ <b>Expiring in ${days} Days</b>`,
      `Total: ${expiring.length}`,
      '',
      ...lines,
      expiring.length > 10 ? `… and ${expiring.length - 10} more` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private formatUsageStats(stats: any): string {
    return [
      `📊 <b>Usage Statistics</b>`,
      `Active Cycles: ${stats.totalActiveCycles}`,
      `Users Over Limit: ${stats.usersExceededLimit}`,
      `Avg Data: ${stats.avgDataUsedGB.toFixed(2)} GB`,
      `Max Data: ${stats.maxDataUsedGB.toFixed(2)} GB`,
    ].join('\n');
  }

  private formatTopConsumers(users: any[]): string {
    const lines = users.map((u) => `• ${u.email}: ${u.dataUsedGB.toFixed(2)} GB / ${u.usagePercent.toFixed(0)}%`);
    return [`🔴 <b>Top Data Consumers</b>`, '', ...lines].join('\n');
  }

  private formatUsersNearLimit(users: any[]): string {
    const lines = users.map(
      (u) => `• ${u.email}: ${u.dataUsedPercent.toFixed(0)}% (${u.dataUsedGB.toFixed(1)} GB)`,
    );
    return [`⚠️ <b>Users Near Limit (80%+)</b>`, `Count: ${users.length}`, '', ...lines].join('\n');
  }
}
