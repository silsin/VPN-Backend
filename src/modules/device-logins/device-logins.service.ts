import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceLogin } from './entities/device-login.entity';

export interface CreateDeviceLoginDto {
  userId: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  pushId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class DeviceLoginsService {
  constructor(
    @InjectRepository(DeviceLogin)
    private deviceLoginsRepository: Repository<DeviceLogin>,
  ) {}

  async create(createDeviceLoginDto: CreateDeviceLoginDto): Promise<DeviceLogin> {
    const deviceLogin = this.deviceLoginsRepository.create(createDeviceLoginDto);
    return await this.deviceLoginsRepository.save(deviceLogin);
  }

  async findAll(userId?: string): Promise<DeviceLogin[]> {
    const query = this.deviceLoginsRepository
      .createQueryBuilder('deviceLogin')
      .leftJoinAndSelect('deviceLogin.user', 'user')
      .orderBy('deviceLogin.loginAt', 'DESC');

    if (userId) {
      query.where('deviceLogin.userId = :userId', { userId });
    }

    return await query.getMany();
  }

  async findOne(id: string): Promise<DeviceLogin> {
    return await this.deviceLoginsRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByDeviceId(deviceId: string): Promise<DeviceLogin[]> {
    return await this.deviceLoginsRepository.find({
      where: { deviceId },
      relations: ['user'],
      order: { loginAt: 'DESC' },
    });
  }

  async findActiveByUserId(userId: string): Promise<DeviceLogin[]> {
    return await this.deviceLoginsRepository.find({
      where: { userId, isActive: true },
      order: { loginAt: 'DESC' },
    });
  }

  async findActiveByDeviceId(deviceId: string): Promise<DeviceLogin | null> {
    return await this.deviceLoginsRepository.findOne({
      where: { deviceId, isActive: true },
    });
  }

  async update(id: string, updateData: Partial<DeviceLogin>): Promise<void> {
    await this.deviceLoginsRepository.update(id, updateData);
  }

  async markAsLoggedOut(id: string): Promise<void> {
    await this.deviceLoginsRepository.update(id, {
      isActive: false,
      logoutAt: new Date(),
    });
  }

  async markAllUserDevicesAsLoggedOut(userId: string): Promise<void> {
    await this.deviceLoginsRepository.update(
      { userId, isActive: true },
      {
        isActive: false,
        logoutAt: new Date(),
      },
    );
  }

  async getLoginStats(userId: string): Promise<{
    totalLogins: number;
    activeDevices: number;
    lastLogin: Date;
  }> {
    const [totalLogins, activeDevices, lastLoginRecord] = await Promise.all([
      this.deviceLoginsRepository.count({ where: { userId } }),
      this.deviceLoginsRepository.count({ where: { userId, isActive: true } }),
      this.deviceLoginsRepository.findOne({
        where: { userId },
        order: { loginAt: 'DESC' },
      }),
    ]);

    return {
      totalLogins,
      activeDevices,
      lastLogin: lastLoginRecord?.loginAt || null,
    };
  }

  /**
   * Global login-session summary for admin reports (Telegram / dashboard).
   */
  async getSummaryReport(): Promise<{
    totalLogins: number;
    activeSessions: number;
    uniqueDevices: number;
    uniqueUsers: number;
    last24h: number;
    last7d: number;
    last30d: number;
    byPlatform: Record<string, number>;
    recentLogins: Array<{
      deviceId: string;
      deviceName: string | null;
      platform: string | null;
      loginAt: Date;
      isActive: boolean;
    }>;
  }> {
    const now = new Date();
    const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLogins,
      activeSessions,
      uniqueDevicesRow,
      uniqueUsersRow,
      last24h,
      last7d,
      last30d,
      byPlatformRaw,
      recentLogins,
    ] = await Promise.all([
      this.deviceLoginsRepository.count(),
      this.deviceLoginsRepository.count({ where: { isActive: true } }),
      this.deviceLoginsRepository
        .createQueryBuilder('l')
        .select('COUNT(DISTINCT l.deviceId)', 'count')
        .getRawOne<{ count: string }>(),
      this.deviceLoginsRepository
        .createQueryBuilder('l')
        .select('COUNT(DISTINCT l.userId)', 'count')
        .getRawOne<{ count: string }>(),
      this.deviceLoginsRepository
        .createQueryBuilder('l')
        .where('l.loginAt >= :d', { d: d1 })
        .getCount(),
      this.deviceLoginsRepository
        .createQueryBuilder('l')
        .where('l.loginAt >= :d', { d: d7 })
        .getCount(),
      this.deviceLoginsRepository
        .createQueryBuilder('l')
        .where('l.loginAt >= :d', { d: d30 })
        .getCount(),
      this.deviceLoginsRepository
        .createQueryBuilder('l')
        .select("COALESCE(NULLIF(TRIM(l.platform), ''), 'unknown')", 'platform')
        .addSelect('COUNT(*)', 'count')
        .groupBy("COALESCE(NULLIF(TRIM(l.platform), ''), 'unknown')")
        .getRawMany<{ platform: string; count: string }>(),
      this.deviceLoginsRepository.find({
        order: { loginAt: 'DESC' },
        take: 8,
        select: ['deviceId', 'deviceName', 'platform', 'loginAt', 'isActive'],
      }),
    ]);

    const byPlatform: Record<string, number> = {};
    for (const row of byPlatformRaw) {
      byPlatform[row.platform] = parseInt(row.count, 10);
    }

    return {
      totalLogins,
      activeSessions,
      uniqueDevices: parseInt(uniqueDevicesRow?.count ?? '0', 10),
      uniqueUsers: parseInt(uniqueUsersRow?.count ?? '0', 10),
      last24h,
      last7d,
      last30d,
      byPlatform,
      recentLogins: recentLogins.map((l) => ({
        deviceId: l.deviceId,
        deviceName: l.deviceName ?? null,
        platform: l.platform ?? null,
        loginAt: l.loginAt,
        isActive: l.isActive,
      })),
    };
  }
}
