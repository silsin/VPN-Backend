import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connection, ConnectionStatus } from './entities/connection.entity';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { UsersService } from '../users/users.service';
import { VpnServersService } from '../vpn-servers/vpn-servers.service';

@Injectable()
export class ConnectionsService {
  constructor(
    @InjectRepository(Connection)
    private connectionsRepository: Repository<Connection>,
    private usersService: UsersService,
    private vpnServersService: VpnServersService,
  ) {}

  async create(createConnectionDto: CreateConnectionDto): Promise<Connection> {
    const connection = this.connectionsRepository.create(createConnectionDto);
    const savedConnection = await this.connectionsRepository.save(connection);

    // Update server connection count
    await this.vpnServersService.incrementConnections(createConnectionDto.serverId);

    return savedConnection;
  }

  async findAll(): Promise<Connection[]> {
    return this.connectionsRepository.find({
      relations: ['user', 'server'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUser(userId: string): Promise<Connection[]> {
    return this.connectionsRepository.find({
      where: { userId },
      relations: ['server'],
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveConnections(userId?: string): Promise<Connection[]> {
    const where: any = { status: ConnectionStatus.CONNECTED };
    if (userId) {
      where.userId = userId;
    }

    return this.connectionsRepository.find({
      where,
      relations: ['user', 'server'],
    });
  }

  async findOne(id: string): Promise<Connection> {
    const connection = await this.connectionsRepository.findOne({
      where: { id },
      relations: ['user', 'server'],
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    return connection;
  }

  async update(id: string, updateConnectionDto: UpdateConnectionDto): Promise<Connection> {
    const connection = await this.findOne(id);
    Object.assign(connection, updateConnectionDto);
    return this.connectionsRepository.save(connection);
  }

  async connect(userId: string, serverId: string, clientIp: string): Promise<Connection> {
    const connection = this.connectionsRepository.create({
      userId,
      serverId,
      clientIp,
      status: ConnectionStatus.CONNECTING,
    });

    const savedConnection = await this.connectionsRepository.save(connection);

    // Update server connection count
    await this.vpnServersService.incrementConnections(serverId);

    return savedConnection;
  }

  async disconnect(id: string): Promise<Connection> {
    const connection = await this.findOne(id);

    if (connection.status === ConnectionStatus.CONNECTED) {
      const duration = connection.connectedAt
        ? Math.floor((new Date().getTime() - connection.connectedAt.getTime()) / 1000)
        : 0;

      connection.status = ConnectionStatus.DISCONNECTED;
      connection.disconnectedAt = new Date();
      connection.duration = duration;

      // Update user statistics
      await this.usersService.updateLastConnection(connection.userId);
      await this.usersService.updateDataTransferred(
        connection.userId,
        connection.bytesReceived + connection.bytesSent,
      );

      // Update server connection count
      await this.vpnServersService.decrementConnections(connection.serverId);
      await this.vpnServersService.updateDataTransferred(
        connection.serverId,
        connection.bytesReceived + connection.bytesSent,
      );
    }

    return this.connectionsRepository.save(connection);
  }

  async updateConnectionStatus(
    id: string,
    status: ConnectionStatus,
    assignedIp?: string,
  ): Promise<Connection> {
    const connection = await this.findOne(id);
    connection.status = status;

    if (status === ConnectionStatus.CONNECTED) {
      connection.connectedAt = new Date();
      if (assignedIp) {
        connection.assignedIp = assignedIp;
      }
      await this.usersService.incrementConnections(connection.userId);
    } else if (status === ConnectionStatus.FAILED) {
      connection.disconnectedAt = new Date();
    }

    return this.connectionsRepository.save(connection);
  }

  async updateDataTransfer(
    id: string,
    bytesReceived: number,
    bytesSent: number,
  ): Promise<Connection> {
    const connection = await this.findOne(id);
    connection.bytesReceived = bytesReceived;
    connection.bytesSent = bytesSent;
    return this.connectionsRepository.save(connection);
  }

  async remove(id: string): Promise<void> {
    const connection = await this.findOne(id);
    await this.connectionsRepository.remove(connection);
  }
}

