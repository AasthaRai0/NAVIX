import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Cpu, Map as MapIcon, Waves } from "lucide-react";
import { DemoTag, Panel, Readout, StatusDot } from "@/components/navix/Panel";
import { CHART_COLORS, MiniAreaChart, MiniLineChart } from "@/components/navix/charts";
import { useSimClock } from "@/hooks/useSimClock";
import { OUTAGE_END, OUTAGE_START, telemetryWindow } from "@/lib/sim";
import { fetchStatus, BackendStatus } from "@/lib/api";

export const Route = createFileRoute("/sensor-fusion")({
  head: () => ({
    meta: [
      { title: "Sensor Fusion Monitor — NAVIX | TrueTrack" },
      {
        name: "description",
        content:
          "IMU/INS, GRU/TCN motion estimator, adaptive UKF and map matching monitoring for RoadSense Fusion AI.",
      },
      { property: "og:title", content: "Sensor Fusion Monitor — NAVIX" },
      {
        property: "og:description",
        content: "Technical monitoring of the TrueTrack TCN + UKF sensor fusion pipeline.",
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

  const [realStatus, setRealStatus] = useState<BackendStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      const st = await fetchStatus();
      if (mounted && st) setRealStatus(st);
    };
    loadStatus();
    const timer = setInterval(loadStatus, 4000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const aiSpeedKmH = realStatus ? (realStatus.ai_speed_mps * 3.6).toFixed(2) : last.velocity.toFixed(2);
  const gnssTrustPercent = realStatus ? (realStatus.gnss_trust * 100).toFixed(1) : (inOutage ? "24.5" : "98.2");
  const ukfMode = realStatus ? realStatus.mode : (inOutage ? "DEAD_RECKONING" : "GNSS_FUSED");

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel
        title="01 — IMU / Inertial Navigation"
        right={
          <span className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-cyan" />
            <DemoTag label={realStatus ? "FASTAPI LIVE" : "DEMO"} />
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
        <div className="mt-2 flex items-center justify-between rounded-sm border border-border bg-secondary/40 px-2 py-1.5 font-mono text-[11px]">
          <span className="label-tech">GNSS Trust Score (FastAPI)</span>
          <span className={`font-mono text-[11px] font-bold ${Number(gnssTrustPercent) > 50 ? "text-ok" : "text-warn"}`}>
            {gnssTrustPercent} %
          </span>
        </div>
      </Panel>

      <Panel
        title="02 — AI Speed Estimator (TCN Model)"
        right={
          <span className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-cyan" />
            <DemoTag label={realStatus ? "TCN ACTIVE" : "GRU DEMO"} />
          </span>
        }
      >
        <Readout label="Model" value="PyTorch TCN — SpeedTCN (speed_tcn.pt)" tone="cyan" />
        <Readout label="AI Speed Prediction" value={aiSpeedKmH} unit="km/h" />
        <Readout label="Speed (m/s)" value={realStatus ? realStatus.ai_speed_mps.toFixed(2) : (last.velocity / 3.6).toFixed(2)} unit="m/s" />
        <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
          <StatusDot tone="ok" />
          <span className="text-ok font-semibold">TCN MODEL ACTIVE — FEEDING UKF</span>
        </div>
        <div className="mt-2">
          <div className="label-tech mb-1">Inference latency — ms</div>
          <MiniAreaChart data={telemetry} dataKey="latency" color="#4ade80" height={110} />
        </div>
      </Panel>

      <Panel
        title="03 — UKF / Unscented Kalman Filter"
        right={
          <span className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-cyan" />
            <DemoTag label={realStatus ? "UKF LIVE" : "EKF DEMO"} />
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Readout
            label="Filter status"
            value={ukfMode}
            tone={ukfMode === "GNSS" || ukfMode === "GNSS_FUSED" ? "ok" : "warn"}
          />
          <Readout label="Update frequency" value="100" unit="Hz" />
          <Readout label="GNSS Trust" value={`${gnssTrustPercent}%`} tone={Number(gnssTrustPercent) > 50 ? "ok" : "warn"} />
          <Readout label="Innovation" value={(last.headingError * 0.37).toFixed(3)} unit="σ" />
        </div>
        <div className="mt-2">
          <div className="label-tech mb-1 font-mono text-[10px]">Position error covariance proxy — m</div>
          <MiniAreaChart data={telemetry} dataKey="posError" color="#818cf8" height={110} />
        </div>
      </Panel>

      <Panel
        title="04 — Map & Trajectory Matching"
        right={
          <span className="flex items-center gap-2">
            <MapIcon className="h-3.5 w-3.5 text-cyan" />
            <DemoTag label={realStatus ? "ACTIVE" : "STANDBY"} />
          </span>
        }
      >
        <Readout label="Road alignment" value="SNAPPED — LATERAL OFFSET 1.2 m" tone="ok" />
        <Readout
          label="Est Coordinates"
          value={realStatus ? `${realStatus.latitude.toFixed(5)}°, ${realStatus.longitude.toFixed(5)}°` : "12.97160°, 77.59460°"}
          tone="cyan"
        />
        <Readout
          label="TrueTrack Constraint"
          value={ukfMode === "DEAD_RECKONING" ? "APPLIED — TCN SPEED DEAD RECKONING" : "GNSS FUSION"}
          tone={ukfMode === "DEAD_RECKONING" ? "warn" : "ok"}
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
