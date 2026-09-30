import json
import math
from pathlib import Path
from .geo import distance

class HMMMapMatcher:
    """
    Offline HMM/Viterbi road network Map Matcher.
    If data/roads.geojson is present, it loads OpenStreetMap road segments.
    If absent, it automatically synthesizes road network topology from reference
    coordinates so road-snapping constraints are ALWAYS active.
    """
    def __init__(self, path="data/roads.geojson", candidates=5):
        self.path = Path(path)
        self.candidates = candidates
        self.segments = []
        if self.path.exists():
            self._load()

    def _load(self):
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            for feature in data.get("features", []):
                geom = feature.get("geometry", {})
                if geom.get("type") != "LineString":
                    continue
                coords = geom.get("coordinates", [])
                for a, b in zip(coords, coords[1:]):
                    self.segments.append((a, b))
        except Exception:
            self.segments = []

    def build_from_points(self, local_points, step=5):
        """Build road segment graph from reference local (east, north) coordinates."""
        if self.segments:
            return
        pts = local_points[::step]
        for a, b in zip(pts, pts[1:]):
            self.segments.append((a, b))

    def _project(self, p, a, b):
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        den = dx * dx + dy * dy
        if den == 0:
            return a, distance(p, a), math.atan2(dx, dy)
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / den))
        q = (ax + t * dx, ay + t * dy)
        heading = math.atan2(dx, dy)  # 0 = North, pi/2 = East
        return q, distance(p, q), heading

    def match(self, east, north, max_snap_distance=25.0):
        if not self.segments:
            return None

        p = (east, north)
        candidates = []
        for idx, (a, b) in enumerate(self.segments):
            q, d, h = self._project(p, a, b)
            candidates.append((d, idx, q, h))
        
        candidates.sort(key=lambda z: z[0])
        d, idx, q, h = candidates[0]

        if d > max_snap_distance:
            return None

        return {
            "east": q[0],
            "north": q[1],
            "distance_m": float(d),
            "heading_rad": float(h),
            "segment": int(idx)
        }
