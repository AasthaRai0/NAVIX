import { createFileRoute } from "@tanstack/react-router";
import {
  Panel,
  Readout,
  StatusDot,
  DemoTag,
  MetricTile,
} from "@/components/navix/Panel";
import { MapLegend, MapSurface } from "@/components/navix/MapPanel";
import { CHART_COLORS, MiniAreaChart, MiniLineChart } from "@/components/navix/charts";
import { useSimClock } from "@/hooks/useSimClock";
import {
  OUTAGE_END,
  OUTAGE_START,
  alerts,
  componentHealth,
  confidenceAt,
  estimatedRoute,
  formatCoord,
  headingBetween,
  performanceMetrics,
  speedAt,
  telemetryWindow,
  uncertaintyAt,
} from "@/lib/sim";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mission Control — NAVIX | RoadSense Fusion AI" },
      {
        name: "description",
        content:
          "NAVIX mission control: live vehicle tracking, telemetry and navigation confidence during simulated GNSS outages.",
      },
      { property: "og:title", content: "Mission Control — NAVIX" },
      {
        property: "og:description",
        content:
          "AI-powered navigation beyond GPS — simulated operations center for RoadSense Fusion AI.",
      },
    ],
  }),
  component: MissionControl,
});

function MissionControl() {
  const { index } = useSimClock({ intervalMs: 450 });
  const telemetry = telemetryWindow(index);
  const pos = estimatedRoute[index]!;
  const prev = estimatedRoute[Math.max(0, index - 1)]!;
  const inOutage = index >= OUTAGE_START && index <= OUTAGE_END;
  const confidence = confidenceAt(index);

  return (
    <div className="grid gap-3 xl:grid-cols-[19rem_minmax(0,1fr)_19rem]">
      <div className="flex flex-col gap-3">
        <Panel title="Navigation System Status" right={<DemoTag />}>
          <Readout
            label="Navigation mode"
            value={inOutage ? "GNSS-DENIED SIMULATION" : "GNSS-AIDED FUSION"}
            tone={inOutage ? "warn" : "ok"}
          />
          <Readout label="Position estimate" value={formatCoord(pos)} tone="cyan" />
          <Readout label="Estimated velocity" value={speedAt(index).toFixed(2)} unit="km/h" />
          <Readout
            label="Heading"
            value={`${headingBetween(prev, pos).toFixed(1)}°`}
          />
          <Readout
            label="Navigation confidence"
            value={confidence.toFixed(1)}
            unit="%"
            tone={confidence > 85 ? "ok" : confidence > 70 ? "warn" : "crit"}
          />
          <Readout
            label="Position uncertainty (1σ)"
            value={uncertaintyAt(index).toFixed(2)}
            unit="m"
            tone={uncertaintyAt(index) > 5 ? "warn" : "default"}
          />
          <Readout
            label="Last GNSS update"
            value={inOutage ? `T-${(index - OUTAGE_START) * 1.2 | 0} s` : "LIVE"}
            tone={inOutage ? "crit" : "ok"}
          />
        </Panel>

        <Panel title="Component Health" bodyClassName="p-2">
          <div className="space-y-1">
            {componentHealth.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between gap-2 rounded-sm border border-border bg-secondary/40 px-2 py-1.5"
              >
                <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
                  {c.name}
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot tone={c.tone} />
                  <span
                    className={`font-mono text-[10px] ${c.tone === "ok" ? "text-ok" : "text-warn"}`}
                  >
                    {c.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <Panel
          title="Live Vehicle Tracking"
          right={
            <span className="flex items-center gap-2">
              <MapLegend />
              <DemoTag />
            </span>
          }
          bodyClassName="p-0"
        >
          <MapSurface index={index} className="h-[420px] w-full" />
        </Panel>

        <Panel title="Vehicle Telemetry" right={<DemoTag />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChartBlock label="Accelerometer X / Y / Z — m/s²">
              <MiniLineChart
                data={telemetry}
                keys={["ax", "ay", "az"]}
                colors={CHART_COLORS}
              />
            </ChartBlock>
            <ChartBlock label="Gyroscope X / Y / Z — rad/s">
              <MiniLineChart
                data={telemetry}
                keys={["gx", "gy", "gz"]}
                colors={[CHART_COLORS[1]!, CHART_COLORS[2]!, CHART_COLORS[3]!]}
              />
            </ChartBlock>
            <ChartBlock label="Estimated velocity — km/h">
              <MiniAreaChart data={telemetry} dataKey="velocity" color="#22d3ee" />
            </ChartBlock>
            <ChartBlock label="Position error — m">
              <MiniAreaChart data={telemetry} dataKey="posError" color="#f43f5e" />
            </ChartBlock>
            <ChartBlock label="Heading error — deg">
              <MiniAreaChart data={telemetry} dataKey="headingError" color="#fbbf24" />
            </ChartBlock>
            <ChartBlock label="Navigation drift — m">
              <MiniAreaChart data={telemetry} dataKey="drift" color="#818cf8" />
            </ChartBlock>
            <ChartBlock label="AI inference latency — ms">
              <MiniAreaChart data={telemetry} dataKey="latency" color="#4ade80" />
            </ChartBlock>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Navigation Alerts" bodyClassName="p-2">
          <div className="space-y-1.5">
            {alerts.map((a) => {
              const tone =
                a.severity === "CRITICAL"
                  ? "border-crit/50 text-crit"
                  : a.severity === "WARNING"
                    ? "border-warn/50 text-warn"
                    : "border-cyan/40 text-cyan";
              return (
                <article
                  key={a.message}
                  className={`rounded-sm border-l-2 bg-secondary/40 px-2 py-1.5 ${tone}`}
                >
                  <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.14em]">
                    <span>{a.severity}</span>
                    <span className="text-muted-foreground">{a.time}</span>
                  </div>
                  <div className="font-mono text-[11px] text-foreground">{a.message}</div>
                  <div className="font-mono text-[9px] text-muted-foreground">{a.detail}</div>
                </article>
              );
            })}
          </div>
        </Panel>

        <Panel title="Navigation Performance" right={<DemoTag />} bodyClassName="p-2">
          <div className="grid grid-cols-2 gap-2">
            {performanceMetrics.map((m) => (
              <MetricTile
                key={m.label}
                label={m.label}
                value={m.value}
                unit={m.unit}
                sub={m.trend}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ChartBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label-tech mb-1">{label}</div>
      {children}
    </div>
  );
}
