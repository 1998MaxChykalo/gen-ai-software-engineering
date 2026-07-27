/**
 * Net-worth aggregation (specification.md Task 12).
 *
 * Pure function of a single MonthState. Guards the savings-rate division by
 * zero (0 bps when income is zero — never NaN/Infinity/throw).
 */
import { addCents, subCents, ZERO_CENTS, type Cents } from './money';
import type { MonthState, NetWorthBreakdown } from './types';

export function aggregateNetWorth(state: MonthState): NetWorthBreakdown {
  let cashMinor: Cents = ZERO_CENTS;
  let investmentsMinor: Cents = ZERO_CENTS;
  let realEstateMinor: Cents = ZERO_CENTS;

  for (const [assetId, value] of Object.entries(state.assets)) {
    const kind = state.assetKinds[assetId];
    if (kind === 'investment') {
      investmentsMinor = addCents(investmentsMinor, value);
    } else if (kind === 'real_estate') {
      realEstateMinor = addCents(realEstateMinor, value);
    } else {
      cashMinor = addCents(cashMinor, value);
    }
  }

  const totalAssetsMinor = addCents(addCents(cashMinor, investmentsMinor), realEstateMinor);
  const totalLiabilitiesMinor = Object.values(state.liabilities).reduce<Cents>(
    (acc, v) => addCents(acc, v),
    ZERO_CENTS,
  );
  const netWorthMinor = subCents(totalAssetsMinor, totalLiabilitiesMinor);
  const savingsMinor = subCents(state.incomeMinor, state.expensesMinor);

  let savingsRateBps = 0;
  if (state.incomeMinor > ZERO_CENTS) {
    savingsRateBps = Number((savingsMinor * 10000n) / state.incomeMinor);
  }

  return {
    cashMinor,
    investmentsMinor,
    realEstateMinor,
    totalAssetsMinor,
    totalLiabilitiesMinor,
    netWorthMinor,
    incomeMinor: state.incomeMinor,
    expensesMinor: state.expensesMinor,
    passiveIncomeMinor: state.passiveIncomeMinor,
    savingsMinor,
    savingsRateBps,
  };
}
