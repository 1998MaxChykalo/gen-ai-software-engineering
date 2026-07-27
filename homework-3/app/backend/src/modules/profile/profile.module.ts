import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { AuditModule } from '../audit/audit.module';
import { ForecastModule } from '../forecast/forecast.module';

@Module({
  imports: [AuditModule, ForecastModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
