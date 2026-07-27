import { Module } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { AuditModule } from '../audit/audit.module';
import { ForecastModule } from '../forecast/forecast.module';

@Module({
  imports: [AuditModule, ForecastModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
