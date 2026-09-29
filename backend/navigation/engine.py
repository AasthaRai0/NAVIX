"""NavigationEngine: the single entry point the API/frontend calls.

    out = engine.update(imu_sample, gnss_fix_or_None)

The filter runs on every IMU sample in ALL modes, so 'switching' to dead
reckoning is only a change in which measurements are accepted (zero latency).
The only latency is *detecting* the loss; call notify_gnss_lost() from the
OS location/GnssStatus callbacks to make that instant.
"""
from __future__ import annotations

import math
from typing import Optional

from .gnss_monitor import ModeMachine, MonitorConfig, TrustScorer
from .interfaces import (EngineOutput, FusionFilter, GnssFix, ImuSample,
                         MapMatcher, Mode, SpeedModel)

_R = 6378137.0


class NavigationEngine:
    def __init__(self, filt: FusionFilter, speed_model: Optional[SpeedModel] = None,
                 map_matcher: Optional[MapMatcher] = None,
                 cfg: Optional[MonitorConfig] = None,
                 display_blend_tau_s: float = 2.0, map_match_period_s: float = 1.0):
        self.f, self.sm, self.mm = filt, speed_model, map_matcher
        self.cfg = cfg or MonitorConfig()
        self.scorer, self.machine = TrustScorer(self.cfg), ModeMachine(self.cfg)
        self.blend_tau, self.mm_period = display_blend_tau_s, map_match_period_s
        self.origin = None
        self._last_fix: Optional[GnssFix] = None
        self._last_t: Optional[float] = None
        self._last_match_t = -1e9
        self._offset = (0.0, 0.0)  # decaying display offset -> marker never teleports
        self._last_out = EngineOutput(t=0.0, mode=Mode.INITIALIZING.value)

    # ---- helpers -----------------------------------------------------------
    def _to_xy(self, lat: float, lon: float):
        lat0, lon0 = self.origin
        return (math.radians(lon - lon0) * _R * math.cos(math.radians(lat0)),
                math.radians(lat - lat0) * _R)

    def _to_ll(self, x: float, y: float):
        lat0, lon0 = self.origin
        return (lat0 + math.degrees(y / _R),
                lon0 + math.degrees(x / (_R * math.cos(math.radians(lat0)))))

    @staticmethod
    def _sigma(fix: GnssFix) -> float:
        if fix.accuracy_m is not None:
            return max(fix.accuracy_m, 1.0)
        if fix.hdop is not None:
            return max(4.0 * fix.hdop, 1.0)
        return 8.0

    def _consistent(self, fix: GnssFix, gx: float, gy: float, sigma: float) -> Optional[bool]:
        """Is this fix consistent with the previous one? (Checked against GNSS itself,
        NOT the filter, because after an outage the filter is the one that drifted.)"""
        p = self._last_fix
        if p is None:
            return None
        dt = fix.t - p.t
        if dt <= 0 or dt > 2.5:
            return None
        px, py = self._to_xy(p.lat, p.lon)
        d = math.hypot(gx - px, gy - py)
        v = fix.speed if fix.speed is not None else self.f.state().speed
        return abs(d - v * dt) <= max(6.0, 3.0 * sigma)

    # ---- public API --------------------------------------------------------
    def notify_gnss_lost(self) -> None:
        """Call from Android GnssStatus/LocationListener 'provider disabled' callbacks."""
        self.machine.force_lost()

    def update(self, imu: ImuSample, gnss: Optional[GnssFix] = None) -> EngineOutput:
        t = imu.t
        dt = 0.0 if self._last_t is None else max(0.0, t - self._last_t)
        self._last_t = t

        # 1. Wait for the first fix to anchor the local frame.
        if self.origin is None:
            if gnss is None:
                return self._last_out
            self.origin = (gnss.lat, gnss.lon)
            course = math.radians(gnss.course_deg) if gnss.course_deg is not None else 0.0
            self.f.initialize(t, 0.0, 0.0, course, gnss.speed or 0.0)
            self._last_fix = gnss
            self.scorer.update(t, gnss, None)
            self.machine.reset(Mode.GNSS_AIDED)
            self._last_out = self._output(t, [])
            return self._last_out

        # 2. Always propagate with IMU (+ speed-model pseudo-measurement).
        speed_est = self.sm.push(imu) if self.sm else None
        self.f.predict(imu, speed_est)

        # 3. GNSS handling.
        before = self.machine.mode
        gx = gy = sigma = 0.0
        consistent = nis = None
        if gnss is not None:
            gx, gy = self._to_xy(gnss.lat, gnss.lon)
            sigma = self._sigma(gnss)
            consistent = self._consistent(gnss, gx, gy, sigma)
            if before in (Mode.GNSS_AIDED, Mode.DEGRADED):
                nis = self.f.innovation_nis(gx, gy, sigma)

        trust = self.scorer.update(t, gnss, nis) if gnss is not None else self.scorer.update(t)
        age = t - (self._last_fix.t if self._last_fix else t)
        if gnss is not None:
            age = 0.0
        after = self.machine.step(trust, age, gnss is not None, consistent)

        if gnss is not None:
            course = math.radians(gnss.course_deg) if gnss.course_deg is not None else None
            if after in (Mode.GNSS_AIDED, Mode.DEGRADED) and before in (Mode.GNSS_AIDED, Mode.DEGRADED):
                if nis is not None and nis <= self.cfg.nis_gate:  # reject outliers (multipath/jamming)
                    self.f.update_position(gx, gy, sigma / max(trust, 0.15), gnss.speed, course)
            elif before == Mode.RECOVERING and after == Mode.GNSS_AIDED:
                s = self.f.state()
                self.f.reset_position(gx, gy, sigma)
                self._offset = (s.x - gx, s.y - gy)  # blend on screen instead of jumping
                self.scorer.score = max(self.scorer.score, self.cfg.degraded_below + 0.05)
            self._last_fix = gnss

        # 4. Map matching while GNSS is not fully trusted.
        if self.mm and after != Mode.GNSS_AIDED and t - self._last_match_t >= self.mm_period:
            s = self.f.state()
            m = self.mm.match(s.x, s.y, s.heading, s.pos_std)
            if m:
                self.f.update_position(m[0], m[1], m[2])
            self._last_match_t = t

        # 5. Decay display offset and emit.
        k = math.exp(-dt / self.blend_tau) if self.blend_tau > 0 else 0.0
        self._offset = (self._offset[0] * k, self._offset[1] * k)

        events = []
        if after != before:
            if after == Mode.DEAD_RECKONING:
                events.append("GNSS_LOST")
            elif after == Mode.DEGRADED:
                events.append("GNSS_WEAK")
            elif after == Mode.GNSS_AIDED and before in (Mode.RECOVERING, Mode.DEGRADED):
                events.append("GNSS_RESTORED")
        self._last_out = self._output(t, events)
        return self._last_out

    def _output(self, t: float, events) -> EngineOutput:
        s = self.f.state()
        lat, lon = self._to_ll(s.x + self._offset[0], s.y + self._offset[1])
        return EngineOutput(t=t, mode=self.machine.mode.value, lat=lat, lon=lon,
                            speed_mps=s.speed, heading_deg=math.degrees(s.heading) % 360.0,
                            accuracy_m=s.pos_std, trust_score=round(self.scorer.score, 3),
                            events=list(events))