/**
 * Scenario delta overlay (specification.md Task 19).
 *
 * Pure function living *beside* (not inside) the forecast engine: it takes
 * a baseline `EngineInputs` and returns a brand-new `EngineInputs` with the
 * deltas applied — every step below produces new arrays/objects rather than
 * mutating the source, so the engine itself stays scenario-agnostic (it
 * only ever sees plain `EngineInputs`, baseline or overlaid) and the
 * baseline object passed in is never touched.
 *
 * MVP SIMPLIFICATION (documented, resolved conservatively): the engine's
 * per-month model does not support time-segmented parameters (an income
 * whose growth rate itself changes mid-projection). `effectiveMonth` /
 * `month` on every delta is validated for shape and horizon-bounds, but all
 * deltas are applied as of the evaluation month (month 0) rather than at an
 * arbitrary future month. Extending the engine to support time-segmented
 * inputs is flagged as a follow-up in the backend README.
 */
import { DomainErrors } from '../../../common/errors/domain-error';
import { centsFromBigInt, toCents, toDecimal, EngineDecimal } from '../../forecast/engine';
import type { EngineAsset, EngineInputs } from '../../forecast/engine';
import type { ScenarioDelta } from '../scenario-delta.types';

function applyOneDelta(inputs: EngineInputs, delta: ScenarioDelta, index: number): EngineInputs {
  switch (delta.type) {
    case 'income_pct_change': {
      const factor = new EngineDecimal(1).plus(new EngineDecimal(delta.pctChange).div(100));
      let matched = false;
      const incomes = inputs.incomes.map((income) => {
        if (delta.incomeId !== null && income.id !== delta.incomeId) return income;
        matched = true;
        return { ...income, amountMinor: toCents(toDecimal(income.amountMinor).times(factor)) };
      });
      if (delta.incomeId !== null && !matched) {
        throw DomainErrors.scenarioReferencesDeletedEntity(index);
      }
      return { ...inputs, incomes };
    }
    case 'expense_amount_change': {
      let matched = false;
      const expenses = inputs.expenses.map((expense) => {
        if (expense.id !== delta.expenseId) return expense;
        matched = true;
        return { ...expense, amountMinor: centsFromBigInt(BigInt(delta.newAmountMinor)) };
      });
      if (!matched) throw DomainErrors.scenarioReferencesDeletedEntity(index);
      return { ...inputs, expenses };
    }
    case 'one_time_purchase': {
      let matched = false;
      const amount = centsFromBigInt(BigInt(delta.amountMinor));
      const assets: EngineAsset[] = inputs.assets.map((asset) => {
        if (asset.id !== delta.fundedFromAssetId) return asset;
        matched = true;
        return {
          ...asset,
          valueMinor: toCents(toDecimal(asset.valueMinor).minus(toDecimal(amount))),
        };
      });
      if (!matched) throw DomainErrors.scenarioReferencesDeletedEntity(index);
      return { ...inputs, assets };
    }
    case 'invest_cash': {
      let fromMatched = false;
      let toMatched = false;
      const amount = centsFromBigInt(BigInt(delta.amountMinor));
      const assets: EngineAsset[] = inputs.assets.map((asset) => {
        if (asset.id === delta.fromAssetId) {
          fromMatched = true;
          return {
            ...asset,
            valueMinor: toCents(toDecimal(asset.valueMinor).minus(toDecimal(amount))),
          };
        }
        if (asset.id === delta.toAssetId) {
          toMatched = true;
          return {
            ...asset,
            valueMinor: toCents(toDecimal(asset.valueMinor).plus(toDecimal(amount))),
          };
        }
        return asset;
      });
      if (!fromMatched || !toMatched) throw DomainErrors.scenarioReferencesDeletedEntity(index);
      return { ...inputs, assets };
    }
    case 'loan_early_payoff': {
      let matched = false;
      const liabilities = inputs.liabilities.map((liability) => {
        if (liability.id !== delta.liabilityId) return liability;
        matched = true;
        return { ...liability, balanceMinor: centsFromBigInt(0n) };
      });
      if (!matched) throw DomainErrors.scenarioReferencesDeletedEntity(index);
      return { ...inputs, liabilities };
    }
  }
}

export function applyDeltasToInputs(baseline: EngineInputs, deltas: ScenarioDelta[]): EngineInputs {
  return deltas.reduce((acc, delta, index) => applyOneDelta(acc, delta, index), baseline);
}
