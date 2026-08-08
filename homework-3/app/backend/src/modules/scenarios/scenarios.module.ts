import { Module } from '@nestjs/common';
import { ScenariosService } from './scenarios.service';
import { ScenariosController } from './scenarios.controller';
import { ScenarioEvaluationService } from './scenario-evaluation.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ScenariosController],
  providers: [ScenariosService, ScenarioEvaluationService],
  exports: [ScenariosService, ScenarioEvaluationService],
})
export class ScenariosModule {}
