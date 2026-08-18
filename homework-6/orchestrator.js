// Orchestrator: sets up shared/ directories, seeds input envelopes from the
// transactions file, runs the three stages in order, verifies completeness,
// and writes shared/results/summary.json. See specification.md, Low-Level Task 5.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Decimal from 'decimal.js';
import { audit, makeEnvelope, readEnvelopes, writeEnvelope } from './pipeline/common.js';
import * as validator from './pipeline/validator.js';
import * as fraudDetector from './pipeline/fraud-detector.js';
import * as settlement from './pipeline/settlement.js';

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHARED_SUBDIRS = ['input', 'processing', 'output', 'results'];

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function prepareSharedDirs(root) {
  const shared = path.join(root, 'shared');
  fs.rmSync(shared, { recursive: true, force: true });
  const dirs = {};
  for (const name of SHARED_SUBDIRS) {
    dirs[name] = path.join(shared, name);
    fs.mkdirSync(dirs[name], { recursive: true });
  }
  return dirs;
}

function buildSummary({ runId, startedAt, records, results }) {
  const settled = results.filter((r) => r.status === 'settled');
  const rejected = results.filter((r) => r.status === 'rejected');
  const settledTotals = {};
  for (const record of settled) {
    const current = settledTotals[record.currency] ?? new Decimal(0);
    settledTotals[record.currency] = current.plus(new Decimal(record.net_amount));
  }
  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_transactions: records.length,
    counts: { settled: settled.length, rejected: rejected.length },
    requires_review: settled.filter((r) => r.requires_review).length,
    rejections: rejected.map((r) => ({
      transaction_id: r.transaction_id,
      reason: r.reason,
      ...(r.reason_detail !== undefined && { reason_detail: r.reason_detail }),
      ...(r.risk_score !== undefined && { risk_score: r.risk_score, risk_factors: r.risk_factors }),
    })),
    settled_totals: Object.fromEntries(
      Object.entries(settledTotals).map(([currency, total]) => [currency, total.toFixed(2)]),
    ),
  };
}

function printSummaryTable(results, summary) {
  const header = `${'TRANSACTION'.padEnd(14)}${'STATUS'.padEnd(11)}${'REVIEW'.padEnd(9)}${'RISK'.padEnd(6)}REASON`;
  console.log(`\n${header}`);
  console.log('-'.repeat(header.length + 10));
  for (const r of [...results].sort((a, b) => a.transaction_id.localeCompare(b.transaction_id))) {
    console.log(
      `${r.transaction_id.padEnd(14)}${r.status.padEnd(11)}${(r.requires_review ? 'yes' : '-').padEnd(9)}${String(r.risk_score ?? '-').padEnd(6)}${r.reason ?? ''}`,
    );
  }
  console.log('-'.repeat(header.length + 10));
  console.log(
    `total: ${summary.total_transactions}  settled: ${summary.counts.settled}` +
      `  requires_review: ${summary.requires_review}  rejected: ${summary.counts.rejected}`,
  );
  const totals = Object.entries(summary.settled_totals)
    .map(([currency, total]) => `${currency} ${total}`)
    .join(', ');
  if (totals) console.log(`settled net totals: ${totals}`);
}

export async function main(argv = []) {
  const root = argValue(argv, '--root') ?? MODULE_ROOT;
  const transactionsPath =
    argValue(argv, '--transactions') ?? path.join(MODULE_ROOT, 'sample-transactions.json');

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const dirs = prepareSharedDirs(root);
  const resultsDir = dirs.results;

  const records = JSON.parse(fs.readFileSync(transactionsPath, 'utf8'));
  audit(resultsDir, 'orchestrator', `RUN-${runId.slice(0, 8)}`, 'started', `records=${records.length}`);

  for (const record of records) {
    writeEnvelope(makeEnvelope('orchestrator', 'validator', record), dirs.input);
  }

  const stageDirs = {
    inputDir: dirs.input,
    processingDir: dirs.processing,
    outputDir: dirs.output,
    resultsDir,
  };
  validator.run(stageDirs);
  fraudDetector.run({ ...stageDirs, inputDir: dirs.output });
  settlement.run({ inputDir: dirs.output, processingDir: dirs.processing, resultsDir });

  const results = readEnvelopes(resultsDir, 'results').map(({ envelope }) => envelope.data);
  const unaccounted = records
    .map((r) => r.transaction_id)
    .filter((id) => results.filter((d) => d.transaction_id === id).length !== 1);

  const summary = buildSummary({ runId, startedAt, records, results });
  const summaryPath = path.join(resultsDir, 'summary.json');
  fs.writeFileSync(`${summaryPath}.tmp`, JSON.stringify(summary, null, 2));
  fs.renameSync(`${summaryPath}.tmp`, summaryPath);

  printSummaryTable(results, summary);

  if (unaccounted.length > 0) {
    audit(resultsDir, 'orchestrator', `RUN-${runId.slice(0, 8)}`, 'failed', `unaccounted=${unaccounted.join(',')}`);
    console.error(`ERROR: transactions without exactly one result: ${unaccounted.join(', ')}`);
    return 1;
  }
  audit(resultsDir, 'orchestrator', `RUN-${runId.slice(0, 8)}`, 'finished', `results=${results.length}`);
  return 0;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
