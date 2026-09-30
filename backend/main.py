from pathlib import Path
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="NAVIX TrueTrack API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RESULT = Path("data/true_track_result.csv")

@app.get("/")
def root():
    return {"project": "NAVIX TrueTrack", "status": "running"}

@app.get("/health")
def health():
    return {"status": "ok", "tcn_weights": Path("data/speed_tcn.pt").exists()}

@app.get("/navigation/metrics")
def metrics():
    if not RESULT.exists():
        raise HTTPException(404, "Run python run_fusion.py first")
    df = pd.read_csv(RESULT)
    e = df["position_error_m"]
    return {
        "rows": len(df),
        "mean_error_m": float(e.mean()),
        "rmse_m": float((e.pow(2).mean()) ** 0.5),
        "max_error_m": float(e.max()),
        "mean_gnss_trust": float(df.gnss_trust.mean()),
    }

@app.get("/navigation/trajectory")
def trajectory(limit: int = 1000):
    if not RESULT.exists():
        raise HTTPException(404, "Run python run_fusion.py first")
    df = pd.read_csv(RESULT).tail(limit)
    return df.to_dict(orient="records")

@app.get("/navigation/status")
def status():
    if not RESULT.exists():
        return {"mode": "NOT_READY"}
    df = pd.read_csv(RESULT)
    r = df.iloc[-1]
    return {
        "mode": "GNSS" if r.gnss_trust >= 0.4 else "DEAD_RECKONING",
        "gnss_trust": float(r.gnss_trust),
        "ai_speed_mps": float(r.ai_speed_mps),
        "latitude": float(r.est_lat),
        "longitude": float(r.est_lon),
    }
