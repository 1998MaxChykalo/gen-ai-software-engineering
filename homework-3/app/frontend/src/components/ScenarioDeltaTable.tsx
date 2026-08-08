import type { GoalDelta } from "../types/api";

interface ScenarioDeltaTableProps {
  goalDeltas: GoalDelta[];
}

/**
 * Renders the deltaMonths sign as plain language:
 *  - positive -> "N months later" (goal completes later under the scenario)
 *  - negative -> "N months sooner"
 *  - zero -> "no change"
 *  - null -> "—" (goal has no completion month in one or both runs)
 */
export function formatDeltaMonths(deltaMonths: number | null): string {
  if (deltaMonths === null) {
    return "—";
  }
  if (deltaMonths === 0) {
    return "no change";
  }
  const magnitude = Math.abs(deltaMonths);
  const unit = magnitude === 1 ? "month" : "months";
  return deltaMonths > 0 ? `${magnitude} ${unit} later` : `${magnitude} ${unit} sooner`;
}

export function ScenarioDeltaTable({ goalDeltas }: ScenarioDeltaTableProps): JSX.Element {
  return (
    <table className="delta-table" data-testid="scenario-delta-table">
      <thead>
        <tr>
          <th>Goal</th>
          <th>Baseline completion</th>
          <th>What-if completion</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        {goalDeltas.map((delta) => (
          <tr key={delta.goalId} data-testid={`delta-row-${delta.goalId}`}>
            <td>{delta.name}</td>
            <td>{delta.baselineCompletionMonth ?? "—"}</td>
            <td>{delta.scenarioCompletionMonth ?? "—"}</td>
            <td>{formatDeltaMonths(delta.deltaMonths)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
