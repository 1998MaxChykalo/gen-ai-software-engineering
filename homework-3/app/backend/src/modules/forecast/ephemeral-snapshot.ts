/**
 * Builds an in-memory, never-persisted "snapshot" from arbitrary engine
 * inputs — used by the scenario simulator (specification.md MLO-5), which
 * must never write to `forecast_snapshots` or mutate the real profile.
 */
import { uuid7 } from '../../common/ids/uuid7';
import { canonicalInputHash } from './input-hash';
import {
  ENGINE_VERSION,
  aggregateNetWorth,
  runProjection,
  solveGoalCompletion,
  type EngineInputs,
} from './engine';
import type {
  ParsedSnapshot,
  SnapshotGoalOutcomeEntry,
  SnapshotMonthEntry,
} from './snapshot-data.types';

export function computeEphemeralSnapshot(userId: string, inputs: EngineInputs): ParsedSnapshot {
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

  return {
    id: uuid7(),
    userId,
    inputHash: canonicalInputHash(inputs),
    engineVersion: ENGINE_VERSION,
    evaluationMonth: inputs.evaluationMonth,
    createdAt: new Date(),
    assumptions: {
      inflationRateBps: inputs.assumptions.inflationRateBps,
      defaultReturnRateBps: inputs.assumptions.defaultReturnRateBps,
      incomeGrowthRateBps: inputs.assumptions.incomeGrowthRateBps,
    },
    months,
    goalOutcomes: goalOutcomeEntries,
  };
}
