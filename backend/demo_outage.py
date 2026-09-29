"""Simulated drive with a 20 s GNSS outage (t=20..40). Run: python demo_outage.py"""
import math
import random

from navigation.interfaces import GnssFix, ImuSample
from navigation.engine import NavigationEngine
from navigation.simple_filter import SimpleFilter

R = 6378137.0
LAT0, LON0 = 28.6139, 77.2090


def to_ll(x, y):
    return (LAT0 + math.degrees(y / R),
            LON0 + math.degrees(x / (R * math.cos(math.radians(LAT0)))))


def to_xy(lat, lon):
    return (math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)),
            math.radians(lat - LAT0) * R)


class NoisySpeed:
    """Stand-in for the TCN: true speed + noise."""
    v = 10.0

    def push(self, imu):
        return self.v


random.seed(1)
speed = NoisySpeed()
eng = NavigationEngine(SimpleFilter(), speed_model=speed)
x = y = h = 0.0
v, dt, OUT = 10.0, 0.02, (20.0, 40.0)
last_mode = None
pre_return_err = None

for i in range(int(70 / dt)):
    t = i * dt
    yaw = 0.05 if 15 <= t < 45 else 0.0
    h += yaw * dt
    x += v * math.sin(h) * dt
    y += v * math.cos(h) * dt
    speed.v = v + random.gauss(0, 0.3)
    imu = ImuSample(t, (0, 0, 9.81), (0, 0, yaw + 0.005 + random.gauss(0, 0.01)))

    gnss = None
    if i % 50 == 0 and not (OUT[0] <= t < OUT[1]):
        lat, lon = to_ll(x + random.gauss(0, 3), y + random.gauss(0, 3))
        gnss = GnssFix(t, lat, lon, speed=v, course_deg=math.degrees(h) % 360,
                       accuracy_m=3.0, hdop=1.0, n_sats=10, cn0_mean=38.0)

    out = eng.update(imu, gnss)
    if out.lat is None:
        continue
    ox, oy = to_xy(out.lat, out.lon)
    err = math.hypot(ox - x, oy - y)
    if out.mode != last_mode or out.events:
        print(f"t={t:5.2f}s  mode={out.mode:15s} trust={out.trust_score:.2f} "
              f"err={err:5.1f} m  events={out.events}")
        last_mode = out.mode
    if i == int(OUT[1] / dt) - 1:
        pre_return_err = err

dist = v * (OUT[1] - OUT[0])
print(f"\nDrift at end of outage: {pre_return_err:.1f} m over {dist:.0f} m "
      f"= {100 * pre_return_err / dist:.1f}% (target < 10%)")
print(f"Final error: {err:.1f} m, final mode: {out.mode}")