import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Dialog, DialogStatus, DialogPlacement } from './entities/dialog.entity';
import { DialogDelivery } from './entities/dialog-delivery.entity';
import { CreateDialogDto } from './dto/create-dialog.dto';
import { UpdateDialogDto } from './dto/update-dialog.dto';
import { FilterDialogDto } from './dto/filter-dialog.dto';
import { DialogButtonDto } from './dto/dialog-button.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../notifications/scheduler.service';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class DialogsService {
  private readonly logger = new Logger(DialogsService.name);
  private queryCache: Map<string, CacheEntry<Dialog[]>> = new Map();

  constructor(
    @InjectRepository(Dialog)
    private readonly dialogRepository: Repository<Dialog>,
    @InjectRepository(DialogDelivery)
    private readonly dialogDeliveryRepository: Repository<DialogDelivery>,
    private readonly notificationsService: NotificationsService,
    private readonly schedulerService: SchedulerService,
  ) {
    // Clear expired cache entries every minute
    setInterval(() => this.cleanExpiredCache(), 60000);
  }

  private cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.queryCache.entries()) {
      if (entry.expiresAt < now) {
        this.queryCache.delete(key);
      }
    }
  }

  private invalidateDialogCache() {
    // Clear all dialog-related cache entries when dialogs change
    this.queryCache.clear();
    this.logger.debug('Dialog cache invalidated');
  }

  /**
   * Create a new dialog
   */
  async create(
    createDialogDto: CreateDialogDto,
    userId?: string,
  ): Promise<Dialog> {
    const normalizedButtons = this.normalizeButtons(createDialogDto.buttons);
    const dialog = this.dialogRepository.create({
      ...createDialogDto,
      repeatable: createDialogDto.repeatable ?? false,
      placement: createDialogDto.placement ?? DialogPlacement.GENERAL,
      ...(normalizedButtons !== undefined ? { buttons: normalizedButtons } : {}),
      createdBy: userId,
    });
    this.logger.log(`Creating dialog with payload: ${JSON.stringify(createDialogDto)}`);


    // Determine initial status
    if (createDialogDto.expireTime) {
      const expireTime = new Date(createDialogDto.expireTime);
      if (Number.isNaN(expireTime.getTime())) {
        throw new BadRequestException(
          'Expire time must be a valid ISO date string',
        );
      }
      dialog.expireTime = expireTime;
    }

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

    // Invalidate cache when dialog is created
    this.invalidateDialogCache();

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
    const { page, limit, sortBy, sortOrder, search, type, status, target, placement } =
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

    if (placement) {
      queryBuilder.andWhere('dialog.placement = :placement', { placement });
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

    if (updateDialogDto.expireTime) {
      const expireTime = new Date(updateDialogDto.expireTime);
      if (Number.isNaN(expireTime.getTime())) {
        throw new BadRequestException('Expire time must be a valid ISO date string');
      }
      dialog.expireTime = expireTime;
    }

    // Update fields
    const { buttons, ...rest } = updateDialogDto;
    Object.assign(dialog, rest);
    if (buttons !== undefined) {
      dialog.buttons = this.normalizeButtons(buttons) ?? null;
    }

    const updatedDialog = await this.dialogRepository.save(dialog);

    // Reschedule if needed
    if (updatedDialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.scheduleDialog(updatedDialog);
    }

    // Invalidate cache when dialog is updated
    this.invalidateDialogCache();

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
   * Enable a dialog so it appears on mobile (status → sent).
   * Draft/scheduled: send immediately. Cancelled: reactivate as sent.
   */
  async enableDialog(id: string): Promise<Dialog> {
    const dialog = await this.findOne(id);

    if (dialog.status === DialogStatus.SENT) {
      return dialog;
    }

    if (
      dialog.status === DialogStatus.DRAFT ||
      dialog.status === DialogStatus.SCHEDULED
    ) {
      return this.sendDialog(id);
    }

    // Cancelled → reactivate for in-app visibility
    dialog.status = DialogStatus.SENT;
    dialog.sentTime = dialog.sentTime ?? new Date();
    const enabled = await this.dialogRepository.save(dialog);
    this.logger.log(`Enabled dialog ${id}`);
    return enabled;
  }

  /**
   * Disable a dialog so mobile clients stop showing it (status → cancelled).
   */
  async disableDialog(id: string): Promise<Dialog> {
    const dialog = await this.findOne(id);

    if (dialog.status === DialogStatus.CANCELLED) {
      return dialog;
    }

    if (dialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.cancelScheduledDialog(id);
    }

    dialog.status = DialogStatus.CANCELLED;
    const disabled = await this.dialogRepository.save(dialog);
    this.logger.log(`Disabled dialog ${id}`);
    return disabled;
  }

  /**
   * Force-delete a dialog regardless of status (admin / Telegram use).
   */
  async forceRemove(id: string): Promise<void> {
    const dialog = await this.findOne(id);

    if (dialog.status === DialogStatus.SCHEDULED) {
      await this.schedulerService.cancelScheduledDialog(id);
    }

    await this.dialogRepository.remove(dialog);
    this.logger.log(`Force-deleted dialog ${id}`);
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
  async getActiveDialogsForMobile(
    platform?: string,
    placement?: string,
    deviceId?: string,
  ): Promise<Dialog[]> {
    // Build cache key based on parameters
    const cacheKey = `dialogs:${platform || 'all'}:${placement || 'all'}:${deviceId || 'none'}`;
    
    // Check cache first (device-agnostic: 60s, device-specific: 30s)
    const cached = this.queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const queryBuilder = this.dialogRepository
      .createQueryBuilder('dialog')
      .where('dialog.status = :status', { status: DialogStatus.SENT })
      .andWhere("(dialog.type = 'in-app' OR dialog.type = 'both')")
      .andWhere('(dialog.expireTime IS NULL OR dialog.expireTime > NOW())');

    if (platform) {
      queryBuilder.andWhere(
        "(dialog.target = :platform OR dialog.target = 'all')",
        { platform },
      );
    }

    if (placement) {
      queryBuilder.andWhere('dialog.placement = :placement', { placement });
    }

    // Hide one-shot dialogs this device already dismissed/clicked
    if (deviceId) {
      queryBuilder.andWhere(
        `NOT (
          dialog.repeatable = false
          AND EXISTS (
            SELECT 1 FROM dialog_deliveries dd
            WHERE dd.dialog_id = dialog.id
              AND dd.device_id = :deviceId
              AND (dd.dismissed = true OR dd.clicked = true)
          )
        )`,
        { deviceId },
      );
    }

    const result = await queryBuilder
      .orderBy('dialog.priority', 'DESC')
      .addOrderBy('dialog.sentTime', 'DESC')
      .getMany();

    // Cache the result (device-agnostic: 60s, device-specific: 30s)
    const cacheTTL = deviceId ? 30 : 60;
    this.queryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + cacheTTL * 1000,
    });

    return result;
  }

  /**
   * Normalize button payloads so both title/label and isPrimary/style work.
   * Stored shape always includes title, label, style, and isPrimary.
   */
  private normalizeButtons(
    buttons?: DialogButtonDto[] | null,
  ): Dialog['buttons'] | undefined {
    if (buttons === undefined) {
      return undefined;
    }
    if (buttons === null || buttons.length === 0) {
      return null as unknown as Dialog['buttons'];
    }

    return buttons.map((button, index) => {
      const text = (button.title ?? button.label ?? '').trim();
      if (!text) {
        throw new BadRequestException(
          `Button #${index + 1}: title (or label) is required`,
        );
      }

      const isPrimary =
        button.isPrimary === true ||
        (button.isPrimary !== false && button.style === 'primary');

      let style = button.style;
      if (isPrimary) {
        style = 'primary';
      } else if (!style) {
        style = 'secondary';
      }

      if (!button.actionUrl && !button.action) {
        throw new BadRequestException(
          `Button #${index + 1} ("${text}"): provide actionUrl or action`,
        );
      }

      return {
        label: text,
        title: text,
        ...(button.actionUrl ? { actionUrl: button.actionUrl } : {}),
        ...(button.action ? { action: button.action } : {}),
        style,
        isPrimary,
      };
    });
  }
}
