// Stage 2 — Fraud detection: additive risk scoring per specification.md.
// score >= 70 -> rejected (FRAUD_SUSPECTED); 30..69 -> flagged_for_review; < 30 -> cleared.
import fs from 'node:fs';
import Decimal from 'decimal.js';
import {
  audit,
  claimEnvelopes,
  makeEnvelope,
  maskRecord,
  writeEnvelope,
} from './common.js';

export const STAGE = 'fraud_detector';

export const WATCHLIST = new Set(['ACC-9999']);
export const REJECT_THRESHOLD = 70;
export const REVIEW_THRESHOLD = 30;

export const RULE_WEIGHTS = {
  VERY_HIGH_VALUE: 50, // amount > 50,000
  HIGH_VALUE: 40, // 10,000 < amount <= 50,000 (mutually exclusive with VERY_HIGH_VALUE)
  NEAR_THRESHOLD: 30, // 9,000 <= amount < 10,000 — structuring just under reporting threshold
  WATCHLIST_ACCOUNT: 40, // destination account on the watchlist
  OFF_HOURS: 20, // UTC hour 00:00–04:59
  CROSS_BORDER: 15, // metadata.country != US
};

/** Score a validated transaction. Returns { score: 0..100, factors: [rule codes] }. */
export function scoreTransaction(record) {
  const amount = new Decimal(record.amount);
  const factors = [];

  if (amount.gt(50_000)) {
    factors.push('VERY_HIGH_VALUE');
  } else if (amount.gt(10_000)) {
    factors.push('HIGH_VALUE');
  }
  if (amount.gte(9_000) && amount.lt(10_000)) {
    factors.push('NEAR_THRESHOLD');
  }
  if (WATCHLIST.has(record.destination_account)) {
    factors.push('WATCHLIST_ACCOUNT');
  }
  if (new Date(record.timestamp).getUTCHours() < 5) {
    factors.push('OFF_HOURS');
  }
  if (record.metadata?.country !== undefined && record.metadata.country !== 'US') {
    factors.push('CROSS_BORDER');
  }

  const raw = factors.reduce((sum, code) => sum + RULE_WEIGHTS[code], 0);
  return { score: Math.min(raw, 100), factors };
}

/** Attach risk score/factors and decide: rejected / flagged_for_review / cleared. */
export function processTransaction(record) {
  const { score, factors } = scoreTransaction(record);
  const scored = { ...record, risk_score: score, risk_factors: factors };
  if (score >= REJECT_THRESHOLD) {
    return { ...scored, status: 'rejected', reason: 'FRAUD_SUSPECTED' };
  }
  if (score >= REVIEW_THRESHOLD) {
    return { ...scored, status: 'flagged_for_review', requires_review: true };
  }
  return { ...scored, status: 'cleared' };
}

/** File-protocol run: input -> processing -> output (settlement) / results (fraud rejections). */
export function run({ inputDir, processingDir, outputDir, resultsDir }) {
  const counts = { cleared: 0, flagged_for_review: 0, rejected: 0, errors: 0 };
  for (const { envelope, processingPath } of claimEnvelopes(inputDir, processingDir, STAGE)) {
    const transactionId = envelope.data?.transaction_id ?? 'UNKNOWN';
    try {
      const result = processTransaction(envelope.data);
      if (result.status === 'rejected') {
        writeEnvelope(makeEnvelope(STAGE, 'results', maskRecord(result)), resultsDir);
      } else {
        writeEnvelope(makeEnvelope(STAGE, 'settlement', result), outputDir);
      }
      counts[result.status] += 1;
      audit(
        resultsDir,
        STAGE,
        transactionId,
        result.status,
        `score=${result.risk_score} factors=[${result.risk_factors.join(',')}]`,
      );
      fs.unlinkSync(processingPath);
    } catch (err) {
      counts.errors += 1;
      audit(resultsDir, STAGE, transactionId, 'stage_error', err.message);
    }
  }
  return counts;
}
