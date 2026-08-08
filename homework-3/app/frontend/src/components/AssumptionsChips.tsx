import type { Assumptions } from "../types/api";

interface AssumptionsChipsProps {
  assumptions: Assumptions;
}

/**
 * Assumption transparency (agents.md 3.4): every surface showing forecast
 * output displays the inflation / return / income-growth assumptions used,
 * visibly next to the output — never buried in settings.
 */
export function AssumptionsChips({ assumptions }: AssumptionsChipsProps): JSX.Element {
  return (
    <div className="assumption-chips" data-testid="assumptions-chips">
      <span className="chip">Inflation {assumptions.inflationRatePct}%/yr</span>
      <span className="chip">Expected return {assumptions.defaultReturnRatePct}%/yr</span>
      <span className="chip">Income growth {assumptions.incomeGrowthRatePct}%/yr</span>
    </div>
  );
}
