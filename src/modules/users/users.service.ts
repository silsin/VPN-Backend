import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserStatus } from './entities/user.entity';
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

}

