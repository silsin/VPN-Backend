import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DialogJobData, DIALOG_QUEUE } from '../scheduler.service';
import { DialogsService } from '../../dialogs/dialogs.service';

@Processor(DIALOG_QUEUE)
export class DialogProcessor {
  private readonly logger = new Logger(DialogProcessor.name);

  constructor(private readonly dialogsService: DialogsService) {}

  @Process('send-dialog')
  async handleSendDialog(job: Job<DialogJobData>): Promise<void> {
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
