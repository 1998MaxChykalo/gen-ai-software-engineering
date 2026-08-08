import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { EmptyState } from "../components/EmptyState";
import { GoalCard } from "../components/GoalCard";
import type { ContributionKind, CreateGoalInput, Goal, GoalType } from "../types/api";
import { minorToEuroInputString, MoneyParseError, parseEurToMinor } from "../utils/money";

const GOAL_TYPES: GoalType[] = [
  "house",
  "car",
  "emergency_fund",
  "net_worth",
  "financial_independence",
  "retirement",
  "vacation",
  "custom",
];

interface GoalFormState {
  name: string;
  type: GoalType;
  targetAmount: string;
  targetMonth: string;
  priority: string;
  contributionKind: ContributionKind;
  contributionAmount: string;
}

const EMPTY_FORM: GoalFormState = {
  name: "",
  type: "custom",
  targetAmount: "0.00",
  targetMonth: "",
  priority: "10",
  contributionKind: "recurring_monthly",
  contributionAmount: "0.00",
};

export function GoalsPage(): JSX.Element {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    const page = await api.listGoals();
    setGoals(page.items);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreateModal(): void {
    setEditingGoal(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(goal: Goal): void {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      type: goal.type,
      targetAmount: minorToEuroInputString(goal.targetAmountMinor),
      targetMonth: goal.targetMonth ?? "",
      priority: String(goal.priority),
      contributionKind: goal.contribution?.kind ?? "recurring_monthly",
      contributionAmount: goal.contribution ? minorToEuroInputString(goal.contribution.amountMinor) : "0.00",
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave(): Promise<void> {
    setFormError(null);
    try {
      const targetAmountMinor = parseEurToMinor(form.targetAmount);
      const contributionAmountMinor = parseEurToMinor(form.contributionAmount);
      const priority = Number.parseInt(form.priority, 10);
      if (!Number.isInteger(priority) || priority < 1) {
        setFormError("Priority must be a positive whole number.");
        return;
      }

      const input: CreateGoalInput = {
        name: form.name,
        type: form.type,
        targetAmountMinor,
        targetMonth: form.targetMonth || undefined,
        priority,
        contribution:
          contributionAmountMinor > 0
            ? {
                kind: form.contributionKind,
                amountMinor: contributionAmountMinor,
                startMonth: new Date().toISOString().slice(0, 7),
              }
            : undefined,
      };

      setSaving(true);
      if (editingGoal) {
        await api.updateGoal(editingGoal.id, input);
      } else {
        await api.createGoal(input);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      if (err instanceof MoneyParseError) {
        setFormError(err.message);
      } else if (err instanceof ApiError) {
        // Inline 422 mapping: GOAL_TARGET_IN_PAST, FORECAST_HORIZON_EXCEEDED,
        // CONTRIBUTION_EXCEEDS_FREE_CASH_FLOW all surface here.
        setFormError(err.userMessage);
      } else {
        setFormError("Could not save this goal.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive(): Promise<void> {
    if (!pendingArchive) return;
    await api.archiveGoal(pendingArchive.id);
    setPendingArchive(null);
    await load();
  }

  if (loading) {
    return <p>Loading…</p>;
  }

  const sortedGoals = [...goals].sort((a, b) => a.priority - b.priority);

  return (
    <div>
      <div className="section-title">
        <h1>Goals</h1>
        <button className="btn btn-primary" onClick={openCreateModal}>
          New goal
        </button>
      </div>

      {sortedGoals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Create your first goal — an emergency fund, a house, a vacation — and track it against your forecast."
          action={
            <button className="btn btn-primary" onClick={openCreateModal}>
              Create a goal
            </button>
          }
        />
      ) : (
        <div className="goal-list">
          {sortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={openEditModal}
              onArchive={(g) => setPendingArchive(g)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{editingGoal ? "Edit goal" : "New goal"}</h2>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-name">Name</label>
              <input id="goal-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-type">Type</label>
              <select
                id="goal-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as GoalType })}
              >
                {GOAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-target">Target amount (€)</label>
              <input
                id="goal-target"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-month">Target month (YYYY-MM, optional)</label>
              <input
                id="goal-month"
                placeholder="2030-01"
                value={form.targetMonth}
                onChange={(e) => setForm({ ...form, targetMonth: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-priority">Priority (1 = highest)</label>
              <input
                id="goal-priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-contribution-kind">Contribution</label>
              <select
                id="goal-contribution-kind"
                value={form.contributionKind}
                onChange={(e) => setForm({ ...form, contributionKind: e.target.value as ContributionKind })}
              >
                <option value="recurring_monthly">Recurring monthly</option>
                <option value="one_time">One time</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="goal-contribution-amount">Contribution amount (€)</label>
              <input
                id="goal-contribution-amount"
                value={form.contributionAmount}
                onChange={(e) => setForm({ ...form, contributionAmount: e.target.value })}
              />
            </div>
            {formError && <p className="error-text">{formError}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save goal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingArchive && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Archive "{pendingArchive.name}"?</h2>
            <p>This removes it from future forecasts. Historical snapshots referencing it are kept.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPendingArchive(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void confirmArchive()}>
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
