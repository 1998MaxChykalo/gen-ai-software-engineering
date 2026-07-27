import { DomainErrors } from '../../common/errors/domain-error';

export type GoalStatus = 'active' | 'paused' | 'achieved' | 'overdue' | 'archived';

/**
 * Goal lifecycle state machine (specification.md Task 6).
 * `achieved` and `overdue` are system-only transitions (driven by the
 * recalculation dispatcher, see forecast.service.ts) and are never
 * reachable through the user-facing PATCH endpoint.
 */
const USER_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  achieved: ['archived'],
  overdue: ['paused', 'archived'],
  archived: [],
};

export function assertUserTransition(from: GoalStatus, to: GoalStatus): void {
  if (from === to) return;
  if (!USER_TRANSITIONS[from].includes(to)) {
    throw DomainErrors.goalIllegalTransition(from, to);
  }
}
