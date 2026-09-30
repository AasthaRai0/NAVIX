import React, { ReactNode } from "react";

export interface PanelProps {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, right, children, className = "", bodyClassName = "p-3" }: PanelProps) {
  return (
    <div className={`rounded-sm border border-border bg-card shadow-sm flex flex-col ${className}`}>
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
        <h3 className="label-tech uppercase tracking-wider text-foreground text-[11px] font-semibold">
          {title}
        </h3>
        {right && <div>{right}</div>}
      </div>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export interface ReadoutProps {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "ok" | "warn" | "crit" | "cyan" | "default";
}

export function Readout({ label, value, unit, tone = "default" }: ReadoutProps) {
  const toneClasses = {
    ok: "text-ok",
    warn: "text-warn",
    crit: "text-crit",
    cyan: "text-cyan",
    default: "text-foreground",
  };

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0 font-mono text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${toneClasses[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

export interface StatusDotProps {
  tone?: "ok" | "warn" | "crit" | "cyan";
}

export function StatusDot({ tone = "ok" }: StatusDotProps) {
  const dotColor = {
    ok: "bg-ok",
    warn: "bg-warn",
    crit: "bg-crit",
    cyan: "bg-cyan",
  };

  return (
    <span className="relative flex h-2 w-2">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor[tone]}`}
      />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor[tone]}`} />
    </span>
  );
}

export function DemoTag({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-cyan uppercase">
      <span className="h-1 w-1 rounded-full bg-cyan animate-pulse" />
      {label || "FASTAPI CONNECTED"}
    </span>
  );
}

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: string;
}

export function MetricTile({ label, value, unit, sub }: MetricTileProps) {
  return (
    <div className="rounded-sm border border-border bg-secondary/30 p-2.5 flex flex-col justify-between font-mono">
      <div className="text-[9px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-lg font-bold text-cyan tracking-tight">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
