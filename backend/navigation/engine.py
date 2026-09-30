import math
import numpy as np
from .gnss import GNSSTrust
from .ukf import UKF
from .geo import latlon_to_local, local_to_latlon
from .tcn_speed import TCNSpeedModel

class NavigationEngine:
    def __init__(self, model=None):
        self.ukf = UKF()
        self.gnss = GNSSTrust()
        self.model = model
        self.lat0 = None
        self.lon0 = None
        self.prev_gps = None
        self.prev_t = None
        self.history = []

    def _heading_from_dataset(self, heading_deg):
        # Dataset Heading is degrees clockwise from north.
        return math.radians(float(heading_deg))

    def step(self, row, window=None):
        t = float(row["relative_time"])
        lat = float(row["gps_lat"])
        lon = float(row["gps_lon"])
        gps_speed = float(row["gps_speed_kmh"]) / 3.6
        accuracy = float(row.get("gps_accuracy_m", 10.0))
        sats = float(row.get("gps_satellites", 8.0))
        gyro_yaw = float(row["gyro_yaw"])  # already rad/s

        if self.lat0 is None:
            self.lat0, self.lon0 = lat, lon
            e,n = 0.0,0.0
            heading = self._heading_from_dataset(float(row["vehicle_heading"]))
            self.ukf.initialize(e,n,gps_speed,heading)

        e,n = latlon_to_local(lat,lon,self.lat0,self.lon0)

        dt = 0.1 if self.prev_t is None else max(0.01,min(1.0,t-self.prev_t))
        jump = None
        if self.prev_gps is not None:
            jump = math.hypot(e-self.prev_gps[0], n-self.prev_gps[1])

        quality = self.gnss.score(accuracy,sats,gps_speed,jump,dt)

        if self.model is not None and window is not None and len(window) == 100:
            ai_speed = self.model.predict(window)
        else:
            ai_speed = gps_speed

        self.ukf.predict(ai_speed, gyro_yaw, dt)

        # Adaptive GNSS update. Suspicious GNSS is strongly downweighted.
        if quality.trust >= 0.08:
            self.ukf.update_gnss(e,n,quality.trust)

        x=self.ukf.x
        est_lat,est_lon=local_to_latlon(x[0],x[1],self.lat0,self.lon0)

        out={
            "time":t,
            "gps_lat":lat,"gps_lon":lon,
            "est_lat":est_lat,"est_lon":est_lon,
            "gps_speed_mps":gps_speed,
            "ai_speed_mps":ai_speed,
            "heading_deg":(math.degrees(x[3])%360),
            "gnss_trust":quality.trust,
            "gnss_status":quality.status,
        }
        self.history.append(out)
        self.prev_gps=(e,n)
        self.prev_t=t
        return out
