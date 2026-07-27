import type { EngineInputs } from '../../../src/modules/forecast/engine/types';

/** Minimal-but-complete EngineInputs builder for engine unit tests. */
export function buildInputs(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    evaluationMonth: '2026-01',
    horizonMonths: 12,
    incomes: [],
    expenses: [],
    assets: [],
    liabilities: [],
    goals: [],
    assumptions: {
      inflationRateBps: 200,
      defaultReturnRateBps: 500,
      incomeGrowthRateBps: 250,
    },
    ...overrides,
  };
}
