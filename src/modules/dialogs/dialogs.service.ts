import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Dialog, DialogStatus } from './entities/dialog.entity';
import { DialogDelivery } from './entities/dialog-delivery.entity';
import { CreateDialogDto } from './dto/create-dialog.dto';
import { UpdateDialogDto } from './dto/update-dialog.dto';
import { FilterDialogDto } from './dto/filter-dialog.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../notifications/scheduler.service';

@Injectable()
export class DialogsService {
  private readonly logger = new Logger(DialogsService.name);

  constructor(
    @InjectRepository(Dialog)
    private readonly dialogRepository: Repository<Dialog>,
    @InjectRepository(DialogDelivery)
    private readonly dialogDeliveryRepository: Repository<DialogDelivery>,
    private readonly notificationsService: NotificationsService,
    private readonly schedulerService: SchedulerService,
  ) {}

  /**
   * Create a new dialog
   */
  async create(
    createDialogDto: CreateDialogDto,
    userId?: string,
  ): Promise<Dialog> {
    const dialog = this.dialogRepository.create({
      ...createDialogDto,
      createdBy: userId,
    });

    // Determine initial status
    if (createDialogDto.scheduleTime) {
      const scheduleTime = new Date(createDialogDto.scheduleTime);
      if (scheduleTime <= new Date()) {
        throw new BadRequestException('Schedule time must be in the future');
      }
      dialog.status = DialogStatus.SCHEDULED;
      dialog.scheduleTime = scheduleTime;
    } else {
      dialog.status = DialogStatus.DRAFT;
    }

    const savedDialog = await this.dialogRepository.save(dialog);

    // Schedule if needed
    if (dialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.scheduleDialog(savedDialog);
    }

    this.logger.log(`Created dialog ${savedDialog.id} with status ${savedDialog.status}`);
    return savedDialog;
  }

  /**
   * Find all dialogs with filtering and pagination
   */
  async findAll(filterDto: FilterDialogDto): Promise<{
    data: Dialog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, sortBy, sortOrder, search, type, status, target } =
      filterDto;

    const queryBuilder = this.dialogRepository.createQueryBuilder('dialog');

    // Apply filters
    if (type) {
      queryBuilder.andWhere('dialog.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('dialog.status = :status', { status });
    }

    if (target) {
      queryBuilder.andWhere('dialog.target = :target', { target });
    }

    if (search) {
      queryBuilder.andWhere(
        '(dialog.title ILIKE :search OR dialog.message ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    queryBuilder.orderBy(`dialog.${sortBy}`, sortOrder);

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return { data, total, page, limit, totalPages };
  }

  /**
   * Get dialog statistics
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const total = await this.dialogRepository.count();

    const byStatus = await this.dialogRepository
      .createQueryBuilder('dialog')
      .select('dialog.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dialog.status')
      .getRawMany();

    const byType = await this.dialogRepository
      .createQueryBuilder('dialog')
      .select('dialog.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dialog.type')
      .getRawMany();

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      byType: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {}),
    };
  }

  /**
   * Find one dialog by ID
   */
  async findOne(id: string): Promise<Dialog> {
    const dialog = await this.dialogRepository.findOne({ where: { id } });

    if (!dialog) {
      throw new NotFoundException(`Dialog with ID ${id} not found`);
    }

    return dialog;
  }

  /**
   * Update a dialog
   */
  async update(id: string, updateDialogDto: UpdateDialogDto): Promise<Dialog> {
    const dialog = await this.findOne(id);

    // Prevent updating sent or cancelled dialogs
    if (dialog.status === DialogStatus.SENT) {
      throw new BadRequestException('Cannot update a sent dialog');
    }

    if (dialog.status === DialogStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled dialog');
    }

    // Handle schedule time changes
    if (updateDialogDto.scheduleTime) {
      const newScheduleTime = new Date(updateDialogDto.scheduleTime);
      if (newScheduleTime <= new Date()) {
        throw new BadRequestException('Schedule time must be in the future');
      }

      // Cancel old scheduled job if exists
      if (dialog.status === DialogStatus.SCHEDULED) {
        await this.schedulerService.cancelScheduledDialog(id);
      }

      dialog.scheduleTime = newScheduleTime;
      dialog.status = DialogStatus.SCHEDULED;
    }

    // Update fields
    Object.assign(dialog, updateDialogDto);

    const updatedDialog = await this.dialogRepository.save(dialog);

    // Reschedule if needed
    if (updatedDialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.scheduleDialog(updatedDialog);
    }

    this.logger.log(`Updated dialog ${id}`);
    return updatedDialog;
  }

  /**
   * Delete a dialog
   */
  async remove(id: string): Promise<void> {
    const dialog = await this.findOne(id);

    // Prevent deleting sent dialogs
    if (dialog.status === DialogStatus.SENT) {
      throw new BadRequestException('Cannot delete a sent dialog');
    }

    // Cancel scheduled job if exists
    if (dialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.cancelScheduledDialog(id);
    }

    await this.dialogRepository.remove(dialog);
    this.logger.log(`Deleted dialog ${id}`);
  }

  /**
   * Send a dialog immediately
   */
  async sendDialog(id: string): Promise<Dialog> {
    const dialog = await this.findOne(id);

    if (dialog.status === DialogStatus.SENT) {
      throw new BadRequestException('Dialog already sent');
    }

    if (dialog.status === DialogStatus.CANCELLED) {
      throw new BadRequestException('Cannot send a cancelled dialog');
    }

    // Cancel scheduled job if exists
    if (dialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.cancelScheduledDialog(id);
    }

    // Send push notifications if applicable
    if (dialog.type === 'push' || dialog.type === 'both') {
      await this.notificationsService.sendToDevices(dialog);
    }

    // Update dialog status
    dialog.status = DialogStatus.SENT;
    dialog.sentTime = new Date();

    const sentDialog = await this.dialogRepository.save(dialog);
    this.logger.log(`Sent dialog ${id}`);

    return sentDialog;
  }

  /**
   * Cancel a scheduled dialog
   */
  async cancelDialog(id: string): Promise<Dialog> {
    const dialog = await this.findOne(id);

    if (dialog.status !== DialogStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled dialogs can be cancelled');
    }

    await this.schedulerService.cancelScheduledDialog(id);

    dialog.status = DialogStatus.CANCELLED;
    const cancelledDialog = await this.dialogRepository.save(dialog);

    this.logger.log(`Cancelled dialog ${id}`);
    return cancelledDialog;
  }

  /**
   * Get analytics for a dialog
   */
  async getAnalytics(id: string): Promise<{
    dialogId: string;
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalClicked: number;
    totalDismissed: number;
    clickThroughRate: number;
    byPlatform: {
      android: { sent: number; clicked: number; dismissed: number };
      ios: { sent: number; clicked: number; dismissed: number };
    };
  }> {
    await this.findOne(id); // Ensure dialog exists

    const deliveries = await this.dialogDeliveryRepository.find({
      where: { dialogId: id },
    });

    const totalSent = deliveries.length;
    const totalDelivered = deliveries.filter(
      (d) => d.deliveryStatus === 'delivered' || d.deliveryStatus === 'sent',
    ).length;
    const totalFailed = deliveries.filter(
      (d) => d.deliveryStatus === 'failed',
    ).length;
    const totalClicked = deliveries.filter((d) => d.clicked).length;
    const totalDismissed = deliveries.filter((d) => d.dismissed).length;

    const clickThroughRate =
      totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;

    const androidDeliveries = deliveries.filter((d) => d.platform === 'android');
    const iosDeliveries = deliveries.filter((d) => d.platform === 'ios');

    return {
      dialogId: id,
      totalSent,
      totalDelivered,
      totalFailed,
      totalClicked,
      totalDismissed,
      clickThroughRate: parseFloat(clickThroughRate.toFixed(2)),
      byPlatform: {
        android: {
          sent: androidDeliveries.length,
          clicked: androidDeliveries.filter((d) => d.clicked).length,
          dismissed: androidDeliveries.filter((d) => d.dismissed).length,
        },
        ios: {
          sent: iosDeliveries.length,
          clicked: iosDeliveries.filter((d) => d.clicked).length,
          dismissed: iosDeliveries.filter((d) => d.dismissed).length,
        },
      },
    };
  }

  /**
   * Get active in-app dialogs for mobile devices
   */
  async getActiveDialogsForMobile(platform?: string): Promise<Dialog[]> {
    const queryBuilder = this.dialogRepository
      .createQueryBuilder('dialog')
      .where('dialog.status = :status', { status: DialogStatus.SENT })
      .andWhere("(dialog.type = 'in-app' OR dialog.type = 'both')");

    if (platform) {
      queryBuilder.andWhere(
        "(dialog.target = :platform OR dialog.target = 'all')",
        { platform },
      );
    }

    return queryBuilder.orderBy('dialog.sentTime', 'DESC').getMany();
  }
}
