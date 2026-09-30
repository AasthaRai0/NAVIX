import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART_COLORS = ["#22d3ee", "#818cf8", "#f43f5e", "#fbbf24", "#4ade80"];

export interface MiniAreaChartProps {
  data: any[];
  dataKey: string;
  color?: string;
  height?: number;
}

export function MiniAreaChart({ data, dataKey, color = "#22d3ee", height = 90 }: MiniAreaChartProps) {
  const gradientId = `grad-${dataKey}-${color.replace("#", "")}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--foreground)",
          }}
        />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface MiniLineChartProps {
  data: any[];
  keys: string[];
  colors?: string[];
  height?: number;
}

export function MiniLineChart({ data, keys, colors = CHART_COLORS, height = 90 }: MiniLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
        <XAxis dataKey="t" hide />
        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--foreground)",
          }}
        />
        {keys.map((k, idx) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={colors[idx % colors.length]}
            strokeWidth={1.2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
