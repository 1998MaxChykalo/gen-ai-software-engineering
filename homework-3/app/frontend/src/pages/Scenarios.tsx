import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { AssumptionsChips } from "../components/AssumptionsChips";
import { ComparisonChart } from "../components/ComparisonChart";
import { DisclaimerFooter } from "../components/DisclaimerFooter";
import { EmptyState } from "../components/EmptyState";
import { ScenarioDeltaTable } from "../components/ScenarioDeltaTable";
import type { Profile, Scenario, ScenarioDelta, ScenarioEvaluationResponse } from "../types/api";

interface Preset {
  key: string;
  title: string;
  description: string;
  buildDeltas: (profile: Profile, currentMonth: string) => ScenarioDelta[] | null;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const PRESETS: Preset[] = [
  {
    key: "salary-up",
    title: "Salary +15%",
    description: "What if my (first) active income increased by 15%?",
    buildDeltas: (profile, month) => {
      const income = profile.incomes.find((i) => i.kind === "active") ?? profile.incomes[0];
      if (!income) return null;
      return [{ type: "income_pct_change", incomeId: income.id, pctChange: "15", effectiveMonth: month }];
    },
  },
  {
    key: "cut-expense",
    title: "Cut an expense by €200/month",
    description: "What if I reduced a variable expense by €200/month?",
    buildDeltas: (profile, month) => {
      const expense = profile.expenses.find((e) => e.kind === "variable") ?? profile.expenses[0];
      if (!expense) return null;
      const newAmount = Math.max(0, expense.amountMinor - 20000);
      return [{ type: "expense_amount_change", expenseId: expense.id, newAmountMinor: newAmount, effectiveMonth: month }];
    },
  },
  {
    key: "invest-cash",
    title: "Invest idle cash",
    description: "What if I moved €5,000 from cash into investments?",
    buildDeltas: (profile, month) => {
      const cash = profile.assets.find((a) => a.kind === "cash");
      const investment = profile.assets.find((a) => a.kind === "investment");
      if (!cash || !investment) return null;
      return [{ type: "invest_cash", amountMinor: 500000, month, fromAssetId: cash.id, toAssetId: investment.id }];
    },
  },
  {
    key: "one-time-purchase",
    title: "One-time purchase",
    description: "What if I bought something for €2,000 this month?",
    buildDeltas: (profile, month) => {
      const cash = profile.assets.find((a) => a.kind === "cash") ?? profile.assets[0];
      if (!cash) return null;
      return [{ type: "one_time_purchase", amountMinor: 200000, month, fundedFromAssetId: cash.id }];
    },
  },
  {
    key: "early-payoff",
    title: "Pay off a loan early",
    description: "What if I paid off my first liability in full this month?",
    buildDeltas: (profile, month) => {
      const liability = profile.liabilities[0];
      if (!liability) return null;
      return [{ type: "loan_early_payoff", liabilityId: liability.id, month }];
    },
  },
];

export function ScenariosPage(): JSX.Element {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [pendingDeltas, setPendingDeltas] = useState<ScenarioDelta[] | null>(null);
  const [result, setResult] = useState<ScenarioEvaluationResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAll(): Promise<void> {
    setLoading(true);
    try {
      const [p, scenarios] = await Promise.all([api.getProfile(), api.listScenarios()]);
      setProfile(p);
      setSavedScenarios(scenarios.items);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function selectPreset(preset: Preset): void {
    if (!profile) return;
    const deltas = preset.buildDeltas(profile, currentMonth());
    if (!deltas) {
      setRunError(`Your profile doesn't have the data needed for "${preset.title}" yet.`);
      return;
    }
    setRunError(null);
    setSelectedPreset(preset.key);
    setPendingDeltas(deltas);
    setResult(null);
  }

  async function runScenario(): Promise<void> {
    if (!pendingDeltas) return;
    setRunning(true);
    setRunError(null);
    try {
      const evaluation = await api.evaluateScenario(pendingDeltas);
      setResult(evaluation);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.userMessage : "Could not evaluate this scenario.");
    } finally {
      setRunning(false);
    }
  }

  async function saveScenario(): Promise<void> {
    if (!pendingDeltas || scenarioName.trim().length === 0) {
      setSaveError("Give your scenario a name first.");
      return;
    }
    setSaveError(null);
    try {
      await api.createScenario(scenarioName.trim(), pendingDeltas);
      setScenarioName("");
      const scenarios = await api.listScenarios();
      setSavedScenarios(scenarios.items);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.userMessage : "Could not save this scenario.");
    }
  }

  async function runSaved(scenario: Scenario): Promise<void> {
    setRunning(true);
    setRunError(null);
    setSelectedPreset(null);
    setPendingDeltas(scenario.deltas);
    try {
      const evaluation = await api.evaluateSavedScenario(scenario.id);
      setResult(evaluation);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.userMessage : "Could not evaluate this scenario.");
    } finally {
      setRunning(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    await api.deleteScenario(pendingDelete.id);
    setPendingDelete(null);
    const scenarios = await api.listScenarios();
    setSavedScenarios(scenarios.items);
  }

  if (loading) {
    return <p>Loading…</p>;
  }

  if (!profile) {
    return (
      <EmptyState
        title="No profile yet"
        description="Set up your profile first so scenarios have real income, expenses, assets, and liabilities to work with."
      />
    );
  }

  return (
    <div>
      <h1>What if?</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Pick a canonical question below, run it, and see how it compares to your current baseline forecast — nothing
        here changes your real profile.
      </p>

      <div className="preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            className={`preset-card${selectedPreset === preset.key ? " selected" : ""}`}
            onClick={() => selectPreset(preset)}
          >
            <strong>{preset.title}</strong>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {preset.description}
            </p>
          </button>
        ))}
      </div>

      {pendingDeltas && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => void runScenario()} disabled={running}>
              {running ? "Running…" : "Run scenario"}
            </button>
            <input
              placeholder="Name this scenario to save it"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              style={{ minWidth: "220px" }}
            />
            <button className="btn btn-teal" onClick={() => void saveScenario()}>
              Save
            </button>
          </div>
          {saveError && <p className="error-text">{saveError}</p>}
        </div>
      )}

      {runError && <p className="error-text">{runError}</p>}

      {result && (
        <div className="card">
          <h2>Baseline vs. what-if</h2>
          <AssumptionsChips assumptions={result.scenario.assumptions} />
          <ComparisonChart baselineMonths={result.baseline.months} scenarioMonths={result.scenario.months} />
          <h3 style={{ marginTop: "1.25rem" }}>Goal impact</h3>
          <ScenarioDeltaTable goalDeltas={result.goalDeltas} />
          <DisclaimerFooter disclaimer={result.scenario.disclaimer} />
        </div>
      )}

      <div className="section-title">
        <h2>Saved scenarios</h2>
      </div>
      {savedScenarios.length === 0 ? (
        <EmptyState
          title="No saved scenarios yet"
          description="Run a preset above and save it to compare it again later."
        />
      ) : (
        <div className="card">
          {savedScenarios.map((scenario) => (
            <div className="saved-scenario-row" key={scenario.id}>
              <div>
                <strong>{scenario.name}</strong>
                {scenario.status === "invalid" && (
                  <span className="badge badge-unreachable" style={{ marginLeft: "0.5rem" }}>
                    Needs review — references a deleted item
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={() => void runSaved(scenario)}>
                  Run
                </button>
                <button className="btn btn-danger" onClick={() => setPendingDelete(scenario)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Delete "{pendingDelete.name}"?</h2>
            <p>This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
