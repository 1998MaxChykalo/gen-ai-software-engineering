/**
 * Pure "YYYY-MM" month arithmetic — deliberately implemented without the
 * `Date` object (the engine folder is not allowed to touch the clock or any
 * timezone-sensitive API; a plain integer month-index avoids both).
 */

const MONTH_LABEL_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Converts "YYYY-MM" to an absolute month index (year*12 + monthIndex0). */
export function monthLabelToAbsoluteIndex(label: string): number {
  const match = MONTH_LABEL_RE.exec(label);
  if (!match) {
    throw new Error(`Invalid month label: ${label}`);
  }
  const year = Number(match[1]);
  const month0 = Number(match[2]) - 1;
  return year * 12 + month0;
}

export function absoluteIndexToMonthLabel(absoluteIndex: number): string {
  const year = Math.floor(absoluteIndex / 12);
  const month0 = absoluteIndex - year * 12;
  const mm = String(month0 + 1).padStart(2, '0');
  return `${year}-${mm}`;
}

/** Adds `offset` (may be negative) months to a "YYYY-MM" label. */
export function addMonthsToLabel(label: string, offset: number): string {
  return absoluteIndexToMonthLabel(monthLabelToAbsoluteIndex(label) + offset);
}

/** Number of months from `fromLabel` to `toLabel` (positive if `toLabel` is later). */
export function monthsBetween(fromLabel: string, toLabel: string): number {
  return monthLabelToAbsoluteIndex(toLabel) - monthLabelToAbsoluteIndex(fromLabel);
}

export function isValidMonthLabel(label: string): boolean {
  return MONTH_LABEL_RE.test(label);
}
