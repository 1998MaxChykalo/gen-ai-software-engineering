import { bpsToPctString } from '../../common/util/rate';
import { FORECAST_DISCLAIMER } from './forecast.constants';
import type { ParsedSnapshot } from './snapshot-data.types';

export interface GoalMeta {
  id: string;
  name: string;
  targetAmountMinor: bigint;
}

/**
 * The binding HTTP contract's goal outcome enum has exactly four values
 * (on_track|late|unreachable|unreachable_within_horizon) — it has no
 * "paused" state. Paused goals are honestly reported as not currently
 * progressing toward completion, so the closest contract-compatible value
 * is `unreachable_within_horizon` (RESOLVED AMBIGUITY, documented in the
 * backend README: specification.md Task 6 says paused goals keep their
 * funded balance visible but says nothing about the wire `outcome` enum,
 * which has no dedicated slot for "paused").
 */
function toWireOutcome(
  status: string,
): 'on_track' | 'late' | 'unreachable' | 'unreachable_within_horizon' {
  if (status === 'paused') return 'unreachable_within_horizon';
  return status as 'on_track' | 'late' | 'unreachable' | 'unreachable_within_horizon';
}

export function mapForecastResponse(
  snapshot: ParsedSnapshot,
  goalsMeta: GoalMeta[],
  stale: boolean,
) {
  const goalMetaById = new Map(goalsMeta.map((g) => [g.id, g]));

  return {
    snapshotId: snapshot.id,
    createdAt: snapshot.createdAt.toISOString(),
    engineVersion: snapshot.engineVersion,
    inputHash: snapshot.inputHash,
    stale,
    disclaimer: FORECAST_DISCLAIMER,
    assumptions: {
      inflationRatePct: bpsToPctString(snapshot.assumptions.inflationRateBps),
      defaultReturnRatePct: bpsToPctString(snapshot.assumptions.defaultReturnRateBps),
      incomeGrowthRatePct: bpsToPctString(snapshot.assumptions.incomeGrowthRateBps),
    },
    months: snapshot.months.map((m) => ({
      month: m.month,
      netWorthMinor: Number(m.netWorthMinor),
      cashFlowMinor: Number(m.cashFlowMinor),
      incomeMinor: Number(m.incomeMinor),
      expensesMinor: Number(m.expensesMinor),
      assetsMinor: Number(m.assetsMinor),
      liabilitiesMinor: Number(m.liabilitiesMinor),
    })),
    goals: snapshot.goalOutcomes
      .filter((o) => goalMetaById.has(o.goalId))
      .map((o) => {
        const meta = goalMetaById.get(o.goalId)!;
        return {
          goalId: o.goalId,
          name: meta.name,
          targetAmountMinor: Number(meta.targetAmountMinor),
          outcome: toWireOutcome(o.status),
          projectedCompletionMonth: o.completionMonth,
          monthsLate: o.monthsLate,
          fundedMinor: Number(o.fundedMinor),
          percentComplete: o.percentComplete,
        };
      }),
  };
}

export type ForecastResponse = ReturnType<typeof mapForecastResponse>;
