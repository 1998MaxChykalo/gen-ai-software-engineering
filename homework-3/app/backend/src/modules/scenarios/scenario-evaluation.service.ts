import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainErrors } from '../../common/errors/domain-error';
import { buildEngineInputs } from '../forecast/engine-inputs.mapper';
import { currentEvaluationMonth } from '../forecast/current-month';
import { computeEphemeralSnapshot } from '../forecast/ephemeral-snapshot';
import { mapForecastResponse, type GoalMeta } from '../forecast/forecast-response.mapper';
import { DEFAULT_HORIZON_MONTHS, monthsBetween } from '../forecast/engine';
import { applyDeltasToInputs } from './engine-overlay/apply-deltas';
import { validateDeltas, type ScenarioDelta } from './scenario-delta.types';

@Injectable()
export class ScenarioEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ad-hoc, synchronous, never-persisted scenario evaluation (Task 19):
   * loads the same inputs `ForecastService.runForecast` would, applies the
   * deltas as a pure in-memory overlay, and returns baseline vs. scenario.
   */
  async evaluate(userId: string, rawDeltas: Record<string, unknown>[]) {
    let deltas: ScenarioDelta[];
    try {
      deltas = validateDeltas(rawDeltas);
    } catch (err) {
      throw DomainErrors.validation(err instanceof Error ? err.message : 'Invalid scenario deltas');
    }

    const evaluationMonth = currentEvaluationMonth();
    const baselineInputs = await buildEngineInputs(
      this.prisma,
      userId,
      evaluationMonth,
      DEFAULT_HORIZON_MONTHS,
    );

    await this.assertReferencesExist(userId, deltas);

    const scenarioInputs = applyDeltasToInputs(baselineInputs, deltas);

    const [goals] = await Promise.all([
      this.prisma.goal.findMany({ where: { userId, status: { not: 'archived' } } }),
    ]);
    const goalsMeta: GoalMeta[] = goals.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmountMinor: g.targetAmountMinor,
    }));

    const baselineSnapshot = computeEphemeralSnapshot(userId, baselineInputs);
    const scenarioSnapshot = computeEphemeralSnapshot(userId, scenarioInputs);

    const baseline = mapForecastResponse(baselineSnapshot, goalsMeta, false);
    const scenario = mapForecastResponse(scenarioSnapshot, goalsMeta, false);

    const goalDeltas = baseline.goals.map((baselineGoal) => {
      const scenarioGoal = scenario.goals.find((g) => g.goalId === baselineGoal.goalId);
      const baselineCompletionMonth = baselineGoal.projectedCompletionMonth;
      const scenarioCompletionMonth = scenarioGoal?.projectedCompletionMonth ?? null;
      const deltaMonths =
        baselineCompletionMonth && scenarioCompletionMonth
          ? monthsBetween(baselineCompletionMonth, scenarioCompletionMonth)
          : null;
      return {
        goalId: baselineGoal.goalId,
        name: baselineGoal.name,
        baselineCompletionMonth,
        scenarioCompletionMonth,
        deltaMonths,
      };
    });

    return { baseline, scenario, goalDeltas };
  }

  private async assertReferencesExist(userId: string, deltas: ScenarioDelta[]): Promise<void> {
    const [incomes, expenses, assets, liabilities] = await Promise.all([
      this.prisma.incomeSource.findMany({
        where: { userId, archivedAt: null },
        select: { id: true },
      }),
      this.prisma.expense.findMany({ where: { userId, archivedAt: null }, select: { id: true } }),
      this.prisma.asset.findMany({ where: { userId, archivedAt: null }, select: { id: true } }),
      this.prisma.liability.findMany({ where: { userId, archivedAt: null }, select: { id: true } }),
    ]);
    const incomeIds = new Set(incomes.map((i) => i.id));
    const expenseIds = new Set(expenses.map((e) => e.id));
    const assetIds = new Set(assets.map((a) => a.id));
    const liabilityIds = new Set(liabilities.map((l) => l.id));

    deltas.forEach((delta, index) => {
      switch (delta.type) {
        case 'income_pct_change':
          if (delta.incomeId !== null && !incomeIds.has(delta.incomeId)) {
            throw DomainErrors.scenarioReferencesDeletedEntity(index);
          }
          break;
        case 'expense_amount_change':
          if (!expenseIds.has(delta.expenseId))
            throw DomainErrors.scenarioReferencesDeletedEntity(index);
          break;
        case 'one_time_purchase':
          if (!assetIds.has(delta.fundedFromAssetId))
            throw DomainErrors.scenarioReferencesDeletedEntity(index);
          break;
        case 'invest_cash':
          if (!assetIds.has(delta.fromAssetId) || !assetIds.has(delta.toAssetId)) {
            throw DomainErrors.scenarioReferencesDeletedEntity(index);
          }
          break;
        case 'loan_early_payoff':
          if (!liabilityIds.has(delta.liabilityId))
            throw DomainErrors.scenarioReferencesDeletedEntity(index);
          break;
      }
    });
  }
}
