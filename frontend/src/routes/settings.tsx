import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DemoTag, Panel, StatusDot } from "@/components/navix/Panel";
import { fetchHealth, BackendHealth } from "@/lib/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "System Settings — NAVIX | TrueTrack" },
      {
        name: "description",
        content:
          "Map, sensor, confidence threshold, notification and backend connection preferences for the NAVIX interface.",
      },
      { property: "og:title", content: "System Settings — NAVIX" },
      {
        property: "og:description",
        content: "Technical configuration for the RoadSense Fusion AI interface.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [mapStyle, setMapStyle] = useState("OpenStreetMap — dark adapted");
  const [autoFollow, setAutoFollow] = useState(true);
  const [showIns, setShowIns] = useState(true);
  const [imuRate, setImuRate] = useState(200);
  const [ekfRate, setEkfRate] = useState(50);
  const [threshold, setThreshold] = useState(75);
  const [alertsCritical, setAlertsCritical] = useState(true);
  const [alertsWarning, setAlertsWarning] = useState(true);
  const [alertsInfo, setAlertsInfo] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [density, setDensity] = useState("Compact");

  const [health, setHealth] = useState<BackendHealth | null>(null);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const res = await fetchHealth();
      if (mounted) setHealth(res);
    };
    check();
    const interval = setInterval(check, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Map Preferences">
        <Select
          label="Base map layer"
          value={mapStyle}
          onChange={setMapStyle}
          options={[
            "OpenStreetMap — dark adapted",
            "OpenStreetMap — standard",
            "Road network only",
          ]}
        />
        <Toggle label="Auto-follow vehicle" value={autoFollow} onChange={setAutoFollow} />
        <Toggle label="Show INS-only trajectory" value={showIns} onChange={setShowIns} />
      </Panel>

      <Panel title="Sensor & Filter Rates" right={<DemoTag label="REALTIME" />}>
        <Range label="IMU update frequency" value={imuRate} min={50} max={400} step={10} unit="Hz" onChange={setImuRate} />
        <Range label="UKF update frequency" value={ekfRate} min={10} max={100} step={5} unit="Hz" onChange={setEkfRate} />
        <Range
          label="Navigation confidence threshold"
          value={threshold}
          min={40}
          max={99}
          step={1}
          unit="%"
          onChange={setThreshold}
        />
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          Below the threshold, the interface raises a degraded-navigation warning.
        </p>
      </Panel>

      <Panel title="Notification Preferences">
        <Toggle label="Critical alerts" value={alertsCritical} onChange={setAlertsCritical} />
        <Toggle label="Warning alerts" value={alertsWarning} onChange={setAlertsWarning} />
        <Toggle label="Informational events" value={alertsInfo} onChange={setAlertsInfo} />
      </Panel>

      <Panel title="FastAPI Backend Connection">
        <div className="flex items-center gap-2 rounded-sm border border-border bg-secondary/40 px-2.5 py-2">
          <StatusDot tone={health?.status === "ok" ? "ok" : "warn"} />
          <span className={`font-mono text-[11px] font-bold ${health?.status === "ok" ? "text-ok" : "text-warn"}`}>
            {health?.status === "ok"
              ? "PYTHON PROCESSING CORE (FASTAPI) — CONNECTED"
              : "PYTHON PROCESSING CORE — NOT CONNECTED"}
          </span>
        </div>
        <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
          <div>ENDPOINT — http://localhost:8000</div>
          <div>PROTOCOL — REST / JSON (FastAPI uvicorn)</div>
          <div>TCN WEIGHTS LOADED — {health?.tcn_weights ? "YES (speed_tcn.pt)" : "NO"}</div>
          <div>HEALTH STATUS — {health?.status || "CHECKING..."}</div>
        </div>
        <Toggle label="Force simulated fallback mode" value={demoMode} onChange={setDemoMode} />
      </Panel>

      <Panel title="Interface Preferences" className="lg:col-span-2">
        <Select
          label="Information density"
          value={density}
          onChange={setDensity}
          options={["Compact", "Standard", "Expanded"]}
        />
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          NAVIX runs a fixed dark aerospace theme optimized for control-room displays.
        </p>
      </Panel>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="mt-2 flex w-full items-center justify-between rounded-sm border border-border bg-secondary/40 px-2 py-2"
    >
      <span className="font-mono text-[11px] text-foreground">{label}</span>
      <span
        className={`relative h-4 w-8 rounded-full transition-colors ${value ? "bg-cyan/70" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all ${value ? "left-4.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="label-tech">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="label-tech">{label}</span>
        <span className="font-mono text-[11px] text-cyan">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan"
        aria-label={label}
      />
    </div>
  );
}
