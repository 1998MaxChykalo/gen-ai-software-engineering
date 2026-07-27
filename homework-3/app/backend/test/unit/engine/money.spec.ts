import Decimal from 'decimal.js';
import {
  EngineDecimal,
  centsFromDecimalString,
  monthlyRateFromAnnualBps,
  toCents,
  toDecimal,
} from '../../../src/modules/forecast/engine/money';

describe('engine money utilities', () => {
  it('rounds half-to-even at the classic half-cent boundaries', () => {
    expect(toCents(new EngineDecimal('0.5'))).toBe(0n);
    expect(toCents(new EngineDecimal('1.5'))).toBe(2n);
    expect(toCents(new EngineDecimal('2.5'))).toBe(2n);
    expect(toCents(new EngineDecimal('3.5'))).toBe(4n);
    expect(toCents(new EngineDecimal('-0.5'))).toBe(0n);
    expect(toCents(new EngineDecimal('-1.5'))).toBe(-2n);
    expect(toCents(new EngineDecimal('-2.5'))).toBe(-2n);
  });

  it('parses decimal strings into exact integer cents', () => {
    expect(centsFromDecimalString('12.34')).toBe(1234n);
    expect(centsFromDecimalString('0.01')).toBe(1n);
    expect(centsFromDecimalString('100')).toBe(10000n);
  });

  it('round-trips cents through toDecimal/toCents', () => {
    const cents = 123456n as ReturnType<typeof centsFromDecimalString>;
    expect(toCents(toDecimal(cents))).toBe(cents);
  });

  it('compounds monthlyRateFromAnnualBps back to the stated annual rate over 12 months', () => {
    const monthly = monthlyRateFromAnnualBps(500); // 5.00%
    const compounded = monthly.plus(1).pow(12).minus(1);
    const relativeError = compounded.minus('0.05').abs().div('0.05');
    expect(relativeError.lessThan('1e-12')).toBe(true);
  });

  it('is unaffected by mutating the global decimal.js configuration', () => {
    const before = monthlyRateFromAnnualBps(500).toString();
    const originalRounding = Decimal.rounding;
    const originalPrecision = Decimal.precision;
    Decimal.set({ precision: 4, rounding: Decimal.ROUND_UP });
    const after = monthlyRateFromAnnualBps(500).toString();
    Decimal.set({ precision: originalPrecision, rounding: originalRounding });
    expect(after).toBe(before);
  });
});
