import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimerConfiguration } from './entities/timer-configuration.entity';
import { TimerEvent } from './entities/timer-event.entity';
import { TimerStatus } from './entities/timer-status.entity';
import { readFileSync } from 'fs';
import { join } from 'path';

interface TimerConfig {
  enabled: boolean;
  backend_control: boolean;
  interval_seconds?: number;
  duration_seconds?: number;
  default_duration_seconds?: number;
  min_interval?: number;
  min_timeout?: number;
  min_delay?: number;
  max_interval?: number;
  max_timeout?: number;
  max_delay?: number;
  min_value?: number;
  max_value?: number;
}

interface TimerCategory {
  [key: string]: TimerConfig;
}

interface TimerConfigs {
  timer_configs: {
    [category: string]: TimerCategory;
  };
}

@Injectable()
export class TimerService {
  private defaultConfigs: TimerConfigs;

  constructor(
    @InjectRepository(TimerConfiguration)
    private timerConfigRepository: Repository<TimerConfiguration>,
    @InjectRepository(TimerEvent)
    private timerEventRepository: Repository<TimerEvent>,
    @InjectRepository(TimerStatus)
    private timerStatusRepository: Repository<TimerStatus>,
  ) {
    this.loadDefaultConfigs();
  }

  private loadDefaultConfigs(): void {
    try {
      const configPath = join(__dirname, 'timer-configs.json');
      const configData = readFileSync(configPath, 'utf8');
      this.defaultConfigs = JSON.parse(configData) as TimerConfigs;
    } catch (error) {
      console.error('Failed to load default timer configs:', error);
      this.defaultConfigs = { timer_configs: {} };
    }
  }

  async getTimerConfigs(): Promise<any> {
    const configs = await this.timerConfigRepository.find();
    
    if (configs.length === 0) {
      await this.initializeDefaultConfigs();
      return this.defaultConfigs;
    }

    // Transform database configs back to nested structure
    const response: TimerConfigs = { timer_configs: {} };
    
    configs.forEach(config => {
      const category = config.category;
      if (!response.timer_configs[category]) {
        response.timer_configs[category] = {};
      }
      
      response.timer_configs[category][config.id] = {
        enabled: config.enabled,
        backend_control: config.backend_control,
      };

      if (config.interval_seconds !== null) {
        response.timer_configs[category][config.id].interval_seconds = config.interval_seconds;
      }
      if (config.duration_seconds !== null) {
        response.timer_configs[category][config.id].duration_seconds = config.duration_seconds;
      }
      if (config.min_value !== null) {
        response.timer_configs[category][config.id].min_value = config.min_value;
      }
      if (config.max_value !== null) {
        response.timer_configs[category][config.id].max_value = config.max_value;
      }
    });

    return response;
  }

  async updateTimerConfigs(updates: any[]): Promise<any> {
    for (const update of updates) {
      const { timer_id, ...configData } = update;
      
      let config = await this.timerConfigRepository.findOne({ 
        where: { id: timer_id } 
      });
      
      if (!config) {
        const newConfig: Partial<TimerConfiguration> = {
          id: timer_id,
          category: this.inferCategory(timer_id),
          enabled: true,
          backend_control: true,
          interval_seconds: null,
          duration_seconds: null,
          min_value: null,
          max_value: null,
          ...configData 
        };
        config = this.timerConfigRepository.create(newConfig as TimerConfiguration);
      } else {
        Object.assign(config, configData);
      }
      
      await this.timerConfigRepository.save(config);
    }

    return this.getTimerConfigs();
  }

  async controlTimer(timerId: string, action: string, parameters?: any): Promise<any> {
    // Log the control action
    await this.logTimerEvent(timerId, 'controlled', {
      action,
      parameters,
      trigger_reason: 'backend_control'
    });

    // Update timer status
    const timerStatus = await this.getOrCreateTimerStatus(timerId);
    timerStatus.status = action;
    await this.timerStatusRepository.save(timerStatus);

    return { success: true, timer_id: timerId, action, status: timerStatus.status };
  }

  async getTimerStatus(): Promise<any> {
    const statuses = await this.timerStatusRepository.find();
    return {
      timers: statuses.map(status => ({
        id: status.timer_id,
        status: status.status,
        remaining_seconds: status.remaining_seconds,
        last_updated: status.last_updated
      }))
    };
  }

  async logTimerEvent(
    timerId: string, 
    eventType: string, 
    metadata?: any, 
    userId?: string
  ): Promise<void> {
    const event = this.timerEventRepository.create({
      timer_id: timerId,
      event_type: eventType,
      user_id: userId,
      metadata: metadata || {}
    });
    
    await this.timerEventRepository.save(event);
  }

  private async initializeDefaultConfigs(): Promise<void> {
    const configs = this.defaultConfigs.timer_configs;
    
    for (const [category, categoryTimers] of Object.entries(configs as any)) {
      for (const [timerId, config] of Object.entries(categoryTimers as any)) {
        const timerConfig = this.timerConfigRepository.create({
          id: timerId,
          category,
          enabled: (config as TimerConfig).enabled,
          backend_control: (config as TimerConfig).backend_control,
          interval_seconds: (config as TimerConfig).interval_seconds || null,
          duration_seconds: (config as TimerConfig).duration_seconds || (config as TimerConfig).default_duration_seconds || null,
          min_value: (config as TimerConfig).min_interval || (config as TimerConfig).min_timeout || (config as TimerConfig).min_delay || null,
          max_value: (config as TimerConfig).max_interval || (config as TimerConfig).max_timeout || (config as TimerConfig).max_delay || null,
        });
        
        await this.timerConfigRepository.save(timerConfig);
      }
    }
  }

  private async getOrCreateTimerStatus(timerId: string): Promise<TimerStatus> {
    let status = await this.timerStatusRepository.findOne({ 
      where: { timer_id: timerId } 
    });
    
    if (!status) {
      status = this.timerStatusRepository.create({
        timer_id: timerId,
        status: 'stopped'
      });
    }
    
    return status;
  }

  private inferCategory(timerId: string): string {
    if (timerId.includes('disconnect') || timerId.includes('timeout') || timerId.includes('status')) {
      return 'connection_management';
    }
    if (timerId.includes('stats') || timerId.includes('protocol')) {
      return 'statistics';
    }
    if (timerId.includes('ping') || timerId.includes('session')) {
      return 'monitoring';
    }
    if (timerId.includes('debounce') || timerId.includes('selection')) {
      return 'ui_performance';
    }
    return 'general';
  }
}
