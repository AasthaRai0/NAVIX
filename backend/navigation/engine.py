import math
import numpy as np
from .gnss import GNSSTrust
from .ukf import UKF
from .geo import latlon_to_local, local_to_latlon
from .tcn_speed import TCNSpeedModel
from .orientation import OrientationCalibrator
from .map_match import HMMMapMatcher

class NavigationEngine:
    def __init__(self, model=None):
        self.ukf = UKF()
        self.gnss = GNSSTrust()
        self.model = model
        self.orient = OrientationCalibrator()
        self.map_matcher = HMMMapMatcher()
        
        self.lat0 = None
        self.lon0 = None
        self.prev_gps = None
        self.prev_t = None
        self.history = []

        # Outage simulation configuration
        self.outage_enabled = True
        self.outage_start = 1000.0
        self.outage_duration = 100.0
        self.outage_mode = "LOST"  # "LOST" or "WEAK"

    def set_outage_config(self, enabled=True, start=1000.0, duration=100.0, mode="LOST"):
        self.outage_enabled = enabled
        self.outage_start = float(start)
        self.outage_duration = float(duration)
        self.outage_mode = mode.upper()

    def reset(self):
        self.ukf = UKF()
        self.gnss = GNSSTrust()
        self.orient = OrientationCalibrator()
        self.lat0 = None
        self.lon0 = None
        self.prev_gps = None
        self.prev_t = None
        self.history = []

    def _heading_from_dataset(self, heading_deg):
        return math.radians(float(heading_deg))

    def step(self, row, window=None):
        t = float(row["relative_time"])
        lat = float(row["gps_lat"])
        lon = float(row["gps_lon"])
        gps_speed = float(row.get("gps_speed_kmh", row.get("vehicle_velocity", 0.0))) / 3.6
        accuracy = float(row.get("gps_accuracy_m", row.get("gps_accuracy", 10.0)))
        sats = float(row.get("gps_satellites", 8.0))

        # Check and apply simulated outage if active for this time step
        in_outage = False
        if self.outage_enabled and (self.outage_start <= t <= self.outage_start + self.outage_duration):
            in_outage = True
            if self.outage_mode == "LOST":
                accuracy = 9999.0
                sats = 0.0
            elif self.outage_mode == "WEAK":
                accuracy = 45.0
                sats = 3.0

        # Orientation transformation (phone to vehicle frame)
        ax = float(row.get("acc_x", 0.0))
        ay = float(row.get("acc_y", 0.0))
        az = float(row.get("acc_z", 9.81))
        gx = float(row.get("gyro_pitch", 0.0))
        gy = float(row.get("gyro_roll", 0.0))
        gz = float(row.get("gyro_yaw", 0.0))

        dt = 0.1 if self.prev_t is None else max(0.01, min(1.0, t - self.prev_t))

        transformed = self.orient.transform_imu(ax, ay, az, gx, gy, gz, dt=dt)
        gyro_yaw = transformed["gyro_yaw"]

        if self.lat0 is None:
            self.lat0, self.lon0 = lat, lon
            e, n = 0.0, 0.0
            heading = self._heading_from_dataset(float(row.get("vehicle_heading", 0.0)))
            self.ukf.initialize(e, n, gps_speed, heading)

        e, n = latlon_to_local(lat, lon, self.lat0, self.lon0)

        # Build fallback road network graph if needed
        if not self.map_matcher.segments and self.lat0 is not None:
            # Generate local coordinates for road network
            local_pts = []
            if "history" in self.__dict__ and self.history:
                local_pts = [(latlon_to_local(h["gps_lat"], h["gps_lon"], self.lat0, self.lon0)) for h in self.history[::5]]
            if len(local_pts) > 2:
                self.map_matcher.build_from_points(local_pts)

        jump = None
        if self.prev_gps is not None:
            jump = math.hypot(e - self.prev_gps[0], n - self.prev_gps[1])

        quality = self.gnss.score(accuracy, sats, gps_speed, jump, dt)

        # AI TCN speed prediction
        if self.model is not None and window is not None and len(window) == 100:
            ai_speed = self.model.predict(window)
        else:
            ai_speed = gps_speed

        # UKF motion prediction using TCN AI speed and vehicle gyro_yaw (with internal Non-Holonomic Constraint)
        self.ukf.predict(ai_speed, gyro_yaw, dt)

        # Adaptive GNSS measurement update (downweighted during outage / weak signal)
        if quality.trust >= 0.08:
            self.ukf.update_gnss(e, n, quality.trust)

        # OSM Map Matching constraint update (snaps position and road heading during GNSS outage or weak trust)
        matched = self.map_matcher.match(self.ukf.x[0], self.ukf.x[1])
        if matched and (quality.trust < 0.50 or in_outage):
            self.ukf.update_map(matched["east"], matched["north"], matched.get("heading_rad"))

        x = self.ukf.x
        est_lat, est_lon = local_to_latlon(x[0], x[1], self.lat0, self.lon0)

        out = {
            "time": t,
            "gps_lat": lat,
            "gps_lon": lon,
            "est_lat": est_lat,
            "est_lon": est_lon,
            "gps_speed_mps": gps_speed,
            "ai_speed_mps": ai_speed,
            "heading_deg": (math.degrees(x[3]) % 360),
            "gnss_trust": quality.trust,
            "gnss_status": quality.status,
            "ukf_mode": "GNSS" if quality.trust >= 0.40 else "DEAD_RECKONING",
            "map_snapped": matched is not None and quality.trust < 0.50,
            "outage_simulated": in_outage,
        }
        self.history.append(out)
        self.prev_gps = (e, n)
        self.prev_t = t
        return out
