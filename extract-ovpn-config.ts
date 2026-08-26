#!/usr/bin/env ts-node
/**
 * Helper script to extract OpenVPN config from .ovpn file
 * Usage: npx ts-node extract-ovpn-config.ts <path-to-file.ovpn>
 */

import * as fs from 'fs';
import * as path from 'path';

function extractBlock(content: string, blockName: string): string | null {
  const regex = new RegExp(`<${blockName}>([\\s\\S]*?)<\/${blockName}>`, 'm');
  const match = content.match(regex);
  if (!match) return null;
  return match[1].trim();
}

function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('Usage: npx ts-node extract-ovpn-config.ts <path-to-file.ovpn>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract components
  const ca = extractBlock(content, 'ca');
  const tlsCrypt = extractBlock(content, 'tls-crypt');
  const cert = extractBlock(content, 'cert');
  const key = extractBlock(content, 'key');

  // Extract remote
  const remoteMatch = content.match(/^remote\s+([\d\.]+)\s+(\d+)/m);
  const serverIp = remoteMatch ? remoteMatch[1] : null;
  const port = remoteMatch ? parseInt(remoteMatch[2]) : null;

  // Extract protocol
  const protoMatch = content.match(/^proto\s+(\w+)/m);
  const protocol = protoMatch ? protoMatch[1] : 'udp';

  // Determine auth type
  const authType = tlsCrypt ? 'user-pass' : 'certificate';

  console.log('\n=== OpenVPN Config Extracted ===\n');
  console.log(`Server IP: ${serverIp}`);
  console.log(`Port: ${port}`);
  console.log(`Protocol: ${protocol}`);
  console.log(`Auth Type: ${authType}`);
  console.log(`\nCA Certificate: ${ca ? '✓ Found' : '✗ Not found'}`);
  console.log(`TLS-Crypt: ${tlsCrypt ? '✓ Found' : '✗ Not found'}`);
  console.log(`Client Cert: ${cert ? '✓ Found' : '✗ Not found'}`);
  console.log(`Client Key: ${key ? '✓ Found' : '✗ Not found'}`);

  console.log('\n=== JSON for API ===\n');

  const obj: any = {
    name: path.basename(filePath, '.ovpn'),
    serverIp,
    port,
    protocol,
    authType,
    sharedUsername: 'vpnuser',
    sharedPassword: 'vpnpass123',
    country: 'Unknown',
    city: 'Unknown',
    speed: 1000,
  };

  if (ca) {
    obj.caBundle = ca;
  }
  if (cert) {
    obj.clientCert = cert;
  }
  if (key) {
    obj.clientKey = key;
  }
  if (tlsCrypt) {
    obj.tlsCrypt = tlsCrypt;
  }

  console.log(JSON.stringify(obj, null, 2));

  console.log('\n=== cURL Command ===\n');
  console.log(`curl -X POST http://localhost:3000/api/v1/openvpn-configs/admin/servers \\`);
  console.log(`  -H "Authorization: Bearer <ADMIN_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '${JSON.stringify(obj)}'`);
}

main();
