import type { HorizonApi } from "./HorizonApi";
import { ApiError } from "./errors";
import { authStore } from "./authStore";
import type {
  CreateGoalInput,
  ForecastResponse,
  FreshnessResponse,
  Goal,
  GoalsPage,
  ProblemDetails,
  Profile,
  ProfileUpdateInput,
  Scenario,
  ScenarioDelta,
  ScenarioEvaluationResponse,
  ScenariosPage,
} from "../types/api";

const BASE_URL = "/api/v1";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older test runners).
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    idempotent?: boolean;
    auth?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", body, idempotent = false, auth = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth) {
    const token = authStore.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  if (idempotent) {
    headers["Idempotency-Key"] = newIdempotencyKey();
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let problem: ProblemDetails;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      problem = {
        type: "about:blank",
        title: response.statusText || "Request failed",
        status: response.status,
      };
    }
    throw new ApiError(problem);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const httpClient: HorizonApi = {
  async register(email, password) {
    return request<{ accessToken: string }>("/auth/register", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  },

  async login(email, password) {
    return request<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  },

  async getProfile() {
    return request<Profile>("/profile");
  },

  async updateProfile(input: ProfileUpdateInput) {
    return request<Profile>("/profile", {
      method: "PUT",
      body: input,
      idempotent: true,
    });
  },

  async listGoals(page = 1, pageSize = 25) {
    return request<GoalsPage>(`/goals?page=${page}&pageSize=${pageSize}`);
  },

  async createGoal(input: CreateGoalInput) {
    return request<Goal>("/goals", {
      method: "POST",
      body: input,
      idempotent: true,
    });
  },

  async updateGoal(id, input) {
    return request<Goal>(`/goals/${id}`, {
      method: "PATCH",
      body: input,
      idempotent: true,
    });
  },

  async archiveGoal(id) {
    await request<void>(`/goals/${id}`, { method: "DELETE", idempotent: true });
  },

  async getLatestForecast() {
    return request<ForecastResponse>("/forecast/latest");
  },

  async getForecastFreshness() {
    return request<FreshnessResponse>("/forecast/freshness");
  },

  async evaluateScenario(deltas: ScenarioDelta[]) {
    return request<ScenarioEvaluationResponse>("/scenarios/evaluate", {
      method: "POST",
      body: { deltas },
    });
  },

  async createScenario(name, deltas) {
    return request<Scenario>("/scenarios", {
      method: "POST",
      body: { name, deltas },
      idempotent: true,
    });
  },

  async listScenarios(page = 1, pageSize = 25) {
    return request<ScenariosPage>(`/scenarios?page=${page}&pageSize=${pageSize}`);
  },

  async evaluateSavedScenario(id) {
    return request<ScenarioEvaluationResponse>(`/scenarios/${id}/evaluate`, {
      method: "POST",
    });
  },

  async deleteScenario(id) {
    await request<void>(`/scenarios/${id}`, { method: "DELETE", idempotent: true });
  },
};
