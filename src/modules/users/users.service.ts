import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'email', 'username', 'firstName', 'lastName', 'role', 'status', 'createdAt'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },

    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      lastLoginAt: new Date(),
    });
  }

  async incrementConnections(id: string): Promise<void> {
    await this.usersRepository.increment({ id }, 'totalConnections', 1);
  }

  async updateDataTransferred(id: string, bytes: number): Promise<void> {
    await this.usersRepository.increment({ id }, 'totalDataTransferred', bytes);
  }

  async updateLastConnection(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      lastConnectionAt: new Date(),
    });
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findOne(id);
    user.status = status;
    return this.usersRepository.save(user);
  }

  async findByDeviceId(deviceId: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { deviceId },
    });
  }

  async createDeviceUser(deviceData: {
    deviceId: string;
    deviceName?: string;
    platform?: string;
    pushId?: string;
  }): Promise<User> {
    const existingUser = await this.usersRepository.findOne({
      where: { deviceId: deviceData.deviceId },
    });

    if (existingUser) {
      throw new ConflictException('User with this device ID already exists');
    }

    const user = this.usersRepository.create({
      deviceId: deviceData.deviceId,
      deviceName: deviceData.deviceName,
      platform: deviceData.platform,
      pushId: deviceData.pushId,
      username: `mobile_${deviceData.deviceId.substring(0, 8)}`,
    });

    return this.usersRepository.save(user);
  }

  async updateDeviceInfo(
    userId: string,
    deviceData: {
      deviceName?: string;
      platform?: string;
      pushId?: string;
    },
  ): Promise<User> {
    const user = await this.findOne(userId);
    
    if (deviceData.deviceName) {
      user.deviceName = deviceData.deviceName;
    }
    if (deviceData.platform) {
      user.platform = deviceData.platform;
    }
    if (deviceData.pushId) {
      user.pushId = deviceData.pushId;
    }

    return this.usersRepository.save(user);
  }

  /**
   * Global users summary for admin reports (Telegram / dashboard).
   */
  async getSummaryReport(): Promise<{
    total: number;
    withEmail: number;
    deviceOnly: number;
    last24h: number;
    last7d: number;
    last30d: number;
    loggedInLast24h: number;
    loggedInLast7d: number;
    byStatus: Record<string, number>;
    byRole: Record<string, number>;
    byPlatform: Record<string, number>;
  }> {
    const now = new Date();
    const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      withEmail,
      last24h,
      last7d,
      last30d,
      loggedInLast24h,
      loggedInLast7d,
      byStatusRaw,
      byRoleRaw,
      byPlatformRaw,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository
        .createQueryBuilder('u')
        .where('u.email IS NOT NULL')
        .getCount(),
      this.usersRepository
        .createQueryBuilder('u')
        .where('u.createdAt >= :d', { d: d1 })
        .getCount(),
      this.usersRepository
        .createQueryBuilder('u')
        .where('u.createdAt >= :d', { d: d7 })
        .getCount(),
      this.usersRepository
        .createQueryBuilder('u')
        .where('u.createdAt >= :d', { d: d30 })
        .getCount(),
      this.usersRepository
        .createQueryBuilder('u')
        .where('u.lastLoginAt >= :d', { d: d1 })
        .getCount(),
      this.usersRepository
        .createQueryBuilder('u')
        .where('u.lastLoginAt >= :d', { d: d7 })
        .getCount(),
      this.usersRepository
        .createQueryBuilder('u')
        .select('u.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('u.status')
        .getRawMany<{ status: string; count: string }>(),
      this.usersRepository
        .createQueryBuilder('u')
        .select('u.role', 'role')
        .addSelect('COUNT(*)', 'count')
        .groupBy('u.role')
        .getRawMany<{ role: string; count: string }>(),
      this.usersRepository
        .createQueryBuilder('u')
        .select("COALESCE(NULLIF(TRIM(u.platform), ''), 'unknown')", 'platform')
        .addSelect('COUNT(*)', 'count')
        .groupBy("COALESCE(NULLIF(TRIM(u.platform), ''), 'unknown')")
        .getRawMany<{ platform: string; count: string }>(),
    ]);

    const byStatus: Record<string, number> = {};
    for (const s of Object.values(UserStatus)) byStatus[s] = 0;
    for (const row of byStatusRaw) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const byRole: Record<string, number> = {};
    for (const r of Object.values(UserRole)) byRole[r] = 0;
    for (const row of byRoleRaw) {
      byRole[row.role] = parseInt(row.count, 10);
    }

    const byPlatform: Record<string, number> = {};
    for (const row of byPlatformRaw) {
      byPlatform[row.platform] = parseInt(row.count, 10);
    }

    return {
      total,
      withEmail,
      deviceOnly: total - withEmail,
      last24h,
      last7d,
      last30d,
      loggedInLast24h,
      loggedInLast7d,
      byStatus,
      byRole,
      byPlatform,
    };
  }
}

