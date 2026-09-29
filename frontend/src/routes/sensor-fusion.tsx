import { createFileRoute } from "@tanstack/react-router";
import { Brain, Cpu, Map as MapIcon, Waves } from "lucide-react";
import { DemoTag, Panel, Readout, StatusDot } from "@/components/navix/Panel";
import { CHART_COLORS, MiniAreaChart, MiniLineChart } from "@/components/navix/charts";
import { useSimClock } from "@/hooks/useSimClock";
import { OUTAGE_END, OUTAGE_START, telemetryWindow } from "@/lib/sim";

export const Route = createFileRoute("/sensor-fusion")({
  head: () => ({
    meta: [
      { title: "Sensor Fusion Monitor — NAVIX" },
      {
        name: "description",
        content:
          "IMU/INS, GRU motion estimator, adaptive error-state EKF and map matching monitoring for RoadSense Fusion AI.",
      },
      { property: "og:title", content: "Sensor Fusion Monitor — NAVIX" },
      {
        property: "og:description",
        content: "Technical monitoring of the RoadSense sensor fusion pipeline.",
      },
    ],
  }),
  component: SensorFusion,
});

function SensorFusion() {
  const { index } = useSimClock({ intervalMs: 400 });
  const telemetry = telemetryWindow(index, 50);
  const last = telemetry[telemetry.length - 1]!;
  const inOutage = index >= OUTAGE_START && index <= OUTAGE_END;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel
        title="01 — IMU / Inertial Navigation"
        right={
          <span className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-cyan" />
            <DemoTag />
          </span>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <Readout label="Accel X" value={`${last.ax}`} unit="m/s²" tone="cyan" />
          <Readout label="Accel Y" value={`${last.ay}`} unit="m/s²" tone="cyan" />
          <Readout label="Accel Z" value={`${last.az}`} unit="m/s²" tone="cyan" />
          <Readout label="Gyro X" value={`${last.gx}`} unit="rad/s" />
          <Readout label="Gyro Y" value={`${last.gy}`} unit="rad/s" />
          <Readout label="Gyro Z" value={`${last.gz}`} unit="rad/s" />
        </div>
        <div className="mt-2">
          <div className="label-tech mb-1">Accelerometer stream</div>
          <MiniLineChart data={telemetry} keys={["ax", "ay", "az"]} colors={CHART_COLORS} height={110} />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-sm border border-border bg-secondary/40 px-2 py-1.5">
          <span className="label-tech">Inertial drift indicator</span>
          <span className={`font-mono text-[11px] ${last.drift > 4 ? "text-warn" : "text-ok"}`}>
            {last.drift.toFixed(2)} m
          </span>
        </div>
      </Panel>

      <Panel
        title="02 — AI Motion Estimator"
        right={
          <span className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-cyan" />
            <DemoTag />
          </span>
        }
      >
        <Readout label="Model" value="GRU — 2 layers × 64 hidden, 100-sample window" tone="cyan" />
        <Readout label="Predicted velocity" value={last.velocity.toFixed(2)} unit="km/h" />
        <Readout label="Inference latency" value={last.latency.toFixed(2)} unit="ms" />
        <div className="mt-1 flex items-center gap-2">
          <StatusDot tone="ok" />
          <span className="font-mono text-[11px] text-ok">MODEL ACTIVE — FEEDING EKF</span>
        </div>
        <div className="mt-2">
          <div className="label-tech mb-1">Inference latency — ms</div>
          <MiniAreaChart data={telemetry} dataKey="latency" color="#4ade80" height={110} />
        </div>
      </Panel>

      <Panel
        title="03 — Adaptive Error-State EKF"
        right={
          <span className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-cyan" />
            <DemoTag />
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Readout
            label="Filter status"
            value={inOutage ? "ADAPTING — HIGH Q" : "NOMINAL"}
            tone={inOutage ? "warn" : "ok"}
          />
          <Readout label="Update frequency" value="50" unit="Hz" />
          <Readout label="Position covariance (trace)" value={(last.posError * 1.6).toFixed(3)} unit="m²" />
          <Readout label="Innovation" value={(last.headingError * 0.37).toFixed(3)} unit="σ" />
        </div>
        <div className="mt-2">
          <div className="label-tech mb-1">Position error covariance proxy — m</div>
          <MiniAreaChart data={telemetry} dataKey="posError" color="#818cf8" height={110} />
        </div>
      </Panel>

      <Panel
        title="04 — Map Matching"
        right={
          <span className="flex items-center gap-2">
            <MapIcon className="h-3.5 w-3.5 text-cyan" />
            <DemoTag />
          </span>
        }
      >
        <Readout label="Road alignment" value="SNAPPED — LATERAL OFFSET 1.2 m" tone="ok" />
        <Readout label="Nearest road segment" value="OSM way 254881 — Outer Ring Road" tone="cyan" />
        <Readout
          label="Map constraint"
          value={inOutage ? "APPLIED — CONSTRAINING DRIFT" : "STANDBY"}
          tone={inOutage ? "warn" : "default"}
        />
        <Readout label="Candidate segments evaluated" value="7" />
        <div className="mt-2">
          <div className="label-tech mb-1">Heading error after matching — deg</div>
          <MiniAreaChart data={telemetry} dataKey="headingError" color="#fbbf24" height={110} />
        </div>
      </Panel>
    </div>
  );
}
