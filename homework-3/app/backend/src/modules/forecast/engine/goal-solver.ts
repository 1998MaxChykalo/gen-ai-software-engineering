/**
 * Goal completion solver (specification.md Task 11).
 *
 * Pure function: scans a completed month-series for each goal's first
 * "funded >= target" month, classifies the outcome, and never throws for a
 * domain state — unreachable goals are a valid, typed result.
 */
import { ZERO_CENTS, type Cents } from './money';
import { monthsBetween } from './month-math';
import type { GoalOutcome, GoalPlanInput, MonthState } from './types';

function percentComplete(fundedMinor: Cents, targetMinor: Cents): string {
  if (targetMinor <= ZERO_CENTS) return '100.0';
  // Integer-safe percentage to one decimal place: (funded * 1000 / target) / 10.
  const scaled = (fundedMinor * 1000n) / targetMinor;
  const clamped = scaled > 1000n ? 1000n : scaled;
  const whole = clamped / 10n;
  const tenth = clamped % 10n;
  return `${whole}.${tenth}`;
}

export function solveGoalCompletion(
  projection: readonly MonthState[],
  goals: readonly GoalPlanInput[],
): GoalOutcome[] {
  return goals.map((goal) => {
    // Progress is always reported as of the evaluation date (first projected
    // month), not as of the completion month — a goal completing years out
    // must not show 100% today.
    const fundedMinor =
      projection.length > 0 ? (projection[0].goalFunded[goal.id] ?? ZERO_CENTS) : ZERO_CENTS;

    if (goal.status === 'paused') {
      return {
        goalId: goal.id,
        completionMonth: null,
        completionMonthIndex: null,
        status: 'paused',
        monthsLate: null,
        fundedMinor,
        percentComplete: percentComplete(fundedMinor, goal.targetAmountMinor),
      };
    }

    const completedState = projection.find(
      (state) => (state.goalFunded[goal.id] ?? ZERO_CENTS) >= goal.targetAmountMinor,
    );

    if (completedState) {
      let status: GoalOutcome['status'] = 'on_track';
      let monthsLate: number | null = null;
      if (goal.targetMonth) {
        const delta = monthsBetween(goal.targetMonth, completedState.month);
        if (delta > 0) {
          status = 'late';
          monthsLate = delta;
        }
      }
      return {
        goalId: goal.id,
        completionMonth: completedState.month,
        completionMonthIndex: completedState.monthIndex,
        status,
        monthsLate,
        fundedMinor,
        percentComplete: percentComplete(fundedMinor, goal.targetAmountMinor),
      };
    }

    // Not completed within the projected horizon.
    const lastState = projection[projection.length - 1];
    const permanentlyNegativeCashFlow = lastState ? lastState.cashFlowMinor < ZERO_CENTS : false;
    return {
      goalId: goal.id,
      completionMonth: null,
      completionMonthIndex: null,
      status: permanentlyNegativeCashFlow ? 'unreachable' : 'unreachable_within_horizon',
      monthsLate: null,
      fundedMinor,
      percentComplete: percentComplete(fundedMinor, goal.targetAmountMinor),
    };
  });
}
