"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, RefLegend, TipCard, axisProps } from "./shared";
import { fmtCompact, fmtPct, fmtInt, monthLabel, monthShort } from "@/lib/format";
import type { MonthKey } from "@/lib/data/types";
import type { SeriesPoint } from "@/lib/data/metrics";

/**
 * January to latest trend with a dashed prior-months baseline and a marker on the selected month.
 * `anomaly` recolours the marker red so the structural break is visible at a glance.
 */
export function TrendChart({
  points, unit, color = C.indigo, selected, anomaly, height = 300, name, onSelectMonth, reference,
}: {
  /** Day-wise: the comparison period's level, drawn instead of the prior average. */
  reference?: { value: number | null; label: string };
  points: SeriesPoint[];
  unit: "count" | "pct";
  color?: string;
  selected: MonthKey;
  anomaly?: boolean;
  height?: number;
  name: string;
  onSelectMonth?: (m: MonthKey) => void;
}) {
  const data = points.map((p) => ({ month: p.month, label: monthShort(p.month), value: p.value }));
  const prior = points.filter((p) => p.month < selected && p.value !== null).map((p) => p.value as number);
  const baseline = reference ? reference.value : prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
  const sel = data.find((d) => d.month === selected) ?? (reference ? data[data.length - 1] : undefined);
  const fmtAxis = (v: number) => (unit === "pct" ? `${Math.round(v * 100)}%` : fmtCompact(v, 0));
  const fmtVal = (v: number | null) => (unit === "pct" ? fmtPct(v) : fmtInt(v));
  const gid = `tg-${name.replace(/\W/g, "")}`;

  return (
    <div>
    {baseline !== null && <RefLegend label={reference ? reference.label : "Prior avg"} value={fmtVal(baseline)} />}
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 30, right: 44, left: 0, bottom: 0 }}
        onClick={(s) => {
          const i = Number(s?.activeIndex);
          if (onSelectMonth && Number.isFinite(i) && data[i]) onSelectMonth(data[i].month);
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.28} />
            <stop offset="1" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} dy={6} />
        <YAxis {...axisProps} tickFormatter={fmtAxis} width={46} domain={unit === "pct" ? [(min: number) => Math.max(0, Math.floor(min * 20 - 1) / 20), (max: number) => Math.min(1, Math.ceil(max * 20 + 1) / 20)] : ["auto", "auto"]} />
        <Tooltip
          cursor={{ stroke: C.ink, strokeOpacity: 0.15 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            const idx = data.findIndex((d) => d.month === p.month);
            const prev = idx > 0 ? data[idx - 1].value : null;
            const ch = prev !== null && p.value !== null && prev !== 0 ? (unit === "pct" ? `${((p.value - prev) * 100 >= 0 ? "+" : "−")}${Math.abs((p.value - prev) * 100).toFixed(1)} pp` : `${p.value / prev - 1 >= 0 ? "+" : "−"}${Math.abs((p.value / prev - 1) * 100).toFixed(1)}%`) : "n/a";
            return <TipCard title={monthLabel(p.month)} rows={[{ label: name, value: fmtVal(p.value), color }, { label: "vs prior day", value: ch }]} />;
          }}
        />
        {baseline !== null && (
          <ReferenceLine y={baseline} stroke={C.slateDeep} strokeDasharray="4 4" strokeOpacity={0.7} />
        )}
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} dot={{ r: 3, fill: C.card, stroke: color, strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive animationDuration={700} />
        {sel && sel.value !== null && (
          <ReferenceDot x={sel.label} y={sel.value} r={7} fill={anomaly ? C.bad : color} stroke={C.card} strokeWidth={3}
            label={anomaly ? { value: "Exception", position: "top", fill: C.bad, fontSize: 11, fontWeight: 700 } : undefined} />
        )}
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
