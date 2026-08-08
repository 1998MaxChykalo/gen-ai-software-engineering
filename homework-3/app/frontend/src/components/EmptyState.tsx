import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/**
 * Designed empty states (agents.md edge case 12): no profile, no goals, no
 * forecast yet each get a friendly onboarding prompt instead of a blank
 * screen or an error.
 */
export function EmptyState({ title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="card empty-state" data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
