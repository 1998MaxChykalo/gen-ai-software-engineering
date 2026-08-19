// Stage 3 — Settlement: fee calculation (decimal.js, ROUND_HALF_UP) and final results.
// Result files are the only place account numbers are persisted masked.
import fs from 'node:fs';
import Decimal from 'decimal.js';
import {
  audit,
  claimEnvelopes,
  makeEnvelope,
  maskRecord,
  writeEnvelope,
} from './common.js';

export const STAGE = 'settlement';

// Fee schedule per specification.md.
export const FEE_SCHEDULE = {
  wire_transfer: { kind: 'percent', rate: '0.001', minimum: '25.00' },
  transfer: { kind: 'flat', amount: '0.25' },
  refund: { kind: 'flat', amount: '0.00' },
};
export const DEFAULT_FLAT_FEE = '0.50';

/** Fee for one transaction. Rounded once, at the end: 2 dp, ROUND_HALF_UP. */
export function calculateFee(amount, transactionType) {
  const rule = FEE_SCHEDULE[transactionType];
  let fee;
  if (!rule) {
    fee = new Decimal(DEFAULT_FLAT_FEE);
  } else if (rule.kind === 'flat') {
    fee = new Decimal(rule.amount);
  } else {
    fee = Decimal.max(amount.mul(rule.rate), new Decimal(rule.minimum));
  }
  return fee.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Settle one cleared/review-flagged transaction: fee, net_amount, settled_at. */
export function processTransaction(record) {
  const amount = new Decimal(record.amount);
  const fee = calculateFee(amount, record.transaction_type);
  return {
    ...record,
    fee: fee.toFixed(2),
    net_amount: amount.minus(fee).toFixed(2),
    settled_at: new Date().toISOString(),
    status: 'settled',
  };
}

/** File-protocol run: input -> processing -> results (final, masked). */
export function run({ inputDir, processingDir, resultsDir }) {
  const counts = { settled: 0, errors: 0 };
  for (const { envelope, processingPath } of claimEnvelopes(inputDir, processingDir, STAGE)) {
    const transactionId = envelope.data?.transaction_id ?? 'UNKNOWN';
    try {
      const result = processTransaction(envelope.data);
      writeEnvelope(makeEnvelope(STAGE, 'results', maskRecord(result)), resultsDir);
      counts.settled += 1;
      audit(resultsDir, STAGE, transactionId, 'settled', `review=${Boolean(result.requires_review)}`);
      fs.unlinkSync(processingPath);
    } catch (err) {
      counts.errors += 1;
      audit(resultsDir, STAGE, transactionId, 'stage_error', err.message);
    }
  }
  return counts;
}
