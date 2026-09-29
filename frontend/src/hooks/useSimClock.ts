import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTE_LENGTH } from "@/lib/sim";

/** Drives the simulated vehicle along the demo route. */
export function useSimClock({
  autoStart = true,
  intervalMs = 400,
  start = 40,
}: { autoStart?: boolean; intervalMs?: number; start?: number } = {}) {
  const [index, setIndex] = useState(start);
  const [running, setRunning] = useState(autoStart);
  const startRef = useRef(start);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1 >= ROUTE_LENGTH ? startRef.current : i + 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [running, intervalMs]);

  const reset = useCallback(() => {
    setIndex(startRef.current);
    setRunning(false);
  }, []);

  return { index, setIndex, running, setRunning, reset };
}
