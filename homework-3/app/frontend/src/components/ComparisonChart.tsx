import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastMonth } from "../types/api";
import { formatEurMinor, formatEurMinorCompact } from "../utils/money";

interface ComparisonChartProps {
  baselineMonths: ForecastMonth[];
  scenarioMonths: ForecastMonth[];
}

// Categorical slots 1 (blue) and 2 (orange) from the validated default
// palette — adjacent slots, verified colorblind-safe as a pair.
const BASELINE_COLOR = "#2a78d6";
const SCENARIO_COLOR = "#eb6834";

interface CombinedRow {
  month: string;
  baseline: number;
  scenario: number;
}

function combine(baseline: ForecastMonth[], scenario: ForecastMonth[]): CombinedRow[] {
  return baseline.map((b, i) => ({
    month: b.month,
    baseline: b.netWorthMinor,
    scenario: scenario[i] ? scenario[i].netWorthMinor : b.netWorthMinor,
  }));
}

function tickFormatter(month: string, index: number): string {
  return index % 24 === 0 ? month : "";
}

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  return (
    <div className="card" style={{ padding: "0.5rem 0.75rem" }}>
      <strong>{label}</strong>
      {payload.map((entry) => (
        <div key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatEurMinor(entry.value)}
        </div>
      ))}
    </div>
  );
}

export function ComparisonChart({ baselineMonths, scenarioMonths }: ComparisonChartProps): JSX.Element {
  const data = combine(baselineMonths, scenarioMonths);
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={tickFormatter}
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatEurMinorCompact(v)}
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<TooltipContent />} />
        <Legend />
        <Line type="monotone" dataKey="baseline" name="Baseline" stroke={BASELINE_COLOR} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="scenario" name="What if" stroke={SCENARIO_COLOR} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
