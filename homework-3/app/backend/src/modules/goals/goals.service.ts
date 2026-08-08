import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { uuid7 } from '../../common/ids/uuid7';
import { DomainErrors } from '../../common/errors/domain-error';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../forecast/outbox/outbox.service';
import { ForecastDispatcherService } from '../forecast/dispatcher/forecast-dispatcher.service';
import { ForecastService } from '../forecast/forecast.service';
import { currentEvaluationMonth } from '../forecast/current-month';
import { buildEngineInputs } from '../forecast/engine-inputs.mapper';
import { runProjection, monthsBetween, MAX_HORIZON_MONTHS } from '../forecast/engine';
import { mapForecastResponse, type GoalMeta } from '../forecast/forecast-response.mapper';
import { assertUserTransition, type GoalStatus } from './goal-state.machine';
import type { CreateGoalDto, UpdateGoalDto } from './dto/goal.dto';

const MAX_ACTIVE_GOALS = 10;

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly dispatcher: ForecastDispatcherService,
    private readonly forecastService: ForecastService,
  ) {}

  async list(userId: string, page: number, pageSize: number) {
    const evaluationMonth = currentEvaluationMonth();
    const [total, goals, snapshot, freshness] = await Promise.all([
      this.prisma.goal.count({ where: { userId, status: { not: 'archived' } } }),
      this.prisma.goal.findMany({
        where: { userId, status: { not: 'archived' } },
        include: { contribution: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.forecastService.getLatest(userId),
      this.forecastService.isStale(userId),
    ]);

    const goalsMeta: GoalMeta[] = goals.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmountMinor: g.targetAmountMinor,
    }));
    const forecastResponse = snapshot
      ? mapForecastResponse(snapshot, goalsMeta, freshness.stale)
      : null;
    const progressByGoalId = new Map((forecastResponse?.goals ?? []).map((g) => [g.goalId, g]));

    void evaluationMonth;

    return {
      items: goals.map((g) => {
        const progress = progressByGoalId.get(g.id);
        return {
          id: g.id,
          name: g.name,
          type: g.type,
          targetAmountMinor: Number(g.targetAmountMinor),
          targetMonth: g.targetMonth,
          priority: g.priority,
          status: g.status,
          contribution: g.contribution
            ? {
                kind: g.contribution.kind,
                amountMinor: Number(g.contribution.amountMinor),
                startMonth: g.contribution.startMonth,
                endMonth: g.contribution.endMonth,
              }
            : null,
          progress: progress
            ? {
                fundedMinor: progress.fundedMinor,
                percentComplete: progress.percentComplete,
                projectedCompletionMonth: progress.projectedCompletionMonth,
                outcome: progress.outcome,
                monthsLate: progress.monthsLate,
                stale: freshness.stale,
              }
            : null,
        };
      }),
      page,
      pageSize,
      total,
    };
  }

  async create(userId: string, dto: CreateGoalDto) {
    const evaluationMonth = currentEvaluationMonth();
    this.validateTargetMonth(dto.targetMonth, evaluationMonth);

    const activeCount = await this.prisma.goal.count({ where: { userId, status: 'active' } });
    if (activeCount >= MAX_ACTIVE_GOALS) {
      throw DomainErrors.goalLimitExceeded(MAX_ACTIVE_GOALS);
    }

    if (dto.contribution?.kind === 'recurring_monthly' && !dto.contribution.allowDeficit) {
      await this.assertContributionAffordable(
        userId,
        evaluationMonth,
        dto.contribution.amountMinor,
        null,
      );
    }

    const goalId = uuid7();
    await this.prisma.$transaction(async (tx) => {
      await tx.goal.create({
        data: {
          id: goalId,
          userId,
          name: dto.name,
          type: dto.type,
          targetAmountMinor: BigInt(dto.targetAmountMinor),
          targetMonth: dto.targetMonth ?? null,
          priority: dto.priority,
          status: 'active',
        },
      });
      if (dto.contribution) {
        await tx.goalContribution.create({
          data: {
            id: uuid7(),
            goalId,
            kind: dto.contribution.kind,
            amountMinor: BigInt(dto.contribution.amountMinor),
            startMonth: dto.contribution.startMonth,
            endMonth: dto.contribution.endMonth ?? null,
            allowDeficit: dto.contribution.allowDeficit ?? false,
          },
        });
      }
      await this.auditService.record(tx, {
        actorId: userId,
        actorRole: 'user',
        entityType: 'Goal',
        entityId: goalId,
        action: 'GOAL_CREATED',
        after: { name: dto.name, type: dto.type, priority: dto.priority },
      });
      await this.outboxService.writeEvent(tx, {
        userId,
        aggregateType: 'Goal',
        aggregateId: goalId,
        eventType: 'GOAL_CHANGED',
      });
    });

    await this.dispatcher.processForUser(userId);
    return this.getOne(userId, goalId);
  }

  async update(userId: string, goalId: string, dto: UpdateGoalDto) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      include: { contribution: true },
    });
    if (!goal) {
      throw DomainErrors.notFound('Goal');
    }

    const evaluationMonth = currentEvaluationMonth();
    if (dto.targetMonth !== undefined) {
      this.validateTargetMonth(dto.targetMonth, evaluationMonth);
    }
    if (dto.status) {
      assertUserTransition(goal.status as GoalStatus, dto.status);
    }
    if (
      dto.contribution &&
      dto.contribution.kind === 'recurring_monthly' &&
      !dto.contribution.allowDeficit
    ) {
      await this.assertContributionAffordable(
        userId,
        evaluationMonth,
        dto.contribution.amountMinor,
        goalId,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.goal.update({
        where: { id: goalId },
        data: {
          name: dto.name ?? undefined,
          type: dto.type ?? undefined,
          targetAmountMinor:
            dto.targetAmountMinor !== undefined ? BigInt(dto.targetAmountMinor) : undefined,
          targetMonth: dto.targetMonth !== undefined ? dto.targetMonth : undefined,
          priority: dto.priority ?? undefined,
          status: dto.status ?? undefined,
          version: { increment: 1 },
        },
      });

      if (dto.contribution !== undefined) {
        if (dto.contribution === null) {
          await tx.goalContribution.deleteMany({ where: { goalId } });
        } else {
          await tx.goalContribution.upsert({
            where: { goalId },
            create: {
              id: uuid7(),
              goalId,
              kind: dto.contribution.kind,
              amountMinor: BigInt(dto.contribution.amountMinor),
              startMonth: dto.contribution.startMonth,
              endMonth: dto.contribution.endMonth ?? null,
              allowDeficit: dto.contribution.allowDeficit ?? false,
            },
            update: {
              kind: dto.contribution.kind,
              amountMinor: BigInt(dto.contribution.amountMinor),
              startMonth: dto.contribution.startMonth,
              endMonth: dto.contribution.endMonth ?? null,
              allowDeficit: dto.contribution.allowDeficit ?? false,
            },
          });
        }
      }

      await this.auditService.record(tx, {
        actorId: userId,
        actorRole: 'user',
        entityType: 'Goal',
        entityId: goalId,
        action: 'GOAL_UPDATED',
        before: { status: goal.status, priority: goal.priority },
        after: { status: dto.status ?? goal.status, priority: dto.priority ?? goal.priority },
      });
      await this.outboxService.writeEvent(tx, {
        userId,
        aggregateType: 'Goal',
        aggregateId: goalId,
        eventType: 'GOAL_CHANGED',
      });
    });

    await this.dispatcher.processForUser(userId);
    return this.getOne(userId, goalId);
  }

  async archive(userId: string, goalId: string): Promise<void> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) {
      throw DomainErrors.notFound('Goal');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.goal.update({
        where: { id: goalId },
        data: { status: 'archived', version: { increment: 1 } },
      });
      await this.auditService.record(tx, {
        actorId: userId,
        actorRole: 'user',
        entityType: 'Goal',
        entityId: goalId,
        action: 'GOAL_ARCHIVED',
        before: { status: goal.status },
        after: { status: 'archived' },
      });
      await this.outboxService.writeEvent(tx, {
        userId,
        aggregateType: 'Goal',
        aggregateId: goalId,
        eventType: 'GOAL_CHANGED',
      });
    });

    await this.dispatcher.processForUser(userId);
  }

  private async getOne(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      include: { contribution: true },
    });
    if (!goal) throw DomainErrors.notFound('Goal');

    const snapshot = await this.forecastService.getLatest(userId);
    const freshness = await this.forecastService.isStale(userId);
    const progress = snapshot
      ? mapForecastResponse(
          snapshot,
          [{ id: goal.id, name: goal.name, targetAmountMinor: goal.targetAmountMinor }],
          freshness.stale,
        ).goals[0]
      : undefined;

    return {
      id: goal.id,
      name: goal.name,
      type: goal.type,
      targetAmountMinor: Number(goal.targetAmountMinor),
      targetMonth: goal.targetMonth,
      priority: goal.priority,
      status: goal.status,
      contribution: goal.contribution
        ? {
            kind: goal.contribution.kind,
            amountMinor: Number(goal.contribution.amountMinor),
            startMonth: goal.contribution.startMonth,
            endMonth: goal.contribution.endMonth,
          }
        : null,
      progress: progress
        ? {
            fundedMinor: progress.fundedMinor,
            percentComplete: progress.percentComplete,
            projectedCompletionMonth: progress.projectedCompletionMonth,
            outcome: progress.outcome,
            monthsLate: progress.monthsLate,
            stale: freshness.stale,
          }
        : null,
    };
  }

  private validateTargetMonth(targetMonth: string | undefined, evaluationMonth: string): void {
    if (!targetMonth) return;
    const delta = monthsBetween(evaluationMonth, targetMonth);
    if (delta < 0) {
      throw DomainErrors.goalTargetInPast();
    }
    if (delta > MAX_HORIZON_MONTHS) {
      throw DomainErrors.forecastHorizonExceeded(MAX_HORIZON_MONTHS);
    }
  }

  private async assertContributionAffordable(
    userId: string,
    evaluationMonth: string,
    newAmountMinor: number,
    excludeGoalId: string | null,
  ): Promise<void> {
    const inputs = await buildEngineInputs(this.prisma, userId, evaluationMonth, 1);
    const [firstMonth] = runProjection({ ...inputs, horizonMonths: 1 });
    const freeCashFlowMinor = firstMonth.cashFlowMinor;

    const otherActiveGoals = await this.prisma.goal.findMany({
      where: { userId, status: 'active', id: excludeGoalId ? { not: excludeGoalId } : undefined },
      include: { contribution: true },
    });
    let committed = 0n;
    for (const g of otherActiveGoals) {
      if (g.contribution?.kind === 'recurring_monthly') {
        committed += g.contribution.amountMinor;
      }
    }

    const available = freeCashFlowMinor - committed;
    if (BigInt(newAmountMinor) > available) {
      throw DomainErrors.contributionExceedsFreeCashFlow(available > 0n ? available : 0n);
    }
  }
}
