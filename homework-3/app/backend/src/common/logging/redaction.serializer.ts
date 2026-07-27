/**
 * Redaction serializer (specification.md §5.7, agents.md §6):
 * recursively replaces any field whose key matches the monetary/PII denylist
 * with "[REDACTED]" before a value is ever emitted to a log. Entity IDs,
 * error codes, durations, and hashes are left untouched.
 */
const DENYLIST_PATTERNS: RegExp[] = [
  /amount/i,
  /balance/i,
  /income/i,
  /target/i,
  /principal/i,
  /payment/i,
  /iban/i,
  /email/i,
  /^name$/i,
  /deltas/i,
  /minor/i, // covers every `*_minor` / `*Minor` money field
];

function isDenylisted(key: string): boolean {
  return DENYLIST_PATTERNS.some((pattern) => pattern.test(key));
}

export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return '[REDACTED]';
  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isDenylisted(key)) {
      result[key] = '[REDACTED]';
    } else if (val !== null && typeof val === 'object') {
      result[key] = redact(val, seen);
    } else {
      result[key] = val;
    }
  }
  return result;
}
