import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VpnServer, ServerStatus } from './entities/vpn-server.entity';
import { CreateVpnServerDto } from './dto/create-vpn-server.dto';
import { UpdateVpnServerDto } from './dto/update-vpn-server.dto';

@Injectable()
export class VpnServersService {
  constructor(
    @InjectRepository(VpnServer)
    private vpnServersRepository: Repository<VpnServer>,
  ) {}

  async create(createVpnServerDto: CreateVpnServerDto): Promise<VpnServer> {
    const server = this.vpnServersRepository.create(createVpnServerDto);
    return this.vpnServersRepository.save(server);
  }

  async findAll(): Promise<VpnServer[]> {
    return this.vpnServersRepository.find({
      where: { isActive: true },
      order: { loadAverage: 'ASC' },
    });
  }

  async findAvailableServers(): Promise<VpnServer[]> {
    return this.vpnServersRepository.find({
      where: {
        isActive: true,
        status: ServerStatus.ONLINE,
      },
      order: { loadAverage: 'ASC', currentConnections: 'ASC' },
    });
  }

  async findOne(id: string): Promise<VpnServer> {
    const server = await this.vpnServersRepository.findOne({
      where: { id },
      relations: ['connections'],
    });

    if (!server) {
      throw new NotFoundException(`VPN Server with ID ${id} not found`);
    }

    return server;
  }

  async findByLocation(location: string): Promise<VpnServer[]> {
    return this.vpnServersRepository.find({
      where: {
        location: location as any,
        isActive: true,
        status: ServerStatus.ONLINE,
      },
      order: { loadAverage: 'ASC' },
    });
  }

  async update(id: string, updateVpnServerDto: UpdateVpnServerDto): Promise<VpnServer> {
    const server = await this.findOne(id);
    Object.assign(server, updateVpnServerDto);
    return this.vpnServersRepository.save(server);
  }

  async remove(id: string): Promise<void> {
    const server = await this.findOne(id);
    await this.vpnServersRepository.remove(server);
  }

  async updateStatus(id: string, status: ServerStatus): Promise<VpnServer> {
    const server = await this.findOne(id);
    server.status = status;
    server.lastHealthCheck = new Date();
    return this.vpnServersRepository.save(server);
  }

  async incrementConnections(id: string): Promise<void> {
    await this.vpnServersRepository.increment({ id }, 'currentConnections', 1);
  }

  async decrementConnections(id: string): Promise<void> {
    await this.vpnServersRepository.decrement({ id }, 'currentConnections', 1);
  }

  async updateLoadAverage(id: string, loadAverage: number): Promise<void> {
    await this.vpnServersRepository.update(id, { loadAverage });
  }

  async updateDataTransferred(id: string, bytes: number): Promise<void> {
    await this.vpnServersRepository.increment({ id }, 'totalDataTransferred', bytes);
  }
}

