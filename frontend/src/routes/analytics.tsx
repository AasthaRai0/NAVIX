import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoTag, MetricTile, Panel } from "@/components/navix/Panel";
import { benchmarks, scenarios } from "@/lib/sim";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Performance Analytics — NAVIX" },
      {
        name: "description",
        content:
          "Benchmark comparison of GNSS-only, INS, AI-assisted INS, EKF fusion and full RoadSense Fusion on simulated runs.",
      },
      { property: "og:title", content: "Performance Analytics — NAVIX" },
      {
        property: "og:description",
        content: "Simulated benchmark analytics for AI-assisted navigation during GNSS outages.",
      },
    ],
  }),
  component: Analytics,
});

const SESSIONS = ["SIM-2416-A — 24 Sep", "SIM-2415-C — 23 Sep", "SIM-2411-B — 19 Sep"];

const METRICS = [
  { key: "rmse", label: "Position RMSE", unit: "m", color: "#22d3ee" },
  { key: "drift", label: "Final drift", unit: "m", color: "#818cf8" },
  { key: "velErr", label: "Velocity error", unit: "m/s", color: "#4ade80" },
  { key: "headErr", label: "Heading error", unit: "deg", color: "#fbbf24" },
  { key: "recovery", label: "Recovery time", unit: "s", color: "#f43f5e" },
  { key: "latency", label: "AI inference latency", unit: "ms", color: "#7dd3fc" },
] as const;

function Analytics() {
  const [scenario, setScenario] = useState(scenarios[0]!);
  const [session, setSession] = useState(SESSIONS[0]!);

  const factor = useMemo(() => 0.85 + scenarios.indexOf(scenario) * 0.13, [scenario]);
  const data = useMemo(
    () =>
      benchmarks.map((b) => ({
        ...b,
        rmse: +(b.rmse * factor).toFixed(2),
        drift: +(b.drift * factor).toFixed(2),
        velErr: +(b.velErr * factor).toFixed(2),
        headErr: +(b.headErr * factor).toFixed(2),
        recovery: +(b.recovery * factor).toFixed(2),
      })),
    [factor],
  );
  const best = data[data.length - 1]!;

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Benchmark Configuration" right={<DemoTag />}>
        <div className="flex flex-wrap gap-4">
          <Field label="Simulation scenario">
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-64 rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px] text-foreground"
            >
              {scenarios.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Session / date">
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-56 rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px] text-foreground"
            >
              {SESSIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-3 font-mono text-[10px] text-muted-foreground">
          All benchmark values below are SIMULATED DEMO DATA generated for interface
          demonstration. No real AI inference or GNSS logging is performed.
        </p>
      </Panel>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile label="POSITION RMSE" value={best.rmse.toFixed(2)} unit="m" sub="full fusion" />
        <MetricTile label="FINAL DRIFT" value={best.drift.toFixed(2)} unit="m" sub="end of outage" />
        <MetricTile label="VELOCITY ERROR" value={best.velErr.toFixed(2)} unit="m/s" sub="RMS" />
        <MetricTile label="HEADING ERROR" value={best.headErr.toFixed(2)} unit="deg" sub="RMS" />
        <MetricTile label="RECOVERY TIME" value={best.recovery.toFixed(2)} unit="s" sub="post re-lock" />
        <MetricTile label="AI LATENCY" value={best.latency.toFixed(2)} unit="ms" sub="per window" />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {METRICS.map((m) => (
          <Panel key={m.key} title={`${m.label} by method — ${m.unit}`} right={<DemoTag />}>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--grid)" strokeOpacity={0.3} vertical={false} />
                <XAxis
                  dataKey="method"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-14}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
                  contentStyle={{
                    backgroundColor: "var(--panel-header)",
                    border: "1px solid var(--border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                  }}
                  formatter={(v: number) => [`${v} ${m.unit}`, m.label]}
                />
                <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9 }} />
                <Bar dataKey={m.key} name={m.label} fill={m.color} radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        ))}
      </div>

      <Panel title="Benchmark Table — Simulated" right={<DemoTag />} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr className="bg-secondary/50 text-left">
                {["METHOD", "RMSE (m)", "DRIFT (m)", "VEL ERR (m/s)", "HEAD ERR (°)", "RECOVERY (s)", "LATENCY (ms)"].map(
                  (h) => (
                    <th key={h} className="border-b border-border px-3 py-2 label-tech">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.method} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-1.5 text-cyan">{r.method}</td>
                  <td className="px-3 py-1.5">{r.rmse.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{r.drift.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{r.velErr.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{r.headErr.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{r.recovery.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{r.latency.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-tech">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
