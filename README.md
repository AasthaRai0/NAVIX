# 🚗NAVIX

### AI-Powered Navigation During GNSS/GPS Outages

RoadSense Fusion AI is a hybrid navigation system designed to maintain reliable position and motion estimation when GNSS/GPS becomes unavailable, degraded, or unreliable.

Instead of depending on GPS alone, the system combines **smartphone IMU sensors, AI-based motion estimation, Kalman filtering, and map constraints** to reduce navigation drift during GNSS outages.

## 🎯 Problem

GNSS/GPS can become unreliable in:

* Tunnels
* Urban canyons
* Dense infrastructure
* Signal-blocked environments
* GNSS interference or outages

Traditional inertial dead reckoning works without GPS but accumulates error over time.

## 💡 Solution

RoadSense Fusion AI combines:

**IMU → Inertial Navigation → AI Motion Estimation → Adaptive EKF → Map Matching → Confidence-Aware Position**

The system can:

* Detect GNSS degradation
* Simulate GNSS outages
* Estimate motion using IMU
* Use AI to improve velocity estimation
* Fuse multiple measurements using Error-State EKF
* Constrain trajectories using road maps
* Estimate navigation confidence and uncertainty
* Detect rough-road events
* Recover smoothly when GNSS returns

## 🧠 Core Technologies

| Component       | Technology                       |
| --------------- | -------------------------------- |
| Language        | Python 3.11+                     |
| Data Processing | NumPy, Pandas, SciPy             |
| AI/ML           | PyTorch, Scikit-learn            |
| Navigation      | INS + Error-State EKF            |
| Geospatial      | PyProj, Shapely                  |
| Map Data        | OpenStreetMap / Local Road Graph |
| UI              | Streamlit                        |
| Visualization   | Plotly, Matplotlib               |
| Testing         | Pytest                           |
| Version Control | Git + GitHub                     |

## 🏗️ Architecture

```text
Sensor / Dataset
       ↓
Data Preprocessing
       ↓
GNSS Quality Monitor
       ↓
 ┌───────────────┐
 │ IMU → INS     │
 │ IMU → AI GRU  │
 └───────┬───────┘
         ↓
   Adaptive EKF
         ↓
   Map Matching
         ↓
Confidence & Uncertainty
         ↓
   Navigation UI
```

## 📊 Evaluation

The system compares:

1. GNSS-only
2. Classical INS
3. AI-assisted INS
4. EKF Fusion
5. EKF + Map Matching
6. Full RoadSense Fusion

Key metrics:

* Position Error
* RMSE
* Final Drift
* Drift %
* Velocity Error
* Heading Error
* Recovery Time
* AI Inference Latency

## 🚀 MVP

The first version is a **Python desktop prototype** that can load recorded sensor data, simulate GNSS outages, run the navigation pipeline, and visualize the resulting trajectory and performance.

## 📱 Future Smartphone Deployment

The current system is being developed as a Python prototype.

The intended smartphone architecture is:
          Android Smartphone
                  │
        ┌─────────┴─────────┐
        │                   │
       IMU                 GNSS
        │                   │
        └─────────┬─────────┘
                  ▼
           NAVIX Edge Engine
                  │
           ┌──────┴──────┐
           │             │
          TCN           UKF
           │             │
           └──────┬──────┘
                  ▼
          Position Estimate
                  │
                  ▼
          Navigation Interface

## 🔮 Future Improvements

AI:
1. Improved TCN architecture
2. Better IMU preprocessing
3. Phone orientation normalization
4. AI confidence estimation
5. More diverse training data

Sensor Fusion:
1. Improved adaptive noise estimation
2. Better GNSS anomaly detection
3. Smartphone-specific calibration
4. Improved GNSS recovery handling

Mapping:
1. Full HMM/Viterbi map matching
2. Offline OpenStreetMap integration
3. Road topology constraints
4. Lane-level positioning

Mobile:
1. Android integration
2. Real-time smartphone IMU streaming
3. On-device AI inference
4. Real-time UKF
5. Low-power optimization
