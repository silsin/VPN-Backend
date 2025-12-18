import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class HandshakeCryptoService {
  constructor(private readonly configService: ConfigService) {}

  private getKeyFromEnvB64(name: string, expectedBytes: number): Buffer {
    const raw = this.configService.get<string>(name);
    if (!raw) {
      throw new InternalServerErrorException(`Missing env var: ${name}`);
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== expectedBytes) {
      throw new InternalServerErrorException(
        `Invalid ${name}: expected ${expectedBytes} bytes (base64), got ${buf.length}`,
      );
    }
    return buf;
  }

  private getAes1Key(): Buffer {
    return this.getKeyFromEnvB64('HANDSHAKE_AES1_KEY_B64', 32);
  }

  private getXor1Key(): Buffer {
    return this.getKeyFromEnvB64('HANDSHAKE_XOR1_KEY_B64', 32);
  }

  private getXor2Key(): Buffer {
    return this.getKeyFromEnvB64('HANDSHAKE_XOR2_KEY_B64', 32);
  }

  private xor(data: Buffer, key: Buffer): Buffer {
    const out = Buffer.allocUnsafe(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ key[i % key.length];
    }
    return out;
  }

  decryptFirst(payloadB64: string): any {
    const encrypted = Buffer.from(payloadB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-ecb', this.getAes1Key(), null);
    decipher.setAutoPadding(true);
    const aesPlain = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    const x1 = this.xor(aesPlain, this.getXor1Key());
    const x2 = this.xor(x1, this.getXor2Key());

    const text = x2.toString('utf8');
    return JSON.parse(text);
  }

  encryptFirst(obj: any): string {
    const json = JSON.stringify(obj);
    const plain = Buffer.from(json, 'utf8');

    const x1 = this.xor(plain, this.getXor2Key());
    const x2 = this.xor(x1, this.getXor1Key());

    const cipher = crypto.createCipheriv('aes-256-ecb', this.getAes1Key(), null);
    cipher.setAutoPadding(true);
    const encrypted = Buffer.concat([cipher.update(x2), cipher.final()]);
    return encrypted.toString('base64');
  }

  decryptSecond(payloadB64: string, aes2Key: Buffer, aes2Iv: Buffer, xor3Key: Buffer): any {
    const encrypted = Buffer.from(payloadB64, 'base64');

    const decipher2 = crypto.createDecipheriv('aes-256-cbc', aes2Key, aes2Iv);
    decipher2.setAutoPadding(true);
    const step1 = Buffer.concat([decipher2.update(encrypted), decipher2.final()]);

    const step2 = this.xor(step1, xor3Key);
    const step3 = this.xor(step2, this.getXor2Key());

    const decipher1 = crypto.createDecipheriv('aes-256-ecb', this.getAes1Key(), null);
    decipher1.setAutoPadding(true);
    const step4 = Buffer.concat([decipher1.update(step3), decipher1.final()]);

    const step5 = this.xor(step4, this.getXor1Key());
    const text = step5.toString('utf8');
    return JSON.parse(text);
  }

  encryptSecond(obj: any, aes2Key: Buffer, aes2Iv: Buffer, xor3Key: Buffer): string {
    const json = JSON.stringify(obj);
    const plain = Buffer.from(json, 'utf8');

    const step1 = this.xor(plain, this.getXor1Key());

    const cipher1 = crypto.createCipheriv('aes-256-ecb', this.getAes1Key(), null);
    cipher1.setAutoPadding(true);
    const step2 = Buffer.concat([cipher1.update(step1), cipher1.final()]);

    const step3 = this.xor(step2, this.getXor2Key());
    const step4 = this.xor(step3, xor3Key);

    const cipher2 = crypto.createCipheriv('aes-256-cbc', aes2Key, aes2Iv);
    cipher2.setAutoPadding(true);
    const encrypted = Buffer.concat([cipher2.update(step4), cipher2.final()]);

    return encrypted.toString('base64');
  }
}
