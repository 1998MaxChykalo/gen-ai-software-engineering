import type { Goal } from "../types/api";
import { formatEurMinor } from "../utils/money";
import { OutcomeBadge } from "./OutcomeBadge";
import { StalenessBadge } from "./StalenessBadge";

interface GoalCardProps {
  goal: Goal;
  onEdit?: (goal: Goal) => void;
  onArchive?: (goal: Goal) => void;
}

function explanationFor(goal: Goal): string | null {
  const progress = goal.progress;
  if (!progress) {
    return null;
  }
  if (progress.outcome === "unreachable") {
    return "Expenses exceed income under current inputs — this goal cannot complete within the forecast horizon unless something changes.";
  }
  if (progress.outcome === "unreachable_within_horizon") {
    return "At the current contribution rate this goal would complete beyond the 60-year forecast horizon.";
  }
  if (progress.outcome === "late" && progress.monthsLate !== null) {
    return `Projected to complete ${progress.monthsLate} month${progress.monthsLate === 1 ? "" : "s"} after the target date, if these assumptions hold.`;
  }
  return null;
}

/**
 * Renders a single goal's progress. Outcome badges are honest, designed
 * states (see OutcomeBadge) — an unreachable goal gets a clear explanation,
 * never an error.
 */
export function GoalCard({ goal, onEdit, onArchive }: GoalCardProps): JSX.Element {
  const progress = goal.progress;
  const percent = progress ? Math.min(100, Math.max(0, Number.parseFloat(progress.percentComplete))) : 0;
  const explanation = explanationFor(goal);

  return (
    <div className="card goal-card" data-testid={`goal-card-${goal.id}`}>
      <div className="goal-card-header">
        <h3>{goal.name}</h3>
        {progress && <OutcomeBadge outcome={progress.outcome} />}
      </div>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
        Target {formatEurMinor(goal.targetAmountMinor)}
        {goal.targetMonth ? ` by ${goal.targetMonth}` : ""}
      </p>
      {progress && (
        <>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <p style={{ fontSize: "0.85rem" }}>
            {formatEurMinor(progress.fundedMinor)} funded ({progress.percentComplete}%)
            {progress.projectedCompletionMonth ? ` — projected ${progress.projectedCompletionMonth}` : ""}
          </p>
          {progress.stale && <StalenessBadge stale />}
          {explanation && (
            <p className="error-text" style={{ color: "var(--color-text-muted)" }} data-testid="goal-explanation">
              {explanation}
            </p>
          )}
        </>
      )}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        {onEdit && (
          <button className="btn btn-secondary" onClick={() => onEdit(goal)}>
            Edit
          </button>
        )}
        {onArchive && (
          <button className="btn btn-danger" onClick={() => onArchive(goal)}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}
