import type {
  CreateGoalInput,
  ForecastResponse,
  FreshnessResponse,
  Goal,
  GoalsPage,
  Profile,
  ProfileUpdateInput,
  Scenario,
  ScenarioDelta,
  ScenarioEvaluationResponse,
  ScenariosPage,
} from "../types/api";

/**
 * The API surface the whole app is built against. `httpClient.ts` implements
 * this against the real backend; `mockClient.ts` implements it in-memory so
 * the app runs standalone (VITE_USE_MOCKS=true) for demos and screenshots.
 */
export interface HorizonApi {
  register(email: string, password: string): Promise<{ accessToken: string }>;
  login(email: string, password: string): Promise<{ accessToken: string }>;

  getProfile(): Promise<Profile>;
  updateProfile(input: ProfileUpdateInput): Promise<Profile>;

  listGoals(page?: number, pageSize?: number): Promise<GoalsPage>;
  createGoal(input: CreateGoalInput): Promise<Goal>;
  updateGoal(id: string, input: Partial<CreateGoalInput>): Promise<Goal>;
  archiveGoal(id: string): Promise<void>;

  getLatestForecast(): Promise<ForecastResponse>;
  getForecastFreshness(): Promise<FreshnessResponse>;

  evaluateScenario(deltas: ScenarioDelta[]): Promise<ScenarioEvaluationResponse>;
  createScenario(name: string, deltas: ScenarioDelta[]): Promise<Scenario>;
  listScenarios(page?: number, pageSize?: number): Promise<ScenariosPage>;
  evaluateSavedScenario(id: string): Promise<ScenarioEvaluationResponse>;
  deleteScenario(id: string): Promise<void>;
}
