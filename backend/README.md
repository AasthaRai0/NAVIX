# NAVIX TrueTrack — AI Dead Reckoning Backend

This version is a clean implementation rather than a copy of the old fusion pipeline.

## Actual AI component

`navigation/tcn_speed.py`

A lightweight Temporal Convolutional Network predicts vehicle speed from:

- accelerometer X/Y/Z
- gyroscope yaw/pitch/roll

The UKF receives the **predicted speed**, not the dataset ground-truth velocity.

## Fusion pipeline

```text
S-S1 IMU
   ↓
Preprocessed synchronized data
   ↓
TCN speed prediction
   ↓
GNSS Trust Score
   ↓
Adaptive UKF
   ├── AI speed
   ├── gyro yaw rate
   └── GNSS position when trusted
   ↓
Trajectory
   ↓
FastAPI
```

## Dataset units

- S-S1 gyro yaw/pitch/roll: rad/s
- V-S1 heading: degrees clockwise from north
- V-S1 velocity: km/h → divided by 3.6 for m/s
- accelerometer: m/s²

Do NOT convert the gyro values from degrees to radians again.

## Run

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Put the synchronized dataset here:

```text
data/S1_synchronized.csv
```

Train the AI model:

```powershell
python train_speed_model.py
```

Then run fusion:

```powershell
python run_fusion.py
```

Start API:

```powershell
uvicorn main:app --reload
```

API:
- `/health`
- `/navigation/status`
- `/navigation/trajectory`
- `/navigation/metrics`

## Important

The GNSS outage in `run_fusion.py` is a validation simulation. It hides GNSS between 1000–1100 seconds. It is not pretending the dataset itself contains a real tunnel outage.

## Map matching

`navigation/map_match.py` contains an offline map-matching module. Add a local OSM-derived GeoJSON road network at:

```text
data/roads.geojson
```

The navigation engine can later call this after UKF positioning. No internet is required during inference.
