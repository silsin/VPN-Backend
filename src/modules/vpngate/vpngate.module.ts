import { Module } from '@nestjs/common';
import { VpnGateService } from './vpngate.service';
import { VpnGateController } from './vpngate.controller';

@Module({
  providers: [VpnGateService],
  controllers: [VpnGateController],
  exports: [VpnGateService],
})
export class VpnGateModule {}
