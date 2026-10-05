"use client";

import { motion } from "motion/react";
import { cn } from "../ui/primitives";

export interface Segment {
  id: string;
  label: string;
  value: number | null;
  color: string;
  detail?: string;
  emphasis?: boolean;
}

/**
 * Segmented share bar: rounded pills separated by small gaps, with a legend of shares underneath.
 * Segments grow with a transform (scaleX), so the reveal stays on the compositor.
 */
export function SegmentBar({ segments, height = 12, legend = true, className, fmt }: { segments: Segment[]; height?: number; legend?: boolean; className?: string; fmt?: (v: number) => string }) {
  const total = segments.reduce((a, s) => a + (s.value ?? 0), 0) || 1;
  const pct = (v: number | null) => ((v ?? 0) / total) * 100;
  const f = fmt ?? ((v: number) => `${Math.round((v / total) * 100)}%`);
  return (
    <div className={className}>
      <div className="flex w-full gap-1.5" style={{ height }}>
        {segments.map((s, i) => (
          <motion.div
            key={s.id}
            className="h-full rounded-full"
            style={{ width: `${pct(s.value)}%`, background: s.color, transformOrigin: "0 50%" }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 + i * 0.12 }}
            title={`${s.label}: ${f(s.value ?? 0)}`}
          />
        ))}
      </div>
      {legend && (
        <ul className="mt-4 space-y-2.5">
          {segments.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className={cn("flex min-w-0 items-center gap-2.5", s.emphasis ? "font-semibold text-ink" : "text-ink-2")}>
                <span className="h-2.5 w-5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="truncate">{s.label}</span>
                {s.detail && <span className="truncate text-[11.5px] font-normal text-mute">{s.detail}</span>}
              </span>
              <span className="num font-semibold text-ink">{f(s.value ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
