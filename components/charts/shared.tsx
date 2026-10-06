"use client";

import type { ReactNode } from "react";

/** Brightspeed chart palette. Theme dependent colours resolve through CSS variables so dark mode follows. */
export const C = {
  ink: "var(--color-ink)",
  card: "var(--color-card)",
  brand: "#ffc72c",
  orange: "#f26a36",
  indigo: "#f28c28",
  lilac: "#fbd38d",
  slate: "var(--color-slate-soft)",
  slateDeep: "#8b8d96",
  bad: "#d92d20",
  good: "#12a150",
  warn: "#e59b12",
  grid: "var(--color-line)",
  axis: "var(--color-mute)",
};

/** Reference line legend, kept at the top right of a chart instead of on top of the plotted line. */
export function RefLegend({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1 flex items-center justify-end gap-2 text-[11.5px] text-mute">
      <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={C.slateDeep} strokeWidth="1.6" strokeDasharray="4 3" /></svg>
      <span>{label}</span><strong className="num text-ink">{value}</strong>
    </div>
  );
}

export interface TooltipRow {
  label: string;
  value: ReactNode;
  color?: string;
}

/** Shared premium tooltip card used by every Recharts chart. */
export function TipCard({ title, rows, note }: { title?: ReactNode; rows: TooltipRow[]; note?: ReactNode }) {
  return (
    <div className="min-w-[170px] rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12px] shadow-pop">
      {title && <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</div>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2 text-mute">
              {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="num font-semibold text-ink">{r.value}</span>
          </div>
        ))}
      </div>
      {note && <div className="mt-2 border-t border-line-2 pt-2 text-[11px] text-mute">{note}</div>}
    </div>
  );
}

export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: C.axis, fontSize: 11 },
} as const;
