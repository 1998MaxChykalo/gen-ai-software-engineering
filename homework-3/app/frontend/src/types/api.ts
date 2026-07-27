/**
 * Types mirroring the BINDING HTTP CONTRACT between the Horizon frontend and
 * backend (see homework-3/specification.md and the frontend build brief).
 *
 * All monetary fields are integer euro-cent minor units and are named with a
 * `Minor` suffix. They must never be treated as floating point numbers in the
 * frontend — formatting only, via `formatEurMinor` (see src/utils/money.ts).
 *
 * Percentage rates arrive as decimal strings (e.g. "2.5"), not numbers.
 * Months are "YYYY-MM" strings.
 */

export type Currency = "EUR";

export type IncomeKind = "active" | "passive";
export type ExpenseKind = "fixed" | "variable";
export type AssetKind = "cash" | "investment" | "real_estate";
export type LiabilityKind = "loan" | "mortgage" | "credit_card";

export interface IncomeSource {
  id: string;
  name: string;
  kind: IncomeKind;
  amountMinor: number;
  currency: Currency;
  annualGrowthRatePct: string;
}

export interface Expense {
  id: string;
  name: string;
  kind: ExpenseKind;
  amountMinor: number;
  currency: Currency;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  valueMinor: number;
  currency: Currency;
  annualReturnRatePct: string;
}

export interface Liability {
  id: string;
  name: string;
  kind: LiabilityKind;
  balanceMinor: number;
  currency: Currency;
  annualInterestRatePct: string;
  monthlyPaymentMinor: number;
}

export interface Assumptions {
  inflationRatePct: string;
  defaultReturnRatePct: string;
  incomeGrowthRatePct: string;
}

export interface Profile {
  version: number;
  incomes: IncomeSource[];
  expenses: Expense[];
  assets: Asset[];
  liabilities: Liability[];
  assumptions: Assumptions;
}

/** Same shape as Profile but new rows in each list omit `id`. */
export type ProfileUpdateInput = {
  version: number;
  incomes: Array<Omit<IncomeSource, "id"> & { id?: string }>;
  expenses: Array<Omit<Expense, "id"> & { id?: string }>;
  assets: Array<Omit<Asset, "id"> & { id?: string }>;
  liabilities: Array<Omit<Liability, "id"> & { id?: string }>;
  assumptions: Assumptions;
};

export type GoalType =
  | "house"
  | "car"
  | "emergency_fund"
  | "net_worth"
  | "financial_independence"
  | "retirement"
  | "vacation"
  | "custom";

export type GoalStatus = "active" | "paused" | "achieved" | "overdue" | "archived";

export type ContributionKind = "one_time" | "recurring_monthly";

export interface GoalContribution {
  kind: ContributionKind;
  amountMinor: number;
  startMonth: string;
  endMonth: string | null;
}

export type GoalOutcome = "on_track" | "late" | "unreachable" | "unreachable_within_horizon";

export interface GoalProgress {
  fundedMinor: number;
  percentComplete: string;
  projectedCompletionMonth: string | null;
  outcome: GoalOutcome;
  monthsLate: number | null;
  stale: boolean;
}

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  targetAmountMinor: number;
  targetMonth: string | null;
  priority: number;
  status: GoalStatus;
  contribution: GoalContribution | null;
  progress: GoalProgress | null;
}

export interface GoalsPage {
  items: Goal[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreateGoalInput {
  name: string;
  type: GoalType;
  targetAmountMinor: number;
  targetMonth?: string;
  priority: number;
  contribution?: Omit<GoalContribution, "endMonth"> & { endMonth?: string | null };
}

export interface ForecastMonth {
  month: string;
  netWorthMinor: number;
  cashFlowMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  assetsMinor: number;
  liabilitiesMinor: number;
}

export interface ForecastGoalOutcome {
  goalId: string;
  name: string;
  targetAmountMinor: number;
  outcome: GoalOutcome;
  projectedCompletionMonth: string | null;
  monthsLate: number | null;
  fundedMinor: number;
  percentComplete: string;
}

export interface ForecastResponse {
  snapshotId: string;
  createdAt: string;
  engineVersion: string;
  inputHash: string;
  stale: boolean;
  disclaimer: string;
  assumptions: Assumptions;
  months: ForecastMonth[];
  goals: ForecastGoalOutcome[];
}

export interface FreshnessResponse {
  stale: boolean;
  pendingEvents: number;
  lastSnapshotAt: string | null;
}

export type ScenarioDelta =
  | {
      type: "income_pct_change";
      incomeId: string | null;
      pctChange: string;
      effectiveMonth: string;
    }
  | {
      type: "expense_amount_change";
      expenseId: string;
      newAmountMinor: number;
      effectiveMonth: string;
    }
  | {
      type: "one_time_purchase";
      amountMinor: number;
      month: string;
      fundedFromAssetId: string;
    }
  | {
      type: "invest_cash";
      amountMinor: number;
      month: string;
      fromAssetId: string;
      toAssetId: string;
    }
  | {
      type: "loan_early_payoff";
      liabilityId: string;
      month: string;
    };

export interface GoalDelta {
  goalId: string;
  name: string;
  baselineCompletionMonth: string | null;
  scenarioCompletionMonth: string | null;
  deltaMonths: number | null;
}

export interface ScenarioEvaluationResponse {
  baseline: ForecastResponse;
  scenario: ForecastResponse;
  goalDeltas: GoalDelta[];
}

export type ScenarioStatus = "active" | "invalid";

export interface Scenario {
  id: string;
  name: string;
  deltas: ScenarioDelta[];
  status: ScenarioStatus;
}

export interface ScenariosPage {
  items: Scenario[];
  page: number;
  pageSize: number;
  total: number;
}

/** RFC 7807 problem+json error shape returned by the API on failure. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
}
