import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
          "Configure GNSS outage experiments, select datasets and run simulated RoadSense Fusion AI navigation runs.",
      },
      { property: "og:title", content: "Simulation Lab — NAVIX" },
      {
        property: "og:description",
        content: "Experiment configuration interface for RoadSense Fusion AI.",
      },
    ],
  }),
  component: SimulationLab,
});

type Phase = "idle" | "running" | "done" | "error";

function SimulationLab() {
  const [dataset, setDataset] = useState(datasets[0]!);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [scenario, setScenario] = useState(scenarios[0]!);
  const [outageStart, setOutageStart] = useState("00:04:12");
  const [duration, setDuration] = useState(86);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(id);
          setPhase("done");
          return 100;
        }
        return p + 4;
      });
    }, 120);
    return () => clearInterval(id);
  }, [phase]);

  const run = () => {
    setProgress(0);
    setPhase("running");
  };

  const results = {
    rmse: (2.41 * (duration / 86)).toFixed(2),
    drift: (7.86 * (duration / 86)).toFixed(2),
    velErr: (0.42 * (duration / 86)).toFixed(2),
    headErr: (1.94 * (duration / 86)).toFixed(2),
    recovery: (3.2 * (duration / 86)).toFixed(2),
    latency: "7.4",
  };

  const exportResults = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { note: "SIMULATED DEMO DATA", dataset: uploaded ?? dataset, scenario, outageStart, duration, results },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "navix_simulated_results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
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
              CSV or JSON — parsed by future Python backend
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => setUploaded(e.target.files?.[0]?.name ?? null)}
          />
          {uploaded ? (
            <p className="mt-2 font-mono text-[10px] text-ok">STAGED: {uploaded}</p>
          ) : null}

          <label className="mt-3 block">
            <span className="label-tech">Built-in dataset</span>
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]"
            >
              {datasets.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </Panel>

        <Panel title="Experiment Configuration">
          <label className="block">
            <span className="label-tech">Vehicle scenario</span>
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
            <span className="label-tech">GNSS outage start (T+)</span>
            <input
              value={outageStart}
              onChange={(e) => setOutageStart(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-secondary/60 px-2 py-1.5 font-mono text-[11px]"
            />
          </label>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="label-tech">Outage duration</span>
              <span className="font-mono text-[11px] text-cyan">{duration} s</span>
            </div>
            <input
              type="range"
              min={10}
              max={240}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
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
            {phase === "running" ? "Running…" : "Run simulation"}
          </button>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Processing Pipeline" right={<DemoTag />}>
          <div className="h-1.5 w-full overflow-hidden rounded-xs bg-secondary">
            <div
              className="h-full bg-cyan transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 grid gap-1">
            {[
              "Loading IMU / GNSS log",
              "Inertial mechanization (INS)",
              "GRU motion estimation",
              "Adaptive error-state EKF",
              "Map matching constraint",
              "Metrics computation",
            ].map((step, i) => {
              const threshold = ((i + 1) / 6) * 100;
              const state =
                progress >= threshold ? "done" : progress > threshold - 17 ? "active" : "pending";
              return (
                <div key={step} className="flex items-center justify-between font-mono text-[10px]">
                  <span
                    className={
                      state === "done"
                        ? "text-ok"
                        : state === "active"
                          ? "text-cyan"
                          : "text-muted-foreground"
                    }
                  >
                    {String(i + 1).padStart(2, "0")} · {step}
                  </span>
                  <span className="text-muted-foreground">
                    {state === "done" ? "COMPLETE" : state === "active" ? "PROCESSING" : "QUEUED"}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Simulation Results"
          right={
            <button
              type="button"
              onClick={exportResults}
              disabled={phase !== "done"}
              className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-cyan disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              Export results
            </button>
          }
        >
          {phase === "idle" ? (
            <EmptyState message="No run yet — configure an experiment and press RUN SIMULATION." />
          ) : phase === "running" ? (
            <EmptyState message="Simulation in progress — computing fused trajectory…" />
          ) : phase === "error" ? (
            <EmptyState message="Simulation failed — check dataset format and retry." tone="crit" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <MetricTile label="POSITION RMSE" value={results.rmse} unit="m" />
                <MetricTile label="FINAL DRIFT" value={results.drift} unit="m" />
                <MetricTile label="VELOCITY ERROR" value={results.velErr} unit="m/s" />
                <MetricTile label="HEADING ERROR" value={results.headErr} unit="deg" />
                <MetricTile label="RECOVERY TIME" value={results.recovery} unit="s" />
                <MetricTile label="AI LATENCY" value={results.latency} unit="ms" />
              </div>
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                Run {uploaded ?? dataset} · {scenario} · outage {outageStart} for {duration} s.
                Values are simulated demo output, not real AI inference.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Backend Integration Notes">
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            This interface is wired for a future Python processing service. The run request
            payload (dataset reference, outage window, scenario) and the results contract
            (RMSE, drift, velocity/heading error, recovery time, inference latency) are already
            fixed, so the mock layer can be swapped for real endpoints without UI changes.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function EmptyState({ message, tone = "muted" }: { message: string; tone?: "muted" | "crit" }) {
  return (
    <div
      className={`grid place-items-center rounded-sm border border-dashed border-border px-3 py-10 text-center font-mono text-[10px] tracking-[0.1em] uppercase ${
        tone === "crit" ? "text-crit" : "text-muted-foreground"
      }`}
    >
      {message}
    </div>
  );
}
