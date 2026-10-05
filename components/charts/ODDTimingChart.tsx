"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, TipCard, axisProps } from "./shared";
import { fmtCompact, fmtInt, fmtPct0, monthLabel, monthShort } from "@/lib/format";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { getSnapshot } from "@/lib/data/metrics";

export const ODD_COLORS = { pre: "#c9c9c1", on: C.brand, post: C.orange } as const;
export type OddBucket = "pre" | "on" | "post";

/** Stacked Pre / On / Post ODD cancellations by month (count or 100%-share mode). */
export function ODDTimingChart({
  model, state, mode, selected, focus, height = 320, onSelectMonth,
}: {
  model: DataModel;
  state: string | null;
  mode: "count" | "pct";
  selected: MonthKey;
  /** Emphasise one bucket (others dim). */
  focus?: OddBucket | null;
  height?: number;
  onSelectMonth?: (m: MonthKey) => void;
}) {
  const data = model.months.map((month) => {
    const s = getSnapshot(model, month, state);
    return {
      month, label: monthShort(month),
      preN: s.preCancels, onN: s.onCancels, postN: s.postCancels,
      preP: s.prePct, onP: s.onPct, postP: s.postPct,
      pre: mode === "count" ? s.preCancels : s.prePct,
      on: mode === "count" ? s.onCancels : s.onPct,
      post: mode === "count" ? s.postCancels : s.postPct,
    };
  });
  const dim = (b: OddBucket) => (focus && focus !== b ? 0.28 : 1);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%" onClick={(s) => { const i = Number(s?.activeIndex); if (onSelectMonth && data[i]) onSelectMonth(data[i].month); }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} dy={6} />
        <YAxis {...axisProps} width={44} domain={mode === "pct" ? [0, 1] : [0, "auto"]} tickFormatter={(v) => (mode === "pct" ? `${Math.round(v * 100)}%` : fmtCompact(v, 0))} />
        <Tooltip
          cursor={{ fill: "rgba(128,128,128,0.08)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            return (
              <TipCard
                title={monthLabel(p.month)}
                rows={[
                  { label: "Post ODD", value: `${fmtInt(p.postN)} · ${fmtPct0(p.postP)}`, color: ODD_COLORS.post },
                  { label: "On ODD", value: `${fmtInt(p.onN)} · ${fmtPct0(p.onP)}`, color: ODD_COLORS.on },
                  { label: "Pre ODD", value: `${fmtInt(p.preN)} · ${fmtPct0(p.preP)}`, color: ODD_COLORS.pre },
                ]}
              />
            );
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
        <Bar isAnimationActive dataKey="pre" name="Pre ODD" stackId="a" fill={ODD_COLORS.pre} radius={[0, 0, 0, 0]} animationDuration={600}>
          {data.map((d) => <Cell key={d.month} fillOpacity={dim("pre") * (d.month === selected ? 1 : 0.85)} />)}
        </Bar>
        <Bar isAnimationActive dataKey="on" name="On ODD" stackId="a" fill={ODD_COLORS.on} animationDuration={600}>
          {data.map((d) => <Cell key={d.month} fillOpacity={dim("on") * (d.month === selected ? 1 : 0.85)} />)}
        </Bar>
        <Bar isAnimationActive dataKey="post" name="Post ODD" stackId="a" fill={ODD_COLORS.post} radius={[8, 8, 0, 0]} animationDuration={600}>
          {data.map((d) => (
            <Cell key={d.month} fill={d.month === selected && !focus ? C.bad : ODD_COLORS.post} fillOpacity={dim("post") * (d.month === selected ? 1 : 0.85)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
