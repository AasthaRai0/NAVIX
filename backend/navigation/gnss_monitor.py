"""GNSS Trust Score + loss/return detection state machine.

Mode flow:
  GNSS_AIDED <-> DEGRADED -> DEAD_RECKONING -> RECOVERING -> GNSS_AIDED
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional

from .interfaces import GnssFix, Mode


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


@dataclass
class MonitorConfig:
    loss_age_s: float = 1.5        # no fix for this long -> GNSS lost
    degraded_below: float = 0.60   # trust below -> DEGRADED
    recover_above: float = 0.70    # trust above -> back to GNSS_AIDED (hysteresis)
    lost_below: float = 0.30       # trust below -> DEAD_RECKONING
    recover_fixes: int = 3         # consecutive consistent fixes to trust GNSS again
    nis_gate: float = 9.21         # chi2(2 dof) 99% : reject fixes beyond this
    # weights: sats, hdop/accuracy, cn0, fix age, innovation
    w_sats: float = 0.15
    w_quality: float = 0.20
    w_cn0: float = 0.20
    w_age: float = 0.25
    w_innov: float = 0.20
    tau_down_s: float = 0.3        # trust falls fast ...
    tau_up_s: float = 2.0          # ... and rises slowly (anti-flapping)


class TrustScorer:
    """GNSS Trust Score in [0, 1]; feeds both the UI and the filter's R inflation."""

    def __init__(self, cfg: MonitorConfig):
        self.cfg = cfg
        self.score = 0.0
        self._fix: Optional[GnssFix] = None
        self._nis: Optional[float] = None
        self._t: Optional[float] = None

    def components(self, now: float) -> Optional[Dict[str, float]]:
        f = self._fix
        if f is None:
            return None
        sats = 0.5 if f.n_sats is None else _clip01((f.n_sats - 4) / 8.0)
        if f.hdop is not None:
            quality = _clip01(1.0 - (f.hdop - 1.0) / 4.0)
        elif f.accuracy_m is not None:
            quality = _clip01(1.0 - (f.accuracy_m - 5.0) / 25.0)
        else:
            quality = 0.5
        cn0 = 0.5 if f.cn0_mean is None else _clip01((f.cn0_mean - 20.0) / 20.0)
        age_s = now - f.t
        age = 1.0 if age_s <= 1.5 else _clip01(1.0 - (age_s - 1.5) / 3.5)
        if self._nis is None:
            innov = 0.5  # unknown -> neutral
        elif self._nis <= 2.0:
            innov = 1.0
        else:
            innov = _clip01(1.0 - (self._nis - 2.0) / (self.cfg.nis_gate - 2.0))
        return {"sats": sats, "quality": quality, "cn0": cn0, "age": age, "innov": innov}

    def update(self, now: float, fix: Optional[GnssFix] = None,
               nis: Optional[float] = None) -> float:
        c = self.cfg
        if fix is not None:
            self._fix, self._nis = fix, nis
        comps = self.components(now)
        if comps is None:
            raw = 0.0
        else:
            raw = (c.w_sats * comps["sats"] + c.w_quality * comps["quality"]
                   + c.w_cn0 * comps["cn0"] + c.w_age * comps["age"]
                   + c.w_innov * comps["innov"])
            raw = min(raw, comps["age"])  # a stale fix can never be trusted
        if self._t is None:
            self.score = raw
        else:
            dt = max(0.0, now - self._t)
            tau = c.tau_down_s if raw < self.score else c.tau_up_s
            self.score += (1.0 - math.exp(-dt / tau)) * (raw - self.score)
        self._t = now
        return self.score


class ModeMachine:
    def __init__(self, cfg: MonitorConfig):
        self.cfg = cfg
        self.mode = Mode.INITIALIZING
        self._good = 0

    def reset(self, mode: Mode) -> None:
        self.mode, self._good = mode, 0

    def force_lost(self) -> None:
        """OS-level 'location provider lost' callback: switch immediately."""
        if self.mode != Mode.INITIALIZING:
            self.mode, self._good = Mode.DEAD_RECKONING, 0

    def step(self, trust: float, age_s: float, new_fix: bool,
             consistent: Optional[bool]) -> Mode:
        c = self.cfg
        if self.mode == Mode.INITIALIZING:
            return self.mode
        if self.mode == Mode.DEAD_RECKONING:
            if new_fix and age_s < c.loss_age_s:
                self.mode, self._good = Mode.RECOVERING, 0
            return self.mode
        if age_s > c.loss_age_s:
            self.mode, self._good = Mode.DEAD_RECKONING, 0
            return self.mode
        if self.mode == Mode.RECOVERING:
            if new_fix and consistent is not None:
                self._good = self._good + 1 if consistent else 0
                if self._good >= c.recover_fixes:
                    self.mode = Mode.GNSS_AIDED
            return self.mode
        if trust < c.lost_below:
            self.mode, self._good = Mode.DEAD_RECKONING, 0
        elif self.mode == Mode.GNSS_AIDED and trust < c.degraded_below:
            self.mode = Mode.DEGRADED
        elif self.mode == Mode.DEGRADED and trust >= c.recover_above:
            self.mode = Mode.GNSS_AIDED
        return self.mode