import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenVpnServer, OpenVpnAuthType } from '../entities/openvpn-server.entity';
import { SubscriptionsService } from '../../subscriptions/services/subscriptions.service';

export interface OpenVpnResponse {
  config: string;
  username: string;
  password: string;
  expiry: number;
}

export interface OpenVpnServerDto {
  name: string;
  serverIp: string;
  port?: number;
  protocol?: 'udp' | 'tcp';
  caBundle?: string;
  clientCert?: string;
  clientKey?: string;
  tlsCrypt?: string;
  authType?: OpenVpnAuthType;
  sharedUsername: string;
  sharedPassword: string;
  country?: string;
  city?: string;
  speed?: number;
}

@Injectable()
export class OpenVpnService {
  constructor(
    @InjectRepository(OpenVpnServer)
    private openVpnServersRepository: Repository<OpenVpnServer>,
    private subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Generate OpenVPN config for user - requires active subscription
   */
  async generateOpenVpnConfig(serverId: string, userId: string): Promise<OpenVpnResponse> {
    // 1. Verify user has active subscription
    const isActive = await this.subscriptionsService.isSubscriptionActive(userId);
    if (!isActive) {
      throw new BadRequestException('Active subscription required for OpenVPN access');
    }

    // 2. Find the server
    const server = await this.openVpnServersRepository.findOne({
      where: { id: serverId, isActive: true },
    });

    if (!server) {
      throw new NotFoundException(`OpenVPN server ${serverId} not found or inactive`);
    }

    // 3. Build .ovpn config string
    const config = this.buildOpenVpnConfig(
      server.name,
      server.serverIp,
      server.port,
      server.protocol,
      server.authType,
      server.caBundle,
      server.clientCert,
      server.clientKey,
      server.tlsCrypt,
      server.sharedUsername,
      server.sharedPassword,
    );

    // 4. Return config + credentials (Option A: shared username/password)
    return {
      config,
      username: server.sharedUsername,
      password: server.sharedPassword,
      expiry: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Get all active OpenVPN servers (for client list)
   */
  async getAllServers(): Promise<OpenVpnServer[]> {
    return this.openVpnServersRepository.find({
      where: { isActive: true },
      order: { country: 'ASC', city: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Get server by ID
   */
  async getServerById(id: string): Promise<OpenVpnServer> {
    const server = await this.openVpnServersRepository.findOne({ where: { id } });
    if (!server) {
      throw new NotFoundException(`OpenVPN server ${id} not found`);
    }
    return server;
  }

  /**
   * Create new OpenVPN server (admin only)
   */
  async createServer(serverData: OpenVpnServerDto): Promise<OpenVpnServer> {
    // Check if server IP + port already exists
    const existing = await this.openVpnServersRepository.findOne({
      where: { serverIp: serverData.serverIp, port: serverData.port || 1194 },
    });

    if (existing) {
      throw new BadRequestException(
        `Server with IP ${serverData.serverIp}:${serverData.port || 1194} already exists`,
      );
    }

    const server = this.openVpnServersRepository.create({
      ...serverData,
      port: serverData.port || 1194,
      protocol: serverData.protocol || 'udp',
      authType: serverData.authType || OpenVpnAuthType.USER_PASS,
      speed: serverData.speed || 0,
    });

    return this.openVpnServersRepository.save(server);
  }

  /**
   * Update OpenVPN server (admin only)
   */
  async updateServer(id: string, serverData: Partial<OpenVpnServerDto>): Promise<OpenVpnServer> {
    const server = await this.getServerById(id);

    // If updating IP/port, check for conflicts
    if (serverData.serverIp || serverData.port) {
      const conflicting = await this.openVpnServersRepository.findOne({
        where: {
          serverIp: serverData.serverIp || server.serverIp,
          port: serverData.port || server.port,
        },
      });

      if (conflicting && conflicting.id !== id) {
        throw new BadRequestException('Server IP/port combination already exists');
      }
    }

    Object.assign(server, serverData);
    return this.openVpnServersRepository.save(server);
  }

  /**
   * Deactivate server
   */
  async deactivateServer(id: string): Promise<void> {
    const server = await this.getServerById(id);
    server.isActive = false;
    await this.openVpnServersRepository.save(server);
  }

  /**
   * Activate server
   */
  async activateServer(id: string): Promise<void> {
    const server = await this.getServerById(id);
    server.isActive = true;
    await this.openVpnServersRepository.save(server);
  }

  /**
   * Delete server
   */
  async deleteServer(id: string): Promise<void> {
    const server = await this.getServerById(id);
    await this.openVpnServersRepository.remove(server);
  }

  /**
   * Get servers by country
   */
  async getServersByCountry(country: string): Promise<OpenVpnServer[]> {
    return this.openVpnServersRepository.find({
      where: { country, isActive: true },
      order: { city: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Build OpenVPN .ovpn config string
   */
  private buildOpenVpnConfig(
    serverName: string,
    serverIp: string,
    port: number,
    protocol: 'udp' | 'tcp',
    authType: string,
    caBundle?: string,
    clientCert?: string,
    clientKey?: string,
    tlsCrypt?: string,
    username?: string,
    password?: string,
  ): string {
    let config = `client
dev tun
proto ${protocol}
remote ${serverIp} ${port}
resolv-retry infinite
nobind
persist-key
persist-tun
`;

    // Add auth method
    if (authType === 'user-pass') {
      config += `auth-user-pass
`;
      if (tlsCrypt) {
        config += `<tls-crypt>
${tlsCrypt}
</tls-crypt>
`;
      }
    } else {
      // Certificate-based auth
      if (caBundle) {
        config += `<ca>
${caBundle}
</ca>
`;
      }
      if (clientCert) {
        config += `<cert>
${clientCert}
</cert>
`;
      }
      if (clientKey) {
        config += `<key>
${clientKey}
</key>
`;
      }
    }

    config += `cipher AES-256-CBC
auth SHA256
verb 3
mute-replay-warnings
`;

    return config;
  }

  /**
   * Get server statistics
   */
  async getStats() {
    const total = await this.openVpnServersRepository.count();
    const active = await this.openVpnServersRepository.count({ where: { isActive: true } });
    const byCountry = await this.openVpnServersRepository
      .createQueryBuilder('server')
      .select('server.country', 'country')
      .addSelect('COUNT(*)', 'count')
      .where('server.isActive = :isActive', { isActive: true })
      .groupBy('server.country')
      .getRawMany();

    return {
      total,
      active,
      inactive: total - active,
      byCountry: byCountry.map((c) => ({ country: c.country || 'Unknown', count: parseInt(c.count) })),
    };
  }
}
