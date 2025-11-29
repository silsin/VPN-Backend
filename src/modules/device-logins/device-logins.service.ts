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
}
