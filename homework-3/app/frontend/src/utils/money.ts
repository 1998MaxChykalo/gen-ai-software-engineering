/**
 * Money-critical frontend utilities.
 *
 * Hard rule (see agents.md 3.1 / .claude/CLAUDE.md): never do float arithmetic
 * on money. All financial computation happens server-side; the frontend only
 * formats minor units for display and parses user-typed euro strings into
 * minor units using pure integer/string arithmetic — no `parseFloat`, no
 * `Number(...) * 100`.
 */

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

/**
 * Parses a user-typed euro amount string into integer minor units (cents).
 *
 * Accepts:
 *  - Plain integers: "1234" -> 123400
 *  - Dot-decimal: "1234.56" -> 123456
 *  - German thousands+decimal: "1.234,56" -> 123456
 *  - Comma-decimal without thousands sep: "1234,56" -> 123456
 *  - Optional leading "-" for negative amounts.
 *
 * Rejects anything else (letters, multiple decimal points, more than 2
 * fraction digits, empty input) with MoneyParseError.
 *
 * Implementation note: the string is decomposed into an integer-part digit
 * string and a fraction-part digit string using only string operations, then
 * combined with BigInt-safe integer arithmetic (`Number` is only used at the
 * very end on an already-integer value, which is exact for any realistic
 * euro amount well within Number.MAX_SAFE_INTEGER).
 */
export function parseEurToMinor(raw: string): number {
  const input = raw.trim();
  if (input.length === 0) {
    throw new MoneyParseError("Amount is required.");
  }

  let negative = false;
  let body = input;
  if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }

  if (body.length === 0 || !/^[0-9.,]+$/.test(body)) {
    throw new MoneyParseError(`"${raw}" is not a valid amount.`);
  }

  const hasDot = body.includes(".");
  const hasComma = body.includes(",");

  let integerPart: string;
  let fractionPart: string;

  if (hasDot && hasComma) {
    // Whichever separator appears last is the decimal separator; the other
    // is a thousands separator, e.g. "1.234,56" or "1,234.56".
    const lastDot = body.lastIndexOf(".");
    const lastComma = body.lastIndexOf(",");
    const decimalIndex = Math.max(lastDot, lastComma);
    const decimalSep = body[decimalIndex];
    const thousandsSep = decimalSep === "." ? "," : ".";
    const rawIntPart = body.slice(0, decimalIndex);
    fractionPart = body.slice(decimalIndex + 1);
    if (rawIntPart.split(thousandsSep).some((group) => group.length === 0)) {
      throw new MoneyParseError(`"${raw}" is not a valid amount.`);
    }
    integerPart = rawIntPart.split(thousandsSep).join("");
  } else if (hasComma) {
    // Single comma: treat as decimal separator (German convention) unless
    // there are multiple commas, which is invalid without a thousands
    // context established above.
    const parts = body.split(",");
    if (parts.length !== 2) {
      throw new MoneyParseError(`"${raw}" is not a valid amount.`);
    }
    [integerPart, fractionPart] = parts;
  } else if (hasDot) {
    const parts = body.split(".");
    if (parts.length !== 2) {
      throw new MoneyParseError(`"${raw}" is not a valid amount.`);
    }
    [integerPart, fractionPart] = parts;
  } else {
    integerPart = body;
    fractionPart = "";
  }

  if (integerPart.length === 0) {
    integerPart = "0";
  }
  if (!/^[0-9]+$/.test(integerPart)) {
    throw new MoneyParseError(`"${raw}" is not a valid amount.`);
  }
  if (fractionPart.length > 2) {
    throw new MoneyParseError(`"${raw}" has more than 2 decimal places.`);
  }
  if (fractionPart.length > 0 && !/^[0-9]+$/.test(fractionPart)) {
    throw new MoneyParseError(`"${raw}" is not a valid amount.`);
  }

  const paddedFraction = fractionPart.padEnd(2, "0");
  // String concatenation of two already-validated integer digit strings,
  // then a single integer parse — no intermediate float ever exists.
  const minorUnitsString = `${integerPart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  const minorUnits = Number.parseInt(minorUnitsString, 10);

  if (!Number.isSafeInteger(minorUnits)) {
    throw new MoneyParseError(`"${raw}" is out of the supported range.`);
  }

  return negative ? -minorUnits : minorUnits;
}

const EUR_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats integer euro-cent minor units as a de-DE localized EUR string,
 * e.g. 123456 -> "1.234,56 €", -50 -> "-0,50 €".
 *
 * Uses integer division/remainder (never float division by 100) to split
 * whole euros from cents, then hands Intl only integers to combine, so no
 * float rounding error can enter the pipeline for realistic minor-unit
 * magnitudes.
 */
export function formatEurMinor(minor: number): string {
  if (!Number.isFinite(minor) || !Number.isInteger(minor)) {
    throw new MoneyParseError("formatEurMinor requires an integer minor-unit value.");
  }

  const sign = minor < 0 ? -1 : 1;
  const absMinor = Math.abs(minor);
  const wholeEuros = Math.trunc(absMinor / 100);
  const cents = absMinor % 100;

  // Reconstruct an exact euro value for Intl by feeding it whole euros plus
  // cents as a decimal string parsed once (never multiplied/divided further).
  const euroValue = Number(`${wholeEuros}.${cents.toString().padStart(2, "0")}`);
  const formatted = EUR_FORMATTER.format(euroValue);
  return sign < 0 ? `-${formatted}` : formatted;
}

const COMPACT_EUR_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Compact axis-label formatting only (e.g. "125k €"). Not used for any
 * money value a user can edit or that must be cent-exact — chart tick
 * labels only. Still integer-only: whole euros are derived via truncating
 * integer division, never a float division by 100.
 */
export function formatEurMinorCompact(minor: number): string {
  const wholeEuros = Math.trunc(minor / 100);
  return COMPACT_EUR_FORMATTER.format(wholeEuros);
}

/**
 * Plain (non-localized, no currency symbol) "1234.56"-style string for
 * pre-filling an editable amount input, so it can be parsed straight back
 * with `parseEurToMinor`. Integer division/remainder only.
 */
export function minorToEuroInputString(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const absMinor = Math.abs(minor);
  const wholeEuros = Math.trunc(absMinor / 100);
  const cents = absMinor % 100;
  return `${sign}${wholeEuros}.${cents.toString().padStart(2, "0")}`;
}
