import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Dialog } from '../dialogs/entities/dialog.entity';

export const DIALOG_QUEUE = 'dialogs';

export interface DialogJobData {
  dialogId: string;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(DIALOG_QUEUE)
    private readonly dialogQueue: Queue<DialogJobData>,
  ) {}

  /**
   * Schedule a dialog to be sent at a specific time
   */
  async scheduleDialog(dialog: Dialog): Promise<void> {
    if (!dialog.scheduleTime) {
      throw new Error('Dialog must have a schedule time');
    }

    const delay = dialog.scheduleTime.getTime() - Date.now();

    if (delay < 0) {
      throw new Error('Schedule time must be in the future');
    }

    try {
      await this.dialogQueue.add(
        'send-dialog',
        { dialogId: dialog.id },
        {
          delay,
          jobId: `dialog-${dialog.id}`,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      this.logger.log(
        `Scheduled dialog ${dialog.id} to be sent at ${dialog.scheduleTime}`,
      );
    } catch (error) {
      this.logger.error(`Failed to schedule dialog: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel a scheduled dialog
   */
  async cancelScheduledDialog(dialogId: string): Promise<boolean> {
    try {
      const job = await this.dialogQueue.getJob(`dialog-${dialogId}`);

      if (!job) {
        this.logger.warn(`Job not found for dialog ${dialogId}`);
        return false;
      }

      await job.remove();
      this.logger.log(`Cancelled scheduled dialog ${dialogId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel scheduled dialog: ${error.message}`);
      return false;
    }
  }

  /**
   * Get job status for a dialog
   */
  async getJobStatus(dialogId: string): Promise<{
    exists: boolean;
    status?: string;
    scheduledFor?: Date;
  }> {
    try {
      const job = await this.dialogQueue.getJob(`dialog-${dialogId}`);

      if (!job) {
        return { exists: false };
      }

      const state = await job.getState();
      const delay = job.opts.delay || 0;
      const scheduledFor = new Date(job.timestamp + delay);

      return {
        exists: true,
        status: state,
        scheduledFor,
      };
    } catch (error) {
      this.logger.error(`Failed to get job status: ${error.message}`);
      return { exists: false };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.dialogQueue.getWaitingCount(),
      this.dialogQueue.getActiveCount(),
      this.dialogQueue.getCompletedCount(),
      this.dialogQueue.getFailedCount(),
      this.dialogQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
