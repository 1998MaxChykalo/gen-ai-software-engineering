import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { ScenariosService } from './scenarios.service';
import { ScenarioEvaluateDto, SaveScenarioDto } from './dto/scenario-delta.dto';
import { ListGoalsQueryDto } from '../goals/dto/list-goals-query.dto';

const SIMULATION_THROTTLE = { default: { limit: 10, ttl: 60000 } };

@ApiTags('scenarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Post('evaluate')
  @Throttle(SIMULATION_THROTTLE)
  @ApiOperation({ summary: 'Ad-hoc, synchronous scenario evaluation (never persisted)' })
  evaluateAdHoc(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScenarioEvaluateDto) {
    return this.scenariosService.evaluateAdHoc(user.id, dto.deltas);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Save a named scenario' })
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveScenarioDto) {
    return this.scenariosService.create(user.id, dto.name, dto.deltas);
  }

  @Get()
  @ApiOperation({ summary: 'List saved scenarios' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListGoalsQueryDto) {
    return this.scenariosService.list(user.id, query.page, query.pageSize);
  }

  @Post(':id/evaluate')
  @Throttle(SIMULATION_THROTTLE)
  @ApiOperation({ summary: 'Evaluate a saved scenario against the current profile' })
  evaluateSaved(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.scenariosService.evaluateSaved(user.id, id);
  }

  @Delete(':id')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Archive a saved scenario' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.scenariosService.archive(user.id, id);
  }
}
