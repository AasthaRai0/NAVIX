from pathlib import Path
import tempfile
import shutil

import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="NAVIX TrueTrack API",
    version="1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

DEFAULT_DATASET = DATA_DIR / "S1_synchronized.csv"
RESULT = DATA_DIR / "true_track_result.csv"


@app.get("/")
def root():
    return {
        "project": "NAVIX TrueTrack",
        "status": "running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "tcn_weights": (DATA_DIR / "speed_tcn.pt").exists(),
        "dataset": DEFAULT_DATASET.exists(),
        "result": RESULT.exists()
    }


@app.get("/navigation/metrics")
def metrics():
    if not RESULT.exists():
        raise HTTPException(
            status_code=404,
            detail="Run navigation fusion first."
        )

    df = pd.read_csv(RESULT)

    if "position_error_m" not in df.columns:
        raise HTTPException(
            status_code=500,
            detail="position_error_m missing from result."
        )

    e = df["position_error_m"]

    return {
        "rows": len(df),
        "mean_error_m": float(e.mean()),
        "rmse_m": float((e.pow(2).mean()) ** 0.5),
        "max_error_m": float(e.max()),
        "mean_gnss_trust": float(df["gnss_trust"].mean())
        if "gnss_trust" in df.columns else 0.0,
    }


@app.get("/navigation/trajectory")
def trajectory(limit: int = 1000):

    if not RESULT.exists():
        raise HTTPException(
            status_code=404,
            detail="Run navigation fusion first."
        )

    df = pd.read_csv(RESULT)

    df = df.tail(min(limit, len(df)))

    return df.to_dict(orient="records")


@app.get("/navigation/status")
def status():

    if not RESULT.exists():
        return {
            "mode": "NOT_READY"
        }

    df = pd.read_csv(RESULT)
    row = df.iloc[-1]

    trust = float(row.get("gnss_trust", 0.0))

    return {
        "mode": "GNSS" if trust >= 0.4 else "DEAD_RECKONING",
        "gnss_trust": trust,
        "ai_speed_mps": float(row.get("ai_speed_mps", 0.0)),
        "latitude": float(row["est_lat"]),
        "longitude": float(row["est_lon"]),
    }


# ============================================================
# REAL SIMULATION LAB ENDPOINT
# ============================================================

@app.post("/simulation/run")
async def simulation_run(
    file: UploadFile | None = File(default=None),
    dataset: str = Form(default="S1_synchronized.csv"),
    scenario: str = Form(default="Urban canyon"),
    outage_start: str = Form(default="00:04:12"),
    outage_duration: float = Form(default=86),
):
    """
    Run the real NAVIX sensor-fusion pipeline.

    Frontend sends:
        file
        dataset
        scenario
        outage_start
        outage_duration
    """

    temp_file = None

    try:

        # ----------------------------------------------------
        # 1. Determine dataset
        # ----------------------------------------------------

        if file is not None and file.filename:

            suffix = Path(file.filename).suffix or ".csv"

            temp = tempfile.NamedTemporaryFile(
                delete=False,
                suffix=suffix,
                dir=DATA_DIR
            )

            temp_file = Path(temp.name)

            with temp:
                shutil.copyfileobj(file.file, temp)

            data_path = temp_file

        else:

            # Always use the real synchronized dataset
            # when frontend selects the verified NAVIX dataset.

            requested = Path(dataset).name

            candidate = DATA_DIR / requested

            if candidate.exists():
                data_path = candidate

            elif requested.lower() in {
                "s1_synchronized.csv",
                "navix_urban_blp_01.csv",
            }:
                data_path = DEFAULT_DATASET

            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Dataset not found: {requested}"
                )

        if not data_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Dataset does not exist: {data_path.name}"
            )

        # ----------------------------------------------------
        # 2. Convert HH:MM:SS → seconds
        # ----------------------------------------------------

        try:
            parts = outage_start.strip().split(":")

            if len(parts) == 3:
                hours = float(parts[0])
                minutes = float(parts[1])
                seconds = float(parts[2])

                outage_start_seconds = (
                    hours * 3600
                    + minutes * 60
                    + seconds
                )

            elif len(parts) == 2:
                minutes = float(parts[0])
                seconds = float(parts[1])

                outage_start_seconds = (
                    minutes * 60 + seconds
                )

            else:
                outage_start_seconds = float(outage_start)

        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid outage start: {outage_start}"
            )

        outage_duration = float(outage_duration)

        if outage_duration <= 0:
            raise HTTPException(
                status_code=400,
                detail="Outage duration must be greater than 0."
            )

        # ----------------------------------------------------
        # 3. Run REAL NAVIX fusion
        # ----------------------------------------------------

        from run_fusion import run_fusion

        result = run_fusion(
            data_path=data_path,
            output_path=RESULT,
            outage_start=outage_start_seconds,
            outage_duration=outage_duration,
        )

        # ----------------------------------------------------
        # 4. Return real backend results
        # ----------------------------------------------------

        if result is None:

            df = pd.read_csv(RESULT)

            error = df["position_error_m"]

            result = {
                "rows": len(df),
                "mean_error_m": float(error.mean()),
                "rmse_m": float(
                    (error.pow(2).mean()) ** 0.5
                ),
                "max_error_m": float(error.max()),
                "mean_gnss_trust": float(
                    df["gnss_trust"].mean()
                ) if "gnss_trust" in df.columns else 0.0,
            }

        return {
            "status": "success",
            "dataset": data_path.name,
            "scenario": scenario,
            "outage_start": outage_start_seconds,
            "outage_duration": outage_duration,
            "result": result,
        }

    except HTTPException:
        raise

    except Exception as exc:

        print("\nNAVIX simulation error:")
        print(exc)

        raise HTTPException(
            status_code=500,
            detail=str(exc)
        )

    finally:

        if temp_file is not None:

            try:
                temp_file.unlink(missing_ok=True)
            except Exception:
                pass