import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { MobileAdsController } from './mobile-ads.controller';
import { Ad } from './entities/ad.entity';
import { AdSetting } from './entities/ad-setting.entity';
import { AdFailureReport } from './entities/ad-failure-report.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ad, AdSetting, AdFailureReport])],
  controllers: [AdsController, MobileAdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}

