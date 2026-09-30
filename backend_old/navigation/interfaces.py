"""Shared contracts between the Navigation & Integration layer, the AI/ML
teammates (UKF, speed model, map matcher) and the frontend.

CONVENTIONS (agree on these with the whole team):
  * Time: seconds (float), monotonic, same clock for IMU and GNSS.
  * Local frame: ENU metres from the first GNSS fix. x = east, y = north.
  * Heading: radians internally, clockwise from north (0 = north, pi/2 = east).
  * ImuSample.gyro[2] = yaw rate about the vertical axis, positive = clockwise
    (heading increasing), rad/s, ALREADY rotated into the vehicle frame by the
    alignment module.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import List, Optional, Protocol, Tuple


class Mode(str, Enum):
    INITIALIZING = "INITIALIZING"
    GNSS_AIDED = "GNSS_AIDED"
    DEGRADED = "DEGRADED"            # GNSS present but weak / untrusted
    DEAD_RECKONING = "DEAD_RECKONING"  # GNSS lost
    RECOVERING = "RECOVERING"        # GNSS is back, being validated


@dataclass
class ImuSample:
    t: float
    accel: Tuple[float, float, float]
    gyro: Tuple[float, float, float]
    mag: Optional[Tuple[float, float, float]] = None


@dataclass
class GnssFix:
    t: float
    lat: float
    lon: float
    speed: Optional[float] = None        # m/s
    course_deg: Optional[float] = None   # clockwise from north
    accuracy_m: Optional[float] = None   # 1-sigma horizontal, as reported by OS
    hdop: Optional[float] = None
    n_sats: Optional[int] = None
    cn0_mean: Optional[float] = None     # dB-Hz, mean of satellites used


@dataclass
class FilterState:
    x: float
    y: float
    speed: float
    heading: float   # rad
    pos_std: float   # 1-sigma horizontal position uncertainty, metres


@dataclass
class EngineOutput:
    """What the API layer / frontend receives on every update."""
    t: float
    mode: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    speed_mps: float = 0.0
    heading_deg: float = 0.0
    accuracy_m: float = 0.0      # 1-sigma -> frontend confidence circle radius
    trust_score: float = 0.0     # 0..1 -> frontend GNSS Trust Score
    events: List[str] = field(default_factory=list)  # GNSS_LOST / GNSS_WEAK / GNSS_RESTORED

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Plug-in points for the AI/ML teammates. Anything with these methods works.
# ---------------------------------------------------------------------------
class FusionFilter(Protocol):
    """UKF / EKF owned by the AI/ML Sensor Fusion developer (ENU frame)."""

    def initialize(self, t: float, x: float, y: float, heading: float, speed: float) -> None: ...

    def predict(self, imu: ImuSample, speed_est: Optional[float]) -> None:
        """Propagate with IMU. speed_est (m/s) is the speed-model pseudo-measurement.
        NHC (zero lateral/vertical velocity) should be applied inside."""

    def innovation_nis(self, x: float, y: float, sigma: float) -> float:
        """Normalised innovation squared (chi2, 2 dof) of a position fix. Must NOT modify state."""

    def update_position(self, x: float, y: float, sigma: float,
                        speed: Optional[float] = None,
                        course: Optional[float] = None) -> None: ...

    def reset_position(self, x: float, y: float, sigma: float) -> None:
        """Hard snap after a long outage (covariance inflated)."""

    def state(self) -> FilterState: ...


class SpeedModel(Protocol):
    """TCN / 1D-CNN+LSTM owned by the AI/ML Speed Prediction developer."""

    def push(self, imu: ImuSample) -> Optional[float]:
        """Feed one sample; return forward speed (m/s) when a new estimate is ready, else None."""


class MapMatcher(Protocol):
    """HMM/Viterbi matcher over OSM."""

    def match(self, x: float, y: float, heading: float,
              sigma: float) -> Optional[Tuple[float, float, float]]:
        """Return (x_snapped, y_snapped, sigma_of_snap) or None if no confident match."""