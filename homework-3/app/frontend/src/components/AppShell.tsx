import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, authStore } from "../api";
import { StalenessBadge } from "./StalenessBadge";

interface AppShellProps {
  children: ReactNode;
}

/**
 * Top-level nav shell: Dashboard / Profile / Goals / What if?, logout, the
 * Horizon wordmark, and a staleness indicator that reflects the latest
 * forecast freshness (polled while stale, per the freshness contract).
 */
export function AppShell({ children }: AppShellProps): JSX.Element {
  const navigate = useNavigate();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const freshness = await api.getForecastFreshness();
        if (cancelled) return;
        setStale(freshness.stale);
      } catch {
        if (cancelled) return;
      }
      if (!cancelled) {
        timer = setTimeout(poll, 5000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  function handleLogout(): void {
    authStore.clearToken();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <span className="wordmark">Horizon</span>
        <nav>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
            Profile
          </NavLink>
          <NavLink to="/goals" className={({ isActive }) => (isActive ? "active" : "")}>
            Goals
          </NavLink>
          <NavLink to="/scenarios" className={({ isActive }) => (isActive ? "active" : "")}>
            What if?
          </NavLink>
        </nav>
        <div className="nav-right">
          <StalenessBadge stale={stale} />
          <button className="logout-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
