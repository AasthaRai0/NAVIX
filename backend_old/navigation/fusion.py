from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from .ukf import UKF

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_FILE = (
    BASE_DIR /
    "data" /
    "S1_synchronized.csv"
)


def latlon_to_xy(
    lat,
    lon,
    lat0,
    lon0
):

    earth_radius = 6371000.0

    lat = np.radians(lat)
    lon = np.radians(lon)

    lat0 = np.radians(lat0)
    lon0 = np.radians(lon0)

    x = (
        (lon - lon0)
        * np.cos(lat0)
        * earth_radius
    )

    y = (
        (lat - lat0)
        * earth_radius
    )

    return x, y


def calculate_gnss_trust(
    satellites,
    accuracy
):

    # Satellite score
    satellite_score = min(
        float(satellites) / 20.0,
        1.0
    )

    # Accuracy score
    if accuracy <= 3:
        accuracy_score = 1.0

    elif accuracy <= 5:
        accuracy_score = 0.8

    elif accuracy <= 10:
        accuracy_score = 0.5

    else:
        accuracy_score = 0.2

    trust = (
        0.6 * satellite_score +
        0.4 * accuracy_score
    )

    return max(
        0.0,
        min(1.0, trust)
    )

def run_fusion():

    print("Loading synchronized data...")

    df = pd.read_csv(DATA_FILE)

    print(
        "Rows:",
        len(df)
    )

    lat0 = df["gps_lat"].iloc[0]
    lon0 = df["gps_lon"].iloc[0]

    df["gps_x"], df["gps_y"] = latlon_to_xy(
        df["gps_lat"].values,
        df["gps_lon"].values,
        lat0,
        lon0
    )

    ukf = UKF(
        dt=0.1
    )

    # Initial state
    ukf.x[0] = df["gps_x"].iloc[0]
    ukf.x[1] = df["gps_y"].iloc[0]
    # Estimate initial heading from GPS movement
    dx = (df["gps_x"].iloc[10]- df["gps_x"].iloc[0])
    dy = (df["gps_y"].iloc[10]- df["gps_y"].iloc[0])

    initial_heading = np.arctan2(dy,dx)

    ukf.x[3] = initial_heading
    
    # Lists to store output states
    estimated_x = []
    estimated_y = []
    estimated_speed = []
    estimated_heading = []
    gnss_trust_list = []
    trusts = []
 
    for _, row in df.iterrows():

        speed_kmh = row[
            "vehicle_velocity"
        ]

        speed_ms = (
            speed_kmh /
            3.6
        )

        gyro_z = row["gyro_yaw"]
        gyro_z = np.deg2rad(gyro_z)

        satellites = row[
            "gps_satellites"
        ]

        accuracy = row[
            "gps_accuracy"
        ]

        # Handle missing values
        if pd.isna(satellites):
            satellites = 0

        if pd.isna(accuracy):
            accuracy = 20

        trust = calculate_gnss_trust(
            satellites,
            accuracy
        )

        ukf.predict(
            speed=speed_ms,
            gyro_z=gyro_z
        )

        gps_x = row["gps_x"]
        gps_y = row["gps_y"]

        # Simulate GPS outage
        time = row["relative_time"]

        gps_available = not (
            1000 <= time <= 1100
        )

        if gps_available and not pd.isna(gps_x) and not pd.isna(gps_y):
            ukf.update_gps(gps_x, gps_y, trust)
            effective_trust = trust
        else:
            effective_trust = 0.0

        state = ukf.get_state()

        estimated_x.append(state[0])
        estimated_y.append(state[1])
        estimated_speed.append(state[2])
        estimated_heading.append(state[3])
        gnss_trust_list.append(effective_trust)

        trusts.append(
            trust
        )

    # Ab teeno/charo lists ki length 51746 hogi
    df["ukf_x"] = estimated_x
    df["ukf_y"] = estimated_y
    df["ukf_speed"] = estimated_speed
    df["ukf_heading"] = estimated_heading
    df["gnss_trust"] = gnss_trust_list

    output_file = BASE_DIR / "data" / "S1_fusion_result.csv"
    df.to_csv(output_file, index=False)

    print("UKF FUSION COMPLETE")

    print(
        "Output:",
        output_file
    )


    plt.figure(
        figsize=(10, 7)
    )

    plt.plot(
        df["gps_x"],
        df["gps_y"],
        label="GPS"
    )

    plt.plot(
        df["ukf_x"],
        df["ukf_y"],
        label="UKF"
    )

    plt.xlabel(
        "X position (m)"
    )

    plt.ylabel(
        "Y position (m)"
    )

    plt.title(
        "TrueTrack - GPS vs UKF"
    )

    plt.legend()

    plt.grid()

    plt.show()

    plt.figure(
        figsize=(10, 5)
    )

    plt.plot(
        df["relative_time"],
        df["gnss_trust"]
    )

    plt.xlabel(
        "Time (seconds)"
    )

    plt.ylabel(
        "GNSS Trust Score"
    )

    plt.title(
        "GNSS Trust Score"
    )

    plt.ylim(
        0,
        1.05
    )

    plt.grid()

    plt.show()

    return df


if __name__ == "__main__":

    run_fusion()