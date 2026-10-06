"use client";

import { motion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, TipCard, axisProps } from "../charts/shared";
import { RankedBars } from "../charts/RankedBars";
import type { DataModel, MonthKey, RepRow } from "@/lib/data/types";
import { fmtInt, fmtPct, fmtPct0, monthLabel, monthShort } from "@/lib/format";
import { steadySignals } from "@/lib/story/analysis";
import { agencyDays } from "@/lib/data/daily";

const ease = [0.2, 0.8, 0.2, 1] as const;

export const SIGNALS = [
  { key: "lowIntent", label: "Low intent in sales transcripts" },
  { key: "promo", label: "Promotion dependent" },
  { key: "competitor", label: "Competitor mentioned" },
  { key: "failedConfirm", label: "Failed independent confirmation" },
] as const;
export type SignalKey = (typeof SIGNALS)[number]["key"];

/** Side by side signal bars (e.g. a representative vs its agency vs the steady agencies). */
export function SignalCompare({ series }: { series: { name: string; color: string; values: Partial<Record<SignalKey, number | null>> }[] }) {
  const max = Math.max(0.1, ...series.flatMap((s) => SIGNALS.map((k) => s.values[k.key] ?? 0))) * 1.1;
  const ordered = [...SIGNALS].sort((a, b) => (series[0]?.values[b.key] ?? 0) - (series[0]?.values[a.key] ?? 0));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-mute">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
      </div>
      <div className="space-y-4">
        {ordered.map((k, i) => (
          <div key={k.key}>
            <div className="mb-1.5 text-[13px] text-ink-2">{k.label}</div>
            <div className="space-y-1">
              {series.map((s, j) => {
                const v = s.values[k.key] ?? null;
                return (
                  <div key={s.name} className="grid grid-cols-[1fr_48px] items-center gap-3">
                    <div className="h-2.5 overflow-hidden rounded-full bg-line-2">
                      <motion.div className="h-full w-full rounded-full" style={{ background: s.color, transformOrigin: "0 50%" }} initial={{ scaleX: 0 }} animate={{ scaleX: v === null ? 0 : v / max }} transition={{ duration: 0.8, ease, delay: 0.1 + i * 0.08 + j * 0.04 }} />
                    </div>
                    <span className="num text-right text-[12.5px] font-semibold">{fmtPct0(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Agency vs the steady agencies on the four order quality signals. */
export function AgencySignals({ model, agency }: { model: DataModel; agency: string }) {
  const a = model.story.agencies.find((x) => x.agency === agency);
  if (!a || a.lowIntent === null) return <div className="py-6 text-center text-[13px] text-mute">Order quality signals are recorded for partner agencies only.</div>;
  const ref = steadySignals(model);
  return <SignalCompare series={[{ name: agency, color: C.bad, values: a }, { name: "Steady agencies", color: "var(--color-slate-soft)", values: ref }]} />;
}

/** Representative vs agency vs steady agencies. */
export function RepSignals({ model, rep }: { model: DataModel; rep: string }) {
  const r = model.story.reps.find((x) => x.id === rep);
  if (!r || r.lowIntent === null) return <div className="py-6 text-center text-[13px] text-mute">Order quality signals are not recorded for this representative.</div>;
  const a = model.story.agencies.find((x) => x.agency === r.agency);
  const ref = steadySignals(model);
  return (
    <SignalCompare
      series={[
        { name: r.id, color: C.bad, values: r },
        ...(a ? [{ name: r.agency, color: "#f5a524", values: a }] : []),
        { name: "Steady agencies", color: "var(--color-slate-soft)", values: ref },
      ]}
    />
  );
}

/** Agency cancel rate over time (day-wise: 7 day rolling, by day) with its own historical baseline. */
export function AgencyTrend({ model, agency, month, height = 220 }: { model: DataModel; agency: string; month: MonthKey; height?: number }) {
  const rows = model.daily ? agencyDays(model, agency) : model.story.agencyMonthly.filter((r) => r.agency === agency && r.month <= month).sort((a, b) => a.month.localeCompare(b.month));
  if (!rows.length) return <div className="py-6 text-center text-[13px] text-mute">Detail is not available for {agency}.</div>;
  const baseline = model.story.agencies.find((a) => a.agency === agency)?.baseline ?? null;
  const data = rows.map((r) => ({ month: r.month, label: monthShort(r.month), rate: r.cancelRate, sales: r.sales, cancels: r.cancels }));
  const id = `ag-${agency.replace(/\W/g, "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={C.bad} stopOpacity={0.3} />
            <stop offset="1" stopColor={C.bad} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 5" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} domain={[0, "auto"]} />
        {baseline !== null && <ReferenceLine y={baseline} stroke="var(--color-ink)" strokeDasharray="4 4" label={{ value: `Own history ${fmtPct(baseline)}`, position: "insideTopLeft", fill: "var(--color-mute)", fontSize: 11 }} />}
        <Tooltip
          cursor={{ stroke: "var(--color-line)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipCard title={monthLabel(String(payload[0].payload.month))} rows={[{ label: "Cancel rate", value: fmtPct(payload[0].payload.rate), color: C.bad }, { label: "Sales", value: fmtInt(payload[0].payload.sales) }, { label: "Cancellations", value: fmtInt(payload[0].payload.cancels) }]} />
            ) : null
          }
        />
        <Area type="monotone" dataKey="rate" stroke={C.bad} strokeWidth={2.2} fill={`url(#${id})`} isAnimationActive animationDuration={900} dot={model.daily ? false : { r: 3, fill: "var(--color-card)", stroke: C.bad, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const BAND_COLOR: Record<string, string> = { critical: C.bad, high: "#f08a80", watch: "#f5a524", low: "var(--color-slate-soft)" };
export const bandColor = (band: string) => BAND_COLOR[band.toLowerCase()] ?? "var(--color-slate-soft)";

/** Representatives of an agency ranked by cancel rate. */
export function RepRanking({ reps, highlight, onSelect, limit }: { reps: RepRow[]; highlight?: string | null; onSelect?: (id: string) => void; limit?: number }) {
  const rows = [...reps].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)).slice(0, limit ?? reps.length);
  return (
    <div className="max-h-[420px] overflow-y-auto pr-1">
      <RankedBars
        dense
        max={Math.max(...rows.map((r) => r.rate ?? 0)) * 1.05}
        rows={rows.map((r) => ({
          id: r.id,
          label: r.id,
          sub: `${r.cohort} · ${fmtInt(r.sales)} sales`,
          value: r.rate,
          valueLabel: fmtPct(r.rate),
          chip: { text: r.band || "n/a", tone: /critical/i.test(r.band) ? "bad" : /high|watch/i.test(r.band) ? "warn" : "neutral" },
          color: bandColor(r.band),
          emphasis: r.id === highlight,
          dim: !!highlight && r.id !== highlight,
          onClick: onSelect ? () => onSelect(r.id) : undefined,
        }))}
      />
    </div>
  );
}
