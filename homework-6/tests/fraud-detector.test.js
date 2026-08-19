import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreTransaction,
  processTransaction,
  RULE_WEIGHTS,
  REJECT_THRESHOLD,
  REVIEW_THRESHOLD,
  WATCHLIST,
} from '../pipeline/fraud-detector.js';

function record(overrides = {}) {
  // Neutral baseline: business hours, domestic, small amount, clean destination.
  return {
    transaction_id: 'TXN200',
    timestamp: '2026-03-16T12:00:00Z',
    source_account: 'ACC-1100',
    destination_account: 'ACC-2200',
    amount: '100.00',
    currency: 'USD',
    transaction_type: 'transfer',
    metadata: { channel: 'online', country: 'US' },
    status: 'validated',
  };
}

describe('fraud-detector.scoreTransaction — rules in isolation', () => {
  it('neutral record scores 0 with no factors', () => {
    assert.deepEqual(scoreTransaction(record()), { score: 0, factors: [] });
  });

  it('VERY_HIGH_VALUE: amount > 50,000', () => {
    const { score, factors } = scoreTransaction({ ...record(), amount: '50000.01' });
    assert.deepEqual(factors, ['VERY_HIGH_VALUE']);
    assert.equal(score, RULE_WEIGHTS.VERY_HIGH_VALUE);
  });

  it('boundary: exactly 50,000.00 is HIGH_VALUE, not VERY_HIGH_VALUE', () => {
    assert.deepEqual(scoreTransaction({ ...record(), amount: '50000.00' }).factors, ['HIGH_VALUE']);
  });

  it('HIGH_VALUE: amount just above 10,000', () => {
    const { score, factors } = scoreTransaction({ ...record(), amount: '10000.01' });
    assert.deepEqual(factors, ['HIGH_VALUE']);
    assert.equal(score, RULE_WEIGHTS.HIGH_VALUE);
  });

  it('boundary: exactly 10,000.00 does not trigger HIGH_VALUE', () => {
    assert.deepEqual(scoreTransaction({ ...record(), amount: '10000.00' }).factors, []);
  });

  it('NEAR_THRESHOLD: 9,000.00 and 9,999.99 trigger, 8,999.99 does not', () => {
    assert.deepEqual(scoreTransaction({ ...record(), amount: '9000.00' }).factors, ['NEAR_THRESHOLD']);
    assert.deepEqual(scoreTransaction({ ...record(), amount: '9999.99' }).factors, ['NEAR_THRESHOLD']);
    assert.deepEqual(scoreTransaction({ ...record(), amount: '8999.99' }).factors, []);
  });

  it('WATCHLIST_ACCOUNT: watchlisted destination', () => {
    const dest = [...WATCHLIST][0];
    const { score, factors } = scoreTransaction({ ...record(), destination_account: dest });
    assert.deepEqual(factors, ['WATCHLIST_ACCOUNT']);
    assert.equal(score, RULE_WEIGHTS.WATCHLIST_ACCOUNT);
  });

  it('OFF_HOURS: 04:59 UTC triggers, 05:00 UTC does not', () => {
    assert.deepEqual(
      scoreTransaction({ ...record(), timestamp: '2026-03-16T04:59:59Z' }).factors,
      ['OFF_HOURS'],
    );
    assert.deepEqual(scoreTransaction({ ...record(), timestamp: '2026-03-16T05:00:00Z' }).factors, []);
  });

  it('CROSS_BORDER: non-US country triggers, missing metadata does not', () => {
    const cross = record();
    cross.metadata = { country: 'DE' };
    assert.deepEqual(scoreTransaction(cross).factors, ['CROSS_BORDER']);
    const noMeta = record();
    delete noMeta.metadata;
    assert.deepEqual(scoreTransaction(noMeta).factors, []);
  });
});

describe('fraud-detector.scoreTransaction — combinations from the spec outcome table', () => {
  it('TXN003 case: structuring + watchlist = 70', () => {
    const dest = [...WATCHLIST][0];
    const { score, factors } = scoreTransaction({
      ...record(),
      amount: '9999.99',
      destination_account: dest,
    });
    assert.equal(score, 70);
    assert.deepEqual(factors.sort(), ['NEAR_THRESHOLD', 'WATCHLIST_ACCOUNT']);
  });

  it('TXN004 case: off-hours + cross-border = 35', () => {
    const r = { ...record(), timestamp: '2026-03-16T02:47:00Z' };
    r.metadata = { country: 'DE' };
    assert.equal(scoreTransaction(r).score, 35);
  });

  it('caps the score at 100', () => {
    const dest = [...WATCHLIST][0];
    const r = {
      ...record(),
      amount: '9999.99', // 30
      destination_account: dest, // +40
      timestamp: '2026-03-16T02:00:00Z', // +20
    };
    r.metadata = { country: 'DE' }; // +15 => 105 raw
    assert.equal(scoreTransaction(r).score, 100);
  });
});

describe('fraud-detector.processTransaction — decisions', () => {
  it(`score >= ${REJECT_THRESHOLD} rejects with FRAUD_SUSPECTED`, () => {
    const dest = [...WATCHLIST][0];
    const result = processTransaction({ ...record(), amount: '9999.99', destination_account: dest });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'FRAUD_SUSPECTED');
    assert.equal(result.risk_score, 70);
  });

  it(`score just below ${REJECT_THRESHOLD} is flagged, not rejected (65 = VERY_HIGH_VALUE + CROSS_BORDER)`, () => {
    const r = { ...record(), amount: '75000.00' };
    r.metadata = { country: 'GB' };
    const result = processTransaction(r);
    assert.equal(result.risk_score, 65);
    assert.equal(result.status, 'flagged_for_review');
    assert.equal(result.requires_review, true);
  });

  it(`score exactly ${REVIEW_THRESHOLD} is flagged for review`, () => {
    const result = processTransaction({ ...record(), amount: '9500.00' });
    assert.equal(result.risk_score, 30);
    assert.equal(result.status, 'flagged_for_review');
  });

  it(`score below ${REVIEW_THRESHOLD} is cleared without requires_review (20 = OFF_HOURS)`, () => {
    const result = processTransaction({ ...record(), timestamp: '2026-03-16T03:00:00Z' });
    assert.equal(result.risk_score, 20);
    assert.equal(result.status, 'cleared');
    assert.equal(result.requires_review, undefined);
  });

  it('always attaches risk_score and risk_factors', () => {
    const result = processTransaction(record());
    assert.equal(result.risk_score, 0);
    assert.deepEqual(result.risk_factors, []);
    assert.equal(result.status, 'cleared');
  });
});
