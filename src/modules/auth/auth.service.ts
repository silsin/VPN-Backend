import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.updateLastLogin(user.id);

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    const { password: _, ...userWithoutPassword } = user;

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: userWithoutPassword,
    };
  }

  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  validateDeviceId(deviceId: string): boolean {
    // Validate device ID format
    // Must be at least 16 characters and contain only alphanumeric characters and hyphens
    const deviceIdRegex = /^[a-zA-Z0-9-]{16,}$/;
    return deviceIdRegex.test(deviceId);
  }

  async deviceLogin(deviceLoginDto: {
    deviceId: string;
    deviceName?: string;
    platform?: string;
    pushId?: string;
  }) {
    // Validate device ID format
    if (!this.validateDeviceId(deviceLoginDto.deviceId)) {
      throw new UnauthorizedException(
        'Invalid device ID format. Device ID must be at least 16 characters and contain only letters, numbers, and hyphens.',
      );
    }

    // Check if user exists with this device ID
    let user = await this.usersService.findByDeviceId(deviceLoginDto.deviceId);

    // If user doesn't exist, create a new one (auto-registration)
    if (!user) {
      user = await this.usersService.createDeviceUser({
        deviceId: deviceLoginDto.deviceId,
        deviceName: deviceLoginDto.deviceName,
        platform: deviceLoginDto.platform,
        pushId: deviceLoginDto.pushId,
      });
    } else {
      // Update device info if provided
      if (deviceLoginDto.deviceName || deviceLoginDto.platform || deviceLoginDto.pushId) {
        await this.usersService.updateDeviceInfo(user.id, {
          deviceName: deviceLoginDto.deviceName,
          platform: deviceLoginDto.platform,
          pushId: deviceLoginDto.pushId,
        });
      }
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    // Generate JWT token
    const payload = { 
      deviceId: user.deviceId, 
      sub: user.id, 
      role: user.role 
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        deviceId: user.deviceId,
        deviceName: user.deviceName,
        platform: user.platform,
        username: user.username,
        role: user.role,
      },
    };
  }

}

