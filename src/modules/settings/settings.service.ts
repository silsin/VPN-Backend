import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private settingsRepository: Repository<Setting>,
  ) {}

  async findAll(): Promise<Record<string, any>> {
    const settings = await this.settingsRepository.find();
    
    // Transform flat list of settings into nested object based on categories or keys
    // Strategy: We will assume the frontend sends a structured object.
    // However, to map to the DB "key-value" structure efficiently:
    // We can store specific keys like 'server.forceServerSelection'
    
    // But the requirement asks for a response structure:
    // { "server": { "forceServerSelection": true, ... } }
    
    const response: Record<string, any> = {
        general: {},
        notifications: {},
        server: {}
    };

    settings.forEach(setting => {
      // Try to parse value as JSON if possible, else string
      let parsedValue;
      try {
        parsedValue = JSON.parse(setting.value);
      } catch {
        parsedValue = setting.value;
      }

      // If key contains dot notation (e.g. server.forceServerSelection), nest it
      // OR we can rely on 'category' column.
      
      // Let's rely on keys being "category.subKey" or just construct from category.
      // Requirement: 
      // Category: server, Key: forceServerSelection
      
      // Implementation: We expect keys in DB to be unique. 
      // Let's use the 'category' field to group them in the response.
      
      if (!response[setting.category]) {
        response[setting.category] = {};
      }
      response[setting.category][setting.key] = parsedValue;
    });

    return response;
  }

  async update(settings: Record<string, any>): Promise<any> {
    // Expecting object like: { server: { forceServerSelection: true } }
    
    for (const [category, groupSettings] of Object.entries(settings)) {
      if (typeof groupSettings === 'object' && groupSettings !== null) {
        for (const [key, value] of Object.entries(groupSettings)) {
           // Save each key. value needs to be stringified.
           const stringValue = JSON.stringify(value);
           
           // Upsert
           let setting = await this.settingsRepository.findOne({ where: { key } });
           if (!setting) {
             setting = this.settingsRepository.create({ 
               key, 
               value: stringValue,
               category
             });
           } else {
             setting.value = stringValue;
             setting.category = category; // update category just in case
           }
           await this.settingsRepository.save(setting);
        }
      }
    }
    return this.findAll();
  }
}
