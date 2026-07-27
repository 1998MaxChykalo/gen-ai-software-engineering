/** JSON-serializable shapes persisted in ForecastSnapshot's String columns. */
export interface SnapshotMonthEntry {
  month: string;
  netWorthMinor: string;
  cashFlowMinor: string;
  incomeMinor: string;
  expensesMinor: string;
  assetsMinor: string;
  liabilitiesMinor: string;
}

export interface SnapshotGoalOutcomeEntry {
  goalId: string;
  status: 'on_track' | 'late' | 'unreachable' | 'unreachable_within_horizon' | 'paused';
  completionMonth: string | null;
  completionMonthIndex: number | null;
  monthsLate: number | null;
  fundedMinor: string;
  percentComplete: string;
}

export interface SnapshotAssumptionsEcho {
  inflationRateBps: number;
  defaultReturnRateBps: number;
  incomeGrowthRateBps: number;
}

export interface ParsedSnapshot {
  id: string;
  userId: string;
  inputHash: string;
  engineVersion: string;
  evaluationMonth: string;
  createdAt: Date;
  assumptions: SnapshotAssumptionsEcho;
  months: SnapshotMonthEntry[];
  goalOutcomes: SnapshotGoalOutcomeEntry[];
}
