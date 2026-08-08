import { runProjection } from '../../../src/modules/forecast/engine/month-step';
import { solveGoalCompletion } from '../../../src/modules/forecast/engine/goal-solver';
import { buildInputs } from './fixtures';
import type { GoalPlanInput } from '../../../src/modules/forecast/engine/types';

describe('solveGoalCompletion', () => {
  it('completes exactly on the target month (on_track)', () => {
    const goals: GoalPlanInput[] = [
      {
        id: 'g1',
        targetAmountMinor: 120000n,
        targetMonth: null,
        priority: 1,
        status: 'active',
        contribution: { kind: 'recurring_monthly', amountMinor: 10000n, startMonthIndex: 0, endMonthIndex: null },
      },
    ];
    const inputs = buildInputs({
      horizonMonths: 24,
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 300000n, annualGrowthRateBps: 0 }],
      goals,
    });
    const series = runProjection(inputs);
    const [outcome] = solveGoalCompletion(series, goals);
    expect(outcome.status).toBe('on_track');
    expect(outcome.completionMonth).toBe('2026-12'); // 12 * 10000 = 120000, completes month index 11
  });

  it('flags a goal completing after its target month as late', () => {
    const goals: GoalPlanInput[] = [
      {
        id: 'g1',
        targetAmountMinor: 120000n,
        targetMonth: '2026-06',
        priority: 1,
        status: 'active',
        contribution: { kind: 'recurring_monthly', amountMinor: 10000n, startMonthIndex: 0, endMonthIndex: null },
      },
    ];
    const inputs = buildInputs({
      horizonMonths: 24,
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 300000n, annualGrowthRateBps: 0 }],
      goals,
    });
    const series = runProjection(inputs);
    const [outcome] = solveGoalCompletion(series, goals);
    expect(outcome.status).toBe('late');
    expect(outcome.monthsLate).toBeGreaterThan(0);
  });

  it('flags a goal as unreachable_within_horizon when cash flow is positive but insufficient', () => {
    const goals: GoalPlanInput[] = [
      { id: 'g1', targetAmountMinor: 100000000n, targetMonth: null, priority: 1, status: 'active', contribution: null },
    ];
    const inputs = buildInputs({
      horizonMonths: 12,
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 300000n, annualGrowthRateBps: 0 }],
      expenses: [{ id: 'exp-1', kind: 'fixed', amountMinor: 290000n }],
      goals,
    });
    const series = runProjection(inputs);
    const [outcome] = solveGoalCompletion(series, goals);
    expect(outcome.status).toBe('unreachable_within_horizon');
  });

  it('flags a goal as unreachable when cash flow is permanently negative', () => {
    const goals: GoalPlanInput[] = [
      { id: 'g1', targetAmountMinor: 100000n, targetMonth: null, priority: 1, status: 'active', contribution: null },
    ];
    const inputs = buildInputs({
      horizonMonths: 12,
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 100000n, annualGrowthRateBps: 0 }],
      expenses: [{ id: 'exp-1', kind: 'fixed', amountMinor: 500000n }],
      goals,
    });
    const series = runProjection(inputs);
    const [outcome] = solveGoalCompletion(series, goals);
    expect(outcome.status).toBe('unreachable');
  });

  it('reports a pre-funded (zero target) goal as on_track at month 0', () => {
    const goals: GoalPlanInput[] = [
      { id: 'g1', targetAmountMinor: 0n, targetMonth: null, priority: 1, status: 'active', contribution: null },
    ];
    const inputs = buildInputs({ horizonMonths: 6, goals });
    const series = runProjection(inputs);
    const [outcome] = solveGoalCompletion(series, goals);
    expect(outcome.status).toBe('on_track');
    expect(outcome.completionMonth).toBe('2026-01');
  });

  it('skips paused goals, echoing status paused with a frozen funded balance', () => {
    const goals: GoalPlanInput[] = [
      { id: 'g1', targetAmountMinor: 50000n, targetMonth: null, priority: 1, status: 'paused', contribution: null },
    ];
    const inputs = buildInputs({ horizonMonths: 6, goals });
    const series = runProjection(inputs);
    const [outcome] = solveGoalCompletion(series, goals);
    expect(outcome.status).toBe('paused');
    expect(outcome.fundedMinor).toBe(0n);
  });

  it('monotonicity: increasing monthly allocation never delays completion', () => {
    const build = (amount: bigint) => {
      const goals: GoalPlanInput[] = [
        {
          id: 'g1',
          targetAmountMinor: 120000n,
          targetMonth: null,
          priority: 1,
          status: 'active',
          contribution: { kind: 'recurring_monthly', amountMinor: amount, startMonthIndex: 0, endMonthIndex: null },
        },
      ];
      const inputs = buildInputs({
        horizonMonths: 60,
        incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 300000n, annualGrowthRateBps: 0 }],
        goals,
      });
      const series = runProjection(inputs);
      return solveGoalCompletion(series, goals)[0];
    };
    const slow = build(5000n);
    const fast = build(20000n);
    expect(fast.completionMonthIndex).not.toBeNull();
    expect(slow.completionMonthIndex).not.toBeNull();
    expect(fast.completionMonthIndex as number).toBeLessThanOrEqual(slow.completionMonthIndex as number);
  });
});
