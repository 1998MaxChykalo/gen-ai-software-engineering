/**
 * Engine-internal types (specification.md Task 10/11/12).
 *
 * These types are engine-local. Every money field is `Cents` (bigint brand);
 * every rate is expressed as integer basis points (never a float) at the
 * input boundary, converted to `Decimal` internally by money.ts helpers.
 */
import type { Cents } from './money';

export type IncomeKind = 'active' | 'passive';
export type ExpenseKind = 'fixed' | 'variable';
export type AssetKind = 'cash' | 'investment' | 'real_estate';
export type LiabilityKind = 'loan' | 'mortgage' | 'credit_card';
export type ContributionKind = 'one_time' | 'recurring_monthly';
export type GoalRuntimeStatus = 'active' | 'paused';

export interface EngineIncome {
  readonly id: string;
  readonly kind: IncomeKind;
  readonly amountMinor: Cents;
  readonly annualGrowthRateBps: number;
}

export interface EngineExpense {
  readonly id: string;
  readonly kind: ExpenseKind;
  readonly amountMinor: Cents;
}

export interface EngineAsset {
  readonly id: string;
  readonly kind: AssetKind;
  readonly valueMinor: Cents;
  readonly annualReturnRateBps: number;
}

export interface EngineLiability {
  readonly id: string;
  readonly kind: LiabilityKind;
  readonly balanceMinor: Cents;
  readonly annualInterestRateBps: number;
  readonly monthlyPaymentMinor: Cents;
}

export interface EngineContribution {
  readonly kind: ContributionKind;
  readonly amountMinor: Cents;
  /** Month index (0-based, relative to evaluationMonth) the contribution starts. */
  readonly startMonthIndex: number;
  /** Month index (inclusive) the contribution ends, or null = no end (until horizon). */
  readonly endMonthIndex: number | null;
}

export interface GoalPlanInput {
  readonly id: string;
  readonly targetAmountMinor: Cents;
  /** "YYYY-MM", or null when the user set no target date. */
  readonly targetMonth: string | null;
  readonly priority: number;
  readonly status: GoalRuntimeStatus;
  readonly contribution: EngineContribution | null;
}

export interface EngineAssumptions {
  readonly inflationRateBps: number;
  readonly defaultReturnRateBps: number;
  readonly incomeGrowthRateBps: number;
}

export interface EngineInputs {
  /** First projected month, e.g. "2026-01". Purely a label; all math uses monthIndex. */
  readonly evaluationMonth: string;
  /** Number of months to project, 1..720. */
  readonly horizonMonths: number;
  readonly incomes: readonly EngineIncome[];
  readonly expenses: readonly EngineExpense[];
  readonly assets: readonly EngineAsset[];
  readonly liabilities: readonly EngineLiability[];
  readonly goals: readonly GoalPlanInput[];
  readonly assumptions: EngineAssumptions;
}

/** Immutable per-month projection state. */
export interface MonthState {
  readonly monthIndex: number;
  readonly month: string;
  readonly assets: Readonly<Record<string, Cents>>;
  /** Static per-asset classification, copied at t=0; asset kinds never change over the projection. */
  readonly assetKinds: Readonly<Record<string, AssetKind>>;
  readonly liabilities: Readonly<Record<string, Cents>>;
  readonly goalFunded: Readonly<Record<string, Cents>>;
  readonly incomeMinor: Cents;
  readonly passiveIncomeMinor: Cents;
  readonly expensesMinor: Cents;
  readonly liabilityPaymentsMinor: Cents;
  readonly interestAccruedMinor: Cents;
  readonly assetReturnsMinor: Cents;
  readonly cashFlowMinor: Cents;
  readonly deficitMinor: Cents;
}

export type GoalOutcomeStatus =
  'on_track' | 'late' | 'unreachable' | 'unreachable_within_horizon' | 'paused';

export interface GoalOutcome {
  readonly goalId: string;
  readonly completionMonth: string | null;
  readonly completionMonthIndex: number | null;
  readonly status: GoalOutcomeStatus;
  readonly monthsLate: number | null;
  readonly fundedMinor: Cents;
  /** Percent complete as a decimal string, e.g. "42.5". */
  readonly percentComplete: string;
}

export interface NetWorthBreakdown {
  readonly cashMinor: Cents;
  readonly investmentsMinor: Cents;
  readonly realEstateMinor: Cents;
  readonly totalAssetsMinor: Cents;
  readonly totalLiabilitiesMinor: Cents;
  readonly netWorthMinor: Cents;
  readonly incomeMinor: Cents;
  readonly expensesMinor: Cents;
  readonly passiveIncomeMinor: Cents;
  readonly savingsMinor: Cents;
  /** Basis points, integer, guarded against divide-by-zero. */
  readonly savingsRateBps: number;
}
