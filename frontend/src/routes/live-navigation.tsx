import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, SatelliteDish } from "lucide-react";
import { DemoTag, Panel, Readout, StatusDot } from "@/components/navix/Panel";
import { MapLegend, MapSurface } from "@/components/navix/MapPanel";
import { MiniAreaChart } from "@/components/navix/charts";
import { useSimClock } from "@/hooks/useSimClock";
import { fetchStatus, fetchTrajectory, TrajectoryPoint, BackendStatus } from "@/lib/api";
import {
  OUTAGE_END,
  OUTAGE_START,
  confidenceAt,
  estimatedRoute,
  formatCoord,
  headingBetween,
  speedAt,
  telemetryWindow,
  uncertaintyAt,
} from "@/lib/sim";

export const Route = createFileRoute("/live-navigation")({
  head: () => ({
    meta: [
      { title: "Live Navigation — NAVIX | TrueTrack" },
      {
        name: "description",
        content:
          "Animated vehicle tracking with reference and fused trajectories, plus GNSS outage simulation controls.",
      },
      { property: "og:title", content: "Live Navigation — NAVIX" },
      {
        property: "og:description",
        content: "Vehicle navigation monitoring with FastAPI TrueTrack backend.",
      },
    ],
  }),
  component: LiveNavigation,
});

function LiveNavigation() {
  const { index, setIndex, running, setRunning, reset } = useSimClock({
    intervalMs: 280,
  });
  const [forcedOutage, setForcedOutage] = useState(false);

  // Real Backend Data State
  const [realTrajectory, setRealTrajectory] = useState<TrajectoryPoint[] | null>(null);
  const [realStatus, setRealStatus] = useState<BackendStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadRealData = async () => {
      const traj = await fetchTrajectory(1000);
      const st = await fetchStatus();
      if (mounted) {
        if (traj && traj.length > 0) setRealTrajectory(traj);
        if (st) setRealStatus(st);
      }
    };
    loadRealData();
    const timer = setInterval(loadRealData, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const hasReal = realTrajectory && realTrajectory.length > 0;
  const maxIdx = hasReal ? realTrajectory.length - 1 : estimatedRoute.length - 1;
  const clampedIdx = Math.min(index, maxIdx);

  const realPoint = hasReal ? realTrajectory[clampedIdx] : null;

  const pos = realPoint
    ? { lat: realPoint.est_lat, lng: realPoint.est_lon }
    : estimatedRoute[index]!;
  const prev = hasReal && clampedIdx > 0
    ? { lat: realTrajectory[clampedIdx - 1]!.est_lat, lng: realTrajectory[clampedIdx - 1]!.est_lon }
    : estimatedRoute[Math.max(0, index - 1)]!;

  const inOutage = forcedOutage || (realPoint ? realPoint.gnss_trust < 0.4 : index >= OUTAGE_START && index <= OUTAGE_END);
  const confidence = realPoint
    ? (realPoint.gnss_trust * 100) - (forcedOutage ? 12 : 0)
    : confidenceAt(index) - (forcedOutage ? 12 : 0);

  const speedKmh = realPoint
    ? realPoint.ai_speed_mps * 3.6
    : speedAt(index);

  const uncertaintyM = realPoint
    ? realPoint.position_error_m
    : uncertaintyAt(index);

  const telemetry = telemetryWindow(index, 48);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel
        title="Road Navigation — Live Track"
        right={
          <span className="flex items-center gap-2">
            <MapLegend showIns />
            <DemoTag label={hasReal ? "FASTAPI REAL DATA" : "SIMULATED DATA"} />
          </span>
        }
        bodyClassName="p-0"
      >
        <MapSurface
          index={clampedIdx}
          showIns
          className="h-[calc(100vh-13rem)] min-h-[440px] w-full"
          trajectoryData={hasReal ? realTrajectory : undefined}
        />
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="Simulation Controls">
          <div className="grid grid-cols-2 gap-2">
            <ControlButton
              icon={<Play className="h-3.5 w-3.5" />}
              label="Start"
              active={running}
              onClick={() => setRunning(true)}
            />
            <ControlButton
              icon={<Pause className="h-3.5 w-3.5" />}
              label="Pause"
              active={!running}
              onClick={() => setRunning(false)}
            />
            <ControlButton
              icon={<SatelliteDish className="h-3.5 w-3.5" />}
              label={forcedOutage ? "Outage ON" : "GNSS Outage"}
              tone="warn"
              active={forcedOutage}
              onClick={() => setForcedOutage((v) => !v)}
            />
            <ControlButton
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              label="Reset"
              onClick={() => {
                setForcedOutage(false);
                reset();
              }}
            />
          </div>
          <div className="mt-3">
            <div className="label-tech mb-1">Timeline — sample {clampedIdx} / {maxIdx}</div>
            <input
              type="range"
              min={0}
              max={maxIdx}
              value={clampedIdx}
              onChange={(e) => setIndex(Number(e.target.value))}
              className="w-full accent-cyan"
              aria-label="Simulation timeline"
            />
          </div>
        </Panel>

        <Panel title="Navigation State" right={<DemoTag label={hasReal ? "REAL DATA" : "SIMULATED"} />}>
          <Readout label="Current speed" value={speedKmh.toFixed(1)} unit="km/h" />
          <Readout label="Heading" value={`${headingBetween(prev, pos).toFixed(1)}°`} />
          <Readout label="Position" value={formatCoord(pos)} tone="cyan" />
          <Readout
            label="Navigation confidence"
            value={confidence.toFixed(1)}
            unit="%"
            tone={confidence > 85 ? "ok" : confidence > 70 ? "warn" : "crit"}
          />
          <Readout label="Position error" value={uncertaintyM.toFixed(2)} unit="m" />
          {realStatus && (
            <Readout label="TrueTrack Mode" value={realStatus.mode} tone={realStatus.mode === "GNSS" ? "ok" : "warn"} />
          )}
          <div className="mt-2 flex items-center gap-2 rounded-sm border border-border bg-secondary/40 px-2 py-1.5">
            <StatusDot tone={inOutage ? "crit" : "ok"} />
            <span className={`font-mono text-[11px] ${inOutage ? "text-crit" : "text-ok"}`}>
              GNSS {inOutage ? "UNAVAILABLE / DEAD RECKONING" : "AVAILABLE / FUSED"}
            </span>
          </div>
        </Panel>

        <Panel title="Live Velocity Estimate">
          <MiniAreaChart data={telemetry} dataKey="velocity" color="#22d3ee" height={120} />
        </Panel>
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  onClick,
  active,
  tone = "cyan",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "cyan" | "warn";
}) {
  const activeCls =
    tone === "warn"
      ? "border-warn text-warn bg-warn/10"
      : "border-cyan text-cyan bg-cyan/10";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-sm border px-2 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
        active ? activeCls : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
