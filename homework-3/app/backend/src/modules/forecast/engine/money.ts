/**
 * Engine money utility (specification.md Task 9).
 *
 * Rules enforced here:
 * - Money is always an integer number of minor units (euro cents), typed as
 *   a branded `Cents` (bigint). Never a JS `number`.
 * - All arithmetic goes through a module-local `Decimal` clone so a test (or
 *   any other module) reconfiguring the global `decimal.js` singleton can
 *   never change engine results.
 * - Rounding to cents happens exactly once, via `toCents`, using
 *   ROUND_HALF_EVEN (banker's rounding).
 *
 * This file's only external import is `decimal.js`, per the engine's
 * dependency-direction rule (agents.md §4, specification.md §5.1/§5.3).
 */
import Decimal from 'decimal.js';

/** Module-local Decimal clone: precision 28, ROUND_HALF_EVEN, isolated from global config. */
export const EngineDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export type EngineDecimalType = InstanceType<typeof EngineDecimal>;

/** Branded integer-cents type. Never a `number`. */
export type Cents = bigint & { readonly __brand: 'Cents' };

export function centsFromBigInt(value: bigint): Cents {
  return value as Cents;
}

export function centsFromNumberOfCents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new Error('centsFromNumberOfCents requires an integer number of cents');
  }
  return BigInt(value) as Cents;
}

/** Parses a decimal string in whole-currency units (e.g. "12.34") into integer cents. */
export function centsFromDecimalString(value: string): Cents {
  const d = new EngineDecimal(value).times(100);
  return toCents(d);
}

export const ZERO_CENTS: Cents = 0n as Cents;

export function toDecimal(cents: Cents): EngineDecimalType {
  return new EngineDecimal(cents.toString());
}

/** Rounds a Decimal (in cents) to an integer number of cents, ROUND_HALF_EVEN, exactly once. */
export function toCents(value: EngineDecimalType): Cents {
  return BigInt(value.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0)) as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return (a + b) as Cents;
}

export function subCents(a: Cents, b: Cents): Cents {
  return (a - b) as Cents;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return (a > b ? a : b) as Cents;
}

export function minCents(a: Cents, b: Cents): Cents {
  return (a < b ? a : b) as Cents;
}

export function isNegative(a: Cents): boolean {
  return a < 0n;
}

/**
 * Converts annual basis points to an effective *monthly* rate, using the
 * geometric relation (1+annual)^(1/12) - 1 (not linear annual/12), so that
 * compounding twelve months reproduces the stated annual rate exactly.
 *
 * 20 significant digits are used for the intermediate exponentiation to
 * keep round-trip error negligible (spec Task 9 acceptance criterion).
 */
export function monthlyRateFromAnnualBps(bps: number): EngineDecimalType {
  const HighPrecisionDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
  const annualRate = new HighPrecisionDecimal(bps).div(10000);
  const monthly = annualRate.plus(1).pow(new HighPrecisionDecimal(1).div(12)).minus(1);
  return new EngineDecimal(monthly.toString());
}

/** Simple (non-compounding) monthly rate: annual/12. Used for liability interest per spec Task 10. */
export function linearMonthlyRateFromAnnualBps(bps: number): EngineDecimalType {
  return new EngineDecimal(bps).div(10000).div(12);
}

export function bpsToDecimalRate(bps: number): EngineDecimalType {
  return new EngineDecimal(bps).div(10000);
}
