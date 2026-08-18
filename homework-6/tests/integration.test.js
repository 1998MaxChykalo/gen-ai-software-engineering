import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../orchestrator.js';

const HW6_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE_PATH = path.join(HW6_ROOT, 'sample-transactions.json');

// The spec's expected-outcomes table (specification.md section 2) is the oracle.
const EXPECTED = {
  TXN001: { status: 'settled', requires_review: false },
  TXN002: { status: 'settled', requires_review: true, risk_score: 40 },
  TXN003: { status: 'rejected', reason: 'FRAUD_SUSPECTED', risk_score: 70 },
  TXN004: { status: 'settled', requires_review: true, risk_score: 35 },
  TXN005: { status: 'settled', requires_review: true, risk_score: 50 },
  TXN006: { status: 'rejected', reason: 'INVALID_CURRENCY' },
  TXN007: { status: 'rejected', reason: 'INVALID_AMOUNT' },
  TXN008: { status: 'settled', requires_review: false },
};

function readResults(root) {
  const resultsDir = path.join(root, 'shared', 'results');
  const records = [];
  for (const name of fs.readdirSync(resultsDir)) {
    if (!name.endsWith('.json') || name === 'summary.json') continue;
    const envelope = JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8'));
    if (envelope.target_stage === 'results') records.push(envelope.data);
  }
  return records;
}

describe('full pipeline over sample-transactions.json (isolated temp root)', () => {
  let root;
  let exitCode;
  let results;
  let summary;

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'hw6-pipeline-'));
    const txCopy = path.join(root, 'sample-transactions.json');
    fs.copyFileSync(SAMPLE_PATH, txCopy);
    exitCode = await main(['--root', root, '--transactions', txCopy]);
    results = readResults(root);
    summary = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'results', 'summary.json'), 'utf8'));
  });

  it('exits 0 and produces exactly one result per transaction', () => {
    assert.equal(exitCode, 0);
    assert.equal(results.length, 8);
    const ids = results.map((r) => r.transaction_id).sort();
    assert.deepEqual(ids, Object.keys(EXPECTED).sort());
  });

  it('matches the expected-outcomes table from specification.md', () => {
    for (const record of results) {
      const expected = EXPECTED[record.transaction_id];
      assert.equal(record.status, expected.status, record.transaction_id);
      if ('reason' in expected) assert.equal(record.reason, expected.reason, record.transaction_id);
      if ('risk_score' in expected) assert.equal(record.risk_score, expected.risk_score, record.transaction_id);
      if ('requires_review' in expected) {
        assert.equal(Boolean(record.requires_review), expected.requires_review, record.transaction_id);
      }
    }
  });

  it('summary.json has the expected counts and per-currency settled totals', () => {
    assert.deepEqual(summary.counts, { settled: 5, rejected: 3 });
    assert.equal(summary.requires_review, 3);
    assert.equal(summary.total_transactions, 8);
    assert.deepEqual(summary.settled_totals, { USD: '104599.50', EUR: '499.75' });
    assert.equal(summary.rejections.length, 3);
  });

  it('persists only masked account numbers in results (PII rule)', () => {
    for (const record of results) {
      assert.match(record.source_account, /^ACC-\*\*\d{2}$/, record.transaction_id);
      assert.match(record.destination_account, /^ACC-\*\*\d{2}$/, record.transaction_id);
    }
  });

  it('writes an audit trail with ISO 8601 timestamps, stage, id, and outcome', () => {
    const log = fs.readFileSync(path.join(root, 'shared', 'results', 'audit.log'), 'utf8').trim();
    const lines = log.split('\n');
    assert.ok(lines.length >= 8 + 2, 'one line per record per stage plus run start/finish');
    for (const line of lines) {
      assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \| [a-z_]+ \| \S+ \| \S+/);
    }
    assert.doesNotMatch(log, /ACC-\d{4}/, 'audit log must not contain unmasked accounts');
  });

  it('drains all working directories (input/processing/output empty)', () => {
    for (const dir of ['input', 'processing', 'output']) {
      assert.deepEqual(fs.readdirSync(path.join(root, 'shared', dir)), [], dir);
    }
  });
});

describe('orchestrator failure path', () => {
  it('returns exit code 1 when a transaction id yields duplicate results', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hw6-dup-'));
    const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
    const duplicated = [sample[0], { ...sample[0] }]; // same transaction_id twice
    const txPath = path.join(root, 'dup.json');
    fs.writeFileSync(txPath, JSON.stringify(duplicated));
    const code = await main(['--root', root, '--transactions', txPath]);
    assert.equal(code, 1);
  });
});
