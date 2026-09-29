/**
 * NAVIX — simulated navigation data.
 * Everything in this module is SYNTHETIC DEMO DATA generated in the browser.
 * No real GNSS, IMU, or AI inference is performed.
 */

export type LatLng = { lat: number; lng: number };

const BASE: LatLng = { lat: 12.9716, lng: 77.5946 }; // Bengaluru, demo scenario

export const OUTAGE_START = 62;
export const OUTAGE_END = 148;
export const ROUTE_LENGTH = 220;

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/** Reference (ground-truth / GNSS) trajectory along a synthetic urban route. */
export const referenceRoute: LatLng[] = Array.from(
  { length: ROUTE_LENGTH },
  (_, i) => {
    const t = i / ROUTE_LENGTH;
    const lat =
      BASE.lat +
      t * 0.042 +
      Math.sin(t * Math.PI * 3.1) * 0.0075 +
      pseudoRandom(i) * 0.00012;
    const lng =
      BASE.lng +
      t * 0.055 -
      Math.cos(t * Math.PI * 2.2) * 0.009 +
      pseudoRandom(i + 500) * 0.00012;
    return { lat, lng };
  },
);

/** RoadSense fusion estimate — tracks reference, drifts slightly in the outage. */
export const estimatedRoute: LatLng[] = referenceRoute.map((p, i) => {
  const inOutage = i >= OUTAGE_START && i <= OUTAGE_END;
  const since = Math.max(0, i - OUTAGE_START);
  const after = Math.max(0, i - OUTAGE_END);
  const drift = inOutage
    ? Math.min(since / (OUTAGE_END - OUTAGE_START), 1) * 0.00085
    : Math.max(0, 0.00085 - after * 0.00006);
  return {
    lat: p.lat + drift * 0.8 + pseudoRandom(i + 90) * 0.00008,
    lng: p.lng - drift + pseudoRandom(i + 190) * 0.00008,
  };
});

/** Inertial-only (no AI, no map matching) estimate — diverges badly. */
export const insOnlyRoute: LatLng[] = referenceRoute.map((p, i) => {
  const since = Math.max(0, Math.min(i, OUTAGE_END) - OUTAGE_START);
  const drift = Math.max(0, since) * 0.00006;
  return { lat: p.lat + drift * 1.4, lng: p.lng - drift * 1.9 };
});

export function headingBetween(a: LatLng, b: LatLng) {
  const d = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  return (d + 360) % 360;
}

export function formatCoord(p: LatLng) {
  return `${p.lat.toFixed(5)}° N   ${p.lng.toFixed(5)}° E`;
}

export function speedAt(i: number) {
  return 38 + Math.sin(i / 11) * 9 + pseudoRandom(i + 3) * 4;
}

export function confidenceAt(i: number) {
  if (i < OUTAGE_START) return 97 + pseudoRandom(i) * 2;
  if (i > OUTAGE_END) return Math.min(96, 78 + (i - OUTAGE_END) * 0.7);
  const p = (i - OUTAGE_START) / (OUTAGE_END - OUTAGE_START);
  return 92 - p * 18 + pseudoRandom(i) * 2;
}

export function uncertaintyAt(i: number) {
  if (i < OUTAGE_START) return 1.4 + Math.abs(pseudoRandom(i)) * 0.6;
  if (i > OUTAGE_END) return Math.max(1.6, 7.4 - (i - OUTAGE_END) * 0.12);
  return 1.6 + (i - OUTAGE_START) * 0.07;
}

export type TelemetryPoint = {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  velocity: number;
  posError: number;
  headingError: number;
  drift: number;
  latency: number;
};

export function telemetryWindow(tick: number, size = 60): TelemetryPoint[] {
  return Array.from({ length: size }, (_, k) => {
    const i = tick - size + k;
    const inOutage = i >= OUTAGE_START && i <= OUTAGE_END;
    const since = Math.max(0, i - OUTAGE_START);
    return {
      t: i,
      ax: +(Math.sin(i / 6) * 1.6 + pseudoRandom(i) * 0.5).toFixed(3),
      ay: +(Math.cos(i / 7.5) * 1.1 + pseudoRandom(i + 11) * 0.5).toFixed(3),
      az: +(9.81 + Math.sin(i / 4) * 0.35 + pseudoRandom(i + 21) * 0.2).toFixed(
        3,
      ),
      gx: +(Math.sin(i / 9) * 0.22 + pseudoRandom(i + 31) * 0.05).toFixed(3),
      gy: +(Math.cos(i / 12) * 0.18 + pseudoRandom(i + 41) * 0.05).toFixed(3),
      gz: +(Math.sin(i / 5.5) * 0.4 + pseudoRandom(i + 51) * 0.06).toFixed(3),
      velocity: +speedAt(i).toFixed(2),
      posError: +(inOutage
        ? 0.9 + since * 0.06
        : Math.max(0.6, 1.2 + pseudoRandom(i) * 0.4)
      ).toFixed(2),
      headingError: +(
        (inOutage ? 0.8 + since * 0.02 : 0.5) +
        Math.abs(pseudoRandom(i + 61)) * 0.6
      ).toFixed(2),
      drift: +(inOutage ? since * 0.09 : 0.2).toFixed(2),
      latency: +(6.2 + Math.abs(pseudoRandom(i + 71)) * 3.4).toFixed(2),
    };
  });
}

export const componentHealth = [
  { name: "IMU SENSOR", status: "HEALTHY", tone: "ok" as const, detail: "200 Hz" },
  { name: "AI MOTION MODEL", status: "ACTIVE", tone: "ok" as const, detail: "GRU-64" },
  { name: "ADAPTIVE EKF", status: "ACTIVE", tone: "ok" as const, detail: "50 Hz" },
  { name: "MAP MATCHING", status: "ACTIVE", tone: "ok" as const, detail: "OSM" },
  { name: "GNSS MONITOR", status: "DEGRADED", tone: "warn" as const, detail: "0 SV lock" },
];

export type Alert = {
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  detail: string;
  time: string;
};

export const alerts: Alert[] = [
  {
    severity: "CRITICAL",
    message: "GNSS signal unavailable",
    detail: "Satellite lock lost — urban canyon segment",
    time: "T+00:04:12",
  },
  {
    severity: "WARNING",
    message: "Inertial drift increasing",
    detail: "Accumulated INS drift 7.8 m over 86 s",
    time: "T+00:05:38",
  },
  {
    severity: "INFO",
    message: "AI motion estimator active",
    detail: "GRU velocity prediction feeding EKF update",
    time: "T+00:04:13",
  },
  {
    severity: "INFO",
    message: "Map matching constraint applied",
    detail: "Snapped to segment OSM/way 254881 — Outer Ring Rd",
    time: "T+00:05:55",
  },
  {
    severity: "INFO",
    message: "Adaptive covariance retuned",
    detail: "Process noise Q scaled ×1.8 during outage",
    time: "T+00:06:20",
  },
];

export const performanceMetrics = [
  { label: "POSITION RMSE", value: "2.41", unit: "m", trend: "-38% vs INS" },
  { label: "FINAL DRIFT", value: "7.86", unit: "m", trend: "over 86 s outage" },
  { label: "VELOCITY ERROR", value: "0.42", unit: "m/s", trend: "RMS" },
  { label: "HEADING ERROR", value: "1.94", unit: "deg", trend: "RMS" },
  { label: "RECOVERY TIME", value: "3.2", unit: "s", trend: "post-GNSS re-lock" },
  { label: "AI INFERENCE", value: "7.4", unit: "ms", trend: "mean per window" },
];

export type Benchmark = {
  method: string;
  rmse: number;
  drift: number;
  velErr: number;
  headErr: number;
  recovery: number;
  latency: number;
};

export const benchmarks: Benchmark[] = [
  { method: "GNSS-only", rmse: 0.0, drift: 0.0, velErr: 0.0, headErr: 0.0, recovery: 0, latency: 0 },
  { method: "Classical INS", rmse: 14.8, drift: 42.6, velErr: 2.35, headErr: 8.4, recovery: 12.4, latency: 0.4 },
  { method: "AI-assisted INS", rmse: 9.1, drift: 24.8, velErr: 1.42, headErr: 5.1, recovery: 8.7, latency: 6.9 },
  { method: "EKF Fusion", rmse: 5.6, drift: 16.2, velErr: 0.91, headErr: 3.6, recovery: 6.1, latency: 2.1 },
  { method: "EKF + Map Matching", rmse: 3.4, drift: 10.4, velErr: 0.63, headErr: 2.5, recovery: 4.4, latency: 3.0 },
  { method: "Full RoadSense Fusion", rmse: 2.41, drift: 7.86, velErr: 0.42, headErr: 1.94, recovery: 3.2, latency: 7.4 },
];

export const scenarios = [
  "Urban canyon — 86 s outage",
  "Tunnel transit — 140 s outage",
  "Highway cruise — 60 s outage",
  "Dense traffic stop-go — 110 s outage",
  "Multi-level parking spiral",
];

export const datasets = [
  "navix_urban_blr_01.csv",
  "navix_tunnel_run_04.csv",
  "navix_highway_nh44.csv",
  "kitti_style_imu_demo.csv",
];
