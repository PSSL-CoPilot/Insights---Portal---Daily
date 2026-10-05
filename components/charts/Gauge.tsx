"use client";

import { useId, type ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Semicircle gauge. The arc draws on with `pathLength`; an optional reference tick marks a baseline.
 * Colours follow the theme through CSS variables.
 */
export function Gauge({
  value, max, reference, color = "var(--color-bad)", label, center, size = 220, thickness = 16,
}: { value: number | null; max: number; reference?: number | null; color?: string; label?: ReactNode; center?: ReactNode; size?: number; thickness?: number }) {
  const id = useId();
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const h = size / 2 + thickness / 2 + 4;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const t = value === null ? 0 : Math.max(0, Math.min(1, value / max));
  const refAngle = reference != null ? Math.PI * (1 - Math.max(0, Math.min(1, reference / max))) : null;
  return (
    <div className="relative" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden>
        <defs>
          <linearGradient id={`${id}g`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#ffc72c" />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="var(--color-line-2)" strokeWidth={thickness} strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke={`url(#${id}g)`}
          strokeWidth={thickness}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: t }}
          transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
        />
        {refAngle !== null && (
          <g>
            <line
              x1={cx + (r - thickness) * Math.cos(refAngle)}
              y1={cy - (r - thickness) * Math.sin(refAngle)}
              x2={cx + (r + thickness) * Math.cos(refAngle)}
              y2={cy - (r + thickness) * Math.sin(refAngle)}
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center text-center">
        {center}
        {label && <div className="mt-1 text-[11.5px] text-mute">{label}</div>}
      </div>
    </div>
  );
}
