"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, motion } from "motion/react";
import type { MapBand } from "@/lib/story/types";

interface GeoState {
  name: string;
  d: string;
  bbox: [number, number, number, number];
  c: [number, number];
}
interface Geo {
  width: number;
  height: number;
  states: GeoState[];
}

export interface MapStateValue {
  name: string;
  label: string;
  severity: MapBand;
}

/** Fractions of the map's own box where the subject should sit (0 to 1). */
export interface MapFrame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let geoCache: Geo | null = null;
/** Precomputed Albers USA paths (us-atlas, public domain), bundled locally so the map works offline and on GitHub Pages. */
function useGeo() {
  const [geo, setGeo] = useState<Geo | null>(geoCache);
  useEffect(() => {
    if (geoCache) return;
    let live = true;
    import("@/lib/story/usStates.json").then((m) => {
      geoCache = (m.default ?? m) as unknown as Geo;
      if (live) setGeo(geoCache);
    });
    return () => {
      live = false;
    };
  }, []);
  return geo;
}

/** Fill and text colour per band: dark green, very light green, very light orange, red. */
export const BAND: Record<MapBand, { fill: string; text: string; label: string }> = {
  low: { fill: "#166534", text: "#ffffff", label: "Below 5%" },
  mild: { fill: "#dcfce7", text: "#000000", label: "5 to 10%" },
  elevated: { fill: "#ffedd5", text: "#000000", label: "10 to 15%" },
  high: { fill: "#dc2626", text: "#ffffff", label: "15% and above" },
};
type VB = [number, number, number, number];

/**
 * Footprint map for the story player. The camera moves by animating the SVG viewBox, so the
 * geometry is redrawn as vectors on every frame: it stays sharp at any zoom (no bitmap scaling).
 */
export const USStoryMap = memo(function USStoryMap({
  states, zoom, frame, showLabels = true, instant = false, onReady, onSelect,
}: { states: MapStateValue[]; zoom: string | null; frame: MapFrame; showLabels?: boolean; instant?: boolean; onReady?: () => void; onSelect?: (state: string) => void }) {
  const geo = useGeo();
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const current = useRef<VB | null>(null);
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = geo?.width ?? 975, H = geo?.height ?? 610;
  const target = zoom && geo ? geo.states.find((s) => s.name === zoom) ?? null : null;
  const byName = useMemo(() => new Map(states.map((s) => [s.name, s])), [states]);

  // Camera: fit the subject (whole map, or the focus state with breathing room) into the frame.
  const cam = useMemo(() => {
    if (!size || size.w === 0 || size.h === 0) return null;
    let [bx0, by0, bx1, by1] = [0, 0, W, H];
    if (target) {
      const [x0, y0, x1, y1] = target.bbox;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const hw = ((x1 - x0) * 2.4) / 2, hh = ((y1 - y0) * 2.4) / 2;
      [bx0, by0, bx1, by1] = [cx - hw, cy - hh, cx + hw, cy + hh];
    }
    const rw = (frame.x1 - frame.x0) * size.w, rh = (frame.y1 - frame.y0) * size.h;
    const s = Math.min(rw / (bx1 - bx0), rh / (by1 - by0));
    const rcx = ((frame.x0 + frame.x1) / 2) * size.w, rcy = ((frame.y0 + frame.y1) / 2) * size.h;
    const vb: VB = [(bx0 + bx1) / 2 - rcx / s, (by0 + by1) / 2 - rcy / s, size.w / s, size.h / s];
    return { vb, s };
  }, [size, target, frame.x0, frame.x1, frame.y0, frame.y1, W, H]);

  useEffect(() => {
    if (!cam || !svg.current) return;
    const to = cam.vb;
    const from = current.current;
    const apply = (v: VB) => {
      current.current = v;
      svg.current?.setAttribute("viewBox", v.map((n) => n.toFixed(2)).join(" "));
    };
    // The camera always glides (it does not depend on the OS reduced motion setting); exports jump straight there.
    if (!from || instant) {
      apply(to);
      setSettled(true);
      return;
    }
    setSettled(false);
    const ctl = animate(0, 1, {
      duration: 1.9,
      ease: [0.65, 0, 0.35, 1],
      delay: zoom ? 0.45 : 0,
      onUpdate: (t) => apply(from.map((a, i) => a + (to[i] - a) * t) as VB),
      onComplete: () => setSettled(true),
    });
    return () => ctl.stop();
  }, [cam, instant, zoom]);

  useEffect(() => {
    if (settled && geo && cam) onReady?.();
  }, [settled, geo, cam, onReady]);

  const px = cam?.s ?? 1; // screen pixels per map unit at the target camera
  const fs = 15 / px;

  return (
    <div ref={box} className="absolute inset-0">
      <svg ref={svg} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={zoom ? `United States map focused on ${zoom}` : "United States footprint map"} style={{ shapeRendering: "geometricPrecision" }}>
        {geo?.states.map((g) => {
          const v = byName.get(g.name);
          const dimmed = !!zoom && v && g.name !== zoom;
          return (
            <path
              key={g.name}
              d={g.d}
              vectorEffect="non-scaling-stroke"
              onClick={v && onSelect ? () => onSelect(g.name) : undefined}
              style={{
                cursor: v && onSelect ? "pointer" : undefined,
                fill: v ? BAND[v.severity].fill : "var(--color-map-land)",
                stroke: "var(--color-map-stroke)",
                strokeWidth: v ? 1.4 : 0.9,
                strokeLinejoin: "round",
                opacity: dimmed ? 0.55 : 1,
                transition: "fill 0.9s ease, opacity 0.9s ease",
              }}
            />
          );
        })}
        {geo && zoom && target && (
          <motion.circle
            cx={target.c[0]}
            cy={target.c[1]}
            r={(target.bbox[2] - target.bbox[0]) * 0.36}
            fill="none"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--color-bad)", strokeWidth: 2, transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={settled ? { scale: [0.7, 1.45], opacity: [0.8, 0] } : { opacity: 0 }}
            transition={settled ? { duration: 1.9, repeat: Infinity, ease: "easeOut" } : { duration: 0.2 }}
          />
        )}
        {geo &&
          states.map((v) => {
            const g = geo.states.find((x) => x.name === v.name);
            if (!g) return null;
            const visible = showLabels && settled && (!zoom || v.name === zoom);
            const big = zoom === v.name;
            const f = big ? fs * 1.5 : fs;
            return (
              <motion.g key={v.name} initial={false} animate={{ opacity: visible ? 1 : 0 }} transition={{ duration: 0.45 }} style={{ pointerEvents: "none" }}>
                <text x={g.c[0]} y={g.c[1] - f * 0.25} textAnchor="middle" fontSize={f} fontWeight={700} style={{ fill: BAND[v.severity].text, stroke: BAND[v.severity].fill, strokeWidth: f * 0.3, strokeLinejoin: "round", paintOrder: "stroke", letterSpacing: "-0.02em" }}>
                  {v.label}
                </text>
                <text x={g.c[0]} y={g.c[1] + f * 0.85} textAnchor="middle" fontSize={f * 0.62} fontWeight={600} style={{ fill: BAND[v.severity].text, stroke: BAND[v.severity].fill, strokeWidth: f * 0.24, strokeLinejoin: "round", paintOrder: "stroke" }}>
                  {v.name}
                </text>
              </motion.g>
            );
          })}
      </svg>
    </div>
  );
});
