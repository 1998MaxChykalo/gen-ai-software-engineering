/**
 * Conversion between the wire format for rates — decimal strings like "2.5"
 * (specification.md binding HTTP contract) — and the DB storage format —
 * integer basis points (1% = 100 bps), chosen for exactness (no floats).
 *
 * Both directions are pure integer/string arithmetic: `pctStringToBps`
 * never parses the string through a float, and `bpsToPctString` only ever
 * divides/mods integers.
 */
const PCT_STRING_RE = /^(-?)(\d+)(?:\.(\d{1,4}))?$/;

export function isValidPctString(pct: string): boolean {
  return PCT_STRING_RE.test(pct);
}

export function pctStringToBps(pct: string): number {
  const match = PCT_STRING_RE.exec(pct);
  if (!match) {
    throw new Error(`Invalid percentage string: "${pct}"`);
  }
  const sign = match[1] === '-' ? -1 : 1;
  const whole = parseInt(match[2], 10);
  const fracDigits = (match[3] ?? '').padEnd(2, '0').slice(0, 2);
  const frac = parseInt(fracDigits, 10);
  return sign * (whole * 100 + frac);
}

export function bpsToPctString(bps: number): string {
  const sign = bps < 0 ? '-' : '';
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac2 = String(abs % 100).padStart(2, '0');
  const frac = frac2.endsWith('0') ? frac2.slice(0, 1) : frac2;
  return `${sign}${whole}.${frac}`;
}
