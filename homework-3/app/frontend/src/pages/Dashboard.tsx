import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { AssumptionsChips } from "../components/AssumptionsChips";
import { DisclaimerFooter } from "../components/DisclaimerFooter";
import { EmptyState } from "../components/EmptyState";
import { GoalCard } from "../components/GoalCard";
import { NetWorthChart } from "../components/NetWorthChart";
import { StalenessBadge } from "../components/StalenessBadge";
import type { ForecastResponse, Goal } from "../types/api";
import { formatEurMinor } from "../utils/money";

/**
 * Savings rate is not part of the forecast contract, so it is derived
 * display-only from the latest month's cashFlowMinor / incomeMinor. Uses
 * integer basis-point math (never a float division on the money fields
 * themselves) and guards divide-by-zero (zero-income profile, spec §7 edge
 * case 3).
 */
function savingsRateBps(cashFlowMinor: number, incomeMinor: number): number {
  if (incomeMinor === 0) {
    return 0;
  }
  return Math.round((cashFlowMinor * 10000) / incomeMinor);
}

const PERCENT_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatSavingsRate(bps: number): string {
  return PERCENT_FORMATTER.format(bps / 10000);
}

export function DashboardPage(): JSX.Element {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [noSnapshotYet, setNoSnapshotYet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      setNoSnapshotYet(false);
      try {
        const [forecastResponse, goalsResponse] = await Promise.all([
          api.getLatestForecast(),
          api.listGoals(),
        ]);
        if (cancelled) return;
        setForecast(forecastResponse);
        setGoals(goalsResponse.items);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "NO_SNAPSHOT_YET") {
          setNoSnapshotYet(true);
        } else {
          setError(err instanceof ApiError ? err.userMessage : "Could not load the dashboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p>Loading…</p>;
  }

  if (noSnapshotYet) {
    return (
      <EmptyState
        title="No forecast yet"
        description="Add your income, expenses, assets, and liabilities in your profile to generate your first forecast."
        action={
          <Link to="/profile" className="btn btn-primary">
            Set up your profile
          </Link>
        }
      />
    );
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!forecast) {
    return (
      <EmptyState
        title="No forecast yet"
        description="Once your profile has income and expenses, your forecast will appear here."
        action={
          <Link to="/profile" className="btn btn-primary">
            Set up your profile
          </Link>
        }
      />
    );
  }

  const latestMonth = forecast.months[forecast.months.length - 1];
  const firstMonth = forecast.months[0];
  const rateBps = firstMonth ? savingsRateBps(firstMonth.cashFlowMinor, firstMonth.incomeMinor) : 0;

  return (
    <div>
      <div className="section-title">
        <h1>Dashboard</h1>
        <StalenessBadge stale={forecast.stale} />
      </div>
      <AssumptionsChips assumptions={forecast.assumptions} />

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-label">Current net worth</div>
          <div className="stat-value">{formatEurMinor(firstMonth ? firstMonth.netWorthMinor : 0)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Monthly free cash flow</div>
          <div className="stat-value">{formatEurMinor(firstMonth ? firstMonth.cashFlowMinor : 0)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Savings rate</div>
          <div className="stat-value">{formatSavingsRate(rateBps)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Projected net worth ({latestMonth?.month})</div>
          <div className="stat-value">{formatEurMinor(latestMonth ? latestMonth.netWorthMinor : 0)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Net worth trajectory</h2>
        <NetWorthChart months={forecast.months} />
      </div>

      <div className="section-title">
        <h2>Goals</h2>
        <Link to="/goals" className="btn btn-secondary">
          View all goals
        </Link>
      </div>
      {goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Create a goal — an emergency fund, a house, a vacation — to see it tracked against your forecast."
          action={
            <Link to="/goals" className="btn btn-primary">
              Create a goal
            </Link>
          }
        />
      ) : (
        <div className="goal-list">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      <DisclaimerFooter disclaimer={forecast.disclaimer} />
    </div>
  );
}
