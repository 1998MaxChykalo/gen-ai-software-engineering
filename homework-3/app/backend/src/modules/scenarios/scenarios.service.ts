import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { uuid7 } from '../../common/ids/uuid7';
import { DomainErrors } from '../../common/errors/domain-error';
import { AuditService } from '../audit/audit.service';
import { ScenarioEvaluationService } from './scenario-evaluation.service';

const MAX_SAVED_SCENARIOS = 20;

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly scenarioEvaluationService: ScenarioEvaluationService,
  ) {}

  async evaluateAdHoc(userId: string, rawDeltas: Record<string, unknown>[]) {
    return this.scenarioEvaluationService.evaluate(userId, rawDeltas);
  }

  async create(userId: string, name: string, rawDeltas: Record<string, unknown>[]) {
    const count = await this.prisma.scenario.count({
      where: { userId, status: { not: 'archived' } },
    });
    if (count >= MAX_SAVED_SCENARIOS) {
      throw DomainErrors.scenarioLimitExceeded(MAX_SAVED_SCENARIOS);
    }

    // Validates shape + entity references up front (Task 18).
    await this.scenarioEvaluationService.evaluate(userId, rawDeltas);

    const id = uuid7();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.scenario.create({
        data: { id, userId, name, deltas: JSON.stringify(rawDeltas), status: 'active' },
      });
      await this.auditService.record(tx, {
        actorId: userId,
        actorRole: 'user',
        entityType: 'Scenario',
        entityId: id,
        action: 'SCENARIO_SAVED',
        after: { name },
      });
      return row;
    });

    return {
      id: created.id,
      name: created.name,
      deltas: rawDeltas,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async list(userId: string, page: number, pageSize: number) {
    const [total, rows] = await Promise.all([
      this.prisma.scenario.count({ where: { userId, status: { not: 'archived' } } }),
      this.prisma.scenario.findMany({
        where: { userId, status: { not: 'archived' } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        deltas: JSON.parse(r.deltas) as Record<string, unknown>[],
        createdAt: r.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  async evaluateSaved(userId: string, scenarioId: string) {
    const scenario = await this.prisma.scenario.findFirst({
      where: { id: scenarioId, userId, status: { not: 'archived' } },
    });
    if (!scenario) {
      throw DomainErrors.scenarioNotFound();
    }
    const deltas = JSON.parse(scenario.deltas) as Record<string, unknown>[];

    try {
      return await this.scenarioEvaluationService.evaluate(userId, deltas);
    } catch (err) {
      await this.prisma.scenario.update({ where: { id: scenarioId }, data: { status: 'invalid' } });
      throw err;
    }
  }

  async archive(userId: string, scenarioId: string): Promise<void> {
    const scenario = await this.prisma.scenario.findFirst({ where: { id: scenarioId, userId } });
    if (!scenario) {
      throw DomainErrors.scenarioNotFound();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scenario.update({ where: { id: scenarioId }, data: { status: 'archived' } });
      await this.auditService.record(tx, {
        actorId: userId,
        actorRole: 'user',
        entityType: 'Scenario',
        entityId: scenarioId,
        action: 'SCENARIO_ARCHIVED',
        before: { status: scenario.status },
        after: { status: 'archived' },
      });
    });
  }
}
