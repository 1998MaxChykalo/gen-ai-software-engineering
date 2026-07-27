/**
 * Golden-fixture harness (specification.md Task 14).
 *
 * Loads a persona's JSON input fixture, runs the pure engine at a fixed
 * evaluation month, and either:
 *   - GOLDEN_MODE=update -> (re)writes test/golden/expected/<persona>.json
 *   - otherwise (CI / default) -> byte-compares against the committed file
 *
 * Fixture JSON cannot hold BigInt, so money fields are plain JSON integers
 * (exact integer cents) that this harness converts to BigInt exactly once
 * at load time — the same boundary-conversion pattern used at the DB/DTO
 * boundary elsewhere in the app.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  runProjection,
  solveGoalCompletion,
  aggregateNetWorth,
  ENGINE_VERSION,
} from '../../src/modules/forecast/engine';
import { canonicalInputHash } from '../../src/modules/forecast/input-hash';
import type {
  EngineAsset,
  EngineExpense,
  EngineIncome,
  EngineInputs,
  EngineLiability,
  GoalPlanInput,
} from '../../src/modules/forecast/engine/types';

export interface FixtureGoal {
  id: string;
  targetAmountMinorCents: number;
  targetMonth: string | null;
  priority: number;
  status: 'active' | 'paused';
  contribution: {
    kind: 'one_time' | 'recurring_monthly';
    amountMinorCents: number;
    startMonthIndex: number;
    endMonthIndex: number | null;
  } | null;
}

export interface Fixture {
  persona: string;
  evaluationMonth: string;
  horizonMonths: number;
  incomes: { id: string; kind: 'active' | 'passive'; amountMinorCents: number; annualGrowthRateBps: number }[];
  expenses: { id: string; kind: 'fixed' | 'variable'; amountMinorCents: number }[];
  assets: { id: string; kind: 'cash' | 'investment' | 'real_estate'; valueMinorCents: number; annualReturnRateBps: number }[];
  liabilities: {
    id: string;
    kind: 'loan' | 'mortgage' | 'credit_card';
    balanceMinorCents: number;
    annualInterestRateBps: number;
    monthlyPaymentMinorCents: number;
  }[];
  goals: FixtureGoal[];
  assumptions: { inflationRateBps: number; defaultReturnRateBps: number; incomeGrowthRateBps: number };
}

export function loadFixture(persona: string): Fixture {
  const path = join(__dirname, 'fixtures', `${persona}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as Fixture;
}

export function toEngineInputs(fixture: Fixture): EngineInputs {
  const incomes: EngineIncome[] = fixture.incomes.map((i) => ({
    id: i.id,
    kind: i.kind,
    amountMinor: BigInt(i.amountMinorCents) as never,
    annualGrowthRateBps: i.annualGrowthRateBps,
  }));
  const expenses: EngineExpense[] = fixture.expenses.map((e) => ({
    id: e.id,
    kind: e.kind,
    amountMinor: BigInt(e.amountMinorCents) as never,
  }));
  const assets: EngineAsset[] = fixture.assets.map((a) => ({
    id: a.id,
    kind: a.kind,
    valueMinor: BigInt(a.valueMinorCents) as never,
    annualReturnRateBps: a.annualReturnRateBps,
  }));
  const liabilities: EngineLiability[] = fixture.liabilities.map((l) => ({
    id: l.id,
    kind: l.kind,
    balanceMinor: BigInt(l.balanceMinorCents) as never,
    annualInterestRateBps: l.annualInterestRateBps,
    monthlyPaymentMinor: BigInt(l.monthlyPaymentMinorCents) as never,
  }));
  const goals: GoalPlanInput[] = fixture.goals.map((g) => ({
    id: g.id,
    targetAmountMinor: BigInt(g.targetAmountMinorCents) as never,
    targetMonth: g.targetMonth,
    priority: g.priority,
    status: g.status,
    contribution: g.contribution
      ? {
          kind: g.contribution.kind,
          amountMinor: BigInt(g.contribution.amountMinorCents) as never,
          startMonthIndex: g.contribution.startMonthIndex,
          endMonthIndex: g.contribution.endMonthIndex,
        }
      : null,
  }));

  return {
    evaluationMonth: fixture.evaluationMonth,
    horizonMonths: fixture.horizonMonths,
    incomes,
    expenses,
    assets,
    liabilities,
    goals,
    assumptions: fixture.assumptions,
  };
}

function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export function computeGoldenSnapshot(fixture: Fixture): unknown {
  const inputs = toEngineInputs(fixture);
  const series = runProjection(inputs);
  const goalOutcomes = solveGoalCompletion(series, inputs.goals);

  const months = series.map((state) => {
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

  return {
    persona: fixture.persona,
    engineVersion: ENGINE_VERSION,
    evaluationMonth: inputs.evaluationMonth,
    horizonMonths: inputs.horizonMonths,
    inputHash: canonicalInputHash(inputs),
    goalOutcomes: goalOutcomes.map((o) => ({
      goalId: o.goalId,
      status: o.status,
      completionMonth: o.completionMonth,
      monthsLate: o.monthsLate,
      fundedMinor: o.fundedMinor.toString(),
      percentComplete: o.percentComplete,
    })),
    months,
  };
}

/** Runs the harness for one persona; returns { actual, expected, expectedPath } for the test to assert on. */
export function runGoldenFixture(persona: string): { actual: unknown; expected: unknown; expectedPath: string } {
  const fixture = loadFixture(persona);
  const actual = computeGoldenSnapshot(fixture);
  const expectedPath = join(__dirname, 'expected', `${persona}.json`);

  if (process.env.GOLDEN_MODE === 'update' || !existsSync(expectedPath)) {
    writeFileSync(expectedPath, JSON.stringify(actual, replacer, 2) + '\n');
    // eslint-disable-next-line no-console
    console.warn(`[golden:update] wrote ${expectedPath}`);
  }

  const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));
  return { actual: JSON.parse(JSON.stringify(actual, replacer)), expected, expectedPath };
}
