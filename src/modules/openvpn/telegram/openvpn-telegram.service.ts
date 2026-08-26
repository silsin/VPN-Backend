import { Injectable, Logger } from '@nestjs/common';
import { OpenVpnService, OpenVpnServerDto } from '../services/openvpn.service';
import { OpenVpnServer, OpenVpnAuthType } from '../entities/openvpn-server.entity';

export interface PendingOpenVpnAdd {
  step: 'name' | 'serverIp' | 'port' | 'protocol' | 'country' | 'city' | 'speed' | 'confirm';
  name?: string;
  serverIp?: string;
  port?: number;
  protocol?: 'udp' | 'tcp';
  country?: string;
  city?: string;
  speed?: number;
  caBundle?: string;
  clientCert?: string;
  clientKey?: string;
  tlsCrypt?: string;
  username?: string;
  password?: string;
  authType?: OpenVpnAuthType;
}

@Injectable()
export class OpenVpnTelegramService {
  private readonly logger = new Logger(OpenVpnTelegramService.name);
  private readonly pendingOpenvpnAdds = new Map<number, PendingOpenVpnAdd>();

  constructor(private readonly openVpnService: OpenVpnService) {}

  /**
   * Start adding a new OpenVPN server from scratch
   */
  async startServerAdd(chatId: number): Promise<string> {
    this.pendingOpenvpnAdds.delete(chatId);
    const pending: PendingOpenVpnAdd = { step: 'name' };
    this.pendingOpenvpnAdds.set(chatId, pending);
    return '📝 Enter OpenVPN server name (e.g., Germany #1):';
  }

  /**
   * Start adding OpenVPN server from .ovpn file content
   */
  async startServerAddFromOvpn(chatId: number, ovpnContent: string): Promise<string | null> {
    this.pendingOpenvpnAdds.delete(chatId);
    
    try {
      const parsed = this.parseOvpnFile(ovpnContent);
      
      const pending: PendingOpenVpnAdd = {
        step: 'name',
        serverIp: parsed.serverIp,
        port: parsed.port,
        protocol: parsed.protocol,
        caBundle: parsed.caBundle,
        clientCert: parsed.clientCert,
        clientKey: parsed.clientKey,
        tlsCrypt: parsed.tlsCrypt,
        authType: parsed.authType,
        username: parsed.username || 'vpnuser',
        password: parsed.password || 'vpnpass123',
      };

      this.pendingOpenvpnAdds.set(chatId, pending);

      // Show detected config and ask for name
      let summary = [
        '✅ <b>.ovpn file parsed successfully!</b>',
        '',
        `IP: <b>${parsed.serverIp}</b>`,
        `Port: <b>${parsed.port}</b>`,
        `Protocol: <b>${parsed.protocol}</b>`,
        `Auth Type: <b>${parsed.authType}</b>`,
      ].join('\n');

      if (parsed.caBundle) summary += '\n✓ CA Certificate found';
      if (parsed.clientCert) summary += '\n✓ Client Certificate found';
      if (parsed.clientKey) summary += '\n✓ Client Key found';
      if (parsed.tlsCrypt) summary += '\n✓ TLS-Crypt found';

      summary += '\n\n📝 Enter server name (e.g., Germany #1):';
      return summary;
    } catch (error) {
      this.logger.error(`Error parsing .ovpn file: ${error.message}`);
      return `❌ Error parsing file: ${error.message}`;
    }
  }

  /**
   * Continue OpenVPN server creation
   */
  async continueServerAdd(chatId: number, text: string): Promise<string | null> {
    const pending = this.pendingOpenvpnAdds.get(chatId);
    if (!pending) return null;

    text = text.trim();

    switch (pending.step) {
      case 'name':
        pending.name = text;
        pending.step = 'serverIp';
        return '🌍 Enter server IP address (press Enter to skip - already extracted):';

      case 'serverIp':
        if (text && !this.isValidIp(text)) {
          return '❌ Invalid IP address. Try again or press Enter to skip:';
        }
        if (text) pending.serverIp = text;
        pending.step = 'port';
        return `🔌 Current port: ${pending.port}. Press Enter to keep or enter new port:`;

      case 'port':
        if (text) {
          const port = parseInt(text);
          if (isNaN(port) || port < 1 || port > 65535) {
            return '❌ Invalid port. Enter a number between 1-65535:';
          }
          pending.port = port;
        }
        pending.step = 'protocol';
        return `📡 Current protocol: ${pending.protocol}. Press Enter to keep or enter (udp/tcp):`;

      case 'protocol':
        if (text && text.toLowerCase() !== 'udp' && text.toLowerCase() !== 'tcp') {
          return '❌ Invalid protocol. Enter udp or tcp:';
        }
        if (text) pending.protocol = text.toLowerCase() as 'udp' | 'tcp';
        pending.step = 'country';
        return '🏳️ Enter country (e.g., Germany, US, Iran):';

      case 'country':
        pending.country = text;
        pending.step = 'city';
        return '🏙️ Enter city (e.g., Berlin):';

      case 'city':
        pending.city = text;
        pending.step = 'speed';
        return '⚡ Enter speed in Mbps (e.g., 1000):';

      case 'speed':
        const speed = parseInt(text);
        if (isNaN(speed) || speed < 0) {
          return '❌ Invalid speed. Enter a positive number:';
        }
        pending.speed = speed;
        pending.step = 'confirm';
        return this.buildServerSummary(pending);

      case 'confirm':
        if (text.toLowerCase() === 'yes' || text === '✅') {
          return await this.finishServerAdd(chatId, pending);
        } else if (text.toLowerCase() === 'no' || text === '❌') {
          this.pendingOpenvpnAdds.delete(chatId);
          return '❌ Cancelled.';
        }
        return '❓ Please enter yes or no.';

      default:
        return null;
    }
  }

  /**
   * List all OpenVPN servers with pagination
   */
  async listServers(page: number = 1): Promise<{ text: string; keyboard: any[][] }> {
    const servers = await this.openVpnService.getAllServers();
    const pageSize = 5;
    const totalPages = Math.ceil(servers.length / pageSize);

    if (page < 1 || page > totalPages) {
      page = 1;
    }

    const start = (page - 1) * pageSize;
    const pageServers = servers.slice(start, start + pageSize);

    let text = `📡 <b>OpenVPN Servers</b> (Page ${page}/${totalPages})\n\n`;

    pageServers.forEach((server, idx) => {
      const status = server.isActive ? '✅' : '❌';
      text += `${status} <b>${server.name}</b>\n`;
      text += `   IP: ${server.serverIp}:${server.port} (${server.protocol})\n`;
      text += `   ${server.country} • ${server.city} • ${server.speed} Mbps\n`;
      text += `   ID: <code>${server.id}</code>\n\n`;
    });

    if (totalPages === 0) {
      text = '📡 <b>OpenVPN Servers</b>\n\nNo servers found.';
    }

    const keyboard: any[][] = [];

    // Pagination buttons
    if (totalPages > 1) {
      const paginationRow = [];
      if (page > 1) {
        paginationRow.push({ text: '⬅️ Prev', callback_data: `openvpn:servers:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${totalPages}`, callback_data: 'openvpn:noop' });
      if (page < totalPages) {
        paginationRow.push({ text: 'Next ➡️', callback_data: `openvpn:servers:${page + 1}` });
      }
      keyboard.push(paginationRow);
    }

    // Action buttons
    keyboard.push([
      { text: '➕ Add Server', callback_data: 'openvpn:add' },
      { text: '📊 Stats', callback_data: 'openvpn:stats' },
    ]);

    return { text, keyboard };
  }

  /**
   * Show server statistics
   */
  async showStats(): Promise<string> {
    const stats = await this.openVpnService.getStats();
    const byCountryText = stats.byCountry
      .map((c) => `  ${c.country}: ${c.count}`)
      .join('\n');

    return [
      '📊 <b>OpenVPN Statistics</b>',
      '',
      `Total servers: <b>${stats.total}</b>`,
      `Active: <b>${stats.active}</b>`,
      `Inactive: <b>${stats.inactive}</b>`,
      '',
      '<b>By Country:</b>',
      byCountryText || '  (none)',
    ].join('\n');
  }

  /**
   * Show server details
   */
  async showServerDetails(serverId: string): Promise<string> {
    const server = await this.openVpnService.getServerById(serverId);
    const status = server.isActive ? '✅ Active' : '❌ Inactive';

    return [
      '📡 <b>Server Details</b>',
      '',
      `Name: <b>${server.name}</b>`,
      `Status: ${status}`,
      `IP: <b>${server.serverIp}</b>`,
      `Port: <b>${server.port}</b>`,
      `Protocol: <b>${server.protocol}</b>`,
      `Country: <b>${server.country || '—'}</b>`,
      `City: <b>${server.city || '—'}</b>`,
      `Speed: <b>${server.speed} Mbps</b>`,
      `Username: <code>${server.sharedUsername}</code>`,
      `Password: <code>${server.sharedPassword}</code>`,
      '',
      `Created: ${new Date(server.createdAt).toLocaleString()}`,
      `Updated: ${new Date(server.updatedAt).toLocaleString()}`,
      '',
      `ID: <code>${server.id}</code>`,
    ].join('\n');
  }

  /**
   * Deactivate server
   */
  async deactivateServer(serverId: string): Promise<string> {
    await this.openVpnService.deactivateServer(serverId);
    return '✅ Server deactivated.';
  }

  /**
   * Activate server
   */
  async activateServer(serverId: string): Promise<string> {
    await this.openVpnService.activateServer(serverId);
    return '✅ Server activated.';
  }

  /**
   * Delete server
   */
  async deleteServer(serverId: string): Promise<string> {
    await this.openVpnService.deleteServer(serverId);
    return '✅ Server deleted.';
  }

  /**
   * Clear pending operations
   */
  clearPending(chatId: number): void {
    this.pendingOpenvpnAdds.delete(chatId);
  }

  /**
   * Get pending add status
   */
  getPending(chatId: number): PendingOpenVpnAdd | null {
    return this.pendingOpenvpnAdds.get(chatId) || null;
  }

  // --- Private helpers ---

  private isValidIp(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) return false;

    const parts = ip.split('.');
    return parts.every((part) => {
      const num = parseInt(part);
      return num >= 0 && num <= 255;
    });
  }

  private parseOvpnFile(content: string): {
    serverIp: string;
    port: number;
    protocol: 'udp' | 'tcp';
    caBundle?: string;
    clientCert?: string;
    clientKey?: string;
    tlsCrypt?: string;
    authType: OpenVpnAuthType;
    username?: string;
    password?: string;
  } {
    // Extract remote (IP and port)
    const remoteMatch = content.match(/^remote\s+([\d\.]+)\s+(\d+)/m);
    if (!remoteMatch) {
      throw new Error('No remote server found in .ovpn file');
    }
    const serverIp = remoteMatch[1];
    const port = parseInt(remoteMatch[2]);

    // Extract protocol
    const protoMatch = content.match(/^proto\s+(\w+)/m);
    const protocol = (protoMatch ? protoMatch[1] : 'udp') as 'udp' | 'tcp';

    // Extract CA certificate
    const caMatch = content.match(/<ca>([\s\S]*?)<\/ca>/);
    const caBundle = caMatch ? caMatch[1].trim() : undefined;

    // Extract client certificate
    const certMatch = content.match(/<cert>([\s\S]*?)<\/cert>/);
    const clientCert = certMatch ? certMatch[1].trim() : undefined;

    // Extract client key
    const keyMatch = content.match(/<key>([\s\S]*?)<\/key>/);
    const clientKey = keyMatch ? keyMatch[1].trim() : undefined;

    // Extract tls-crypt
    const tlsCryptMatch = content.match(/<tls-crypt>([\s\S]*?)<\/tls-crypt>/);
    const tlsCrypt = tlsCryptMatch ? tlsCryptMatch[1].trim() : undefined;

    // Determine auth type
    const hasAuthUserPass = /^auth-user-pass/m.test(content);
    const authType = hasAuthUserPass || tlsCrypt ? OpenVpnAuthType.USER_PASS : OpenVpnAuthType.CERTIFICATE;

    return {
      serverIp,
      port,
      protocol,
      caBundle,
      clientCert,
      clientKey,
      tlsCrypt,
      authType,
      username: hasAuthUserPass ? 'vpnuser' : undefined,
      password: hasAuthUserPass ? 'vpnpass123' : undefined,
    };
  }

  private buildServerSummary(pending: PendingOpenVpnAdd): string {
    return [
      '📝 <b>OpenVPN Server Summary</b>',
      '',
      `Name: <b>${pending.name}</b>`,
      `IP: <b>${pending.serverIp}</b>`,
      `Port: <b>${pending.port}</b>`,
      `Protocol: <b>${pending.protocol}</b>`,
      `Country: <b>${pending.country}</b>`,
      `City: <b>${pending.city}</b>`,
      `Speed: <b>${pending.speed} Mbps</b>`,
      `Username: <code>${pending.username}</code>`,
      `Password: <code>${pending.password}</code>`,
      `Auth Type: <b>${pending.authType}</b>`,
      '',
      'Is this correct? (yes/no)',
    ].join('\n');
  }

  private async finishServerAdd(chatId: number, pending: PendingOpenVpnAdd): Promise<string> {
    if (!pending.name || !pending.serverIp || !pending.port || !pending.protocol || !pending.username || !pending.password) {
      return '❌ Missing required fields.';
    }

    try {
      const serverData: OpenVpnServerDto = {
        name: pending.name,
        serverIp: pending.serverIp,
        port: pending.port,
        protocol: pending.protocol,
        country: pending.country,
        city: pending.city,
        speed: pending.speed,
        caBundle: pending.caBundle,
        clientCert: pending.clientCert,
        clientKey: pending.clientKey,
        tlsCrypt: pending.tlsCrypt,
        authType: pending.authType,
        sharedUsername: pending.username,
        sharedPassword: pending.password,
      };

      const server = await this.openVpnService.createServer(serverData);
      this.pendingOpenvpnAdds.delete(chatId);
      return `✅ Server created:\n<code>${server.id}</code>`;
    } catch (error) {
      this.logger.error(`Error creating OpenVPN server: ${error.message}`);
      return `❌ Error: ${error.message}`;
    }
  }
}
