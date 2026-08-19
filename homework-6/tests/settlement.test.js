import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { calculateFee, processTransaction, FEE_SCHEDULE, DEFAULT_FLAT_FEE } from '../pipeline/settlement.js';
import { maskAccount, maskRecord, parseAmount } from '../pipeline/common.js';

function record(overrides = {}) {
  return {
    transaction_id: 'TXN300',
    timestamp: '2026-03-16T12:00:00Z',
    source_account: 'ACC-1100',
    destination_account: 'ACC-2200',
    amount: '1500.00',
    currency: 'USD',
    transaction_type: 'transfer',
    status: 'cleared',
    risk_score: 0,
    risk_factors: [],
    ...overrides,
  };
}

describe('settlement.calculateFee', () => {
  it('wire_transfer: 0.1% of the amount (TXN005 case: 75,000 -> 75.00)', () => {
    assert.equal(calculateFee(new Decimal('75000.00'), 'wire_transfer').toFixed(2), '75.00');
  });

  it('wire_transfer boundary: 0.1% of 25,000.00 equals the 25.00 minimum exactly', () => {
    assert.equal(calculateFee(new Decimal('25000.00'), 'wire_transfer').toFixed(2), '25.00');
  });

  it('wire_transfer below the boundary: minimum 25.00 applies (10,000 -> 25.00, not 10.00)', () => {
    assert.equal(calculateFee(new Decimal('10000.00'), 'wire_transfer').toFixed(2), '25.00');
  });

  it('rounds HALF_UP once at the end (30,125.00 -> 30.125 -> 30.13)', () => {
    assert.equal(calculateFee(new Decimal('30125.00'), 'wire_transfer').toFixed(2), '30.13');
  });

  it('transfer: flat fee from the schedule', () => {
    assert.equal(calculateFee(new Decimal('1500.00'), 'transfer').toFixed(2), FEE_SCHEDULE.transfer.amount);
  });

  it('refund: zero fee', () => {
    assert.equal(calculateFee(new Decimal('100.00'), 'refund').toFixed(2), '0.00');
  });

  it('unknown type: default flat fee', () => {
    assert.equal(calculateFee(new Decimal('100.00'), 'crypto_swap').toFixed(2), DEFAULT_FLAT_FEE);
  });
});

describe('settlement.processTransaction', () => {
  it('settles with fee, net_amount, and settled_at (TXN002 case)', () => {
    const result = processTransaction(
      record({ transaction_id: 'TXN002', amount: '25000.00', transaction_type: 'wire_transfer' }),
    );
    assert.equal(result.status, 'settled');
    assert.equal(result.fee, '25.00');
    assert.equal(result.net_amount, '24975.00');
    assert.match(result.settled_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('serializes money as 2-dp strings, never numbers', () => {
    const result = processTransaction(record());
    assert.equal(typeof result.fee, 'string');
    assert.equal(typeof result.net_amount, 'string');
    assert.equal(result.net_amount, '1499.75');
  });

  it('preserves requires_review from the fraud stage', () => {
    const result = processTransaction(record({ requires_review: true, status: 'flagged_for_review' }));
    assert.equal(result.requires_review, true);
    assert.equal(result.status, 'settled');
  });
});

describe('common — masking and amount parsing (persisted-results invariants)', () => {
  it('maskAccount keeps the ACC- prefix and last 2 characters', () => {
    assert.equal(maskAccount('ACC-1001'), 'ACC-**01');
    assert.equal(maskAccount('ACC-9999'), 'ACC-**99');
  });

  it('maskAccount handles non-ACC and degenerate values', () => {
    assert.equal(maskAccount('DE44500105175407324931'), '**31');
    assert.equal(maskAccount('X'), '***');
    assert.equal(maskAccount(undefined), '***');
  });

  it('maskRecord masks both account fields and copies the rest', () => {
    const original = record();
    const masked = maskRecord(original);
    assert.equal(masked.source_account, 'ACC-**00');
    assert.equal(masked.destination_account, 'ACC-**00');
    assert.equal(masked.amount, original.amount);
    assert.equal(original.source_account, 'ACC-1100'); // input not mutated
  });

  it('parseAmount returns a Decimal for valid strings and rejects junk', () => {
    assert.equal(parseAmount('1500.00').toFixed(2), '1500.00');
    assert.throws(() => parseAmount('0.00'));
    assert.throws(() => parseAmount('1.999'));
    assert.throws(() => parseAmount(15));
    assert.throws(() => parseAmount('1,500.00'));
  });
});
