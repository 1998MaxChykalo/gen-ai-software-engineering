// Stage 1 — Validation: structural checks only (fields, amount, currency, timestamp).
// Business/risk judgment belongs to the fraud detector.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  audit,
  claimEnvelopes,
  makeEnvelope,
  maskRecord,
  parseAmount,
  writeEnvelope,
} from './common.js';

export const STAGE = 'validator';

export const REQUIRED_FIELDS = [
  'transaction_id',
  'timestamp',
  'source_account',
  'destination_account',
  'amount',
  'currency',
  'transaction_type',
];

// ISO 4217 allowlist per specification.md — unknown codes are rejected, never converted.
export const CURRENCY_ALLOWLIST = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD']);

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function rejected(record, reason, reasonDetail) {
  const out = { ...record, status: 'rejected', reason };
  if (reasonDetail) out.reason_detail = reasonDetail;
  return out;
}

/** Validate one raw transaction record. Returns the record with status 'validated' or 'rejected' + reason. */
export function processTransaction(record) {
  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === '') {
      return rejected(record, 'MISSING_FIELD', field);
    }
  }
  try {
    parseAmount(record.amount);
  } catch (err) {
    return rejected(record, 'INVALID_AMOUNT', err.message);
  }
  if (!CURRENCY_ALLOWLIST.has(record.currency)) {
    return rejected(record, 'INVALID_CURRENCY', String(record.currency));
  }
  if (typeof record.timestamp !== 'string' || !ISO_8601.test(record.timestamp) || Number.isNaN(Date.parse(record.timestamp))) {
    return rejected(record, 'INVALID_TIMESTAMP', String(record.timestamp));
  }
  return { ...record, status: 'validated' };
}

/** File-protocol run: input -> processing -> output (validated) / results (rejected). */
export function run({ inputDir, processingDir, outputDir, resultsDir }) {
  const counts = { validated: 0, rejected: 0, errors: 0 };
  for (const { envelope, processingPath } of claimEnvelopes(inputDir, processingDir, STAGE)) {
    const transactionId = envelope.data?.transaction_id ?? 'UNKNOWN';
    try {
      const result = processTransaction(envelope.data);
      if (result.status === 'validated') {
        writeEnvelope(makeEnvelope(STAGE, 'fraud_detector', result), outputDir);
        counts.validated += 1;
      } else {
        writeEnvelope(makeEnvelope(STAGE, 'results', maskRecord(result)), resultsDir);
        counts.rejected += 1;
      }
      audit(resultsDir, STAGE, transactionId, result.status, result.reason ?? '');
      fs.unlinkSync(processingPath);
    } catch (err) {
      counts.errors += 1;
      audit(resultsDir, STAGE, transactionId, 'stage_error', err.message);
    }
  }
  return counts;
}

/** Dry-run over a transactions file: report validity without touching shared/. */
export function dryRun(transactionsPath) {
  const records = JSON.parse(fs.readFileSync(transactionsPath, 'utf8'));
  const rows = records.map((record) => {
    const result = processTransaction(record);
    return {
      transaction_id: result.transaction_id ?? 'UNKNOWN',
      valid: result.status === 'validated',
      reason: result.reason ?? '',
      reason_detail: result.reason_detail ?? '',
    };
  });
  return {
    total: rows.length,
    valid: rows.filter((r) => r.valid).length,
    invalid: rows.filter((r) => !r.valid).length,
    rows,
  };
}

function printDryRun(report) {
  const header = `${'TRANSACTION'.padEnd(14)}${'VALID'.padEnd(8)}${'REASON'.padEnd(18)}DETAIL`;
  console.log(header);
  console.log('-'.repeat(header.length + 10));
  for (const row of report.rows) {
    console.log(
      `${row.transaction_id.padEnd(14)}${(row.valid ? 'yes' : 'NO').padEnd(8)}${row.reason.padEnd(18)}${row.reason_detail}`,
    );
  }
  console.log('-'.repeat(header.length + 10));
  console.log(`total: ${report.total}  valid: ${report.valid}  invalid: ${report.invalid}`);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const args = process.argv.slice(2);
  if (!args.includes('--dry-run')) {
    console.error('Usage: node pipeline/validator.js --dry-run [transactions.json]');
    process.exit(2);
  }
  const explicitPath = args.filter((a) => a !== '--dry-run')[0];
  const defaultPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-transactions.json');
  printDryRun(dryRun(explicitPath ?? defaultPath));
}
