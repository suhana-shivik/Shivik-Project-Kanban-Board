import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsGateway } from './metrics.gateway';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsGateway],
  exports: [MetricsService],
})
export class MetricsModule {}
