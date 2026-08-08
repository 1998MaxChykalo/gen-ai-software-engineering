import { Module } from '@nestjs/common';
import { ForecastService } from './forecast.service';
import { ForecastController } from './forecast.controller';
import { OutboxService } from './outbox/outbox.service';
import { ForecastDispatcherService } from './dispatcher/forecast-dispatcher.service';

@Module({
  controllers: [ForecastController],
  providers: [ForecastService, OutboxService, ForecastDispatcherService],
  exports: [ForecastService, OutboxService, ForecastDispatcherService],
})
export class ForecastModule {}
