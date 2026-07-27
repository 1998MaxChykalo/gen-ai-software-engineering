/**
 * fast-check property-based invariants (specification.md MLO-3 / agents.md §5.2):
 * determinism, month-to-month net-worth continuity, monotonic goal progress,
 * horizon bound, and integer-cent exactness.
 */
import fc from 'fast-check';
import { runProjection } from '../../../src/modules/forecast/engine/month-step';
import { aggregateNetWorth } from '../../../src/modules/forecast/engine/net-worth';
import { solveGoalCompletion } from '../../../src/modules/forecast/engine/goal-solver';
import { canonicalInputHash } from '../../../src/modules/forecast/input-hash';
import type { EngineInputs, GoalPlanInput } from '../../../src/modules/forecast/engine/types';

const bpsArb = fc.integer({ min: 0, max: 3000 });
const centsArb = fc.integer({ min: 0, max: 5_000_000 }).map((n) => BigInt(n));

const inputsArb: fc.Arbitrary<EngineInputs> = fc.record({
  horizonMonths: fc.integer({ min: 1, max: 120 }),
  incomeAmount: centsArb,
  incomeGrowthBps: bpsArb,
  expenseAmount: centsArb,
  inflationBps: bpsArb,
  assetValue: centsArb,
  assetReturnBps: bpsArb,
}).map((r) => ({
  evaluationMonth: '2026-01',
  horizonMonths: r.horizonMonths,
  incomes: [{ id: 'inc-1', kind: 'active' as const, amountMinor: r.incomeAmount, annualGrowthRateBps: r.incomeGrowthBps }],
  expenses: [{ id: 'exp-1', kind: 'fixed' as const, amountMinor: r.expenseAmount }],
  assets: [{ id: 'ast-1', kind: 'cash' as const, valueMinor: r.assetValue, annualReturnRateBps: r.assetReturnBps }],
  liabilities: [],
  goals: [] as GoalPlanInput[],
  assumptions: {
    inflationRateBps: r.inflationBps,
    defaultReturnRateBps: 500,
    incomeGrowthRateBps: r.incomeGrowthBps,
  },
}));

describe('engine property-based invariants', () => {
  it('determinism: same input object twice -> deep-equal series and equal input hash', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const a = runProjection(inputs);
        const b = runProjection(inputs);
        expect(a).toEqual(b);
        expect(canonicalInputHash(inputs)).toBe(canonicalInputHash(inputs));
      }),
      { numRuns: 50 },
    );
  });

  it('continuity: each month equals the previous month plus that month\'s modeled flows', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const series = runProjection(inputs);
        let prevNetWorth =
          inputs.assets.reduce((acc, a) => acc + a.valueMinor, 0n) -
          inputs.liabilities.reduce((acc, l) => acc + l.balanceMinor, 0n);
        for (const state of series) {
          const nw = aggregateNetWorth(state);
          const expectedDelta =
            state.incomeMinor - state.expensesMinor - state.interestAccruedMinor + state.assetReturnsMinor;
          expect(nw.netWorthMinor - prevNetWorth).toBe(expectedDelta);
          prevNetWorth = nw.netWorthMinor;
        }
      }),
      { numRuns: 50 },
    );
  });

  it('horizon bound: never emits more than 720 monthly points', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const series = runProjection(inputs);
        expect(series.length).toBeLessThanOrEqual(720);
        expect(series.length).toBe(inputs.horizonMonths);
      }),
      { numRuns: 50 },
    );
  });

  it('exactness: every monetary output is a bigint (integer minor units), never a float', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const series = runProjection(inputs);
        for (const state of series) {
          expect(typeof state.incomeMinor).toBe('bigint');
          expect(typeof state.expensesMinor).toBe('bigint');
          for (const v of Object.values(state.assets)) expect(typeof v).toBe('bigint');
          for (const v of Object.values(state.liabilities)) expect(typeof v).toBe('bigint');
        }
      }),
      { numRuns: 50 },
    );
  });

  it('monotonicity: non-negative recurring contribution + non-negative return never decreases goal progress', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 50000 }).map((n) => BigInt(n)),
        fc.integer({ min: 0, max: 500 }),
        (contributionAmount, returnBps) => {
          const goals: GoalPlanInput[] = [
            {
              id: 'g1',
              targetAmountMinor: 100_000_000n,
              targetMonth: null,
              priority: 1,
              status: 'active',
              contribution: {
                kind: 'recurring_monthly',
                amountMinor: contributionAmount,
                startMonthIndex: 0,
                endMonthIndex: null,
              },
            },
          ];
          const inputs: EngineInputs = {
            evaluationMonth: '2026-01',
            horizonMonths: 36,
            incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 10_000_000n, annualGrowthRateBps: 0 }],
            expenses: [],
            assets: [{ id: 'ast-1', kind: 'investment', valueMinor: 100000n, annualReturnRateBps: returnBps }],
            liabilities: [],
            goals,
            assumptions: { inflationRateBps: 0, defaultReturnRateBps: 500, incomeGrowthRateBps: 0 },
          };
          const series = runProjection(inputs);
          let prevFunded = 0n;
          for (const s of series) {
            const funded = s.goalFunded['g1'];
            expect(funded).toBeGreaterThanOrEqual(prevFunded);
            prevFunded = funded;
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('solveGoalCompletion never throws for any generated input (unreachable is a valid result)', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const goals: GoalPlanInput[] = [
          { id: 'g1', targetAmountMinor: 999_999_999n, targetMonth: null, priority: 1, status: 'active', contribution: null },
        ];
        const withGoals = { ...inputs, goals };
        const series = runProjection(withGoals);
        expect(() => solveGoalCompletion(series, goals)).not.toThrow();
      }),
      { numRuns: 50 },
    );
  });
});
