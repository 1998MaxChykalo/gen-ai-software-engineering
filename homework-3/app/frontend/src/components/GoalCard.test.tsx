import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Goal } from "../types/api";
import { GoalCard } from "./GoalCard";

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    name: "Emergency fund",
    type: "emergency_fund",
    targetAmountMinor: 2000000,
    targetMonth: "2028-01",
    priority: 1,
    status: "active",
    contribution: null,
    progress: {
      fundedMinor: 0,
      percentComplete: "0.00",
      projectedCompletionMonth: null,
      outcome: "unreachable",
      monthsLate: null,
      stale: false,
    },
    ...overrides,
  };
}

describe("GoalCard", () => {
  it("renders the unreachable outcome badge with an honest explanation", () => {
    render(<GoalCard goal={makeGoal()} />);

    expect(screen.getByTestId("outcome-badge")).toHaveTextContent("Unreachable");
    expect(screen.getByTestId("goal-explanation")).toHaveTextContent(
      "Expenses exceed income under current inputs",
    );
  });

  it("renders an on_track goal without an explanation", () => {
    render(
      <GoalCard
        goal={makeGoal({
          progress: {
            fundedMinor: 1000000,
            percentComplete: "50.00",
            projectedCompletionMonth: "2027-01",
            outcome: "on_track",
            monthsLate: null,
            stale: false,
          },
        })}
      />,
    );

    expect(screen.getByTestId("outcome-badge")).toHaveTextContent("On track");
    expect(screen.queryByTestId("goal-explanation")).not.toBeInTheDocument();
  });

  it("renders a late goal with the months-late explanation", () => {
    render(
      <GoalCard
        goal={makeGoal({
          progress: {
            fundedMinor: 1000000,
            percentComplete: "20.00",
            projectedCompletionMonth: "2030-06",
            outcome: "late",
            monthsLate: 5,
            stale: false,
          },
        })}
      />,
    );

    expect(screen.getByTestId("outcome-badge")).toHaveTextContent("Late");
    expect(screen.getByTestId("goal-explanation")).toHaveTextContent("5 months after the target date");
  });
});
