import type {
  Assumptions,
  ForecastGoalOutcome,
  ForecastMonth,
  ForecastResponse,
  Goal,
  GoalOutcome,
  Profile,
} from "../types/api";

/**
 * Seed data for VITE_USE_MOCKS=true. Models a median-family persona (two
 * incomes, a mortgage, three goals) so the app is fully demoable without a
 * backend. Numbers here stand in for what the real forecast engine would
 * compute server-side — per the frontend build brief, "no real math needed,
 * clearly fine for demo." All values are still integer minor units; no
 * floats are used anywhere in this module.
 */

export const DISCLAIMER =
  "This is a projection, not financial advice. It shows what could happen if the assumptions " +
  "below hold — inflation, investment returns, and income growth are estimates, not guarantees. " +
  "Actual results will vary; nothing here is a recommendation to buy, sell, or invest.";

export const DEMO_EMAIL = "demo@horizon.app";
export const DEMO_PASSWORD = "HorizonDemo1!";

export const SEED_ASSUMPTIONS: Assumptions = {
  inflationRatePct: "2.5",
  defaultReturnRatePct: "5.0",
  incomeGrowthRatePct: "2.0",
};

export function buildSeedProfile(): Profile {
  return {
    version: 1,
    incomes: [
      {
        id: "income-salary",
        name: "Primary salary",
        kind: "active",
        amountMinor: 420000,
        currency: "EUR",
        annualGrowthRatePct: "2.5",
      },
      {
        id: "income-rental",
        name: "Rental income",
        kind: "passive",
        amountMinor: 80000,
        currency: "EUR",
        annualGrowthRatePct: "1.0",
      },
    ],
    expenses: [
      {
        id: "expense-groceries",
        name: "Groceries",
        kind: "fixed",
        amountMinor: 60000,
        currency: "EUR",
      },
      {
        id: "expense-utilities",
        name: "Utilities",
        kind: "fixed",
        amountMinor: 25000,
        currency: "EUR",
      },
      {
        id: "expense-insurance",
        name: "Insurance",
        kind: "fixed",
        amountMinor: 15000,
        currency: "EUR",
      },
      {
        id: "expense-dining",
        name: "Dining out",
        kind: "variable",
        amountMinor: 30000,
        currency: "EUR",
      },
      {
        id: "expense-entertainment",
        name: "Entertainment",
        kind: "variable",
        amountMinor: 20000,
        currency: "EUR",
      },
    ],
    assets: [
      {
        id: "asset-cash",
        name: "Emergency & checking cash",
        kind: "cash",
        valueMinor: 1500000,
        currency: "EUR",
        annualReturnRatePct: "1.0",
      },
      {
        id: "asset-investment",
        name: "Investment portfolio",
        kind: "investment",
        valueMinor: 4000000,
        currency: "EUR",
        annualReturnRatePct: "6.0",
      },
      {
        id: "asset-real-estate",
        name: "Family home",
        kind: "real_estate",
        valueMinor: 35000000,
        currency: "EUR",
        annualReturnRatePct: "3.0",
      },
    ],
    liabilities: [
      {
        id: "liability-mortgage",
        name: "Home mortgage",
        kind: "mortgage",
        balanceMinor: 28000000,
        currency: "EUR",
        annualInterestRatePct: "3.2",
        monthlyPaymentMinor: 145000,
      },
    ],
    assumptions: SEED_ASSUMPTIONS,
  };
}

export function buildSeedGoals(): Goal[] {
  return [
    {
      id: "goal-emergency-fund",
      name: "Emergency fund",
      type: "emergency_fund",
      targetAmountMinor: 2000000,
      targetMonth: "2028-01",
      priority: 1,
      status: "active",
      contribution: {
        kind: "recurring_monthly",
        amountMinor: 50000,
        startMonth: "2026-08",
        endMonth: null,
      },
      progress: {
        fundedMinor: 1500000,
        percentComplete: "75.00",
        projectedCompletionMonth: "2027-06",
        outcome: "on_track",
        monthsLate: null,
        stale: false,
      },
    },
    {
      id: "goal-house",
      name: "Bigger house down payment",
      type: "house",
      targetAmountMinor: 6000000,
      targetMonth: "2036-01",
      priority: 2,
      status: "active",
      contribution: {
        kind: "recurring_monthly",
        amountMinor: 30000,
        startMonth: "2026-08",
        endMonth: null,
      },
      progress: {
        fundedMinor: 1200000,
        percentComplete: "20.00",
        projectedCompletionMonth: "2039-11",
        outcome: "late",
        monthsLate: 46,
        stale: false,
      },
    },
    {
      id: "goal-vacation",
      name: "Family vacation",
      type: "vacation",
      targetAmountMinor: 500000,
      targetMonth: "2027-06",
      priority: 3,
      status: "active",
      contribution: {
        kind: "recurring_monthly",
        amountMinor: 20000,
        startMonth: "2026-08",
        endMonth: null,
      },
      progress: {
        fundedMinor: 350000,
        percentComplete: "70.00",
        projectedCompletionMonth: "2027-04",
        outcome: "on_track",
        monthsLate: null,
        stale: false,
      },
    },
  ];
}

/** Adds `delta` months to a "YYYY-MM" string, pure integer arithmetic. */
export function addMonths(month: string, delta: number): string {
  const [yearStr, monthStr] = month.split("-");
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const total = year * 12 + monthIndex + delta;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = ((total % 12) + 12) % 12;
  return `${newYear}-${String(newMonthIndex + 1).padStart(2, "0")}`;
}

const FORECAST_START_MONTH = "2026-08";
const FORECAST_HORIZON_MONTHS = 240; // 20 years, well within the 720-month cap

const OPENING_ASSETS_MINOR = 1500000 + 4000000 + 35000000; // 40,500,000
const OPENING_LIABILITIES_MINOR = 28000000;
const OPENING_INCOME_MINOR = 420000 + 80000; // 500,000
const OPENING_EXPENSES_MINOR = 60000 + 25000 + 15000 + 30000 + 20000 + 145000; // incl. mortgage payment, 295,000

const MONTHLY_LIABILITY_AMORTIZATION_MINOR = 116000;

/**
 * Builds a plausible month-by-month series for the demo persona. This
 * stands in for the real forecast engine (decimal.js, month-step
 * projection) that the backend implements — the mock only needs to look
 * right for screenshots and manual exploration, not be numerically exact.
 */
export function buildMonthSeries(): ForecastMonth[] {
  const months: ForecastMonth[] = [];
  let assetsMinor = OPENING_ASSETS_MINOR;
  let liabilitiesMinor = OPENING_LIABILITIES_MINOR;
  let incomeMinor = OPENING_INCOME_MINOR;
  let expensesMinor = OPENING_EXPENSES_MINOR;

  for (let i = 0; i < FORECAST_HORIZON_MONTHS; i += 1) {
    const month = addMonths(FORECAST_START_MONTH, i);

    if (liabilitiesMinor <= 0) {
      liabilitiesMinor = 0;
      // Once the mortgage is paid off, that payment no longer leaves the
      // household — expenses drop by the (fixed) payment amount once.
      if (i > 0 && months[i - 1].liabilitiesMinor > 0) {
        expensesMinor -= 145000;
      }
    } else {
      liabilitiesMinor = Math.max(0, liabilitiesMinor - MONTHLY_LIABILITY_AMORTIZATION_MINOR);
    }

    const cashFlowMinor = incomeMinor - expensesMinor;
    // Assets grow from reinvested cash flow plus a blended ~5%/yr return,
    // applied monthly (integer rounding, no persisted fractional cents).
    const monthlyReturnMinor = Math.round((assetsMinor * 5) / 1200);
    assetsMinor = assetsMinor + cashFlowMinor + monthlyReturnMinor;

    const netWorthMinor = assetsMinor - liabilitiesMinor;

    months.push({
      month,
      netWorthMinor,
      cashFlowMinor,
      incomeMinor,
      expensesMinor,
      assetsMinor,
      liabilitiesMinor,
    });

    // Modest monthly income growth / inflation, integer rounding once.
    incomeMinor = Math.round((incomeMinor * 1002) / 1000);
    expensesMinor = Math.round((expensesMinor * 10021) / 10000);
  }

  return months;
}

export function buildForecastGoalOutcomes(goals: Goal[]): ForecastGoalOutcome[] {
  return goals
    .filter((goal) => goal.progress !== null)
    .map((goal) => {
      const progress = goal.progress;
      if (!progress) {
        throw new Error(`Goal ${goal.id} has no progress in this mock fixture.`);
      }
      return {
        goalId: goal.id,
        name: goal.name,
        targetAmountMinor: goal.targetAmountMinor,
        outcome: progress.outcome,
        projectedCompletionMonth: progress.projectedCompletionMonth,
        monthsLate: progress.monthsLate,
        fundedMinor: progress.fundedMinor,
        percentComplete: progress.percentComplete,
      };
    });
}

let snapshotCounter = 0;

export function buildForecastResponse(goals: Goal[], stale: boolean): ForecastResponse {
  snapshotCounter += 1;
  return {
    snapshotId: `snapshot-mock-${snapshotCounter}`,
    createdAt: new Date().toISOString(),
    engineVersion: "mock-0.1.0",
    inputHash: `mockhash-${snapshotCounter}`,
    stale,
    disclaimer: DISCLAIMER,
    assumptions: SEED_ASSUMPTIONS,
    months: buildMonthSeries(),
    goals: buildForecastGoalOutcomes(goals),
  };
}

export function outcomeLabel(outcome: GoalOutcome): string {
  switch (outcome) {
    case "on_track":
      return "On track";
    case "late":
      return "Late";
    case "unreachable":
      return "Unreachable";
    case "unreachable_within_horizon":
      return "Beyond 60-year horizon";
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}
