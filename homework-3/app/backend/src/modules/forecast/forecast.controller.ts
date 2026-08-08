import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { DomainErrors } from '../../common/errors/domain-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ForecastService } from './forecast.service';
import { mapForecastResponse } from './forecast-response.mapper';

@ApiTags('forecast')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('forecast')
export class ForecastController {
  constructor(
    private readonly forecastService: ForecastService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('latest')
  @ApiOperation({ summary: 'Latest forecast snapshot for the current user' })
  @ApiResponse({ status: 200, description: 'Full computed month series + per-goal outcomes.' })
  @ApiResponse({ status: 404, description: 'NO_SNAPSHOT_YET' })
  async getLatest(@CurrentUser() user: AuthenticatedUser) {
    const [snapshot, freshness, goals] = await Promise.all([
      this.forecastService.getLatest(user.id),
      this.forecastService.isStale(user.id),
      this.prisma.goal.findMany({ where: { userId: user.id, status: { not: 'archived' } } }),
    ]);
    if (!snapshot) {
      throw DomainErrors.noSnapshotYet();
    }
    const goalsMeta = goals.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmountMinor: g.targetAmountMinor,
    }));
    return mapForecastResponse(snapshot, goalsMeta, freshness.stale);
  }

  @Get('freshness')
  @ApiOperation({ summary: 'Cheap staleness indicator for client polling' })
  async getFreshness(@CurrentUser() user: AuthenticatedUser) {
    const freshness = await this.forecastService.isStale(user.id);
    return {
      stale: freshness.stale,
      pendingEvents: freshness.pendingEvents,
      lastSnapshotAt: freshness.lastSnapshotAt ? freshness.lastSnapshotAt.toISOString() : null,
    };
  }
}
