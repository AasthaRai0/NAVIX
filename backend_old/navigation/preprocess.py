from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

S_FILE = DATA_DIR / "S-S1.csv"
V_FILE = DATA_DIR / "V-S1.csv"

def load_data():
    print("Loading S-S1...")
    s_data = pd.read_csv(S_FILE, encoding="latin1")

    print("Loading V-S1...")
    v_data = pd.read_csv(V_FILE, encoding="latin1")

    print("S-S1 shape:", s_data.shape)
    print("V-S1 shape:", v_data.shape)

    return s_data, v_data

def clean_columns(df):
    df.columns = (
        df.columns
        .astype(str)
        .str.replace("\xa0", " ", regex=False)
        .str.strip()
    )
    return df

def prepare_s_data(s_data):
    s_data = clean_columns(s_data)

    # Cleaned exact column names mapping based on your CSV printout
    s = s_data.rename(columns={
        "GPS LATITUDE (degrees)": "gps_lat",
        "GPS LONGITUDE (degrees)": "gps_lon",
        "GPS ALTITUDE (m)": "gps_alt",
        "GPS SPEED (Kmh)": "gps_speed_kmh",
        "GPS ACCURACY (m)": "gps_accuracy",
        "GPS SATELLITES IN RANGE": "gps_satellites",
        "TIME SINCE START (ms)": "time_ms",

        "ACCELEROMETER X (m/s²)": "acc_x",
        "ACCELEROMETER Y (m/s²)": "acc_y",
        "ACCELEROMETER Z (m/s²)": "acc_z",

        "GYROSCOPE Yaw (rad/s)": "gyro_yaw",
        "GYROSCOPE Pitch (rad/s)": "gyro_pitch",
        "GYROSCOPE Roll (rad/s)": "gyro_roll"
    })

    required = [
        "gps_lat",
        "gps_lon",
        "gps_speed_kmh",
        "gps_accuracy",
        "gps_satellites",
        "time_ms",
        "acc_x",
        "acc_y",
        "acc_z",
        "gyro_yaw",
        "gyro_pitch",
        "gyro_roll"
    ]

    missing = [col for col in required if col not in s.columns]

    if missing:
        raise ValueError(f"Missing S-S1 columns: {missing}")

    # Convert numeric columns
    for col in required:
        s[col] = pd.to_numeric(s[col], errors="coerce")

    # Remove invalid rows
    s = s.dropna(
        subset=[
            "gps_lat",
            "gps_lon",
            "time_ms",
            "acc_x",
            "acc_y",
            "acc_z",
            "gyro_yaw"
        ]
    )

    # Relative time in seconds
    s["relative_time"] = (
        s["time_ms"] - s["time_ms"].iloc[0]
    ) / 1000.0

    return s

def prepare_v_data(v_data):
    v_data = clean_columns(v_data)

    # Standardizing spaces in V-S1 columns as well
    v = v_data.rename(columns=lambda x: " ".join(x.split()))

    v = v.rename(columns={
        "No of GPS Satellites Available": "vehicle_gps_satellites",
        "Time Since Start of Day (seconds)": "vehicle_time_s",
        "Latitude (degrees)": "vehicle_lat",
        "Longitude (degrees)": "vehicle_lon",
        "Velocity (km/hr)": "vehicle_velocity",
        "Heading (degrees)": "vehicle_heading",
        "Yaw Rate (deg/sec)": "vehicle_yaw_rate",
        "Indicated Vehicle Speed (km/hr)": "vehicle_speed",
        "Indicated Longitudinal Acceleration (g)": "longitudinal_acc",
        "Indicated Lateral Acceleration (g)": "lateral_acc"
    })

    required = [
        "vehicle_time_s",
        "vehicle_lat",
        "vehicle_lon",
        "vehicle_velocity",
        "vehicle_heading"
    ]

    missing = [col for col in required if col not in v.columns]

    if missing:
        raise ValueError(f"Missing V-S1 columns: {missing}")

    for col in required:
        v[col] = pd.to_numeric(v[col], errors="coerce")

    v = v.dropna(subset=required)

    # Relative time
    v["relative_time"] = (
        v["vehicle_time_s"] - v["vehicle_time_s"].iloc[0]
    )

    return v

def synchronize_data(s, v):
    s = s.sort_values("relative_time")
    v = v.sort_values("relative_time")

    merged = pd.merge_asof(
        s,
        v,
        on="relative_time",
        direction="nearest",
        tolerance=0.06
    )

    merged = merged.dropna(
        subset=[
            "vehicle_velocity",
            "vehicle_heading"
        ]
    )

    return merged

def preprocess():
    s_data, v_data = load_data()

    s = prepare_s_data(s_data)
    v = prepare_v_data(v_data)

    merged = synchronize_data(s, v)

    output_file = DATA_DIR / "S1_synchronized.csv"

    merged.to_csv(output_file, index=False)

    print("\n===================================")
    print("PREPROCESSING COMPLETE")
    print("===================================")

    print("S-S1 rows:", len(s))
    print("V-S1 rows:", len(v))
    print("Final rows:", len(merged))

    print("\nOutput:")
    print(output_file)

    print("\nSample:")
    print(
        merged[
            [
                "relative_time",
                "gps_lat",
                "gps_lon",
                "gps_speed_kmh",
                "gps_satellites",
                "acc_x",
                "acc_y",
                "acc_z",
                "gyro_yaw",
                "gyro_pitch",
                "gyro_roll",
                "vehicle_velocity",
                "vehicle_heading"
            ]
        ].head()
    )

    return merged

if __name__ == "__main__":
    preprocess()