from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from navigation.engine import NavigationEngine
from navigation.tcn_speed import TCNSpeedModel

DATA=Path("data/S1_synchronized.csv")
OUT=Path("data/true_track_result.csv")
WINDOW=100

FEATURES=["acc_x","acc_y","acc_z","gyro_yaw","gyro_pitch","gyro_roll"]

def main():
    df = pd.read_csv(DATA)

    # 1. Clean duplicate column names if any
    df = df.loc[:, ~df.columns.duplicated()].copy()

    # Column mapping fix
    column_mapping = {
        "gps_accuracy": "gps_accuracy_m",
        "gps_speed": "gps_speed_kmh",
        "vehicle_velocity": "gps_speed_kmh",
        "heading": "vehicle_heading"
    }
    
    # Only rename columns that actually exist and avoid overriding existing ones
    rename_dict = {k: v for k, v in column_mapping.items() if k in df.columns and v not in df.columns}
    df = df.rename(columns=rename_dict)

    needed = FEATURES + [
        "relative_time", "gps_lat", "gps_lon", "gps_speed_kmh",
        "gps_accuracy_m", "gps_satellites", "vehicle_heading"
    ]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    model = TCNSpeedModel()
    if not model.ready:
        raise RuntimeError("TCN weights not found. Run: python train_speed_model.py")

    engine = NavigationEngine(model)
    rows = []

    feature_array = df[FEATURES].astype("float32").to_numpy()

    # 2. Iterate using df.itertuples() - 100x faster than to_dict/iloc
    print(f"Running Fusion on {len(df)} rows... Please wait.")
    
    for i, row in enumerate(df.itertuples()):
        start = i - WINDOW + 1
        window = None
        if start >= 0:
            window = feature_array[start : i + 1]

        # Convert named tuple row to dict safely
        row_dict = row._asdict()

        # Simulated GNSS-denied interval
        if 1000 <= float(row_dict["relative_time"]) <= 1100:
            row_dict["gps_accuracy_m"] = 9999
            row_dict["gps_satellites"] = 0

        rows.append(engine.step(row_dict, window))
        
        # Print progress every 10,000 rows
        if (i + 1) % 10000 == 0:
            print(f"Processed {i + 1}/{len(df)} rows...")

    out = pd.DataFrame(rows)
    print("Processing complete! Generating plots...")

    # Reference error in meters.
    lat0 = out["gps_lat"].iloc[0]
    m_lat = 111320.0
    m_lon = 111320.0 * np.cos(np.radians(lat0))
    de = (out["est_lon"] - out["gps_lon"]) * m_lon
    dn = (out["est_lat"] - out["gps_lat"]) * m_lat
    out["position_error_m"] = np.sqrt(de**2 + dn**2)

    out.to_csv(OUT, index=False)

    print("\n=== TrueTrack Validation ===")
    print(f"Rows: {len(out)}")
    print(f"Mean error: {out.position_error_m.mean():.2f} m")
    print(f"RMSE      : {np.sqrt(np.mean(out.position_error_m**2)):.2f} m")
    print(f"Max error : {out.position_error_m.max():.2f} m")

    if 'time' in out.columns:
        out['relative_time'] = out['time'] - out['time'].iloc[0]
    else:  
        out['relative_time'] = out.index

    # Plots
    fig = plt.figure(figsize=(9, 6))
    plt.plot(out.gps_lon, out.gps_lat, label="GNSS reference")
    plt.plot(out.est_lon, out.est_lat, label="TrueTrack")
    plt.xlabel("Longitude"); plt.ylabel("Latitude")
    plt.title("TrueTrack: GNSS vs Fused Trajectory")
    plt.legend(); plt.grid(True)
    plt.tight_layout(); plt.savefig("data/trajectory_plot.png"); plt.close()

    fig=plt.figure(figsize=(9,4))
    plt.plot(out.relative_time,out.position_error_m)
    plt.axvspan(1000,1100,alpha=.2,label="simulated GNSS outage")
    plt.xlabel("Time (s)"); plt.ylabel("Position error (m)")
    plt.title("Position Error")
    plt.legend(); plt.grid(True)
    plt.tight_layout(); plt.savefig("data/position_error_plot.png"); plt.close()

    fig=plt.figure(figsize=(9,4))
    plt.plot(out.relative_time,out.gnss_trust)
    plt.axvspan(1000,1100,alpha=.2,label="simulated GNSS outage")
    plt.xlabel("Time (s)"); plt.ylabel("GNSS Trust")
    plt.title("Adaptive GNSS Trust Score")
    plt.ylim(-0.05,1.05); plt.legend(); plt.grid(True)
    plt.tight_layout(); plt.savefig("data/gnss_trust_plot.png"); plt.close()

if __name__=="__main__":
    main()
