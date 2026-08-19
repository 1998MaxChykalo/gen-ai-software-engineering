// Express API over shared/results/ + static hosting for the built React dashboard.
// The API only reads final result files, which are persisted with masked accounts —
// unmasked working files in shared/input|processing|output are never exposed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { main as runPipeline } from '../orchestrator.js';
import { readEnvelopes } from '../pipeline/common.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = path.join(ROOT, 'shared', 'results');
const DIST_DIR = path.join(ROOT, 'frontend', 'dist');

export const app = express();

function readSummary() {
  const summaryPath = path.join(RESULTS_DIR, 'summary.json');
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

app.get('/api/summary', (req, res) => {
  const summary = readSummary();
  if (!summary) {
    res.status(404).json({ error: 'No pipeline run yet. Trigger one with POST /api/run.' });
    return;
  }
  res.json(summary);
});

app.get('/api/transactions', (req, res) => {
  const transactions = readEnvelopes(RESULTS_DIR, 'results')
    .map(({ envelope }) => envelope.data)
    .sort((a, b) => String(a.transaction_id).localeCompare(String(b.transaction_id)));
  res.json(transactions);
});

app.post('/api/run', async (req, res) => {
  try {
    const exitCode = await runPipeline([]);
    const summary = readSummary();
    res.status(exitCode === 0 ? 200 : 500).json({ exit_code: exitCode, summary });
  } catch (err) {
    res.status(500).json({ error: `Pipeline run failed: ${err.message}` });
  }
});

app.use(express.static(DIST_DIR));

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Pipeline dashboard: http://localhost:${port}`);
    if (!fs.existsSync(DIST_DIR)) {
      console.log('(frontend/dist not found — run "npm run build" in frontend/ for the UI; the /api endpoints work regardless)');
    }
  });
}
