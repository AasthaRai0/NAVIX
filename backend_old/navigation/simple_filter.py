"""Minimal stand-in for the UKF so the integration layer can be built and tested
now. Replace with the AI/ML teammate's UKF (same methods, see FusionFilter)."""
from __future__ import annotations

import math
from typing import Optional

from .interfaces import FilterState, ImuSample


def _wrap(a: float) -> float:
    return (a + math.pi) % (2 * math.pi) - math.pi


class SimpleFilter:
    def __init__(self, pos_sigma0: float = 5.0, drift_rate: float = 0.03):
        self.pos_sigma0, self.drift_rate = pos_sigma0, drift_rate
        self.t = 0.0
        self.x = self.y = self.v = self.h = 0.0
        self.sigma = pos_sigma0

    def initialize(self, t, x, y, heading, speed):
        self.t, self.x, self.y, self.h, self.v = t, x, y, heading, speed
        self.sigma = self.pos_sigma0

    def predict(self, imu: ImuSample, speed_est: Optional[float] = None):
        dt = imu.t - self.t
        if dt <= 0:
            return
        self.t = imu.t
        self.h = _wrap(self.h + imu.gyro[2] * dt)
        if speed_est is not None:
            self.v = max(0.0, speed_est)
        ds = self.v * dt
        # Motion is only along heading => implicit non-holonomic constraint.
        self.x += ds * math.sin(self.h)
        self.y += ds * math.cos(self.h)
        self.sigma += self.drift_rate * ds  # uncertainty grows with distance

    def innovation_nis(self, x, y, sigma) -> float:
        d2 = (x - self.x) ** 2 + (y - self.y) ** 2
        return d2 / (self.sigma ** 2 + sigma ** 2)

    def update_position(self, x, y, sigma, speed=None, course=None):
        s2, r2 = self.sigma ** 2, sigma ** 2
        k = s2 / (s2 + r2)
        self.x += k * (x - self.x)
        self.y += k * (y - self.y)
        self.sigma = max(1.0, math.sqrt((1 - k) * s2))
        if speed is not None:
            self.v += 0.3 * (speed - self.v)
        if course is not None and self.v > 2.0:
            self.h = _wrap(self.h + 0.3 * _wrap(course - self.h))

    def reset_position(self, x, y, sigma):
        self.x, self.y, self.sigma = x, y, max(sigma, 1.0)

    def state(self) -> FilterState:
        return FilterState(self.x, self.y, self.v, self.h, self.sigma)