import type { ProblemDetails } from "../types/api";

/**
 * Thrown by the API client for any non-2xx response. Carries the RFC 7807
 * problem+json body so callers can surface `detail` (falling back to
 * `title`) and branch on `code` for inline form-error mapping (e.g. 409
 * PROFILE_VERSION_CONFLICT, 422 GOAL_TARGET_IN_PAST).
 */
export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }

  get code(): string | undefined {
    return this.problem.code;
  }

  /** User-facing message per contract: detail, falling back to title. */
  get userMessage(): string {
    return this.problem.detail ?? this.problem.title;
  }
}
