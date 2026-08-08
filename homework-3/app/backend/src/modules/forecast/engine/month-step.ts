/**
 * Projection month-step (specification.md Task 10).
 *
 * Normative operation order per month (changing it changes results and is a
 * deliberate golden-file-breaking change):
 *   1. Income (active + passive, annual growth compounded monthly from the
 *      evaluation-month anchor — NOT chained from the previous month's
 *      rounded value, so results stay reproducible regardless of horizon).
 *   2. Expenses (fixed + variable, both inflated monthly from the same
 *      anchor — MVP simplification: the wire `Expense` DTO carries no
 *      per-item "inflation adjusted" flag, so inflation is applied
 *      uniformly to every expense; documented in the backend README).
 *   3. Liability interest accrual + payment (annual/12 simple monthly
 *      interest per the approved engine brief; final payment clamps to the
 *      remaining balance so principal never goes negative).
 *   4. Asset growth (annual return compounded monthly, rate/12... no —
 *      geometric monthly rate derived from the annual rate, applied to
 *      every asset kind including cash, which defaults to a 0% rate).
 *   5. Free cash flow (income − expenses − liability payments) is allocated
 *      to goal `funded` counters via the engine's allocation policy
 *      (./allocation.ts); the *entire* free cash flow (whether allocated to
 *      a goal or left over) is deposited into (or drawn down from) the
 *      designated cash asset — goal funding is a bookkeeping label over the
 *      same money, not a separate pot, which keeps net-worth conservation
 *      exact (see test/unit/engine/month-step.spec.ts).
 *   6. Every stored monetary value is rounded to the cent exactly once via
 *      `toCents` (ROUND_HALF_EVEN).
 *
 * Pure function: no I/O, no Date, no config. Only external import is
 * decimal.js (transitively, via ./money).
 */
import {
  addCents,
  ZERO_CENTS,
  monthlyRateFromAnnualBps,
  linearMonthlyRateFromAnnualBps,
  subCents,
  toCents,
  toDecimal,
  type Cents,
} from './money';
import { addMonthsToLabel } from './month-math';
import { allocateFreeCashFlow, type AllocationGoalInput } from './allocation';
import type { AssetKind, EngineInputs, GoalPlanInput, MonthState } from './types';

const IMPLICIT_CASH_ASSET_ID = '__implicit_cash__';

function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((acc, v) => addCents(acc, v), ZERO_CENTS);
}

/** Picks (or synthesizes) the asset that absorbs free cash flow each month. */
function resolveSinkAssetId(inputs: EngineInputs): string {
  const firstCash = inputs.assets.find((a) => a.kind === 'cash');
  return firstCash ? firstCash.id : IMPLICIT_CASH_ASSET_ID;
}

/** Builds the pre-projection (month -1) opening state directly from engine inputs. */
export function initialState(inputs: EngineInputs): MonthState {
  const assets: Record<string, Cents> = {};
  const assetKinds: Record<string, AssetKind> = {};
  for (const asset of inputs.assets) {
    assets[asset.id] = asset.valueMinor;
    assetKinds[asset.id] = asset.kind;
  }
  const sinkId = resolveSinkAssetId(inputs);
  if (!(sinkId in assets)) {
    assets[sinkId] = ZERO_CENTS;
    assetKinds[sinkId] = 'cash';
  }

  const liabilities: Record<string, Cents> = {};
  for (const liability of inputs.liabilities) {
    liabilities[liability.id] = liability.balanceMinor;
  }

  const goalFunded: Record<string, Cents> = {};
  for (const goal of inputs.goals) {
    goalFunded[goal.id] = ZERO_CENTS;
  }

  return {
    monthIndex: -1,
    month: addMonthsToLabel(inputs.evaluationMonth, -1),
    assets,
    assetKinds,
    liabilities,
    goalFunded,
    incomeMinor: ZERO_CENTS,
    passiveIncomeMinor: ZERO_CENTS,
    expensesMinor: ZERO_CENTS,
    liabilityPaymentsMinor: ZERO_CENTS,
    interestAccruedMinor: ZERO_CENTS,
    assetReturnsMinor: ZERO_CENTS,
    cashFlowMinor: ZERO_CENTS,
    deficitMinor: ZERO_CENTS,
  };
}

function isContributionDue(contribution: GoalPlanInput['contribution'], monthIndex: number): Cents {
  if (!contribution) return ZERO_CENTS;
  if (contribution.kind === 'one_time') {
    return monthIndex === contribution.startMonthIndex ? contribution.amountMinor : ZERO_CENTS;
  }
  // recurring_monthly
  if (monthIndex < contribution.startMonthIndex) return ZERO_CENTS;
  if (contribution.endMonthIndex !== null && monthIndex > contribution.endMonthIndex)
    return ZERO_CENTS;
  return contribution.amountMinor;
}

/**
 * Computes the projection state for `monthIndex` (0-based) given the
 * previous month's closing state (or `initialState` when monthIndex === 0).
 */
export function projectMonth(
  prevState: MonthState,
  inputs: EngineInputs,
  monthIndex: number,
): MonthState {
  // 1. Income.
  const incomeAmounts = inputs.incomes.map((income) => {
    const monthlyRate = monthlyRateFromAnnualBps(income.annualGrowthRateBps);
    const factor = monthlyRate.plus(1).pow(monthIndex);
    return { income, amount: toCents(toDecimal(income.amountMinor).times(factor)) };
  });
  const incomeMinor = sumCents(incomeAmounts.map((a) => a.amount));
  const passiveIncomeMinor = sumCents(
    incomeAmounts.filter((a) => a.income.kind === 'passive').map((a) => a.amount),
  );

  // 2. Expenses (uniformly inflated — see file header).
  const inflationMonthlyRate = monthlyRateFromAnnualBps(inputs.assumptions.inflationRateBps);
  const expensesMinor = sumCents(
    inputs.expenses.map((expense) => {
      const factor = inflationMonthlyRate.plus(1).pow(monthIndex);
      return toCents(toDecimal(expense.amountMinor).times(factor));
    }),
  );

  // 3. Liability interest + payment.
  const liabilities: Record<string, Cents> = {};
  let interestAccruedMinor: Cents = ZERO_CENTS;
  let liabilityPaymentsMinor: Cents = ZERO_CENTS;
  for (const liability of inputs.liabilities) {
    const prevBalance = prevState.liabilities[liability.id] ?? ZERO_CENTS;
    if (prevBalance <= ZERO_CENTS) {
      liabilities[liability.id] = ZERO_CENTS;
      continue;
    }
    const monthlyRate = linearMonthlyRateFromAnnualBps(liability.annualInterestRateBps);
    const interest = toCents(toDecimal(prevBalance).times(monthlyRate));
    const owed = addCents(prevBalance, interest);
    const payment = owed < liability.monthlyPaymentMinor ? owed : liability.monthlyPaymentMinor;
    const newBalance = subCents(owed, payment);
    liabilities[liability.id] = newBalance;
    interestAccruedMinor = addCents(interestAccruedMinor, interest);
    liabilityPaymentsMinor = addCents(liabilityPaymentsMinor, payment);
  }

  // 4. Asset growth.
  const grownAssets: Record<string, Cents> = {};
  let assetReturnsMinor: Cents = ZERO_CENTS;
  for (const [assetId, prevValue] of Object.entries(prevState.assets)) {
    const kind = prevState.assetKinds[assetId];
    const asset = inputs.assets.find((a) => a.id === assetId);
    const annualReturnRateBps = asset ? asset.annualReturnRateBps : 0;
    const monthlyRate = monthlyRateFromAnnualBps(annualReturnRateBps);
    const growth = toCents(toDecimal(prevValue).times(monthlyRate));
    grownAssets[assetId] = addCents(prevValue, growth);
    assetReturnsMinor = addCents(assetReturnsMinor, growth);
    void kind;
  }

  // 5. Free cash flow -> goal allocation + cash sink update.
  const cashFlowMinor = subCents(subCents(incomeMinor, expensesMinor), liabilityPaymentsMinor);

  const activeGoals = inputs.goals.filter((g) => g.status === 'active');
  const allocationInputs: AllocationGoalInput[] = activeGoals.map((goal) => {
    const fundedSoFar = prevState.goalFunded[goal.id] ?? ZERO_CENTS;
    const remainingNeedMinor =
      goal.targetAmountMinor > fundedSoFar
        ? subCents(goal.targetAmountMinor, fundedSoFar)
        : ZERO_CENTS;
    return {
      id: goal.id,
      priority: goal.priority,
      remainingNeedMinor,
      explicitDueMinor: isContributionDue(goal.contribution, monthIndex),
    };
  });
  const { allocations, deficitMinor } = allocateFreeCashFlow(cashFlowMinor, allocationInputs);

  const goalFunded: Record<string, Cents> = {};
  for (const goal of inputs.goals) {
    const prevFunded = prevState.goalFunded[goal.id] ?? ZERO_CENTS;
    if (goal.status === 'paused') {
      goalFunded[goal.id] = prevFunded;
    } else {
      goalFunded[goal.id] = addCents(prevFunded, allocations[goal.id] ?? ZERO_CENTS);
    }
  }

  const sinkId = resolveSinkAssetId(inputs);
  const assets: Record<string, Cents> = { ...grownAssets };
  assets[sinkId] = addCents(assets[sinkId] ?? ZERO_CENTS, cashFlowMinor);

  return {
    monthIndex,
    month: addMonthsToLabel(inputs.evaluationMonth, monthIndex),
    assets,
    assetKinds: prevState.assetKinds,
    liabilities,
    goalFunded,
    incomeMinor,
    passiveIncomeMinor,
    expensesMinor,
    liabilityPaymentsMinor,
    interestAccruedMinor,
    assetReturnsMinor,
    cashFlowMinor,
    deficitMinor,
  };
}

/** Runs the full month-by-month projection, months 0..horizonMonths-1. */
export function runProjection(inputs: EngineInputs): MonthState[] {
  if (inputs.horizonMonths < 1 || inputs.horizonMonths > 720) {
    throw new Error(
      'EngineInputs.horizonMonths must be between 1 and 720 (validated before the engine runs)',
    );
  }
  const series: MonthState[] = [];
  let prev = initialState(inputs);
  for (let i = 0; i < inputs.horizonMonths; i += 1) {
    const next = projectMonth(prev, inputs, i);
    series.push(next);
    prev = next;
  }
  return series;
}
