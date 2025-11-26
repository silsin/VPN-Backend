import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Connection, ConnectionStatus } from '../connections/entities/connection.entity';
import { VpnServer } from '../vpn-servers/entities/vpn-server.entity';
import { AdImpression } from '../ads/entities/ad-impression.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Connection)
    private connectionsRepository: Repository<Connection>,
    @InjectRepository(VpnServer)
    private vpnServersRepository: Repository<VpnServer>,
    @InjectRepository(AdImpression)
    private adImpressionsRepository: Repository<AdImpression>,
  ) {}

  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalConnections,
      activeConnections,
      totalServers,
      onlineServers,
      totalAdImpressions,
      totalAdClicks,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.count({
        where: { status: 'active' as any },
      }),
      this.connectionsRepository.count(),
      this.connectionsRepository.count({
        where: { status: ConnectionStatus.CONNECTED },
      }),
      this.vpnServersRepository.count(),
      this.vpnServersRepository.count({
        where: { status: 'online' as any },
      }),
      this.adImpressionsRepository.count(),
      this.adImpressionsRepository.count({
        where: { clicked: true },
      }),
    ]);

    // Get total data transferred
    const totalDataResult = await this.connectionsRepository
      .createQueryBuilder('connection')
      .select('SUM(connection.bytesReceived + connection.bytesSent)', 'total')
      .getRawOne();

    const totalDataTransferred = parseInt(totalDataResult?.total || '0', 10);

    // Get ad revenue
    const adRevenueResult = await this.adImpressionsRepository
      .createQueryBuilder('impression')
      .select('SUM(impression.revenue)', 'total')
      .where('impression.clicked = :clicked', { clicked: true })
      .getRawOne();

    const totalAdRevenue = parseFloat(adRevenueResult?.total || '0');

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      connections: {
        total: totalConnections,
        active: activeConnections,
      },
      servers: {
        total: totalServers,
        online: onlineServers,
      },
      ads: {
        impressions: totalAdImpressions,
        clicks: totalAdClicks,
        clickThroughRate:
          totalAdImpressions > 0 ? (totalAdClicks / totalAdImpressions) * 100 : 0,
        revenue: totalAdRevenue,
      },
      dataTransferred: {
        bytes: totalDataTransferred,
        gigabytes: (totalDataTransferred / (1024 * 1024 * 1024)).toFixed(2),
      },
    };
  }

  async getUserStats(userId: string, startDate?: Date, endDate?: Date) {
    const where: any = { userId };

    if (startDate && endDate) {
      where.createdAt = Between(startDate, endDate);
    }

    const connections = await this.connectionsRepository.find({
      where,
      relations: ['server'],
    });

    const totalConnections = connections.length;
    const activeConnections = connections.filter(
      (c) => c.status === ConnectionStatus.CONNECTED,
    ).length;

    const totalDataTransferred = connections.reduce(
      (sum, c) => sum + c.bytesReceived + c.bytesSent,
      0,
    );

    const totalDuration = connections.reduce((sum, c) => sum + (c.duration || 0), 0);

    const serversUsed = new Set(connections.map((c) => c.serverId)).size;

    return {
      totalConnections,
      activeConnections,
      totalDataTransferred: {
        bytes: totalDataTransferred,
        gigabytes: (totalDataTransferred / (1024 * 1024 * 1024)).toFixed(2),
      },
      totalDuration: {
        seconds: totalDuration,
        hours: (totalDuration / 3600).toFixed(2),
      },
      serversUsed,
      connections: connections.slice(0, 10), // Last 10 connections
    };
  }

  async getServerStats(serverId: string, startDate?: Date, endDate?: Date) {
    const where: any = { serverId };

    if (startDate && endDate) {
      where.createdAt = Between(startDate, endDate);
    }

    const connections = await this.connectionsRepository.find({
      where,
      relations: ['user'],
    });

    const totalConnections = connections.length;
    const activeConnections = connections.filter(
      (c) => c.status === ConnectionStatus.CONNECTED,
    ).length;

    const totalDataTransferred = connections.reduce(
      (sum, c) => sum + c.bytesReceived + c.bytesSent,
      0,
    );

    const uniqueUsers = new Set(connections.map((c) => c.userId)).size;

    return {
      totalConnections,
      activeConnections,
      uniqueUsers,
      totalDataTransferred: {
        bytes: totalDataTransferred,
        gigabytes: (totalDataTransferred / (1024 * 1024 * 1024)).toFixed(2),
      },
    };
  }

  async getAdStats(startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate && endDate) {
      where.createdAt = Between(startDate, endDate);
    }

    const impressions = await this.adImpressionsRepository.find({
      where,
      relations: ['ad', 'user'],
    });

    const totalImpressions = impressions.length;
    const totalClicks = impressions.filter((i) => i.clicked).length;
    const totalRevenue = impressions.reduce((sum, i) => sum + Number(i.revenue || 0), 0);

    // Group by ad
    const adStats = impressions.reduce((acc, impression) => {
      const adId = impression.adId;
      if (!acc[adId]) {
        acc[adId] = {
          adId,
          adTitle: impression.ad?.title || 'Unknown',
          impressions: 0,
          clicks: 0,
          revenue: 0,
        };
      }
      acc[adId].impressions++;
      if (impression.clicked) {
        acc[adId].clicks++;
        acc[adId].revenue += Number(impression.revenue || 0);
      }
      return acc;
    }, {} as Record<string, any>);

    return {
      totalImpressions,
      totalClicks,
      clickThroughRate: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      totalRevenue,
      adStats: Object.values(adStats),
    };
  }
}

