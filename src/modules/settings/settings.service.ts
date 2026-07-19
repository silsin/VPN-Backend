import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';

export type AppUpdateType = 'force' | 'optional' | 'none';

export interface MobileAppVersionResponse {
  platform: 'android' | 'ios';
  latestVersion: string;
  latestBuild: number;
  forceUpdate: boolean;
  optionalUpdate: boolean;
  storeUrl: string;
  message: string;
  clientBuild?: number;
  clientVersion?: string;
  updateRequired: boolean;
  updateType: AppUpdateType;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private settingsRepository: Repository<Setting>,
  ) {}

  async findAll(): Promise<Record<string, any>> {
    const settings = await this.settingsRepository.find();

    const response: Record<string, any> = {
      general: {},
      notifications: {},
      server: {},
      app_version: {},
    };

    settings.forEach((setting) => {
      let parsedValue;
      try {
        parsedValue = JSON.parse(setting.value);
      } catch {
        parsedValue = setting.value;
      }

      if (!response[setting.category]) {
        response[setting.category] = {};
      }
      response[setting.category][setting.key] = parsedValue;
    });

    return response;
  }

  async update(settings: Record<string, any>): Promise<any> {
    for (const [category, groupSettings] of Object.entries(settings)) {
      if (typeof groupSettings === 'object' && groupSettings !== null) {
        for (const [key, value] of Object.entries(groupSettings)) {
          const stringValue = JSON.stringify(value);

          let setting = await this.settingsRepository.findOne({ where: { key } });
          if (!setting) {
            setting = this.settingsRepository.create({
              key,
              value: stringValue,
              category,
            });
          } else {
            setting.value = stringValue;
            setting.category = category;
          }
          await this.settingsRepository.save(setting);
        }
      }
    }
    return this.findAll();
  }

  async getAppVersionForMobile(
    platformRaw: string,
    clientBuild?: number,
    clientVersion?: string,
  ): Promise<MobileAppVersionResponse> {
    const platform = (platformRaw || '').toLowerCase();
    if (platform !== 'android' && platform !== 'ios') {
      throw new BadRequestException('platform must be android or ios');
    }

    const all = await this.findAll();
    const cfg = all.app_version || {};
    const prefix = platform === 'android' ? 'android' : 'ios';

    const latestVersion = String(cfg[`${prefix}Version`] ?? '1.0.0');
    const latestBuild = Number(cfg[`${prefix}Build`] ?? 1) || 1;
    const forceUpdate = Boolean(cfg[`${prefix}ForceUpdate`]);
    const optionalUpdate = Boolean(cfg[`${prefix}OptionalUpdate`]);
    const storeUrl = String(cfg[`${prefix}StoreUrl`] ?? '');
    const message = String(
      cfg[`${prefix}Message`] ?? 'A new version is available.',
    );

    let updateType: AppUpdateType = 'none';
    let updateRequired = false;

    if (clientBuild !== undefined && Number.isFinite(clientBuild)) {
      if (clientBuild < latestBuild) {
        if (forceUpdate) {
          updateType = 'force';
          updateRequired = true;
        } else if (optionalUpdate) {
          updateType = 'optional';
          updateRequired = true;
        }
      }
    }

    return {
      platform,
      latestVersion,
      latestBuild,
      forceUpdate,
      optionalUpdate,
      storeUrl,
      message,
      ...(clientBuild !== undefined ? { clientBuild } : {}),
      ...(clientVersion ? { clientVersion } : {}),
      updateRequired,
      updateType,
    };
  }
}
