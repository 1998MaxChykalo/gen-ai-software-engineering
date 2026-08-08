import type { GoalOutcome } from "../types/api";

const LABELS: Record<GoalOutcome, string> = {
  on_track: "On track",
  late: "Late",
  unreachable: "Unreachable",
  unreachable_within_horizon: "Beyond horizon",
};

interface OutcomeBadgeProps {
  outcome: GoalOutcome;
}

/**
 * Honest, designed outcome states — never an error toast (agents.md 3.5,
 * 3.7, spec §7 edge case 1). Colors: on_track green, late amber, unreachable
 * red, unreachable_within_horizon grey.
 */
export function OutcomeBadge({ outcome }: OutcomeBadgeProps): JSX.Element {
  return (
    <span className={`badge badge-${outcome}`} data-testid="outcome-badge">
      {LABELS[outcome]}
    </span>
  );
}
