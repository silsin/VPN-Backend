import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailService = this.configService.get('EMAIL_SERVICE', 'smtp');
    const emailUser = this.configService.get('EMAIL_USER');
    const emailPass = this.configService.get('EMAIL_PASS');
    const emailFrom = this.configService.get('EMAIL_FROM', 'noreply@flyvpn.com');

    if (emailService === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });
    } else if (emailService === 'smtp') {
      const smtpHost = this.configService.get('SMTP_HOST', 'localhost');
      const smtpPort = this.configService.get('SMTP_PORT', 587);
      const smtpSecure = this.configService.get('SMTP_SECURE', false);

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: emailUser && emailPass ? { user: emailUser, pass: emailPass } : undefined,
      });
    } else {
      // Fallback to console logging for development
      this.logger.warn('Email service not configured. Using console logging instead.');
      this.transporter = null;
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        this.logger.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
        return true;
      }

      const emailFrom = this.configService.get('EMAIL_FROM', 'noreply@flyvpn.com');
      await this.transporter.sendMail({
        from: emailFrom,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return false;
    }
  }

  // Email templates

  async sendExpirationReminder(email: string, userFirstName: string, daysRemaining: number, planName: string): Promise<boolean> {
    const html = `
      <h2>Your ${planName} Subscription Expires Soon</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your FlyVPN subscription expires in <strong>${daysRemaining} days</strong>.</p>
      <p>To avoid interruption, please renew your subscription now.</p>
      <p><a href="https://flyvpn.com/renew" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Now</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Your FlyVPN subscription expires in ${daysRemaining} days`, html);
  }

  async sendSubscriptionExpired(email: string, userFirstName: string): Promise<boolean> {
    const html = `
      <h2>Your Subscription Has Expired</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your FlyVPN subscription has expired and VPN access is no longer available.</p>
      <p>To restore access, please renew your subscription.</p>
      <p><a href="https://flyvpn.com/renew" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Renew Subscription</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, 'Your FlyVPN subscription has expired', html);
  }

  async sendDataUsageWarning(email: string, userFirstName: string, usagePercent: number, dataLimit: number): Promise<boolean> {
    const html = `
      <h2>Data Usage Warning</h2>
      <p>Hi ${userFirstName},</p>
      <p>You have used <strong>${usagePercent.toFixed(1)}%</strong> of your ${dataLimit}GB monthly data limit.</p>
      <p>To continue using VPN when you reach 100%, upgrade your plan.</p>
      <p><a href="https://flyvpn.com/upgrade" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Plans</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Data Usage Warning: ${usagePercent.toFixed(1)}% used`, html);
  }

  async sendDataLimitExceeded(email: string, userFirstName: string, dataLimit: number): Promise<boolean> {
    const html = `
      <h2>Data Limit Exceeded</h2>
      <p>Hi ${userFirstName},</p>
      <p>You have exceeded your monthly data limit of ${dataLimit}GB and VPN access is temporarily blocked.</p>
      <p>Your access will be restored when your billing cycle resets, or you can upgrade your plan for more data.</p>
      <p><a href="https://flyvpn.com/upgrade" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Plan</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, 'Data Limit Exceeded - VPN Blocked', html);
  }

  async sendPaymentFailed(email: string, userFirstName: string, reason: string, retryCount: number, nextRetryTime: Date): Promise<boolean> {
    const retryTimeStr = nextRetryTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = `
      <h2>Payment Failed - Auto-Renewal</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your auto-renewal payment failed with the following reason:</p>
      <p><em>${reason}</em></p>
      <p>We will automatically retry on <strong>${retryTimeStr}</strong> (Attempt ${retryCount} of 5).</p>
      <p>If you'd like to update your payment method or retry now:</p>
      <p><a href="https://flyvpn.com/billing" style="background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Update Payment</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, 'Payment Failed - Auto-Renewal Retry Scheduled', html);
  }

  async sendAutoRenewalSuccess(email: string, userFirstName: string, planName: string, amount: number, expiryDate: Date): Promise<boolean> {
    const expiryStr = expiryDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const html = `
      <h2>Subscription Renewed Successfully</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your auto-renewal payment was successful!</p>
      <p><strong>Plan:</strong> ${planName}<br/>
      <strong>Amount:</strong> $${amount.toFixed(2)}<br/>
      <strong>Expires:</strong> ${expiryStr}</p>
      <p>View your receipt and manage subscription:</p>
      <p><a href="https://flyvpn.com/account/subscription" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Receipt</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, 'Subscription Renewed - Payment Successful', html);
  }

  async sendSubscriptionSuspended(email: string, userFirstName: string, reason: string): Promise<boolean> {
    const html = `
      <h2>Subscription Suspended</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your FlyVPN subscription has been suspended for the following reason:</p>
      <p><em>${reason}</em></p>
      <p>To restore your subscription, contact our support team.</p>
      <p><a href="https://flyvpn.com/support" style="background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Contact Support</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, 'Subscription Suspended', html);
  }

  async sendDeviceLimitExceeded(email: string, userFirstName: string, deviceLimit: number): Promise<boolean> {
    const html = `
      <h2>Device Limit Reached</h2>
      <p>Hi ${userFirstName},</p>
      <p>You have reached your maximum concurrent device limit of <strong>${deviceLimit} devices</strong>.</p>
      <p>Please disconnect one device to continue using VPN, or upgrade your plan for more devices.</p>
      <p><a href="https://flyvpn.com/upgrade" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Plan</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, 'Device Limit Reached', html);
  }

  async sendPauseNotification(email: string, userFirstName: string, planName: string, reason: string): Promise<boolean> {
    const html = `
      <h2>Subscription Paused</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your ${planName} subscription has been successfully paused.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Your expiry date is now frozen and will not advance while your subscription is paused. You can resume your subscription at any time from your account.</p>
      <p><a href="https://flyvpn.com/account/subscription" style="background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Manage Subscription</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Your ${planName} Subscription Has Been Paused`, html);
  }

  async sendResumeNotification(email: string, userFirstName: string, planName: string, pauseDurationDays: number, newExpiryDate: Date): Promise<boolean> {
    const expiryStr = newExpiryDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const html = `
      <h2>Subscription Resumed</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your ${planName} subscription has been successfully resumed.</p>
      <p>Your expiry date has been extended by <strong>${pauseDurationDays} days</strong> as compensation for the pause period.</p>
      <p><strong>New Expiry Date:</strong> ${expiryStr}</p>
      <p>Your VPN service is now fully active.</p>
      <p><a href="https://flyvpn.com/account/subscription" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Subscription</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Your ${planName} Subscription Has Been Resumed`, html);
  }

  async sendTrialStartedNotification(email: string, userFirstName: string, planName: string, daysRemaining: number, trialEndDate: Date): Promise<boolean> {
    const endDateStr = trialEndDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const html = `
      <h2>Free Trial Started!</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your free ${daysRemaining}-day trial for <strong>${planName}</strong> has started!</p>
      <p>Trial ends on: <strong>${endDateStr}</strong></p>
      <p>Enjoy unlimited VPN access. After the trial ends, your subscription will automatically convert to a paid plan.</p>
      <p><a href="https://flyvpn.com/account/subscription" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Your Trial</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Your Free Trial for ${planName} Has Started!`, html);
  }

  async sendTrialConvertedNotification(email: string, userFirstName: string, planName: string, planPrice: number, expiryDate: Date): Promise<boolean> {
    const expiryStr = expiryDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const html = `
      <h2>Trial Ended - Subscription Active</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your free trial for <strong>${planName}</strong> has ended.</p>
      <p>Your subscription is now active and will auto-renew.</p>
      <p><strong>Plan:</strong> ${planName}<br/>
      <strong>Price:</strong> $${planPrice.toFixed(2)}/month<br/>
      <strong>Expires:</strong> ${expiryStr}</p>
      <p>View your receipt and manage subscription:</p>
      <p><a href="https://flyvpn.com/account/subscription" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Receipt</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Your Free Trial Has Ended - Subscription Active`, html);
  }

  async sendTrialExpiredNotification(email: string, userFirstName: string, planName: string): Promise<boolean> {
    const html = `
      <h2>Free Trial Expired</h2>
      <p>Hi ${userFirstName},</p>
      <p>Your free trial for <strong>${planName}</strong> has expired.</p>
      <p>To continue using VPN, please subscribe to one of our plans.</p>
      <p><a href="https://flyvpn.com/upgrade" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Subscribe Now</a></p>
      <p>Best regards,<br/>FlyVPN Team</p>
    `;
    return this.sendEmail(email, `Your Free Trial for ${planName} Has Expired`, html);
  }
}
