"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../ui/primitives";

export interface RankedRow {
  id: string;
  label: ReactNode;
  /** Numeric value that drives the bar length (null → no bar, shown as unavailable). */
  value: number | null;
  valueLabel: string;
  sub?: ReactNode;
  chip?: { text: string; tone: "bad" | "good" | "warn" | "neutral" };
  color: string;
  emphasis?: boolean;
  dim?: boolean;
  tip?: string;
  onClick?: () => void;
}

const chipTone = {
  bad: "bg-bad-soft text-bad",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  neutral: "bg-line-2 text-mute",
};

/** Horizontal ranked bars with animated fill, hover state, optional growth chip and click-through. */
export function RankedBars({ rows, max, className, dense }: { rows: RankedRow[]; max?: number; className?: string; dense?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const top = max ?? Math.max(...rows.map((r) => r.value ?? 0), 1);
  return (
    <div className={cn("space-y-1", className)}>
      {rows.map((r, i) => {
        const w = r.value === null ? 0 : Math.max((r.value / top) * 100, r.value > 0 ? 1.5 : 0);
        const Comp = r.onClick ? "button" : "div";
        return (
          <Comp
            key={r.id}
            onClick={r.onClick}
            title={r.tip}
            className={cn(
              "group grid w-full items-center gap-x-4 rounded-xl px-3 text-left transition",
              dense ? "py-2" : "py-2.5",
              "grid-cols-[minmax(150px,280px)_1fr_auto]",
              r.onClick && "cursor-pointer hover:bg-subtle",
              r.emphasis && "bg-subtle",
              r.dim && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <div className={cn("truncate text-[13.5px]", r.emphasis ? "font-semibold text-ink" : "font-medium text-ink-2")}>{r.label}</div>
              {r.sub && <div className="truncate text-[11px] text-mute">{r.sub}</div>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-line-2">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: ready ? `${w}%` : 0, background: r.color, transitionDelay: `${i * 45}ms` }}
              />
            </div>
            <div className="flex min-w-[112px] items-center justify-end gap-2">
              <span className="num text-[13.5px] font-semibold">{r.valueLabel}</span>
              {r.chip && <span className={cn("num rounded-full px-1.5 py-0.5 text-[10.5px] font-bold", chipTone[r.chip.tone])}>{r.chip.text}</span>}
            </div>
          </Comp>
        );
      })}
    </div>
  );
}
