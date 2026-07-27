import { runProjection } from '../../../src/modules/forecast/engine/month-step';
import { aggregateNetWorth } from '../../../src/modules/forecast/engine/net-worth';
import { buildInputs } from './fixtures';

describe('projectMonth / runProjection', () => {
  it('is deterministic: two runs over identical inputs produce deep-equal states', () => {
    const inputs = buildInputs({
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 380000n, annualGrowthRateBps: 250 }],
      expenses: [{ id: 'exp-1', kind: 'fixed', amountMinor: 230000n }],
      assets: [{ id: 'ast-1', kind: 'cash', valueMinor: 1500000n, annualReturnRateBps: 0 }],
    });
    const run1 = runProjection(inputs);
    const run2 = runProjection(inputs);
    expect(run1).toEqual(run2);
  });

  it('conserves net worth: closing NW - opening NW = income - expenses - interest + returns', () => {
    const inputs = buildInputs({
      horizonMonths: 24,
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 380000n, annualGrowthRateBps: 250 }],
      expenses: [{ id: 'exp-1', kind: 'fixed', amountMinor: 230000n }],
      assets: [
        { id: 'cash-1', kind: 'cash', valueMinor: 1500000n, annualReturnRateBps: 0 },
        { id: 'inv-1', kind: 'investment', valueMinor: 2200000n, annualReturnRateBps: 500 },
      ],
      liabilities: [
        { id: 'loan-1', kind: 'loan', balanceMinor: 900000n, annualInterestRateBps: 650, monthlyPaymentMinor: 28000n },
      ],
    });
    const series = runProjection(inputs);

    let prevNetWorth = (() => {
      // opening net worth before month 0: sum of initial assets - initial liabilities
      const cash = 1500000n + 2200000n;
      const liabilities = 900000n;
      return cash - liabilities;
    })();

    for (const state of series) {
      const nw = aggregateNetWorth(state);
      const expectedDelta = state.incomeMinor - state.expensesMinor - state.interestAccruedMinor + state.assetReturnsMinor;
      expect(nw.netWorthMinor - prevNetWorth).toBe(expectedDelta);
      prevNetWorth = nw.netWorthMinor;
    }
  });

  it('clamps the final liability payment to the remaining balance (never goes negative)', () => {
    const inputs = buildInputs({
      horizonMonths: 6,
      liabilities: [
        { id: 'loan-1', kind: 'loan', balanceMinor: 100n, annualInterestRateBps: 0, monthlyPaymentMinor: 50000n },
      ],
    });
    const series = runProjection(inputs);
    expect(series[0].liabilities['loan-1']).toBe(0n);
    for (const state of series) {
      expect(state.liabilities['loan-1']).toBe(0n);
    }
    // Only month 0 pays anything (the clamped 100 cents); rest pay 0.
    expect(series[0].liabilityPaymentsMinor).toBe(100n);
    expect(series[1].liabilityPaymentsMinor).toBe(0n);
  });

  it('handles a zero-income profile without dividing by zero', () => {
    const inputs = buildInputs({
      expenses: [{ id: 'exp-1', kind: 'fixed', amountMinor: 100000n }],
    });
    const series = runProjection(inputs);
    for (const state of series) {
      const nw = aggregateNetWorth(state);
      expect(nw.savingsRateBps).toBe(0);
      expect(state.incomeMinor).toBe(0n);
    }
  });

  it('records a deficit (never throws) when cash flow is negative', () => {
    const inputs = buildInputs({
      incomes: [{ id: 'inc-1', kind: 'active', amountMinor: 100000n, annualGrowthRateBps: 0 }],
      expenses: [{ id: 'exp-1', kind: 'fixed', amountMinor: 500000n }],
    });
    const series = runProjection(inputs);
    for (const state of series) {
      expect(state.cashFlowMinor).toBeLessThan(0n);
      expect(state.deficitMinor).toBeGreaterThan(0n);
    }
  });

  it('never produces more than 720 monthly points', () => {
    const inputs = buildInputs({ horizonMonths: 720 });
    const series = runProjection(inputs);
    expect(series.length).toBe(720);
  });

  it('rejects a horizon above 720 months before computing anything', () => {
    const inputs = buildInputs({ horizonMonths: 721 });
    expect(() => runProjection(inputs)).toThrow();
  });
});
