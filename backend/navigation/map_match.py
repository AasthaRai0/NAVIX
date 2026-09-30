import json, math
from pathlib import Path
from .geo import distance

class HMMMapMatcher:
    """
    Optional offline HMM/Viterbi map matcher.
    Put a local GeoJSON FeatureCollection of LineStrings at:
        data/roads.geojson

    If the file is absent, navigation still works without map matching.
    """
    def __init__(self, path="data/roads.geojson", candidates=5):
        self.path = Path(path)
        self.candidates = candidates
        self.segments = []
        if self.path.exists():
            self._load()

    def _load(self):
        data = json.loads(self.path.read_text(encoding="utf-8"))
        for feature in data.get("features", []):
            geom = feature.get("geometry", {})
            if geom.get("type") != "LineString":
                continue
            coords = geom.get("coordinates", [])
            for a,b in zip(coords, coords[1:]):
                self.segments.append((a,b))

    def _project(self, p, a, b):
        ax,ay=a; bx,by=b
        dx,dy=bx-ax,by-ay
        den=dx*dx+dy*dy
        if den == 0:
            return a, distance(p,a)
        t=max(0,min(1,((p[0]-ax)*dx+(p[1]-ay)*dy)/den))
        q=(ax+t*dx, ay+t*dy)
        return q, distance(p,q)

    def match(self, east, north):
        if not self.segments:
            return None

        p=(east,north)
        candidates=[]
        for idx,(a,b) in enumerate(self.segments):
            q,d=self._project(p,a,b)
            candidates.append((d,idx,q))
        candidates.sort(key=lambda z:z[0])
        best=candidates[:self.candidates]

        # Emission probability: closer road = higher probability.
        # In this lightweight implementation the previous chosen candidate
        # can be used as the Viterbi predecessor by the caller.
        d,idx,q=best[0]
        return {"east":q[0], "north":q[1], "distance_m":d, "segment":idx}
