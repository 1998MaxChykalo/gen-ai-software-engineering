import { aggregateNetWorth } from '../../../src/modules/forecast/engine/net-worth';
import type { MonthState } from '../../../src/modules/forecast/engine/types';

function state(overrides: Partial<MonthState> = {}): MonthState {
  return {
    monthIndex: 0,
    month: '2026-01',
    assets: { cash: 100000n, inv: 200000n, re: 300000n },
    assetKinds: { cash: 'cash', inv: 'investment', re: 'real_estate' },
    liabilities: { loan: 50000n },
    goalFunded: {},
    incomeMinor: 0n,
    passiveIncomeMinor: 0n,
    expensesMinor: 0n,
    liabilityPaymentsMinor: 0n,
    interestAccruedMinor: 0n,
    assetReturnsMinor: 0n,
    cashFlowMinor: 0n,
    deficitMinor: 0n,
    ...overrides,
  };
}

describe('aggregateNetWorth', () => {
  it('sums parts to totals exactly', () => {
    const nw = aggregateNetWorth(state());
    expect(nw.cashMinor).toBe(100000n);
    expect(nw.investmentsMinor).toBe(200000n);
    expect(nw.realEstateMinor).toBe(300000n);
    expect(nw.totalAssetsMinor).toBe(600000n);
    expect(nw.totalLiabilitiesMinor).toBe(50000n);
    expect(nw.netWorthMinor).toBe(550000n);
  });

  it('returns a guarded 0 bps savings rate on zero income (no NaN/Infinity/throw)', () => {
    const nw = aggregateNetWorth(state({ incomeMinor: 0n, expensesMinor: 50000n }));
    expect(nw.savingsRateBps).toBe(0);
    expect(Number.isFinite(nw.savingsRateBps)).toBe(true);
  });

  it('computes savings rate in basis points from income and expenses', () => {
    const nw = aggregateNetWorth(state({ incomeMinor: 200000n, expensesMinor: 150000n }));
    // savings = 50000, rate = 50000/200000 = 25% = 2500 bps
    expect(nw.savingsRateBps).toBe(2500);
  });
});
