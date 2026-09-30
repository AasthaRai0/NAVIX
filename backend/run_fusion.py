from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from navigation.engine import NavigationEngine
from navigation.tcn_speed import TCNSpeedModel


BASE_DIR = Path(__file__).resolve().parent

DEFAULT_DATA = BASE_DIR / "data" / "S1_synchronized.csv"
DEFAULT_OUT = BASE_DIR / "data" / "true_track_result.csv"

WINDOW = 100

FEATURES = [
    "acc_x",
    "acc_y",
    "acc_z",
    "gyro_yaw",
    "gyro_pitch",
    "gyro_roll",
]


def run_fusion(
    data_path=DEFAULT_DATA,
    output_path=DEFAULT_OUT,
    outage_start=1000.0,
    outage_duration=100.0,
):
    """
    Real NAVIX fusion pipeline.

    CSV
      ↓
    TCN
      ↓
    GNSS Trust
      ↓
    GNSS outage
      ↓
    UKF
      ↓
    trajectory
      ↓
    metrics
    """

    data_path = Path(data_path)
    output_path = Path(output_path)

    # ========================================================
    # LOAD DATA
    # ========================================================

    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {data_path}"
        )

    df = pd.read_csv(data_path)

    # Remove duplicate columns
    df = df.loc[
        :,
        ~df.columns.duplicated(),
    ].copy()

    # ========================================================
    # COLUMN NORMALIZATION
    # ========================================================

    column_mapping = {
        "gps_accuracy": "gps_accuracy_m",
        "gps_speed": "gps_speed_kmh",
        "vehicle_velocity": "gps_speed_kmh",
        "heading": "vehicle_heading",
    }

    rename_dict = {
        k: v
        for k, v in column_mapping.items()
        if k in df.columns
        and v not in df.columns
    }

    df = df.rename(
        columns=rename_dict
    )

    needed = FEATURES + [
        "relative_time",
        "gps_lat",
        "gps_lon",
        "gps_speed_kmh",
        "gps_accuracy_m",
        "gps_satellites",
        "vehicle_heading",
    ]

    missing = [
        c
        for c in needed
        if c not in df.columns
    ]

    if missing:
        raise ValueError(
            f"Missing columns: {missing}"
        )

    # ========================================================
    # LOAD TCN
    # ========================================================

    model = TCNSpeedModel()

    if not model.ready:
        raise RuntimeError(
            "TCN weights not found. "
            "Run: python train_speed_model.py"
        )

    engine = NavigationEngine(model)

    # ========================================================
    # FEATURE ARRAY
    # ========================================================

    feature_array = (
        df[FEATURES]
        .astype("float32")
        .to_numpy()
    )

    rows = []

    print()
    print("=" * 60)
    print("NAVIX REAL SENSOR FUSION")
    print("=" * 60)
    print(f"Dataset       : {data_path.name}")
    print(f"Rows          : {len(df)}")
    print(f"Outage start  : {outage_start:.2f} s")
    print(
        f"Outage end    : "
        f"{outage_start + outage_duration:.2f} s"
    )
    print(
        f"Outage length : "
        f"{outage_duration:.2f} s"
    )
    print("=" * 60)
    print()

    # ========================================================
    # PROCESS EACH SENSOR SAMPLE
    # ========================================================

    for i, row in enumerate(
        df.itertuples()
    ):

        start = (
            i - WINDOW + 1
        )

        if start >= 0:
            window = feature_array[
                start : i + 1
            ]
        else:
            window = None

        row_dict = row._asdict()

        current_time = float(
            row_dict["relative_time"]
        )

        # ====================================================
        # REAL GNSS OUTAGE
        # ====================================================

        outage_end = (
            outage_start
            + outage_duration
        )

        in_outage = (
            outage_start
            <= current_time
            <= outage_end
        )

        if in_outage:

            # Remove GNSS reliability
            row_dict["gps_accuracy_m"] = 9999.0

            row_dict["gps_satellites"] = 0

        # ====================================================
        # NAVIX ENGINE
        # ====================================================

        result = engine.step(
            row_dict,
            window,
        )

        # Add simulation state
        result["simulation_gnss_outage"] = (
            1 if in_outage else 0
        )

        result["simulation_phase"] = (
            "GNSS_LOST"
            if in_outage
            else "GNSS_AVAILABLE"
        )

        rows.append(result)

        if (i + 1) % 5000 == 0:
            print(
                f"Processed "
                f"{i + 1}/{len(df)} rows..."
            )

    # ========================================================
    # OUTPUT DATAFRAME
    # ========================================================

    out = pd.DataFrame(rows)

    print()
    print(
        "Processing complete!"
    )

    # ========================================================
    # POSITION ERROR
    # ========================================================

    lat0 = float(
        out["gps_lat"].iloc[0]
    )

    meters_per_lat = 111320.0

    meters_per_lon = (
        111320.0
        * np.cos(
            np.radians(lat0)
        )
    )

    delta_east = (
        out["est_lon"]
        - out["gps_lon"]
    ) * meters_per_lon

    delta_north = (
        out["est_lat"]
        - out["gps_lat"]
    ) * meters_per_lat

    out["position_error_m"] = np.sqrt(
        delta_east**2
        + delta_north**2
    )

    # ========================================================
    # SAVE RESULT
    # ========================================================

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    out.to_csv(
        output_path,
        index=False,
    )

    # ========================================================
    # METRICS
    # ========================================================

    errors = (
        pd.to_numeric(
            out["position_error_m"],
            errors="coerce",
        )
        .dropna()
    )

    rmse = float(
        np.sqrt(
            np.mean(
                errors**2
            )
        )
    )

    mean_error = float(
        errors.mean()
    )

    max_error = float(
        errors.max()
    )

    # ========================================================
    # VELOCITY ERROR
    # ========================================================

    if (
        "ai_speed_mps" in out.columns
        and "gps_speed_kmh" in out.columns
    ):

        ai_speed = pd.to_numeric(
            out["ai_speed_mps"],
            errors="coerce",
        )

        gps_speed = (
            pd.to_numeric(
                out["gps_speed_kmh"],
                errors="coerce",
            )
            / 3.6
        )

        velocity_error = float(
            (ai_speed - gps_speed)
            .abs()
            .mean()
        )

    else:
        velocity_error = 0.0

    # ========================================================
    # HEADING ERROR
    # ========================================================

    if (
        "est_heading" in out.columns
        and "vehicle_heading"
        in out.columns
    ):

        est_heading = pd.to_numeric(
            out["est_heading"],
            errors="coerce",
        )

        ref_heading = pd.to_numeric(
            out["vehicle_heading"],
            errors="coerce",
        )

        heading_difference = (
            est_heading
            - ref_heading
            + 180
        ) % 360 - 180

        heading_error = float(
            heading_difference
            .abs()
            .mean()
        )

    else:
        heading_error = 0.0

    # ========================================================
    # GNSS OUTAGE INFORMATION
    # ========================================================

    outage_mask = (
        out["simulation_gnss_outage"]
        == 1
    )

    gnss_lost_samples = int(
        outage_mask.sum()
    )

    # ========================================================
    # AI LATENCY
    # ========================================================

    latency = 0.0

    if "ai_latency_ms" in out.columns:

        latency_values = pd.to_numeric(
            out["ai_latency_ms"],
            errors="coerce",
        ).dropna()

        if len(latency_values):
            latency = float(
                latency_values.mean()
            )

    # ========================================================
    # PLOTS
    # ========================================================

    if "relative_time" not in out.columns:

        out["relative_time"] = (
            np.arange(len(out))
        )

    # --------------------------------------------------------
    # Trajectory
    # --------------------------------------------------------

    plt.figure(
        figsize=(9, 6)
    )

    plt.plot(
        out["gps_lon"],
        out["gps_lat"],
        label="GNSS reference",
    )

    plt.plot(
        out["est_lon"],
        out["est_lat"],
        label="NAVIX fused trajectory",
    )

    plt.xlabel("Longitude")
    plt.ylabel("Latitude")

    plt.title(
        "NAVIX: GNSS vs AI-UKF Trajectory"
    )

    plt.legend()
    plt.grid(True)
    plt.tight_layout()

    plt.savefig(
        BASE_DIR
        / "data"
        / "trajectory_plot.png"
    )

    plt.close()

    # --------------------------------------------------------
    # Position error
    # --------------------------------------------------------

    plt.figure(
        figsize=(9, 4)
    )

    plt.plot(
        out["relative_time"],
        out["position_error_m"],
    )

    plt.axvspan(
        outage_start,
        outage_start + outage_duration,
        alpha=0.2,
        label="GNSS outage",
    )

    plt.xlabel("Time (s)")
    plt.ylabel("Position error (m)")

    plt.title(
        "NAVIX Position Error"
    )

    plt.legend()
    plt.grid(True)
    plt.tight_layout()

    plt.savefig(
        BASE_DIR
        / "data"
        / "position_error_plot.png"
    )

    plt.close()

    # --------------------------------------------------------
    # GNSS trust
    # --------------------------------------------------------

    plt.figure(
        figsize=(9, 4)
    )

    plt.plot(
        out["relative_time"],
        out["gnss_trust"],
    )

    plt.axvspan(
        outage_start,
        outage_start + outage_duration,
        alpha=0.2,
        label="GNSS outage",
    )

    plt.xlabel("Time (s)")
    plt.ylabel("GNSS Trust")

    plt.title(
        "NAVIX Adaptive GNSS Trust"
    )

    plt.ylim(
        -0.05,
        1.05,
    )

    plt.legend()
    plt.grid(True)
    plt.tight_layout()

    plt.savefig(
        BASE_DIR
        / "data"
        / "gnss_trust_plot.png"
    )

    plt.close()

    # ========================================================
    # PRINT VALIDATION
    # ========================================================

    print()
    print("=" * 60)
    print("NAVIX SIMULATION RESULT")
    print("=" * 60)

    print(
        f"Rows              : {len(out)}"
    )

    print(
        f"Mean error        : "
        f"{mean_error:.2f} m"
    )

    print(
        f"RMSE              : "
        f"{rmse:.2f} m"
    )

    print(
        f"Max error         : "
        f"{max_error:.2f} m"
    )

    print(
        f"Velocity error    : "
        f"{velocity_error:.2f} m/s"
    )

    print(
        f"Heading error     : "
        f"{heading_error:.2f} deg"
    )

    print(
        f"GNSS lost samples : "
        f"{gnss_lost_samples}"
    )

    print("=" * 60)

    # ========================================================
    # RETURN API RESULT
    # ========================================================

    return {
        "rows": int(len(out)),
        "mean_error_m": mean_error,
        "rmse": rmse,
        "position_rmse": rmse,
        "drift": max_error,
        "final_drift": max_error,
        "velErr": velocity_error,
        "velocity_error": velocity_error,
        "headErr": heading_error,
        "heading_error": heading_error,
        "recovery": 0.0,
        "recovery_time": 0.0,
        "latency": latency,
        "inference_latency_ms": latency,
        "outage_start": float(
            outage_start
        ),
        "outage_end": float(
            outage_start
            + outage_duration
        ),
        "gnss_lost_samples": gnss_lost_samples,
        "output_file": str(
            output_path
        ),
    }


def main():

    run_fusion(
        data_path=DEFAULT_DATA,
        output_path=DEFAULT_OUT,
        outage_start=1000.0,
        outage_duration=100.0,
    )


if __name__ == "__main__":
    main()