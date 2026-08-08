import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForecastService } from '../forecast.service';

/**
 * In-process recalculation dispatcher (approved deviation replacing
 * BullMQ/Redis for this environment — see backend README "Deviations").
 *
 * Called right after a profile/goal mutation's transaction commits: reads
 * that user's still-unprocessed outbox rows, runs the (idempotent) forecast
 * computation once, then marks exactly those rows processed. Production
 * would instead have a BullMQ worker poll `outbox_events` with
 * `FOR UPDATE SKIP LOCKED` and coalesce bursts into one job per user.
 */
@Injectable()
export class ForecastDispatcherService {
  private readonly logger = new Logger(ForecastDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecastService: ForecastService,
  ) {}

  async processForUser(userId: string): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { userId, processedAt: null },
      select: { id: true },
    });
    if (pending.length === 0) return;

    await this.forecastService.runForecast(userId);

    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { processedAt: new Date() },
    });

    this.logger.log(`outbox_processed userId=${userId} count=${pending.length}`);
  }
}
