import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GoalDelta } from "../types/api";
import { formatDeltaMonths, ScenarioDeltaTable } from "./ScenarioDeltaTable";

describe("formatDeltaMonths", () => {
  it("formats a positive delta as 'later'", () => {
    expect(formatDeltaMonths(7)).toBe("7 months later");
  });

  it("formats a negative delta as 'sooner'", () => {
    expect(formatDeltaMonths(-3)).toBe("3 months sooner");
  });

  it("formats a zero delta as 'no change'", () => {
    expect(formatDeltaMonths(0)).toBe("no change");
  });

  it("formats null as an em dash", () => {
    expect(formatDeltaMonths(null)).toBe("—");
  });

  it("uses singular 'month' for a magnitude of 1", () => {
    expect(formatDeltaMonths(1)).toBe("1 month later");
    expect(formatDeltaMonths(-1)).toBe("1 month sooner");
  });
});

describe("ScenarioDeltaTable", () => {
  it("renders a row per goal with the correct sign wording", () => {
    const goalDeltas: GoalDelta[] = [
      { goalId: "g1", name: "House", baselineCompletionMonth: "2031-01", scenarioCompletionMonth: "2030-06", deltaMonths: -7 },
      { goalId: "g2", name: "Vacation", baselineCompletionMonth: "2027-04", scenarioCompletionMonth: "2027-07", deltaMonths: 3 },
      { goalId: "g3", name: "Emergency fund", baselineCompletionMonth: "2027-06", scenarioCompletionMonth: "2027-06", deltaMonths: 0 },
      { goalId: "g4", name: "Retirement", baselineCompletionMonth: null, scenarioCompletionMonth: null, deltaMonths: null },
    ];

    render(<ScenarioDeltaTable goalDeltas={goalDeltas} />);

    expect(screen.getByTestId("delta-row-g1")).toHaveTextContent("7 months sooner");
    expect(screen.getByTestId("delta-row-g2")).toHaveTextContent("3 months later");
    expect(screen.getByTestId("delta-row-g3")).toHaveTextContent("no change");
    expect(screen.getByTestId("delta-row-g4")).toHaveTextContent("—");
  });
});
