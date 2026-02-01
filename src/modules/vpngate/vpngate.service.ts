import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

@Injectable()
export class VpnGateService implements OnModuleInit {
  private readonly logger = new Logger(VpnGateService.name);
  private readonly CSV_URL = 'https://www.vpngate.net/api/iphone/';
  private readonly LOG_URL = 'https://www.vpngate.net/en/lastlog.aspx';
  private readonly STORAGE_PATH = path.join(process.cwd(), 'free_configs.json');
  private readonly CONFIGS_DIR = path.join(process.cwd(), 'configs');

  onModuleInit() {
    this.logger.log('VpnGateService initialized. Starting first sync...');
    this.updateFreeConfigs();
    // Schedule every 5 minutes
    setInterval(() => this.updateFreeConfigs(), 5 * 60 * 1000);
  }

  async getFreeConfigs() {
    try {
      if (fs.existsSync(this.STORAGE_PATH)) {
        const data = fs.readFileSync(this.STORAGE_PATH, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      this.logger.error(`Error reading free configs: ${error.message}`);
      return [];
    }
  }

  async updateFreeConfigs() {
    this.logger.log('[*] Fetching server list from VPN Gate...');
    try {
      const servers = await this.fetchCsv();
      const logHtml = await this.fetchLogs();
      
      if (!servers || servers.length === 0) {
        this.logger.warn('[!] No servers found.');
        return;
      }

      const iranConns = this.parseIranConnections(logHtml);
      const uniqueIranPrefixes = [...new Set(iranConns.map(c => c.prefix))];
      
      this.logger.log(`[*] Found ${uniqueIranPrefixes.length} active IP ranges used by Iranians recently.`);
      
      const candidateServers = [];
      const seenIps = new Set();
      
      for (const prefix of uniqueIranPrefixes) {
        for (const s of servers) {
          const ip = s['IP'];
          if (ip && ip.startsWith(prefix) && !seenIps.has(ip)) {
            candidateServers.push(s);
            seenIps.add(ip);
          }
        }
      }

      this.logger.log(`[*] Found ${candidateServers.length} potential servers. Starting reachability tests...`);

      const passedServers = [];
      const testPromises = candidateServers.map(s => this.testServer(s));
      const results = await Promise.all(testPromises);

      for (const result of results) {
        if (result.reachable) {
          passedServers.push(result.data);
        }
      }

      passedServers.sort((a, b) => parseInt(b.Score || '0') - parseInt(a.Score || '0'));
      
      // Save top 50 to file
      const topServers = passedServers.slice(0, 50);
      fs.writeFileSync(this.STORAGE_PATH, JSON.stringify(topServers, null, 2));
      
      this.logger.log(`[+] Total working servers found: ${passedServers.length}. Saved top 50.`);
      
      // Also save OVPN files if needed (optional but matched python script)
      if (!fs.existsSync(this.CONFIGS_DIR)) {
        fs.mkdirSync(this.CONFIGS_DIR);
      }
      // Clear old configs
      const files = fs.readdirSync(this.CONFIGS_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(this.CONFIGS_DIR, file));
      }

      for (const s of topServers.slice(0, 20)) {
        const configB64 = s['OpenVPN_ConfigData_Base64'];
        if (configB64) {
          const filename = path.join(this.CONFIGS_DIR, `iran_working_${s.IP}.ovpn`);
          fs.writeFileSync(filename, Buffer.from(configB64, 'base64'));
        }
      }

    } catch (error) {
      this.logger.error(`Error during update: ${error.message}`);
    }
  }

  private fetchCsv(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      https.get(this.CSV_URL, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const lines = data.split('\n');
          if (lines.length < 3) return resolve([]);
          
          const headerLine = lines[1];
          const headers = headerLine.split(',');
          const results = [];
          
          for (let i = 2; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = line.split(',');
            const obj = {};
            headers.forEach((header, index) => {
              obj[header] = values[index];
            });
            results.push(obj);
          }
          resolve(results);
        });
      }).on('error', reject);
    });
  }

  private fetchLogs(): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(this.LOG_URL, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  private parseIranConnections(html: string) {
    // Ported regex from Python
    const rowRegex = /IR\.png'.*?\/> Iran.*?<\/td>.*?<td.*?>(.*?)<\/td>.*?<td.*?>(.*?)<\/td>.*?<td.*?>(.*?)<\/td>/gis;
    let match;
    const connections = [];
    
    while ((match = rowRegex.exec(html)) !== null) {
      let destIp = match[2].replace(/<.*?>/g, '').trim();
      if (destIp.includes('.x.x')) {
        const prefix = destIp.replace('.x.x', '');
        connections.push({ prefix });
      }
    }
    return connections;
  }

  private async testServer(serverData: any): Promise<{ reachable: boolean, data: any }> {
    const ip = serverData['IP'];
    const targetPorts = [443, 1194, 995, 5555];
    
    for (const port of targetPorts) {
      try {
        const reachable = await this.checkTcpPort(ip, port);
        if (reachable) {
          return { reachable: true, data: { ...serverData, SuccessPort: port } };
        }
      } catch (e) {
        continue;
      }
    }
    return { reachable: false, data: serverData };
  }

  private checkTcpPort(ip: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1500);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, ip);
    });
  }
}
