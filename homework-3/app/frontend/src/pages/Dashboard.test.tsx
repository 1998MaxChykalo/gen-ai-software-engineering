import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ForecastResponse, GoalsPage } from "../types/api";
import { DashboardPage } from "./Dashboard";

const DISCLAIMER_TEXT =
  "This is a projection, not financial advice — figures assume the rates shown and are not guaranteed.";

const forecast: ForecastResponse = {
  snapshotId: "snap-1",
  createdAt: new Date().toISOString(),
  engineVersion: "test-0.0.1",
  inputHash: "hash-1",
  stale: false,
  disclaimer: DISCLAIMER_TEXT,
  assumptions: { inflationRatePct: "2.5", defaultReturnRatePct: "5.0", incomeGrowthRatePct: "2.0" },
  months: [
    {
      month: "2026-08",
      netWorthMinor: 12500000,
      cashFlowMinor: 205000,
      incomeMinor: 500000,
      expensesMinor: 295000,
      assetsMinor: 40500000,
      liabilitiesMinor: 28000000,
    },
  ],
  goals: [],
};

const goalsPage: GoalsPage = { items: [], page: 1, pageSize: 25, total: 0 };

vi.mock("../api", () => ({
  api: {
    getLatestForecast: vi.fn(() => Promise.resolve(forecast)),
    listGoals: vi.fn(() => Promise.resolve(goalsPage)),
  },
  ApiError: class ApiError extends Error {},
}));

describe("DashboardPage", () => {
  it("shows the disclaimer text returned by the API", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("disclaimer-footer")).toHaveTextContent(DISCLAIMER_TEXT);
    });
  });
});
