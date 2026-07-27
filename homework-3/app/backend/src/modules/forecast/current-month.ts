/**
 * The forecast engine may never read the clock (specification.md §5.3), so
 * "what month is it right now" is resolved exactly once, here, at the
 * service layer, and passed into the engine as an explicit input.
 */
export function currentEvaluationMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
