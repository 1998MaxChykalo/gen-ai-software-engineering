import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  processTransaction,
  dryRun,
  REQUIRED_FIELDS,
  CURRENCY_ALLOWLIST,
} from '../pipeline/validator.js';

const SAMPLE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'sample-transactions.json',
);

function baseRecord(overrides = {}) {
  return {
    transaction_id: 'TXN100',
    timestamp: '2026-03-16T10:00:00Z',
    source_account: 'ACC-1100',
    destination_account: 'ACC-2200',
    amount: '100.00',
    currency: 'USD',
    transaction_type: 'transfer',
    description: 'test payment',
    metadata: { channel: 'online', country: 'US' },
    ...overrides,
  };
}

describe('validator.processTransaction', () => {
  it('validates a well-formed record', () => {
    const result = processTransaction(baseRecord());
    assert.equal(result.status, 'validated');
    assert.equal(result.reason, undefined);
  });

  it('accepts every allowlisted currency', () => {
    for (const currency of CURRENCY_ALLOWLIST) {
      assert.equal(processTransaction(baseRecord({ currency })).status, 'validated');
    }
  });

  for (const field of REQUIRED_FIELDS) {
    it(`rejects MISSING_FIELD when ${field} is absent`, () => {
      const record = baseRecord();
      delete record[field];
      const result = processTransaction(record);
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason, 'MISSING_FIELD');
      assert.equal(result.reason_detail, field);
    });
  }

  it('treats an empty-string field as missing', () => {
    const result = processTransaction(baseRecord({ currency: '' }));
    assert.equal(result.reason, 'MISSING_FIELD');
  });

  describe('INVALID_AMOUNT', () => {
    const cases = {
      zero: '0.00',
      negative: '-100.00',
      'three decimal places': '10.123',
      'not a number': 'abc',
      'number instead of string': 100,
    };
    for (const [label, amount] of Object.entries(cases)) {
      it(`rejects ${label} (${JSON.stringify(amount)})`, () => {
        const result = processTransaction(baseRecord({ amount }));
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason, 'INVALID_AMOUNT');
      });
    }

    it('accepts the smallest positive amount 0.01', () => {
      assert.equal(processTransaction(baseRecord({ amount: '0.01' })).status, 'validated');
    });
  });

  it('rejects INVALID_CURRENCY for non-ISO-4217 code (TXN006 case)', () => {
    const result = processTransaction(baseRecord({ currency: 'XYZ' }));
    assert.equal(result.reason, 'INVALID_CURRENCY');
    assert.equal(result.reason_detail, 'XYZ');
  });

  it('rejects lowercase currency codes', () => {
    assert.equal(processTransaction(baseRecord({ currency: 'usd' })).reason, 'INVALID_CURRENCY');
  });

  describe('INVALID_TIMESTAMP', () => {
    const bad = ['not-a-date', '2026-13-45T99:00:00Z', '2026-03-16T10:00:00', '16.03.2026 10:00'];
    for (const timestamp of bad) {
      it(`rejects ${JSON.stringify(timestamp)}`, () => {
        assert.equal(processTransaction(baseRecord({ timestamp })).reason, 'INVALID_TIMESTAMP');
      });
    }

    it('accepts an ISO 8601 timestamp with offset', () => {
      const result = processTransaction(baseRecord({ timestamp: '2026-03-16T10:00:00+02:00' }));
      assert.equal(result.status, 'validated');
    });
  });

  it('checks amount before currency (rejection reasons are ordered)', () => {
    const result = processTransaction(baseRecord({ amount: '-1.00', currency: 'XYZ' }));
    assert.equal(result.reason, 'INVALID_AMOUNT');
  });
});

describe('validator.dryRun (sample data)', () => {
  it('reports 8 total, 6 valid, 2 invalid with the expected reasons', () => {
    const report = dryRun(SAMPLE_PATH);
    assert.equal(report.total, 8);
    assert.equal(report.valid, 6);
    assert.equal(report.invalid, 2);
    const byId = Object.fromEntries(report.rows.map((r) => [r.transaction_id, r]));
    assert.equal(byId.TXN006.reason, 'INVALID_CURRENCY');
    assert.equal(byId.TXN007.reason, 'INVALID_AMOUNT');
    assert.equal(byId.TXN001.valid, true);
  });
});
