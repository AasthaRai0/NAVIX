from dataclasses import dataclass
import math

@dataclass
class GNSSQuality:
    trust: float
    status: str
    accuracy_m: float
    satellites: float

class GNSSTrust:
    """
    Trust score is not an ML prediction. It is a safety/quality gate.
    It reduces the GNSS update weight when accuracy/satellites are poor
    or when the position jump is physically inconsistent.
    """
    def score(self, accuracy_m, satellites, speed_mps, jump_m=None, dt=0.1):
        accuracy_m = float(accuracy_m) if accuracy_m == accuracy_m else 999.0
        satellites = float(satellites) if satellites == satellites else 0.0

        sat_score = min(max((satellites - 4.0) / 8.0, 0.0), 1.0)
        acc_score = max(0.0, min(1.0, 1.0 - (accuracy_m - 3.0) / 35.0))

        consistency = 1.0
        if jump_m is not None and dt > 0:
            possible = max(1.0, abs(speed_mps) * dt * 4.0 + 5.0)
            ratio = jump_m / possible
            consistency = max(0.0, min(1.0, 1.0 - max(0.0, ratio - 1.0)))

        trust = 0.45 * acc_score + 0.30 * sat_score + 0.25 * consistency

        if accuracy_m <= 8 and satellites >= 8 and trust >= 0.70:
            status = "STRONG"
        elif trust >= 0.40:
            status = "WEAK"
        else:
            status = "SUSPICIOUS"

        return GNSSQuality(round(float(trust), 4), status, accuracy_m, satellites)
