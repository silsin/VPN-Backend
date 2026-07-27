import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Downloads and installs Xray-core into ./bin/xray automatically on startup.
 * No manual PATH setup required — the resolved absolute binary path is returned.
 */
@Injectable()
export class XrayInstallerService implements OnModuleInit {
  private readonly logger = new Logger(XrayInstallerService.name);

  private readonly installDir: string;
  private readonly autoInstall: boolean;
  private readonly preferredVersion: string | null;
  private readonly overrideBin: string | null;

  private resolvedBin: string | null = null;
  private readyPromise: Promise<string | null> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.installDir =
      this.configService.get<string>('XRAY_INSTALL_DIR') ||
      path.join(process.cwd(), 'bin', 'xray');
    this.autoInstall =
      (this.configService.get<string>('XRAY_AUTO_INSTALL', 'true') || 'true')
        .toLowerCase() !== 'false';
    this.preferredVersion =
      this.configService.get<string>('XRAY_VERSION')?.trim() || null;
    const override = this.configService.get<string>('XRAY_BIN')?.trim();
    // Treat bare "xray" as "auto-resolve", not a fixed override
    this.overrideBin =
      override && override !== 'xray' && override !== 'xray.exe'
        ? override
        : null;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureInstalled();
  }

  /** Absolute path to xray binary, or null if unavailable */
  getBinaryPath(): string | null {
    return this.resolvedBin;
  }

  /** Resolves/installs Xray and returns absolute binary path (or null). */
  async ensureInstalled(): Promise<string | null> {
    if (this.resolvedBin && fs.existsSync(this.resolvedBin)) {
      return this.resolvedBin;
    }
    if (!this.readyPromise) {
      this.readyPromise = this.doEnsure().finally(() => {
        // allow retry later if failed
        if (!this.resolvedBin) this.readyPromise = null;
      });
    }
    return this.readyPromise;
  }

  private async doEnsure(): Promise<string | null> {
    // 1) Explicit override path
    if (this.overrideBin) {
      if (await this.verifyBinary(this.overrideBin)) {
        this.resolvedBin = this.overrideBin;
        this.logger.log(`Using XRAY_BIN override: ${this.resolvedBin}`);
        return this.resolvedBin;
      }
      this.logger.warn(`XRAY_BIN=${this.overrideBin} is not runnable — will try auto-install`);
    }

    // 2) Already installed under installDir
    const localBin = this.localBinaryPath();
    if (await this.verifyBinary(localBin)) {
      this.resolvedBin = localBin;
      this.logger.log(`Using local Xray: ${this.resolvedBin}`);
      return this.resolvedBin;
    }

    // 3) System PATH
    const which = await this.findOnPath();
    if (which && (await this.verifyBinary(which))) {
      this.resolvedBin = which;
      this.logger.log(`Using system Xray: ${this.resolvedBin}`);
      return this.resolvedBin;
    }

    // 4) Auto-download
    if (!this.autoInstall) {
      this.logger.warn('Xray not found and XRAY_AUTO_INSTALL=false — traffic checks will be skipped');
      return null;
    }

    try {
      this.logger.log('Xray not found — downloading automatically…');
      await this.downloadAndInstall();
      if (await this.verifyBinary(localBin)) {
        this.resolvedBin = localBin;
        this.logger.log(`Xray installed at ${this.resolvedBin}`);
        return this.resolvedBin;
      }
      this.logger.error('Xray download finished but binary still not runnable');
      return null;
    } catch (err) {
      this.logger.error(`Automatic Xray install failed: ${err.message}`);
      return null;
    }
  }

  private localBinaryPath(): string {
    const name = process.platform === 'win32' ? 'xray.exe' : 'xray';
    return path.join(this.installDir, name);
  }

  private async findOnPath(): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('where.exe', ['xray'], {
          windowsHide: true,
        });
        const first = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
        return first || null;
      }
      const { stdout } = await execFileAsync('which', ['xray']);
      const first = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      return first || null;
    } catch {
      return null;
    }
  }

  private async verifyBinary(bin: string): Promise<boolean> {
    if (!bin || !fs.existsSync(bin)) return false;
    try {
      await execFileAsync(bin, ['version'], {
        timeout: 8_000,
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async downloadAndInstall(): Promise<void> {
    fs.mkdirSync(this.installDir, { recursive: true });

    const asset = this.platformAssetName();
    const { version, url } = await this.resolveDownload(asset);
    this.logger.log(`Downloading Xray ${version} (${asset})…`);

    const zipPath = path.join(os.tmpdir(), `flyvpn-${asset}`);
    await this.downloadFile(url, zipPath);
    this.assertValidZip(zipPath);

    await this.extractZip(zipPath, this.installDir);

    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore */
    }

    const bin = this.localBinaryPath();
    if (process.platform !== 'win32' && fs.existsSync(bin)) {
      fs.chmodSync(bin, 0o755);
    }

    try {
      fs.writeFileSync(
        path.join(this.installDir, 'VERSION'),
        `${version}\n`,
        'utf8',
      );
    } catch {
      /* ignore */
    }
  }

  private platformAssetName(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
      if (arch === 'arm64') return 'Xray-windows-arm64-v8a.zip';
      if (arch === 'ia32') return 'Xray-windows-32.zip';
      return 'Xray-windows-64.zip';
    }
    if (platform === 'darwin') {
      if (arch === 'arm64') return 'Xray-macos-arm64-v8a.zip';
      return 'Xray-macos-64.zip';
    }
    if (arch === 'arm64') return 'Xray-linux-arm64-v8a.zip';
    if (arch === 'arm') return 'Xray-linux-arm32-v7a.zip';
    if (arch === 'ia32') return 'Xray-linux-32.zip';
    return 'Xray-linux-64.zip';
  }

  private async resolveDownload(
    asset: string,
  ): Promise<{ version: string; url: string }> {
    if (this.preferredVersion) {
      const version = this.preferredVersion.startsWith('v')
        ? this.preferredVersion
        : `v${this.preferredVersion}`;
      return {
        version,
        url: `https://github.com/XTLS/Xray-core/releases/download/${version}/${asset}`,
      };
    }

    try {
      const releases = await this.httpsJson<any[]>(
        'https://api.github.com/repos/XTLS/Xray-core/releases?per_page=5',
      );
      const release =
        releases.find((r) => !r.draft && Array.isArray(r.assets) && r.assets.length) ||
        releases[0];
      if (!release?.tag_name) throw new Error('No release tag');
      const match = (release.assets as any[]).find((a) => a.name === asset);
      if (!match?.browser_download_url) {
        throw new Error(`Asset ${asset} not in release ${release.tag_name}`);
      }
      return { version: release.tag_name, url: match.browser_download_url };
    } catch (err) {
      const version = 'v26.6.27';
      this.logger.warn(
        `GitHub API failed (${err.message}) — falling back to ${version}`,
      );
      return {
        version,
        url: `https://github.com/XTLS/Xray-core/releases/download/${version}/${asset}`,
      };
    }
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (current: string, redirectsLeft: number) => {
        const lib = current.startsWith('https') ? https : http;
        const req = lib.get(
          current,
          {
            headers: {
              'User-Agent': 'FlyVPN-ConfigChecker/2.0',
              Accept: 'application/octet-stream',
            },
          },
          (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location &&
              redirectsLeft > 0
            ) {
              res.resume();
              follow(res.headers.location, redirectsLeft - 1);
              return;
            }
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`Download HTTP ${res.statusCode} for ${current}`));
              return;
            }
            const out = createWriteStream(dest);
            pipeline(res, out).then(resolve).catch(reject);
          },
        );
        req.setTimeout(120_000, () => {
          req.destroy();
          reject(new Error('Download timeout'));
        });
        req.on('error', reject);
      };
      follow(url, 5);
    });
  }

  /** Reject HTML/error pages masquerading as a zip */
  private assertValidZip(zipPath: string): void {
    const st = fs.statSync(zipPath);
    if (st.size < 1_000_000) {
      const head = fs.readFileSync(zipPath, { encoding: 'utf8' }).slice(0, 200);
      throw new Error(
        `Downloaded file too small (${st.size} bytes) — not a real Xray zip. Head: ${head}`,
      );
    }
    const fd = fs.openSync(zipPath, 'r');
    const magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    // ZIP local header magic: PK\x03\x04
    if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
      throw new Error(
        `Downloaded file is not a ZIP (magic=${magic.toString('hex')})`,
      );
    }
  }

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    fs.mkdirSync(destDir, { recursive: true });

    // 1) Platform tools (fast path)
    if (process.platform === 'win32') {
      try {
        await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
          ],
          { windowsHide: true, timeout: 120_000 },
        );
        return;
      } catch (err) {
        this.logger.warn(`PowerShell Expand-Archive failed: ${err.message} — using Node unzip`);
      }
    } else {
      try {
        await execFileAsync('unzip', ['-o', zipPath, '-d', destDir], {
          timeout: 120_000,
        });
        return;
      } catch {
        /* no unzip on many minimal servers */
      }

      // python3 zipfile module is common on Linux images
      try {
        await execFileAsync(
          'python3',
          ['-m', 'zipfile', '-e', zipPath, destDir],
          { timeout: 120_000 },
        );
        return;
      } catch {
        /* fall through */
      }
    }

    // 2) Pure Node — no unzip/tar dependency (GNU tar cannot open zip)
    this.logger.log('Extracting Xray zip with built-in Node unzip…');
    this.extractZipNode(zipPath, destDir);
  }

  /**
   * Minimal ZIP extractor (store + deflate) using central directory.
   * Avoids depending on system `unzip` / `tar` (GNU tar cannot open zip).
   */
  private extractZipNode(zipPath: string, destDir: string): void {
    const buf = fs.readFileSync(zipPath);
    const destRoot = path.resolve(destDir);

    // Find End of Central Directory (EOCD) signature 0x06054b50
    let eocd = -1;
    const scanFrom = Math.max(0, buf.length - 65_536 - 22);
    for (let i = buf.length - 22; i >= scanFrom; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error('Invalid ZIP: end-of-central-directory not found');
    }

    const totalEntries = buf.readUInt16LE(eocd + 10);
    let cdOffset = buf.readUInt32LE(eocd + 16);
    let extracted = 0;

    for (let e = 0; e < totalEntries; e++) {
      if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== 0x02014b50) {
        throw new Error(`Invalid ZIP: bad central directory entry at ${cdOffset}`);
      }

      const method = buf.readUInt16LE(cdOffset + 10);
      const compSize = buf.readUInt32LE(cdOffset + 20);
      const nameLen = buf.readUInt16LE(cdOffset + 28);
      const extraLen = buf.readUInt16LE(cdOffset + 30);
      const commentLen = buf.readUInt16LE(cdOffset + 32);
      const localOff = buf.readUInt32LE(cdOffset + 42);
      const name = buf.slice(cdOffset + 46, cdOffset + 46 + nameLen).toString('utf8');
      cdOffset += 46 + nameLen + extraLen + commentLen;

      // Zip-slip protection
      const outPath = path.resolve(destRoot, name);
      if (!outPath.startsWith(destRoot + path.sep) && outPath !== destRoot) {
        throw new Error(`Refusing unsafe zip path: ${name}`);
      }

      if (name.endsWith('/')) {
        fs.mkdirSync(outPath, { recursive: true });
        continue;
      }

      if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) {
        throw new Error(`Invalid ZIP: bad local header for ${name}`);
      }
      const localNameLen = buf.readUInt16LE(localOff + 26);
      const localExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + localNameLen + localExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compSize);

      let out: Buffer;
      if (method === 0) {
        out = Buffer.from(compressed);
      } else if (method === 8) {
        out = zlib.inflateRawSync(compressed);
      } else {
        throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
      }

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, out);
      extracted++;
    }

    if (extracted === 0) {
      throw new Error('ZIP contained no files');
    }
    this.logger.log(`Extracted ${extracted} file(s) from Xray zip`);
  }

  private httpsJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'FlyVPN-ConfigChecker/2.0',
            Accept: 'application/vnd.github+json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`GitHub API HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.setTimeout(20_000, () => {
        req.destroy();
        reject(new Error('GitHub API timeout'));
      });
      req.on('error', reject);
    });
  }
}
