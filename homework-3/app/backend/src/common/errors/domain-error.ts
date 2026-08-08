/**
 * Domain error codes used across Horizon (specification.md §5.5, §7).
 * Business outcomes that are valid domain states (e.g. an unreachable goal)
 * are NOT modeled as errors — only actual rejections are.
 */
export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'INVALID_CREDENTIALS'
  | 'CURRENCY_NOT_SUPPORTED'
  | 'PROFILE_VERSION_CONFLICT'
  | 'GOAL_TARGET_IN_PAST'
  | 'FORECAST_HORIZON_EXCEEDED'
  | 'CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW'
  | 'GOAL_ILLEGAL_TRANSITION'
  | 'GOAL_LIMIT_EXCEEDED'
  | 'GOAL_VERSION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_MISMATCH'
  | 'NO_SNAPSHOT_YET'
  | 'SCENARIO_REFERENCES_DELETED_ENTITY'
  | 'SCENARIO_LIMIT_EXCEEDED'
  | 'SCENARIO_NOT_FOUND'
  | 'TOO_MANY_REQUESTS';

/**
 * Thrown for every expected rejection. Caught by ProblemJsonFilter and
 * rendered as `application/problem+json` (RFC 7807).
 */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    public readonly status: number,
    public readonly detail: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(detail);
    this.name = 'DomainError';
  }
}

export const DomainErrors = {
  validation: (detail: string, extra?: Record<string, unknown>) =>
    new DomainError('VALIDATION_ERROR', 422, detail, extra),
  unauthorized: (detail = 'Authentication required.') =>
    new DomainError('UNAUTHORIZED', 401, detail),
  forbidden: (detail = 'You do not have access to this resource.') =>
    new DomainError('FORBIDDEN', 403, detail),
  notFound: (entity: string) => new DomainError('NOT_FOUND', 404, `${entity} not found.`),
  emailAlreadyRegistered: () =>
    new DomainError('EMAIL_ALREADY_REGISTERED', 409, 'An account with this email already exists.'),
  invalidCredentials: () =>
    new DomainError('INVALID_CREDENTIALS', 401, 'Invalid email or password.'),
  currencyNotSupported: (currency: string) =>
    new DomainError(
      'CURRENCY_NOT_SUPPORTED',
      422,
      `MVP supports EUR only; received "${currency}".`,
    ),
  profileVersionConflict: () =>
    new DomainError(
      'PROFILE_VERSION_CONFLICT',
      409,
      'The profile was modified by another request; refetch and re-apply your changes.',
    ),
  goalTargetInPast: () =>
    new DomainError(
      'GOAL_TARGET_IN_PAST',
      422,
      'targetMonth must not be in the past relative to today.',
    ),
  forecastHorizonExceeded: (maxMonths: number) =>
    new DomainError(
      'FORECAST_HORIZON_EXCEEDED',
      422,
      `targetMonth is more than ${maxMonths} months out; the maximum forecast horizon is ${maxMonths} months.`,
    ),
  contributionExceedsFreeCashFlow: (availableFreeCashFlowMinor: bigint) =>
    new DomainError(
      'CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW',
      422,
      'The recurring contribution exceeds your current free cash flow. Set allowDeficit=true to override.',
      { availableFreeCashFlowMinor: Number(availableFreeCashFlowMinor) },
    ),
  goalIllegalTransition: (from: string, to: string) =>
    new DomainError(
      'GOAL_ILLEGAL_TRANSITION',
      422,
      `Cannot transition goal from "${from}" to "${to}".`,
    ),
  goalLimitExceeded: (max: number) =>
    new DomainError('GOAL_LIMIT_EXCEEDED', 422, `A user may have at most ${max} active goals.`),
  goalVersionConflict: () =>
    new DomainError('GOAL_VERSION_CONFLICT', 409, 'The goal was modified by another request.'),
  idempotencyKeyRequired: () =>
    new DomainError(
      'IDEMPOTENCY_KEY_REQUIRED',
      400,
      'The Idempotency-Key header is required for this request.',
    ),
  idempotencyKeyMismatch: () =>
    new DomainError(
      'IDEMPOTENCY_KEY_MISMATCH',
      422,
      'This Idempotency-Key was already used with a different request body.',
    ),
  noSnapshotYet: () =>
    new DomainError('NO_SNAPSHOT_YET', 404, 'No forecast has been computed yet for this account.'),
  scenarioReferencesDeletedEntity: (deltaIndex: number) =>
    new DomainError(
      'SCENARIO_REFERENCES_DELETED_ENTITY',
      422,
      `Scenario delta at index ${deltaIndex} references an entity that no longer exists.`,
      { deltaIndex },
    ),
  scenarioLimitExceeded: (max: number) =>
    new DomainError('SCENARIO_LIMIT_EXCEEDED', 422, `A user may save at most ${max} scenarios.`),
  scenarioNotFound: () => new DomainError('SCENARIO_NOT_FOUND', 404, 'Scenario not found.'),
  tooManyRequests: (retryAfterSeconds: number) =>
    new DomainError('TOO_MANY_REQUESTS', 429, 'Rate limit exceeded.', { retryAfterSeconds }),
};
