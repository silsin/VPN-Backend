import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DialogJobData, DIALOG_QUEUE } from '../scheduler.service';
import { DialogsService } from '../../dialogs/dialogs.service';

@Processor(DIALOG_QUEUE)
export class DialogProcessor extends WorkerHost {
  private readonly logger = new Logger(DialogProcessor.name);

  constructor(private readonly dialogsService: DialogsService) {
    super();
  }

  async process(job: Job<DialogJobData, any, string>): Promise<void> {
    if (job.name === 'send-dialog') {
      await this.handleSendDialog(job);
    }
  }

  private async handleSendDialog(job: Job<DialogJobData>): Promise<void> {
    const { dialogId } = job.data;

    this.logger.log(`Processing scheduled dialog: ${dialogId}`);

    try {
      await this.dialogsService.sendDialog(dialogId);
      this.logger.log(`Successfully sent scheduled dialog: ${dialogId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send scheduled dialog ${dialogId}: ${error.message}`,
      );
      throw error; // This will trigger retry logic
    }
  }
}
