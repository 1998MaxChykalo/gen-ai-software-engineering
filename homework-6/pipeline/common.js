// Shared pipeline protocol: message envelopes, atomic file I/O, audit logging,
// PII masking, and decimal amount parsing. See specification.md section 3.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';

export const AUDIT_LOG_NAME = 'audit.log';

/** Build a standard message envelope (specification.md, file-based pipeline protocol). */
export function makeEnvelope(sourceStage, targetStage, data, messageType = 'transaction') {
  return {
    message_id: randomUUID(),
    timestamp: new Date().toISOString(),
    source_stage: sourceStage,
    target_stage: targetStage,
    message_type: messageType,
    data,
  };
}

/**
 * Write an envelope atomically (temp file + rename) so a reader never sees
 * half-written JSON. Returns the final file path.
 */
export function writeEnvelope(envelope, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const transactionId = envelope.data?.transaction_id ?? 'unknown';
  const fileName = `${envelope.source_stage}-${transactionId}-${envelope.message_id}.json`;
  const tmpPath = path.join(directory, `.${fileName}.tmp`);
  const finalPath = path.join(directory, fileName);
  fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2));
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}

/**
 * Read all envelopes in a directory, optionally filtered by target_stage.
 * Returns [{ envelope, path }]; non-envelope files (summary.json, audit.log,
 * temp files) are skipped.
 */
export function readEnvelopes(directory, targetStage) {
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const name of fs.readdirSync(directory).sort()) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const filePath = path.join(directory, name);
    let envelope;
    try {
      envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!envelope || typeof envelope !== 'object' || !envelope.message_id) continue;
    if (targetStage && envelope.target_stage !== targetStage) continue;
    out.push({ envelope, path: filePath });
  }
  return out;
}

/**
 * Claim the envelopes addressed to a stage: snapshot the input directory,
 * move each claimed file into processing/. Returns [{ envelope, processingPath }].
 */
export function claimEnvelopes(inputDir, processingDir, targetStage) {
  fs.mkdirSync(processingDir, { recursive: true });
  return readEnvelopes(inputDir, targetStage).map(({ envelope, path: filePath }) => {
    const processingPath = path.join(processingDir, path.basename(filePath));
    fs.renameSync(filePath, processingPath);
    return { envelope, processingPath };
  });
}

/**
 * Parse a monetary amount. Amounts travel as strings in JSON and become
 * decimal.js Decimals at the edge — native JS numbers never hold money.
 * Throws for non-string, non-decimal, non-positive, or >2-decimal-place input.
 */
export function parseAmount(value) {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) {
    throw new Error(`amount is not a decimal string: ${JSON.stringify(value)}`);
  }
  const amount = new Decimal(value.trim());
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error('amount must be positive');
  }
  if (amount.decimalPlaces() > 2) {
    throw new Error('amount must have at most 2 decimal places');
  }
  return amount;
}

/** Mask an account number for logs/results: 'ACC-1001' -> 'ACC-**01'. */
export function maskAccount(account) {
  if (typeof account !== 'string' || account.length < 3) return '***';
  const prefix = account.startsWith('ACC-') ? 'ACC-' : '';
  return `${prefix}**${account.slice(-2)}`;
}

/** Copy of a record with both account fields masked (used for anything persisted to results). */
export function maskRecord(record) {
  const masked = { ...record };
  if ('source_account' in masked) masked.source_account = maskAccount(masked.source_account);
  if ('destination_account' in masked) masked.destination_account = maskAccount(masked.destination_account);
  return masked;
}

/**
 * Audit trail: one ISO 8601 UTC line per operation, to stderr and
 * <resultsDir>/audit.log. Callers must never pass unmasked accounts,
 * names, or amounts in `detail`.
 */
export function audit(resultsDir, stage, transactionId, outcome, detail = '') {
  const line = `${new Date().toISOString()} | ${stage} | ${transactionId} | ${outcome}${detail ? ` | ${detail}` : ''}`;
  process.stderr.write(`${line}\n`);
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.appendFileSync(path.join(resultsDir, AUDIT_LOG_NAME), `${line}\n`);
}
