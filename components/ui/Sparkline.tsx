"use client";

import { useId } from "react";

/** Tiny dependency-free sparkline. `values` may contain nulls (rendered as gaps). The last point is emphasised. */
export function Sparkline({
  values, color = "#f28c28", width = 96, height = 30, highlightLast = true, fill = true,
}: { values: (number | null)[]; color?: string; width?: number; height?: number; highlightLast?: boolean; fill?: boolean }) {
  const id = useId();
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <div style={{ width, height }} className="grid place-items-center text-[10px] text-soft">no trend</div>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${d} L${x(last.i).toFixed(1)},${height} L${x(pts[0].i).toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {highlightLast && <circle cx={x(last.i)} cy={y(last.v)} r="2.6" fill="var(--color-card)" stroke={color} strokeWidth="1.6" />}
    </svg>
  );
}
