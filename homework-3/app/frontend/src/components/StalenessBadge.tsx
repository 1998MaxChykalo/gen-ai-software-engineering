interface StalenessBadgeProps {
  stale: boolean;
}

/**
 * Stale forecasts show a visible "recalculating / based on older data"
 * badge driven by the `stale` flag (never silently served as current data —
 * spec §7 edge case 13).
 */
export function StalenessBadge({ stale }: StalenessBadgeProps): JSX.Element | null {
  if (!stale) {
    return null;
  }
  return (
    <span className="badge badge-stale" data-testid="staleness-badge">
      Recalculating — based on older data
    </span>
  );
}
