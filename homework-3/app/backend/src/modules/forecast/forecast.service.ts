import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { uuid7 } from '../../common/ids/uuid7';
import { canonicalInputHash } from './input-hash';
import { buildEngineInputs } from './engine-inputs.mapper';
import { currentEvaluationMonth } from './current-month';
import {
  ENGINE_VERSION,
  DEFAULT_HORIZON_MONTHS,
  aggregateNetWorth,
  runProjection,
  solveGoalCompletion,
  monthsBetween,
} from './engine';
import type {
  ParsedSnapshot,
  SnapshotGoalOutcomeEntry,
  SnapshotMonthEntry,
} from './snapshot-data.types';

@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes (or reuses, if the input hash is unchanged) the latest forecast
   * snapshot for a user, and applies system-driven goal status transitions
   * (achieved / overdue) — specification.md Task 13.
   */
  async runForecast(
    userId: string,
    horizonMonths: number = DEFAULT_HORIZON_MONTHS,
  ): Promise<ParsedSnapshot> {
    const evaluationMonth = currentEvaluationMonth();
    const inputs = await buildEngineInputs(this.prisma, userId, evaluationMonth, horizonMonths);
    const inputHash = canonicalInputHash(inputs);

    const existing = await this.prisma.forecastSnapshot.findUnique({
      where: {
        userId_inputHash_engineVersion: { userId, inputHash, engineVersion: ENGINE_VERSION },
      },
    });
    if (existing) {
      return this.parse(existing);
    }

    const series = runProjection(inputs);
    const goalOutcomes = solveGoalCompletion(series, inputs.goals);

    const months: SnapshotMonthEntry[] = series.map((state) => {
      const nw = aggregateNetWorth(state);
      return {
        month: state.month,
        netWorthMinor: nw.netWorthMinor.toString(),
        cashFlowMinor: state.cashFlowMinor.toString(),
        incomeMinor: state.incomeMinor.toString(),
        expensesMinor: state.expensesMinor.toString(),
        assetsMinor: nw.totalAssetsMinor.toString(),
        liabilitiesMinor: nw.totalLiabilitiesMinor.toString(),
      };
    });

    const goalOutcomeEntries: SnapshotGoalOutcomeEntry[] = goalOutcomes.map((o) => ({
      goalId: o.goalId,
      status: o.status,
      completionMonth: o.completionMonth,
      completionMonthIndex: o.completionMonthIndex,
      monthsLate: o.monthsLate,
      fundedMinor: o.fundedMinor.toString(),
      percentComplete: o.percentComplete,
    }));

    const snapshotId = uuid7();
    let created;
    try {
      created = await this.prisma.forecastSnapshot.create({
        data: {
          id: snapshotId,
          userId,
          inputHash,
          engineVersion: ENGINE_VERSION,
          evaluationMonth,
          inputsEcho: JSON.stringify({
            inflationRateBps: inputs.assumptions.inflationRateBps,
            defaultReturnRateBps: inputs.assumptions.defaultReturnRateBps,
            incomeGrowthRateBps: inputs.assumptions.incomeGrowthRateBps,
          }),
          monthSeries: JSON.stringify(months),
          goalOutcomes: JSON.stringify(goalOutcomeEntries),
        },
      });
    } catch (err) {
      // Idempotent race: another concurrent call already persisted the same
      // (userId, inputHash, engineVersion) snapshot — reuse it (Task 13).
      const raced = await this.prisma.forecastSnapshot.findUnique({
        where: {
          userId_inputHash_engineVersion: { userId, inputHash, engineVersion: ENGINE_VERSION },
        },
      });
      if (!raced) throw err;
      created = raced;
    }

    await this.applySystemGoalTransitions(userId, evaluationMonth, goalOutcomeEntries);

    this.logger.log(`forecast_recomputed userId=${userId} snapshotId=${created.id}`);
    return this.parse(created);
  }

  async getLatest(userId: string): Promise<ParsedSnapshot | null> {
    const row = await this.prisma.forecastSnapshot.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.parse(row) : null;
  }

  async isStale(
    userId: string,
  ): Promise<{ stale: boolean; pendingEvents: number; lastSnapshotAt: Date | null }> {
    const [pendingEvents, latest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { userId, processedAt: null } }),
      this.prisma.forecastSnapshot.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      stale: pendingEvents > 0,
      pendingEvents,
      lastSnapshotAt: latest?.createdAt ?? null,
    };
  }

  /**
   * Applies the two system-only goal transitions (Task 6): a goal already
   * funded as of the evaluation month becomes `achieved`; a goal whose
   * target month has already passed without completion becomes `overdue`.
   * Never user-triggerable.
   */
  private async applySystemGoalTransitions(
    userId: string,
    evaluationMonth: string,
    outcomes: SnapshotGoalOutcomeEntry[],
  ): Promise<void> {
    const goals = await this.prisma.goal.findMany({
      where: { userId, status: { in: ['active', 'paused'] } },
    });
    const outcomeByGoalId = new Map(outcomes.map((o) => [o.goalId, o]));

    for (const goal of goals) {
      const outcome = outcomeByGoalId.get(goal.id);
      if (!outcome) continue;

      if (goal.status === 'active' && outcome.completionMonthIndex === 0) {
        await this.prisma.goal.update({ where: { id: goal.id }, data: { status: 'achieved' } });
        continue;
      }
      if (
        goal.status === 'active' &&
        goal.targetMonth &&
        monthsBetween(goal.targetMonth, evaluationMonth) > 0 &&
        outcome.completionMonthIndex !== 0
      ) {
        await this.prisma.goal.update({ where: { id: goal.id }, data: { status: 'overdue' } });
      }
    }
  }

  private parse(row: {
    id: string;
    userId: string;
    inputHash: string;
    engineVersion: string;
    evaluationMonth: string;
    inputsEcho: string;
    monthSeries: string;
    goalOutcomes: string;
    createdAt: Date;
  }): ParsedSnapshot {
    return {
      id: row.id,
      userId: row.userId,
      inputHash: row.inputHash,
      engineVersion: row.engineVersion,
      evaluationMonth: row.evaluationMonth,
      createdAt: row.createdAt,
      assumptions: JSON.parse(row.inputsEcho),
      months: JSON.parse(row.monthSeries),
      goalOutcomes: JSON.parse(row.goalOutcomes),
    };
  }
}
