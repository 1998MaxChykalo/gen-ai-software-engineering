import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastMonth } from "../types/api";
import { formatEurMinor, formatEurMinorCompact } from "../utils/money";

interface NetWorthChartProps {
  months: ForecastMonth[];
}

// Categorical slot 1 (blue) from the validated default palette — single
// series, so no legend is needed (the axis/title already name it).
const SERIES_COLOR = "#2a78d6";

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  return (
    <div className="card" style={{ padding: "0.5rem 0.75rem" }}>
      <strong>{label}</strong>
      <div>{formatEurMinor(payload[0].value)}</div>
    </div>
  );
}

/** Every ~24th month is labeled to avoid overcrowding a 240-month axis. */
function tickFormatter(month: string, index: number): string {
  return index % 24 === 0 ? month : "";
}

export function NetWorthChart({ months }: NetWorthChartProps): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={months} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={SERIES_COLOR} stopOpacity={0.35} />
            <stop offset="95%" stopColor={SERIES_COLOR} stopOpacity={0.03} />
          </linearGradient>
        </defs>
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
        <Area
          type="monotone"
          dataKey="netWorthMinor"
          stroke={SERIES_COLOR}
          strokeWidth={2}
          fill="url(#netWorthFill)"
          name="Net worth"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
