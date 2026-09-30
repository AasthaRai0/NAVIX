import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { estimatedRoute, insOnlyRoute, referenceRoute } from "@/lib/sim";

export function MapLegend({ showIns = false }: { showIns?: boolean }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[10px]">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-cyan inline-block" />
        <span className="text-muted-foreground">TrueTrack Fused</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-ok inline-block" />
        <span className="text-muted-foreground">GNSS Reference</span>
      </span>
      {showIns && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-crit inline-block" />
          <span className="text-muted-foreground">INS Only</span>
        </span>
      )}
    </div>
  );
}

export interface MapSurfaceProps {
  index?: number;
  className?: string;
  showIns?: boolean;
  trajectoryData?: Array<{
    gps_lat: number;
    gps_lon: number;
    est_lat: number;
    est_lon: number;
    gnss_trust?: number;
  }>;
}

export function MapSurface({
  index = 0,
  className = "h-[420px] w-full",
  showIns = false,
  trajectoryData,
}: MapSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const refPolylineRef = useRef<L.Polyline | null>(null);
  const fusedPolylineRef = useRef<L.Polyline | null>(null);
  const insPolylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const fittedDataKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialized

    // Center map initially
    const centerLat = trajectoryData?.length
      ? trajectoryData[0]!.est_lat
      : referenceRoute[0]!.lat;
    const centerLng = trajectoryData?.length
      ? trajectoryData[0]!.est_lon
      : referenceRoute[0]!.lng;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    // 100% Free OpenStreetMap Tile Server - NO API KEY REQUIRED EVER
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    let refCoords: [number, number][] = [];
    let fusedCoords: [number, number][] = [];
    let insCoords: [number, number][] = [];

    const isReal = trajectoryData && trajectoryData.length > 0;

    if (isReal) {
      refCoords = trajectoryData.map((d) => [d.gps_lat, d.gps_lon]);
      fusedCoords = trajectoryData.map((d) => [d.est_lat, d.est_lon]);
    } else {
      refCoords = referenceRoute.map((p) => [p.lat, p.lng]);
      fusedCoords = estimatedRoute.map((p) => [p.lat, p.lng]);
      insCoords = insOnlyRoute.map((p) => [p.lat, p.lng]);
    }

    // Draw GNSS Reference line (Green)
    if (refPolylineRef.current) {
      refPolylineRef.current.setLatLngs(refCoords);
    } else {
      refPolylineRef.current = L.polyline(refCoords, {
        color: "#4ade80",
        weight: 3,
        opacity: 0.8,
        dashArray: "4, 4",
      }).addTo(map);
    }

    // Draw Fused Trajectory (TrueTrack Cyan)
    if (fusedPolylineRef.current) {
      fusedPolylineRef.current.setLatLngs(fusedCoords);
    } else {
      fusedPolylineRef.current = L.polyline(fusedCoords, {
        color: "#22d3ee",
        weight: 4,
        opacity: 0.95,
      }).addTo(map);
    }

    // Draw INS Only line if enabled (Red/Crit)
    if (showIns && insCoords.length > 0) {
      if (insPolylineRef.current) {
        insPolylineRef.current.setLatLngs(insCoords);
      } else {
        insPolylineRef.current = L.polyline(insCoords, {
          color: "#f43f5e",
          weight: 2,
          opacity: 0.7,
        }).addTo(map);
      }
    } else if (insPolylineRef.current) {
      map.removeLayer(insPolylineRef.current);
      insPolylineRef.current = null;
    }

    // Auto-fit map view to the dataset bounds on load
    const currentDataKey = isReal ? `real-${trajectoryData.length}` : "simulated";
    if (fittedDataKeyRef.current !== currentDataKey && fusedCoords.length > 0) {
      fittedDataKeyRef.current = currentDataKey;
      const bounds = L.latLngBounds(fusedCoords);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }

    // Update active vehicle position marker
    const currPos = fusedCoords[Math.min(index, fusedCoords.length - 1)] || fusedCoords[0];
    if (currPos) {
      if (markerRef.current) {
        markerRef.current.setLatLng(currPos);
      } else {
        markerRef.current = L.circleMarker(currPos, {
          radius: 7,
          color: "#ffffff",
          fillColor: "#22d3ee",
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);
      }
    }
  }, [index, showIns, trajectoryData]);

  return (
    <div className={`relative overflow-hidden rounded-sm border border-border ${className}`}>
      <div ref={containerRef} className="h-full w-full bg-secondary/20 z-0" />
    </div>
  );
}
