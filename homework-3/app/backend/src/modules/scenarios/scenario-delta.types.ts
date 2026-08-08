/**
 * Scenario delta types (specification.md binding HTTP contract — discriminated
 * union on `type`). Validated at runtime by `validateDeltas` (see
 * scenarios.service.ts) rather than through class-validator's more limited
 * polymorphic-DTO support, which keeps the five canonical shapes exactly as
 * specified without fighting class-transformer discriminators.
 */
export interface IncomePctChangeDelta {
  type: 'income_pct_change';
  incomeId: string | null;
  pctChange: string;
  effectiveMonth: string;
}

export interface ExpenseAmountChangeDelta {
  type: 'expense_amount_change';
  expenseId: string;
  newAmountMinor: number;
  effectiveMonth: string;
}

export interface OneTimePurchaseDelta {
  type: 'one_time_purchase';
  amountMinor: number;
  month: string;
  fundedFromAssetId: string;
}

export interface InvestCashDelta {
  type: 'invest_cash';
  amountMinor: number;
  month: string;
  fromAssetId: string;
  toAssetId: string;
}

export interface LoanEarlyPayoffDelta {
  type: 'loan_early_payoff';
  liabilityId: string;
  month: string;
}

export type ScenarioDelta =
  | IncomePctChangeDelta
  | ExpenseAmountChangeDelta
  | OneTimePurchaseDelta
  | InvestCashDelta
  | LoanEarlyPayoffDelta;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PCT_PATTERN = /^-?\d+(\.\d{1,4})?$/;

/** Runtime shape validation. Throws a plain Error with a human-readable reason; the caller wraps it as a DomainError. */
export function validateDeltaShape(raw: unknown, index: number): ScenarioDelta {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    throw new Error(`deltas[${index}] is not a valid scenario delta object`);
  }
  const d = raw as Record<string, unknown>;
  const fail = (msg: string): never => {
    throw new Error(`deltas[${index}] (${String(d.type)}): ${msg}`);
  };

  switch (d.type) {
    case 'income_pct_change': {
      if (d.incomeId !== null && typeof d.incomeId !== 'string')
        fail('incomeId must be a string or null');
      if (typeof d.pctChange !== 'string' || !PCT_PATTERN.test(d.pctChange))
        fail('pctChange must be a decimal string');
      if (typeof d.effectiveMonth !== 'string' || !MONTH_PATTERN.test(d.effectiveMonth))
        fail('effectiveMonth must be YYYY-MM');
      return d as unknown as IncomePctChangeDelta;
    }
    case 'expense_amount_change': {
      if (typeof d.expenseId !== 'string') fail('expenseId is required');
      if (
        typeof d.newAmountMinor !== 'number' ||
        !Number.isInteger(d.newAmountMinor) ||
        d.newAmountMinor < 0
      )
        fail('newAmountMinor must be a non-negative integer');
      if (typeof d.effectiveMonth !== 'string' || !MONTH_PATTERN.test(d.effectiveMonth))
        fail('effectiveMonth must be YYYY-MM');
      return d as unknown as ExpenseAmountChangeDelta;
    }
    case 'one_time_purchase': {
      if (
        typeof d.amountMinor !== 'number' ||
        !Number.isInteger(d.amountMinor) ||
        d.amountMinor < 1
      )
        fail('amountMinor must be a positive integer');
      if (typeof d.month !== 'string' || !MONTH_PATTERN.test(d.month))
        fail('month must be YYYY-MM');
      if (typeof d.fundedFromAssetId !== 'string') fail('fundedFromAssetId is required');
      return d as unknown as OneTimePurchaseDelta;
    }
    case 'invest_cash': {
      if (
        typeof d.amountMinor !== 'number' ||
        !Number.isInteger(d.amountMinor) ||
        d.amountMinor < 1
      )
        fail('amountMinor must be a positive integer');
      if (typeof d.month !== 'string' || !MONTH_PATTERN.test(d.month))
        fail('month must be YYYY-MM');
      if (typeof d.fromAssetId !== 'string') fail('fromAssetId is required');
      if (typeof d.toAssetId !== 'string') fail('toAssetId is required');
      return d as unknown as InvestCashDelta;
    }
    case 'loan_early_payoff': {
      if (typeof d.liabilityId !== 'string') fail('liabilityId is required');
      if (typeof d.month !== 'string' || !MONTH_PATTERN.test(d.month))
        fail('month must be YYYY-MM');
      return d as unknown as LoanEarlyPayoffDelta;
    }
    default:
      return fail(`unknown delta type "${String(d.type)}"`);
  }
}

export function validateDeltas(raw: unknown[]): ScenarioDelta[] {
  return raw.map((d, i) => validateDeltaShape(d, i));
}
