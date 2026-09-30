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
    df=pd.read_csv(DATA)

    # Exact synchronized dataset columns expected by this backend.
    needed=FEATURES+[
        "relative_time","gps_lat","gps_lon","gps_speed_kmh",
        "gps_accuracy_m","gps_satellites","vehicle_heading"
    ]
    missing=[c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    model=TCNSpeedModel()
    if not model.ready:
        raise RuntimeError(
            "TCN weights not found. Run: python train_speed_model.py"
        )

    engine=NavigationEngine(model)
    rows=[]

    feature_array=df[FEATURES].astype("float32").to_numpy()

    for i in range(len(df)):
        start=i-WINDOW+1
        window=None
        if start>=0:
            window=feature_array[start:i+1]

        # Simulated GNSS-denied interval for evaluation only.
        # During this interval we hide GNSS from the fusion engine.
        row=df.iloc[i].copy()
        if 1000 <= float(row["relative_time"]) <= 1100:
            row["gps_accuracy_m"]=9999
            row["gps_satellites"]=0

        rows.append(engine.step(row,window))

    out=pd.DataFrame(rows)

    # Reference error in meters.
    lat0=out["gps_lat"].iloc[0]
    m_lat=111320.0
    m_lon=111320.0*np.cos(np.radians(lat0))
    de=(out["est_lon"]-out["gps_lon"])*m_lon
    dn=(out["est_lat"]-out["gps_lat"])*m_lat
    out["position_error_m"]=np.sqrt(de**2+dn**2)

    out.to_csv(OUT,index=False)

    print("\\n=== TrueTrack Validation ===")
    print(f"Rows: {len(out)}")
    print(f"Mean error: {out.position_error_m.mean():.2f} m")
    print(f"RMSE      : {np.sqrt(np.mean(out.position_error_m**2)):.2f} m")
    print(f"Max error : {out.position_error_m.max():.2f} m")

    fig=plt.figure(figsize=(9,6))
    plt.plot(out.gps_lon,out.gps_lat,label="GNSS reference")
    plt.plot(out.est_lon,out.est_lat,label="TrueTrack")
    plt.xlabel("Longitude"); plt.ylabel("Latitude")
    plt.title("TrueTrack: GNSS vs Fused Trajectory")
    plt.legend(); plt.grid(True)
    plt.tight_layout(); plt.show()

    fig=plt.figure(figsize=(9,4))
    plt.plot(out.relative_time,out.position_error_m)
    plt.axvspan(1000,1100,alpha=.2,label="simulated GNSS outage")
    plt.xlabel("Time (s)"); plt.ylabel("Position error (m)")
    plt.title("Position Error")
    plt.legend(); plt.grid(True)
    plt.tight_layout(); plt.show()

    fig=plt.figure(figsize=(9,4))
    plt.plot(out.relative_time,out.gnss_trust)
    plt.axvspan(1000,1100,alpha=.2,label="simulated GNSS outage")
    plt.xlabel("Time (s)"); plt.ylabel("GNSS Trust")
    plt.title("Adaptive GNSS Trust Score")
    plt.ylim(-0.05,1.05); plt.legend(); plt.grid(True)
    plt.tight_layout(); plt.show()

if __name__=="__main__":
    main()
