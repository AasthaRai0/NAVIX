import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, Cpu, FlaskConical, Navigation, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch("http://localhost:8000/health", { method: "GET" });
        if (res.ok) {
          setBackendConnected(true);
        } else {
          setBackendConnected(false);
        }
      } catch {
        setBackendConnected(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { to: "/", label: "MISSION CONTROL", icon: Activity },
    { to: "/live-navigation", label: "LIVE NAVIGATION", icon: Navigation },
    { to: "/analytics", label: "ANALYTICS", icon: BarChart3 },
    { to: "/sensor-fusion", label: "SENSOR FUSION", icon: Cpu },
    { to: "/simulation-lab", label: "SIMULATION LAB", icon: FlaskConical },
    { to: "/settings", label: "SETTINGS", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans antialiased">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-7 w-7 rounded bg-primary/10 border border-primary/40 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              <Navigation className="h-4 w-4 text-cyan" />
            </div>
            <div>
              <span className="font-mono text-sm font-bold tracking-wider text-foreground">
                NAVIX <span className="text-cyan font-normal">| TrueTrack</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
                RoadSense Fusion AI
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-secondary/30 p-1 rounded-md border border-border">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono tracking-wider transition-all ${
                  isActive
                    ? "bg-cyan/15 text-cyan font-semibold border border-cyan/30 shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-cyan" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Status */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-border bg-secondary/40">
            <span
              className={`h-2 w-2 rounded-full ${
                backendConnected === true
                  ? "bg-ok animate-pulse"
                  : backendConnected === false
                  ? "bg-warn"
                  : "bg-muted-foreground"
              }`}
            />
            <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
              {backendConnected === true
                ? "FASTAPI ONLINE"
                : backendConnected === false
                ? "FASTAPI OFFLINE"
                : "CONNECTING..."}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className="md:hidden flex overflow-x-auto border-b border-border bg-secondary/20 p-2 gap-1 font-mono text-[10px]">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${
              currentPath === item.to ? "bg-cyan/20 text-cyan font-bold" : "text-muted-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-3 md:p-4 max-w-(--breakpoint-2xl) w-full mx-auto">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-2 text-center font-mono text-[10px] text-muted-foreground flex justify-between items-center">
        <span>NAVIX TrueTrack v1.0 — TCN + UKF Sensor Fusion Engine</span>
        <span>FASTAPI http://localhost:8000</span>
      </footer>
    </div>
  );
}
