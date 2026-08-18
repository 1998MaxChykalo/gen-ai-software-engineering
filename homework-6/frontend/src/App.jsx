import { useCallback, useEffect, useState } from 'react';

const STATUS_META = {
  settled: { label: 'Settled', className: 'badge badge-settled' },
  rejected: { label: 'Rejected', className: 'badge badge-rejected' },
};

function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function StatusBadge({ transaction }) {
  if (transaction.status === 'settled' && transaction.requires_review) {
    return <span className="badge badge-review">Settled · review</span>;
  }
  const meta = STATUS_META[transaction.status] ?? { label: transaction.status, className: 'badge' };
  return <span className={meta.className}>{meta.label}</span>;
}

export default function App() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [summaryRes, txRes] = await Promise.all([
        fetch('/api/summary'),
        fetch('/api/transactions'),
      ]);
      setSummary(summaryRes.ok ? await summaryRes.json() : null);
      setTransactions(txRes.ok ? await txRes.json() : []);
      setError(null);
    } catch (err) {
      setError(`Could not reach the pipeline API: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runPipeline() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/run', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `pipeline exited with status ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(`Pipeline run failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  }

  const settledTotals = summary ? Object.entries(summary.settled_totals ?? {}) : [];

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Transaction Processing Pipeline</h1>
          <p className="subtitle">validator → fraud detector → settlement</p>
        </div>
        <button className="run-button" onClick={runPipeline} disabled={running}>
          {running ? 'Running…' : 'Run pipeline'}
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!summary && !error && (
        <div className="empty-state">
          <p>No pipeline run yet.</p>
          <p>Press “Run pipeline” to process <code>sample-transactions.json</code>.</p>
        </div>
      )}

      {summary && (
        <>
          <section className="stats">
            <StatCard label="Transactions" value={summary.total_transactions} tone="neutral" />
            <StatCard label="Settled" value={summary.counts.settled} tone="ok" />
            <StatCard label="Needs review" value={summary.requires_review} tone="warn" />
            <StatCard label="Rejected" value={summary.counts.rejected} tone="bad" />
          </section>

          {settledTotals.length > 0 && (
            <p className="totals">
              Settled net totals:{' '}
              {settledTotals.map(([currency, total]) => `${total} ${currency}`).join(' · ')}
              <span className="run-meta"> — run {summary.run_id.slice(0, 8)} finished {summary.finished_at}</span>
            </p>
          )}

          <table className="tx-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>From → To</th>
                <th>Amount</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.transaction_id}>
                  <td className="mono">{tx.transaction_id}</td>
                  <td className="mono">
                    {tx.source_account} → {tx.destination_account}
                  </td>
                  <td className="mono amount">
                    {tx.amount} {tx.currency}
                  </td>
                  <td>{tx.risk_score ?? '—'}</td>
                  <td>
                    <StatusBadge transaction={tx} />
                  </td>
                  <td className="reason">
                    {tx.reason ?? ''}
                    {tx.risk_factors?.length ? (
                      <span className="factors"> {tx.risk_factors.join(', ')}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <footer className="footer">Homework 6 capstone — created by Maksym Chykalo</footer>
    </div>
  );
}
