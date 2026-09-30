export const API_BASE_URL = "http://localhost:8000";

export interface BackendHealth {
  status: string;
  tcn_weights: boolean;
}

export interface BackendMetrics {
  rows: number;
  mean_error_m: number;
  rmse_m: number;
  max_error_m: number;
  mean_gnss_trust: number;
}

export interface BackendStatus {
  mode: string;
  gnss_trust: number;
  ai_speed_mps: number;
  latitude: number;
  longitude: number;
}

export interface TrajectoryPoint {
  relative_time?: number;
  gps_lat: number;
  gps_lon: number;
  est_lat: number;
  est_lon: number;
  gnss_trust: number;
  ai_speed_mps: number;
  position_error_m: number;
  vehicle_heading?: number;
  acc_x?: number;
  acc_y?: number;
  acc_z?: number;
  gyro_yaw?: number;
  gyro_pitch?: number;
  gyro_roll?: number;
}

export async function fetchHealth(): Promise<BackendHealth | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchMetrics(): Promise<BackendMetrics | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/navigation/metrics`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchStatus(): Promise<BackendStatus | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/navigation/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchTrajectory(limit: number = 1000): Promise<TrajectoryPoint[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/navigation/trajectory?limit=${limit}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
