"use client";

import { useId } from "react";

/** Insights Genie mark: round Brightspeed yellow to orange gradient badge with a four point spark. */
export function GenieMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD54F" />
          <stop offset=".5" stopColor="#FF9F2E" />
          <stop offset="1" stopColor="#F2553A" />
        </linearGradient>
        <radialGradient id={`${id}h`} cx=".3" cy=".2" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill={`url(#${id}g)`} />
      <circle cx="20" cy="20" r="20" fill={`url(#${id}h)`} />
      <path d="M19 8.5c.9 5.6 3.4 8.2 9 9.1-5.6.9-8.1 3.5-9 9.1-.9-5.6-3.4-8.2-9-9.1 5.6-.9 8.1-3.5 9-9.1Z" fill="#fff" />
      <path d="M29 24.5c.4 2.3 1.4 3.3 3.6 3.7-2.2.4-3.2 1.4-3.6 3.7-.4-2.3-1.4-3.3-3.6-3.7 2.2-.4 3.2-1.4 3.6-3.7Z" fill="#fff" fillOpacity=".85" />
    </svg>
  );
}

/** Insights navigation glyph: a rising trend line with a spark, stroked in the Brightspeed gradient. */
export function InsightsGlyph({ className }: { className?: string; strokeWidth?: number }) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="2" y1="20" x2="22" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC72C" />
          <stop offset="1" stopColor="#F26A36" />
        </linearGradient>
      </defs>
      <path d="M3 18.5 8.5 13l3.5 3 5-6" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21h17" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
      <path d="M18.5 2.5c.35 2 1.2 2.85 3.2 3.2-2 .35-2.85 1.2-3.2 3.2-.35-2-1.2-2.85-3.2-3.2 2-.35 2.85-1.2 3.2-3.2Z" fill={`url(#${id})`} />
    </svg>
  );
}
