/**
 * Contribution allocation policy (specification.md Task 7).
 *
 * RESOLVED AMBIGUITY: Task 7 names `src/modules/goals/allocation/` as the
 * file location and says the function is "shared by the forecast engine and
 * the scenario simulator." agents.md / .claude/CLAUDE.md hard rules state
 * the engine folder may import *nothing* outside itself, and nothing may
 * import config/other modules into it. Because `projectMonth` (Task 10)
 * must call this allocator every month, the conservative reading that keeps
 * the engine's purity/dependency-direction rule intact (a "never do" rule)
 * is to define the allocator inside `forecast/engine/` and let the `goals`
 * module import it *from* the engine (modules may depend on the engine;
 * the engine may not depend on modules). This is flagged in the backend
 * README as a conservative interpretation, per agents.md §1.4.
 *
 * Pure function: no I/O. Only external import is decimal.js (via ./money).
 */
import { addCents, minCents, subCents, type Cents, ZERO_CENTS } from './money';

export interface AllocationGoalInput {
  readonly id: string;
  readonly priority: number;
  /** Remaining amount needed to reach the goal's target, floor 0. */
  readonly remainingNeedMinor: Cents;
  /** Explicit contribution amount committed for this month (0 if none due). */
  readonly explicitDueMinor: Cents;
}

export interface AllocationResult {
  /** Cents credited to each goal's funded balance this month. */
  readonly allocations: Readonly<Record<string, Cents>>;
  /** Amount left over after all goal allocations — routed to general savings/cash. */
  readonly leftoverMinor: Cents;
  /** Positive when free cash flow was negative (permanent deficit signal). */
  readonly deficitMinor: Cents;
}

/**
 * Allocates a month's free cash flow across goals:
 *   1. Negative or zero free cash flow => zero allocations, deficit reported, nothing lost.
 *   2. Explicit (committed) contributions are honored first, in priority order,
 *      capped at each goal's remaining need.
 *   3. Any remaining free cash flow is allocated to goals *without* an explicit
 *      contribution, strict priority order, capped at remaining need.
 *   4. Whatever is left after that is returned as `leftoverMinor` (general savings).
 *
 * Invariant (property-tested): sum(allocations) + leftoverMinor === freeCashFlowMinor
 * whenever freeCashFlowMinor > 0 — no cent is created or destroyed.
 */
export function allocateFreeCashFlow(
  freeCashFlowMinor: Cents,
  goals: readonly AllocationGoalInput[],
): AllocationResult {
  if (freeCashFlowMinor <= ZERO_CENTS) {
    return {
      allocations: {},
      leftoverMinor: ZERO_CENTS,
      deficitMinor: -freeCashFlowMinor as Cents,
    };
  }

  const ordered = [...goals].sort((a, b) => a.priority - b.priority);
  const remainingNeed = new Map<string, Cents>(ordered.map((g) => [g.id, g.remainingNeedMinor]));
  const allocations: Record<string, Cents> = {};
  let remaining = freeCashFlowMinor;

  // Pass 1: explicit committed contributions, priority order, capped at remaining need.
  for (const goal of ordered) {
    if (remaining <= ZERO_CENTS) break;
    if (goal.explicitDueMinor <= ZERO_CENTS) continue;
    const need = remainingNeed.get(goal.id) ?? ZERO_CENTS;
    const want = minCents(goal.explicitDueMinor, need);
    const pay = minCents(want, remaining);
    if (pay > ZERO_CENTS) {
      allocations[goal.id] = addCents(allocations[goal.id] ?? ZERO_CENTS, pay);
      remaining = subCents(remaining, pay);
      remainingNeed.set(goal.id, subCents(need, pay));
    }
  }

  // Pass 2: leftover allocated to goals without an explicit contribution, priority order.
  for (const goal of ordered) {
    if (remaining <= ZERO_CENTS) break;
    if (goal.explicitDueMinor > ZERO_CENTS) continue;
    const need = remainingNeed.get(goal.id) ?? ZERO_CENTS;
    if (need <= ZERO_CENTS) continue;
    const pay = minCents(need, remaining);
    if (pay > ZERO_CENTS) {
      allocations[goal.id] = addCents(allocations[goal.id] ?? ZERO_CENTS, pay);
      remaining = subCents(remaining, pay);
      remainingNeed.set(goal.id, subCents(need, pay));
    }
  }

  return { allocations, leftoverMinor: remaining, deficitMinor: ZERO_CENTS };
}
