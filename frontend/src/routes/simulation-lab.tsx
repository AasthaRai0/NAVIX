import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Download, FileUp, Play } from "lucide-react";
import { DemoTag, MetricTile, Panel } from "@/components/navix/Panel";
import { datasets, scenarios } from "@/lib/sim";

export const Route = createFileRoute("/simulation-lab")({
  head: () => ({
    meta: [
      { title: "Simulation Lab — NAVIX" },
      {
        name: "description",
        content:
          "Run real NAVIX GNSS outage simulations using IMU/GNSS data and AI sensor fusion.",
      },
    ],
  }),
  component: SimulationLab,
});

type Phase = "idle" | "running" | "done" | "error";

type SimulationResult = {
  rmse: number;
  drift: number;
  velErr: number;
  headErr: number;
  recovery: number;
  latency: number;
  rows?: number;
  outage_start?: number;
  outage_end?: number;
  gnss_lost_samples?: number;
  message?: string;
};

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

function timeToSeconds(value: string): number {
  const parts = value.split(":").map(Number);

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return Number(value) || 0;
}

function SimulationLab() {
  const [dataset, setDataset] = useState(datasets[0]!);
  const [uploaded, setUploaded] = useState<File | null>(null);
  const [scenario, setScenario] = useState(scenarios[0]!);
  const [outageStart, setOutageStart] = useState("00:04:12");
  const [duration, setDuration] = useState(86);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const [results, setResults] = useState<SimulationResult | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  /*
   * REAL BACKEND SIMULATION
   *
   * Frontend sends:
   * - CSV/JSON file
   * - outage start
   * - outage duration
   * - scenario
   *
   * Backend should perform:
   * CSV -> preprocessing -> TCN -> GNSS Trust -> UKF
   * -> GNSS outage -> fused trajectory -> metrics
   */
  const run = async () => {
    setError("");
    setResults(null);
    setProgress(5);
    setPhase("running");

    try {
      const formData = new FormData();

      if (uploaded) {
        formData.append("file", uploaded);
      }

      formData.append("dataset", uploaded?.name ?? dataset);
      formData.append("scenario", scenario);
      formData.append(
        "outage_start",
        String(timeToSeconds(outageStart)),
      );
      formData.append("outage_duration", String(duration));

      setProgress(15);

      const response = await fetch(`${API_BASE}/simulation/run`, {
        method: "POST",
        body: formData,
      });

      setProgress(55);

      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        let message = `Backend returned HTTP ${response.status}`;

        if (contentType.includes("application/json")) {
          const body = await response.json();

          if (body?.detail) {
            message =
              typeof body.detail === "string"
                ? body.detail
                : JSON.stringify(body.detail);
          } else if (body?.message) {
            message = body.message;
          }
        } else {
          const text = await response.text();

          if (text) {
            message = text;
          }
        }

        throw new Error(message);
      }

      if (!contentType.includes("application/json")) {
        throw new Error(
          "Simulation backend did not return JSON results.",
        );
      }

      const data = await response.json();

      setProgress(90);

      /*
       * Accept both the clean API format and the older naming style.
       */
      const normalized: SimulationResult = {
        rmse: Number(
          data.rmse ??
          data.position_rmse ??
          data.metrics?.rmse ??
          0,
        ),

        drift: Number(
          data.drift ??
          data.final_drift ??
          data.metrics?.drift ??
          0,
        ),

        velErr: Number(
          data.velErr ??
          data.velocity_error ??
          data.velocity_error_mps ??
          data.metrics?.velocity_error ??
          0,
        ),

        headErr: Number(
          data.headErr ??
          data.heading_error ??
          data.heading_error_deg ??
          data.metrics?.heading_error ??
          0,
        ),

        recovery: Number(
          data.recovery ??
          data.recovery_time ??
          data.recovery_time_sec ??
          data.metrics?.recovery_time ??
          0,
        ),

        latency: Number(
          data.latency ??
          data.ai_latency ??
          data.inference_latency_ms ??
          data.metrics?.latency ??
          0,
        ),

        rows: Number(data.rows ?? data.samples ?? 0),

        outage_start: Number(
          data.outage_start ??
          data.outage?.start ??
          timeToSeconds(outageStart),
        ),

        outage_end: Number(
          data.outage_end ??
          data.outage?.end ??
          timeToSeconds(outageStart) + duration,
        ),

        gnss_lost_samples: Number(
          data.gnss_lost_samples ??
          data.outage?.lost_samples ??
          0,
        ),

        message: data.message,
      };

      setResults(normalized);
      setProgress(100);
      setPhase("done");
    } catch (err) {
      console.error("NAVIX simulation failed:", err);

      setProgress(0);
      setPhase("error");

      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to NAVIX backend.",
      );
    }
  };

  const exportResults = () => {
    if (!results) return;

    const payload = {
      project: "NAVIX",
      type: "REAL_SIMULATION_RESULT",
      dataset: uploaded?.name ?? dataset,
      scenario,
      outageStart,
      outageDuration: duration,
      results,
    };

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      {
        type: "application/json",
      },
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "navix_simulation_results.json";

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

  const pipelineSteps = [
    "Loading IMU / GNSS log",
    "Sensor preprocessing",
    "TCN AI speed estimation",
    "GNSS Trust evaluation",
    "Adaptive UKF fusion",
    "GNSS outage simulation",
    "Trajectory + metrics",
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
      {/* ================= LEFT ================= */}

      <div className="flex flex-col gap-3">
        <Panel title="Dataset" right={<DemoTag />}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-sm border border-dashed border-cyan/40 bg-cyan/5 px-3 py-6 transition-colors hover:bg-cyan/10"
          >
            <FileUp className="h-5 w-5 text-cyan" />

            <span className="font-mono text-[10px] tracking-[0.14em] text-cyan uppercase">
              Upload IMU / GNSS log
            </span>

            <span className="font-mono text-[9px] text-muted-foreground">
              CSV or JSON — sent to NAVIX backend
            </span>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;

              setUploaded(file);
              setResults(null);
              setPhase("idle");
              setProgress(0);
              setError("");
            }}
          />

          {uploaded ? (
            <div className="mt-2 rounded-sm border border-ok/30 bg-ok/5 px-2 py-2">
              <p className="font-mono text-[10px] text-ok">
                LOADED: {uploaded.name}
              </p>

              <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                {(uploaded.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <p className="mt-2 font-mono text-[9px] text-muted-foreground">
              Recommended: S1_synchronized.csv
            </p>
          )}

          <label className="mt-3 block">
            <span className="label-tech">
              Built-in dataset
            </span>

            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              disabled={!!uploaded}
              className="mt-1 w-full rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px] disabled:opacity-40"
            >
              {datasets.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </Panel>

        {/* ================= CONFIG ================= */}

        <Panel title="Experiment Configuration">
          <label className="block">
            <span className="label-tech">
              Vehicle scenario
            </span>

            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]"
            >
              {scenarios.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="label-tech">
              GNSS outage start (T+)
            </span>

            <input
              value={outageStart}
              onChange={(e) =>
                setOutageStart(e.target.value)
              }
              placeholder="00:04:12"
              className="mt-1 w-full rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]"
            />
          </label>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="label-tech">
                Outage duration
              </span>

              <span className="font-mono text-[11px] text-cyan">
                {duration} s
              </span>
            </div>

            <input
              type="range"
              min={10}
              max={240}
              value={duration}
              onChange={(e) =>
                setDuration(Number(e.target.value))
              }
              className="mt-1 w-full accent-cyan"
              aria-label="GNSS outage duration"
            />
          </div>

          <button
            type="button"
            onClick={run}
            disabled={phase === "running"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm border border-cyan bg-cyan/10 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-cyan uppercase transition-colors hover:bg-cyan/20 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />

            {phase === "running"
              ? "Running…"
              : "Run simulation"}
          </button>

          {error ? (
            <div className="mt-3 rounded-sm border border-crit/30 bg-crit/5 px-2 py-2">
              <p className="font-mono text-[9px] leading-relaxed text-crit">
                ERROR: {error}
              </p>
            </div>
          ) : null}
        </Panel>
      </div>

      {/* ================= RIGHT ================= */}

      <div className="flex flex-col gap-3">
        {/* ================= PIPELINE ================= */}

        <Panel title="Processing Pipeline">
          <div className="h-1.5 w-full overflow-hidden rounded-xs bg-secondary">
            <div
              className="h-full bg-cyan transition-[width] duration-300"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="mt-2 grid gap-1">
            {pipelineSteps.map((step, i) => {
              const threshold =
                ((i + 1) / pipelineSteps.length) *
                100;

              const state =
                progress >= threshold
                  ? "done"
                  : progress >
                    threshold -
                    100 /
                    pipelineSteps.length
                    ? "active"
                    : "pending";

              return (
                <div
                  key={step}
                  className="flex items-center justify-between font-mono text-[10px]"
                >
                  <span
                    className={
                      state === "done"
                        ? "text-ok"
                        : state === "active"
                          ? "text-cyan"
                          : "text-muted-foreground"
                    }
                  >
                    {String(i + 1).padStart(2, "0")} ·{" "}
                    {step}
                  </span>

                  <span className="text-muted-foreground">
                    {state === "done"
                      ? "COMPLETE"
                      : state === "active"
                        ? "PROCESSING"
                        : "QUEUED"}
                  </span>
                </div>
              );
            })}
          </div>

          {phase === "done" && (
            <div className="mt-3 rounded-sm border border-ok/30 bg-ok/5 px-2 py-2">
              <p className="font-mono text-[9px] text-ok">
                GNSS OUTAGE → AI SPEED → IMU → UKF
                FUSION COMPLETED
              </p>
            </div>
          )}
        </Panel>

        {/* ================= RESULTS ================= */}

        <Panel
          title="Simulation Results"
          right={
            <button
              type="button"
              onClick={exportResults}
              disabled={!results}
              className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-cyan disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              Export results
            </button>
          }
        >
          {phase === "idle" ? (
            <EmptyState message="No run yet — upload a dataset, configure an experiment and press RUN SIMULATION." />
          ) : phase === "running" ? (
            <EmptyState message="NAVIX backend is processing the real IMU/GNSS dataset…" />
          ) : phase === "error" ? (
            <EmptyState
              message="Simulation failed — check backend connection and dataset format."
              tone="crit"
            />
          ) : results ? (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <MetricTile
                  label="POSITION RMSE"
                  value={results.rmse.toFixed(2)}
                  unit="m"
                />

                <MetricTile
                  label="FINAL DRIFT"
                  value={results.drift.toFixed(2)}
                  unit="m"
                />

                <MetricTile
                  label="VELOCITY ERROR"
                  value={results.velErr.toFixed(2)}
                  unit="m/s"
                />

                <MetricTile
                  label="HEADING ERROR"
                  value={results.headErr.toFixed(2)}
                  unit="deg"
                />

                <MetricTile
                  label="RECOVERY TIME"
                  value={results.recovery.toFixed(2)}
                  unit="s"
                />

                <MetricTile
                  label="AI LATENCY"
                  value={results.latency.toFixed(2)}
                  unit="ms"
                />
              </div>

              <div className="mt-3 grid gap-1 font-mono text-[9px] text-muted-foreground">
                <p>
                  DATASET:{" "}
                  {uploaded?.name ?? dataset}
                </p>

                <p>
                  SCENARIO: {scenario}
                </p>

                <p>
                  OUTAGE: {outageStart} →{" "}
                  {duration}s
                </p>

                {results.rows ? (
                  <p>
                    PROCESSED SAMPLES: {results.rows}
                  </p>
                ) : null}

                {results.gnss_lost_samples ? (
                  <p>
                    GNSS LOST SAMPLES:{" "}
                    {results.gnss_lost_samples}
                  </p>
                ) : null}
              </div>

              <p className="mt-3 font-mono text-[10px] text-ok">
                ✓ Values returned by the NAVIX backend —
                not frontend mock data.
              </p>
            </>
          ) : null}
        </Panel>

        {/* ================= BACKEND STATUS ================= */}

        <Panel title="Backend Integration">
          <div className="grid gap-2 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                API
              </span>

              <span className="text-cyan">
                {API_BASE}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Endpoint
              </span>

              <span className="text-cyan">
                POST /simulation/run
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Processing
              </span>

              <span className="text-ok">
                IMU → TCN → GNSS Trust → UKF
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                GNSS outage
              </span>

              <span className="text-ok">
                Simulated by backend
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function EmptyState({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "muted" | "crit";
}) {
  return (
    <div
      className={`grid place-items-center rounded-sm border border-dashed border-border px-3 py-10 text-center font-mono text-[10px] tracking-[0.1em] uppercase ${tone === "crit"
          ? "text-crit"
          : "text-muted-foreground"
        }`}
    >
      {message}
    </div>
  );
}