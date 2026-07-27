import type { HorizonApi } from "./HorizonApi";
import { ApiError } from "./errors";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  addMonths,
  buildForecastResponse,
  buildSeedGoals,
  buildSeedProfile,
} from "./mockData";
import type {
  CreateGoalInput,
  ForecastResponse,
  FreshnessResponse,
  Goal,
  GoalOutcome,
  GoalsPage,
  Profile,
  ProfileUpdateInput,
  Scenario,
  ScenarioDelta,
  ScenarioEvaluationResponse,
  ScenariosPage,
} from "../types/api";

function problem(status: number, title: string, code: string, detail?: string): ApiError {
  return new ApiError({
    type: `https://horizon.app/errors/${code.toLowerCase()}`,
    title,
    status,
    detail,
    code,
  });
}

let nextId = 1;
function generateId(prefix: string): string {
  nextId += 1;
  return `${prefix}-mock-${nextId}`;
}

/**
 * In-memory implementation of HorizonApi for VITE_USE_MOCKS=true / `npm run
 * dev:mock`. State lives for the lifetime of the page; mutations update it
 * plausibly (see mockData.ts) so the whole app is explorable and
 * screenshot-able without the backend running.
 */
class MockHorizonApi implements HorizonApi {
  private profile: Profile = buildSeedProfile();
  private goals: Goal[] = buildSeedGoals();
  private scenarios: Scenario[] = [];
  private stale = false;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEvents = 0;
  private lastSnapshotAt: string = new Date().toISOString();

  private markStale(): void {
    this.stale = true;
    this.pendingEvents += 1;
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
    }
    // Simulate the recalculation pipeline settling within a few seconds so
    // the staleness badge and freshness polling have something real to show.
    this.staleTimer = setTimeout(() => {
      this.stale = false;
      this.pendingEvents = 0;
      this.lastSnapshotAt = new Date().toISOString();
    }, 3000);
  }

  async register(email: string, _password: string): Promise<{ accessToken: string }> {
    void _password;
    return { accessToken: `mock-token-for-${email}` };
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      // Mock mode is permissive: any credentials work, but we surface the
      // demo hint via a realistic-looking rejection only for an obviously
      // wrong demo attempt structure (empty fields), matching what the real
      // API's validation would do.
      if (email.trim().length === 0 || password.trim().length === 0) {
        throw problem(422, "Validation failed", "VALIDATION_ERROR", "Email and password are required.");
      }
    }
    return { accessToken: `mock-token-for-${email}` };
  }

  async getProfile(): Promise<Profile> {
    return structuredClone(this.profile);
  }

  async updateProfile(input: ProfileUpdateInput): Promise<Profile> {
    if (input.version !== this.profile.version) {
      throw problem(
        409,
        "Profile changed elsewhere",
        "PROFILE_VERSION_CONFLICT",
        "Profile changed elsewhere — reload",
      );
    }
    this.profile = {
      version: this.profile.version + 1,
      incomes: input.incomes.map((row) => ({ ...row, id: row.id ?? generateId("income") })),
      expenses: input.expenses.map((row) => ({ ...row, id: row.id ?? generateId("expense") })),
      assets: input.assets.map((row) => ({ ...row, id: row.id ?? generateId("asset") })),
      liabilities: input.liabilities.map((row) => ({ ...row, id: row.id ?? generateId("liability") })),
      assumptions: input.assumptions,
    };
    this.markStale();
    return structuredClone(this.profile);
  }

  async listGoals(page = 1, pageSize = 25): Promise<GoalsPage> {
    const sorted = [...this.goals]
      .filter((g) => g.status !== "archived")
      .sort((a, b) => a.priority - b.priority);
    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);
    return { items: structuredClone(items), page, pageSize, total: sorted.length };
  }

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    if (input.targetAmountMinor <= 0) {
      throw problem(422, "Invalid target amount", "GOAL_TARGET_INVALID", "Target amount must be positive.");
    }
    if (input.targetMonth) {
      const today = new Date();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      if (input.targetMonth < currentMonth) {
        throw problem(
          422,
          "Goal target date in the past",
          "GOAL_TARGET_IN_PAST",
          "The target month must not be in the past.",
        );
      }
    }
    const goal: Goal = {
      id: generateId("goal"),
      name: input.name,
      type: input.type,
      targetAmountMinor: input.targetAmountMinor,
      targetMonth: input.targetMonth ?? null,
      priority: input.priority,
      status: "active",
      contribution: input.contribution
        ? {
            kind: input.contribution.kind,
            amountMinor: input.contribution.amountMinor,
            startMonth: input.contribution.startMonth,
            endMonth: input.contribution.endMonth ?? null,
          }
        : null,
      progress: {
        fundedMinor: 0,
        percentComplete: "0.00",
        projectedCompletionMonth: null,
        outcome: "unreachable_within_horizon",
        monthsLate: null,
        stale: true,
      },
    };
    this.goals.push(goal);
    this.markStale();
    return structuredClone(goal);
  }

  async updateGoal(id: string, input: Partial<CreateGoalInput>): Promise<Goal> {
    const goal = this.goals.find((g) => g.id === id);
    if (!goal) {
      throw problem(404, "Goal not found", "GOAL_NOT_FOUND", `No goal with id ${id}.`);
    }
    if (input.targetMonth) {
      const today = new Date();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      if (input.targetMonth < currentMonth) {
        throw problem(
          422,
          "Goal target date in the past",
          "GOAL_TARGET_IN_PAST",
          "The target month must not be in the past.",
        );
      }
    }
    Object.assign(goal, {
      name: input.name ?? goal.name,
      type: input.type ?? goal.type,
      targetAmountMinor: input.targetAmountMinor ?? goal.targetAmountMinor,
      targetMonth: input.targetMonth ?? goal.targetMonth,
      priority: input.priority ?? goal.priority,
    });
    this.markStale();
    return structuredClone(goal);
  }

  async archiveGoal(id: string): Promise<void> {
    const goal = this.goals.find((g) => g.id === id);
    if (!goal) {
      throw problem(404, "Goal not found", "GOAL_NOT_FOUND", `No goal with id ${id}.`);
    }
    goal.status = "archived";
    this.markStale();
  }

  async getLatestForecast(): Promise<ForecastResponse> {
    return buildForecastResponse(this.goals, this.stale);
  }

  async getForecastFreshness(): Promise<FreshnessResponse> {
    return {
      stale: this.stale,
      pendingEvents: this.pendingEvents,
      lastSnapshotAt: this.lastSnapshotAt,
    };
  }

  async evaluateScenario(deltas: ScenarioDelta[]): Promise<ScenarioEvaluationResponse> {
    return this.runScenario(deltas);
  }

  async createScenario(name: string, deltas: ScenarioDelta[]): Promise<Scenario> {
    const scenario: Scenario = { id: generateId("scenario"), name, deltas, status: "active" };
    this.scenarios.push(scenario);
    return structuredClone(scenario);
  }

  async listScenarios(page = 1, pageSize = 25): Promise<ScenariosPage> {
    const start = (page - 1) * pageSize;
    const items = this.scenarios.slice(start, start + pageSize);
    return { items: structuredClone(items), page, pageSize, total: this.scenarios.length };
  }

  async evaluateSavedScenario(id: string): Promise<ScenarioEvaluationResponse> {
    const scenario = this.scenarios.find((s) => s.id === id);
    if (!scenario) {
      throw problem(404, "Scenario not found", "SCENARIO_NOT_FOUND", `No scenario with id ${id}.`);
    }
    return this.runScenario(scenario.deltas);
  }

  async deleteScenario(id: string): Promise<void> {
    const scenario = this.scenarios.find((s) => s.id === id);
    if (!scenario) {
      throw problem(404, "Scenario not found", "SCENARIO_NOT_FOUND", `No scenario with id ${id}.`);
    }
    this.scenarios = this.scenarios.filter((s) => s.id !== id);
  }

  /**
   * Illustrative mock heuristics for "what if" comparisons. These stand in
   * for the real scenario-evaluation engine (an in-memory input overlay run
   * through the same deterministic decimal.js engine as the baseline). The
   * mock only needs to produce internally-consistent, plausible deltas.
   */
  private runScenario(deltas: ScenarioDelta[]): ScenarioEvaluationResponse {
    const baseline = buildForecastResponse(this.goals, false);

    let monthShift = 0;
    let netWorthBoostPerMonthMinor = 0;

    for (const delta of deltas) {
      switch (delta.type) {
        case "income_pct_change": {
          const pct = Number.parseFloat(delta.pctChange);
          monthShift -= Math.round(pct / 5);
          netWorthBoostPerMonthMinor += Math.round((OPENING_INCOME_HINT * pct) / 100 / 2);
          break;
        }
        case "expense_amount_change": {
          netWorthBoostPerMonthMinor += 20000;
          monthShift -= 2;
          break;
        }
        case "one_time_purchase": {
          monthShift += Math.max(1, Math.round(delta.amountMinor / 500000));
          netWorthBoostPerMonthMinor -= Math.round(delta.amountMinor / 240);
          break;
        }
        case "invest_cash": {
          monthShift -= 1;
          netWorthBoostPerMonthMinor += Math.round(delta.amountMinor / 100);
          break;
        }
        case "loan_early_payoff": {
          monthShift -= 6;
          netWorthBoostPerMonthMinor += 145000;
          break;
        }
        default: {
          const exhaustive: never = delta;
          void exhaustive;
        }
      }
    }

    const scenarioMonths = baseline.months.map((m, index) => ({
      ...m,
      netWorthMinor: m.netWorthMinor + netWorthBoostPerMonthMinor * index,
      cashFlowMinor: m.cashFlowMinor + Math.round(netWorthBoostPerMonthMinor / 12),
    }));

    const scenarioGoals = baseline.goals.map((g) => {
      const newCompletion = g.projectedCompletionMonth
        ? addMonths(g.projectedCompletionMonth, monthShift)
        : g.projectedCompletionMonth;
      const outcome = recomputeOutcome(g.outcome, newCompletion);
      return {
        ...g,
        projectedCompletionMonth: newCompletion,
        outcome,
      };
    });

    const scenario: ForecastResponse = {
      ...baseline,
      snapshotId: `${baseline.snapshotId}-scenario`,
      months: scenarioMonths,
      goals: scenarioGoals,
    };

    const goalDeltas = baseline.goals.map((baselineGoal, index) => {
      const scenarioGoal = scenarioGoals[index];
      const deltaMonths =
        baselineGoal.projectedCompletionMonth && scenarioGoal.projectedCompletionMonth
          ? monthsBetween(baselineGoal.projectedCompletionMonth, scenarioGoal.projectedCompletionMonth)
          : null;
      return {
        goalId: baselineGoal.goalId,
        name: baselineGoal.name,
        baselineCompletionMonth: baselineGoal.projectedCompletionMonth,
        scenarioCompletionMonth: scenarioGoal.projectedCompletionMonth,
        deltaMonths,
      };
    });

    return { baseline, scenario, goalDeltas };
  }
}

const OPENING_INCOME_HINT = 500000;

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map((n) => Number.parseInt(n, 10));
  const [ty, tm] = to.split("-").map((n) => Number.parseInt(n, 10));
  return ty * 12 + tm - (fy * 12 + fm);
}

function recomputeOutcome(previous: GoalOutcome, newCompletion: string | null): GoalOutcome {
  if (previous === "unreachable") {
    return previous;
  }
  if (newCompletion === null) {
    return "unreachable_within_horizon";
  }
  return previous;
}

export const mockClient: HorizonApi = new MockHorizonApi();
