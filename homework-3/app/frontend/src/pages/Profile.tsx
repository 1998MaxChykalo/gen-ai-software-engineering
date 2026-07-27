import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { EmptyState } from "../components/EmptyState";
import type {
  Asset,
  AssetKind,
  Assumptions,
  Expense,
  ExpenseKind,
  IncomeKind,
  IncomeSource,
  Liability,
  LiabilityKind,
  Profile,
  ProfileUpdateInput,
} from "../types/api";
import { minorToEuroInputString, MoneyParseError, parseEurToMinor } from "../utils/money";

interface DraftIncome {
  id?: string;
  name: string;
  kind: IncomeKind;
  amount: string;
  growthRate: string;
}
interface DraftExpense {
  id?: string;
  name: string;
  kind: ExpenseKind;
  amount: string;
}
interface DraftAsset {
  id?: string;
  name: string;
  kind: AssetKind;
  value: string;
  returnRate: string;
}
interface DraftLiability {
  id?: string;
  name: string;
  kind: LiabilityKind;
  balance: string;
  interestRate: string;
  monthlyPayment: string;
}

function toDraftIncome(row: IncomeSource): DraftIncome {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amount: minorToEuroInputString(row.amountMinor),
    growthRate: row.annualGrowthRatePct,
  };
}
function toDraftExpense(row: Expense): DraftExpense {
  return { id: row.id, name: row.name, kind: row.kind, amount: minorToEuroInputString(row.amountMinor) };
}
function toDraftAsset(row: Asset): DraftAsset {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    value: minorToEuroInputString(row.valueMinor),
    returnRate: row.annualReturnRatePct,
  };
}
function toDraftLiability(row: Liability): DraftLiability {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    balance: minorToEuroInputString(row.balanceMinor),
    interestRate: row.annualInterestRatePct,
    monthlyPayment: minorToEuroInputString(row.monthlyPaymentMinor),
  };
}

export function ProfilePage(): JSX.Element {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [incomes, setIncomes] = useState<DraftIncome[]>([]);
  const [expenses, setExpenses] = useState<DraftExpense[]>([]);
  const [assets, setAssets] = useState<DraftAsset[]>([]);
  const [liabilities, setLiabilities] = useState<DraftLiability[]>([]);
  const [assumptions, setAssumptions] = useState<Assumptions>({
    inflationRatePct: "2.5",
    defaultReturnRatePct: "5.0",
    incomeGrowthRatePct: "2.0",
  });
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const p = await api.getProfile();
      setProfile(p);
      setIncomes(p.incomes.map(toDraftIncome));
      setExpenses(p.expenses.map(toDraftExpense));
      setAssets(p.assets.map(toDraftAsset));
      setLiabilities(p.liabilities.map(toDraftLiability));
      setAssumptions(p.assumptions);
      setConflict(false);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <p>Loading…</p>;
  }

  if (!profile) {
    return (
      <EmptyState
        title="No profile yet"
        description="Set up your income, expenses, assets, and liabilities to start forecasting your financial future."
        action={
          <button className="btn btn-primary" onClick={() => void load()}>
            Retry
          </button>
        }
      />
    );
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    setSaved(false);
    if (!profile) return;

    try {
      const input: ProfileUpdateInput = {
        version: profile.version,
        incomes: incomes.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          amountMinor: parseEurToMinor(row.amount),
          currency: "EUR",
          annualGrowthRatePct: row.growthRate,
        })),
        expenses: expenses.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          amountMinor: parseEurToMinor(row.amount),
          currency: "EUR",
        })),
        assets: assets.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          valueMinor: parseEurToMinor(row.value),
          currency: "EUR",
          annualReturnRatePct: row.returnRate,
        })),
        liabilities: liabilities.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          balanceMinor: parseEurToMinor(row.balance),
          currency: "EUR",
          annualInterestRatePct: row.interestRate,
          monthlyPaymentMinor: parseEurToMinor(row.monthlyPayment),
        })),
        assumptions,
      };

      setSaving(true);
      const updated = await api.updateProfile(input);
      setProfile(updated);
      setIncomes(updated.incomes.map(toDraftIncome));
      setExpenses(updated.expenses.map(toDraftExpense));
      setAssets(updated.assets.map(toDraftAsset));
      setLiabilities(updated.liabilities.map(toDraftLiability));
      setAssumptions(updated.assumptions);
      setSaved(true);
    } catch (err) {
      if (err instanceof MoneyParseError) {
        setFormError(err.message);
      } else if (err instanceof ApiError && err.code === "PROFILE_VERSION_CONFLICT") {
        setConflict(true);
      } else if (err instanceof ApiError) {
        setFormError(err.userMessage);
      } else {
        setFormError("Could not save your profile. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Profile</h1>
      {conflict && (
        <div className="card" style={{ borderColor: "var(--color-amber)", marginBottom: "1rem" }}>
          <p className="error-text" style={{ color: "var(--color-amber)" }}>
            Profile changed elsewhere — reload
          </p>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Reload profile
          </button>
        </div>
      )}

      <IncomeSection incomes={incomes} setIncomes={setIncomes} />
      <ExpenseSection expenses={expenses} setExpenses={setExpenses} />
      <AssetSection assets={assets} setAssets={setAssets} />
      <LiabilitySection liabilities={liabilities} setLiabilities={setLiabilities} />
      <AssumptionsSection assumptions={assumptions} setAssumptions={setAssumptions} />

      {formError && <p className="error-text">{formError}</p>}
      {saved && !formError && <p style={{ color: "var(--color-green)" }}>Profile saved.</p>}

      <button className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}

function IncomeSection({
  incomes,
  setIncomes,
}: {
  incomes: DraftIncome[];
  setIncomes: (rows: DraftIncome[]) => void;
}): JSX.Element {
  return (
    <section className="card">
      <h2>Income sources</h2>
      <div className="entity-row entity-row-header">
        <span>Name</span>
        <span>Kind</span>
        <span>Amount / month (€)</span>
        <span>Annual growth (%)</span>
        <span />
      </div>
      {incomes.map((row, index) => (
        <div className="entity-row" key={row.id ?? `new-income-${index}`}>
          <input
            aria-label="Income name"
            value={row.name}
            onChange={(e) => {
              const next = [...incomes];
              next[index] = { ...row, name: e.target.value };
              setIncomes(next);
            }}
          />
          <select
            aria-label="Income kind"
            value={row.kind}
            onChange={(e) => {
              const next = [...incomes];
              next[index] = { ...row, kind: e.target.value as IncomeKind };
              setIncomes(next);
            }}
          >
            <option value="active">Active</option>
            <option value="passive">Passive</option>
          </select>
          <input
            aria-label="Income amount"
            value={row.amount}
            onChange={(e) => {
              const next = [...incomes];
              next[index] = { ...row, amount: e.target.value };
              setIncomes(next);
            }}
          />
          <input
            aria-label="Income growth rate"
            value={row.growthRate}
            onChange={(e) => {
              const next = [...incomes];
              next[index] = { ...row, growthRate: e.target.value };
              setIncomes(next);
            }}
          />
          <button
            className="remove-row-btn"
            aria-label="Remove income"
            onClick={() => setIncomes(incomes.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn btn-secondary"
        onClick={() => setIncomes([...incomes, { name: "", kind: "active", amount: "0.00", growthRate: "0" }])}
      >
        Add income
      </button>
    </section>
  );
}

function ExpenseSection({
  expenses,
  setExpenses,
}: {
  expenses: DraftExpense[];
  setExpenses: (rows: DraftExpense[]) => void;
}): JSX.Element {
  return (
    <section className="card">
      <h2>Expenses</h2>
      <div className="entity-row entity-row-header">
        <span>Name</span>
        <span>Kind</span>
        <span>Amount / month (€)</span>
        <span />
        <span />
      </div>
      {expenses.map((row, index) => (
        <div className="entity-row" key={row.id ?? `new-expense-${index}`}>
          <input
            aria-label="Expense name"
            value={row.name}
            onChange={(e) => {
              const next = [...expenses];
              next[index] = { ...row, name: e.target.value };
              setExpenses(next);
            }}
          />
          <select
            aria-label="Expense kind"
            value={row.kind}
            onChange={(e) => {
              const next = [...expenses];
              next[index] = { ...row, kind: e.target.value as ExpenseKind };
              setExpenses(next);
            }}
          >
            <option value="fixed">Fixed</option>
            <option value="variable">Variable</option>
          </select>
          <input
            aria-label="Expense amount"
            value={row.amount}
            onChange={(e) => {
              const next = [...expenses];
              next[index] = { ...row, amount: e.target.value };
              setExpenses(next);
            }}
          />
          <span />
          <button
            className="remove-row-btn"
            aria-label="Remove expense"
            onClick={() => setExpenses(expenses.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn btn-secondary"
        onClick={() => setExpenses([...expenses, { name: "", kind: "fixed", amount: "0.00" }])}
      >
        Add expense
      </button>
    </section>
  );
}

function AssetSection({
  assets,
  setAssets,
}: {
  assets: DraftAsset[];
  setAssets: (rows: DraftAsset[]) => void;
}): JSX.Element {
  return (
    <section className="card">
      <h2>Assets</h2>
      <div className="entity-row entity-row-header">
        <span>Name</span>
        <span>Kind</span>
        <span>Value (€)</span>
        <span>Annual return (%)</span>
        <span />
      </div>
      {assets.map((row, index) => (
        <div className="entity-row" key={row.id ?? `new-asset-${index}`}>
          <input
            aria-label="Asset name"
            value={row.name}
            onChange={(e) => {
              const next = [...assets];
              next[index] = { ...row, name: e.target.value };
              setAssets(next);
            }}
          />
          <select
            aria-label="Asset kind"
            value={row.kind}
            onChange={(e) => {
              const next = [...assets];
              next[index] = { ...row, kind: e.target.value as AssetKind };
              setAssets(next);
            }}
          >
            <option value="cash">Cash</option>
            <option value="investment">Investment</option>
            <option value="real_estate">Real estate</option>
          </select>
          <input
            aria-label="Asset value"
            value={row.value}
            onChange={(e) => {
              const next = [...assets];
              next[index] = { ...row, value: e.target.value };
              setAssets(next);
            }}
          />
          <input
            aria-label="Asset return rate"
            value={row.returnRate}
            onChange={(e) => {
              const next = [...assets];
              next[index] = { ...row, returnRate: e.target.value };
              setAssets(next);
            }}
          />
          <button
            className="remove-row-btn"
            aria-label="Remove asset"
            onClick={() => setAssets(assets.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn btn-secondary"
        onClick={() => setAssets([...assets, { name: "", kind: "cash", value: "0.00", returnRate: "0" }])}
      >
        Add asset
      </button>
    </section>
  );
}

function LiabilitySection({
  liabilities,
  setLiabilities,
}: {
  liabilities: DraftLiability[];
  setLiabilities: (rows: DraftLiability[]) => void;
}): JSX.Element {
  return (
    <section className="card">
      <h2>Liabilities</h2>
      <div className="entity-row entity-row-header" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
        <span>Name</span>
        <span>Kind</span>
        <span>Balance (€)</span>
        <span>Interest (%)</span>
        <span>Payment / month (€)</span>
        <span />
      </div>
      {liabilities.map((row, index) => (
        <div className="entity-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }} key={row.id ?? `new-liability-${index}`}>
          <input
            aria-label="Liability name"
            value={row.name}
            onChange={(e) => {
              const next = [...liabilities];
              next[index] = { ...row, name: e.target.value };
              setLiabilities(next);
            }}
          />
          <select
            aria-label="Liability kind"
            value={row.kind}
            onChange={(e) => {
              const next = [...liabilities];
              next[index] = { ...row, kind: e.target.value as LiabilityKind };
              setLiabilities(next);
            }}
          >
            <option value="loan">Loan</option>
            <option value="mortgage">Mortgage</option>
            <option value="credit_card">Credit card</option>
          </select>
          <input
            aria-label="Liability balance"
            value={row.balance}
            onChange={(e) => {
              const next = [...liabilities];
              next[index] = { ...row, balance: e.target.value };
              setLiabilities(next);
            }}
          />
          <input
            aria-label="Liability interest rate"
            value={row.interestRate}
            onChange={(e) => {
              const next = [...liabilities];
              next[index] = { ...row, interestRate: e.target.value };
              setLiabilities(next);
            }}
          />
          <input
            aria-label="Liability monthly payment"
            value={row.monthlyPayment}
            onChange={(e) => {
              const next = [...liabilities];
              next[index] = { ...row, monthlyPayment: e.target.value };
              setLiabilities(next);
            }}
          />
          <button
            className="remove-row-btn"
            aria-label="Remove liability"
            onClick={() => setLiabilities(liabilities.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn btn-secondary"
        onClick={() =>
          setLiabilities([
            ...liabilities,
            { name: "", kind: "loan", balance: "0.00", interestRate: "0", monthlyPayment: "0.00" },
          ])
        }
      >
        Add liability
      </button>
    </section>
  );
}

function AssumptionsSection({
  assumptions,
  setAssumptions,
}: {
  assumptions: Assumptions;
  setAssumptions: (a: Assumptions) => void;
}): JSX.Element {
  return (
    <section className="card">
      <h2>Assumptions</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
        These conservative defaults drive every forecast. They are always shown alongside forecast output for
        transparency.
      </p>
      <div className="form-row">
        <div className="field">
          <label htmlFor="inflation">Inflation rate (%/yr)</label>
          <input
            id="inflation"
            value={assumptions.inflationRatePct}
            onChange={(e) => setAssumptions({ ...assumptions, inflationRatePct: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="return">Expected return (%/yr)</label>
          <input
            id="return"
            value={assumptions.defaultReturnRatePct}
            onChange={(e) => setAssumptions({ ...assumptions, defaultReturnRatePct: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="incomeGrowth">Income growth (%/yr)</label>
          <input
            id="incomeGrowth"
            value={assumptions.incomeGrowthRatePct}
            onChange={(e) => setAssumptions({ ...assumptions, incomeGrowthRatePct: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}
