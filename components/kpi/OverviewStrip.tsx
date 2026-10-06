"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { useApp } from "../AppContext";
import { Card } from "../ui/primitives";
import { Gauge } from "../charts/Gauge";
import { SegmentBar } from "../charts/SegmentBar";
import { C, TipCard, axisProps } from "../charts/shared";
import { getSnapshot, prevMonth, series } from "@/lib/data/metrics";
import { storyFacts } from "@/lib/story/facts";
import { fmtCompact, fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthLabel, monthName, monthShort } from "@/lib/format";
import { parseKey, presets } from "@/lib/data/daily";
import { cn } from "../ui/primitives";

/** Three at-a-glance visuals between the executive story and the KPI cards. */
export function OverviewStrip() {
  const { model, month, setMonth, openKpi } = useApp();
  const f = storyFacts(model, month);
  const s = getSnapshot(model, month, null);
  const pm = prevMonth(model, month);
  const p = pm ? getSnapshot(model, pm, null) : null;

  // Day-wise: the chart shows the selected days (a single day shows the week ending on it).
  const [start, end] = model.daily ? parseKey(month) : [null, null];
  const data = useMemo(() => {
    const sales = series(model, "sales", null), cancels = series(model, "cancels", null);
    const rows = model.months.map((m, i) => ({ month: m, label: monthShort(m), sales: sales[i].value, cancels: cancels[i].value }));
    if (!start || !end) return rows.filter((r) => r.month <= month);
    const from = start === end ? model.months[Math.max(0, model.months.indexOf(end) - 6)] : start;
    return rows.filter((r) => r.month >= from && r.month <= end);
  }, [model, month, start, end]);
  const sel = data[data.length - 1];
  const chips = model.daily ? (["30", "5", "7", "mtd"] as const).map((id) => presets(model).find((p) => p.id === id)!) : [];
  const CHIP: Record<string, string> = { "30": "Last 30 Days", "5": "Last 5 Days", "7": "Last 7 Days", mtd: "Month-to-Date" };
  const dS = f.d.salesMoM, dC = f.d.cancelsMoM;
  const gaugeMax = Math.max(0.3, (s.cancelRate ?? 0) * 1.3);

  return (
    <section aria-label="Overview" className="grid gap-4 lg:grid-cols-12">
      <Card className="p-5 sm:p-6 lg:col-span-6">
        <Head title="Sales and cancellations" sub={model.daily ? `${monthLabel(month)} · daily` : `${monthShort(model.months[0])} to ${monthName(month)}`} onOpen={() => openKpi("cancels")} />
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Chart period">
            {chips.map((p) => (
              <button key={p.id} type="button" onClick={() => setMonth(p.key)} aria-pressed={month === p.key}
                className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold transition", month === p.key ? "border-ink bg-ink text-canvas" : "border-line text-mute hover:border-ink hover:text-ink")}>
                {CHIP[p.id]}
              </button>
            ))}
          </div>
        )}
        {model.daily && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              { l: "Unique Sales", v: fmtInt(s.sales), d: fmtSignedPct(dS), tone: (dS ?? 0) >= 0 ? "text-good" : "text-bad" },
              { l: "Cancellations", v: fmtInt(s.cancels), d: fmtSignedPct(dC), tone: (dC ?? 0) > 0 ? "text-bad" : "text-good" },
              { l: "Cancel rate", v: fmtPct(s.cancelRate), d: p?.cancelRate != null && s.cancelRate != null ? fmtPp(s.cancelRate - p.cancelRate) : "n/a", tone: (s.cancelRate ?? 0) > (p?.cancelRate ?? 0) ? "text-bad" : "text-good" },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl border border-line bg-card px-3 py-2.5">
                <div className="text-[11.5px] text-mute">{x.l}</div>
                <div className="num-display mt-0.5 text-[20px] leading-none">{x.v}</div>
                <div className={cn("mt-1 text-[11.5px] font-semibold", x.tone)}>{x.d} <span className="font-normal text-mute">vs prior period</span></div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-5 text-[12px] text-mute">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-slate-soft" />Unique Sales</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: C.bad }} />Cancellations</span>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ov-sales" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--color-slate-soft)" stopOpacity={0.9} />
                <stop offset="1" stopColor="var(--color-slate-soft)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="ov-cancels" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={C.bad} stopOpacity={0.35} />
                <stop offset="1" stopColor={C.bad} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 5" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis yAxisId="s" {...axisProps} width={40} tickFormatter={(v: number) => (v >= 1000 && v < 10000 ? fmtCompact(v, 1) : fmtCompact(v, 0))} />
            <YAxis yAxisId="c" orientation="right" {...axisProps} width={36} tickFormatter={(v: number) => (v >= 1000 && v < 10000 ? fmtCompact(v, 1) : fmtCompact(v, 0))} />
            <Tooltip
              cursor={{ stroke: "var(--color-line)", strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TipCard
                    title={monthLabel(String(payload[0].payload.month))}
                    rows={[
                      { label: "Unique Sales", value: fmtInt(payload[0].payload.sales), color: "var(--color-slate-soft)" },
                      { label: "Cancellations", value: fmtInt(payload[0].payload.cancels), color: C.bad },
                    ]}
                  />
                ) : null
              }
            />
            <Area yAxisId="s" type="monotone" dataKey="sales" stroke="var(--color-mute)" strokeWidth={1.5} fill="url(#ov-sales)" isAnimationActive animationDuration={900} />
            <Area yAxisId="c" type="monotone" dataKey="cancels" stroke={C.bad} strokeWidth={2.2} fill="url(#ov-cancels)" isAnimationActive animationDuration={1100} />
            {sel?.cancels != null && <ReferenceDot yAxisId="c" x={sel.label} y={sel.cancels} r={5} fill="var(--color-card)" stroke={C.bad} strokeWidth={2.5} />}
          </AreaChart>
        </ResponsiveContainer>
        {model.daily && dC !== null && dS !== null && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            {monthName(month)}: cancellations <strong className={dC > 0 ? "text-bad" : "text-good"}>{dC >= 0 ? "up" : "down"} {fmtPct0(Math.abs(dC))}</strong> and Unique Sales <strong className={dS >= 0 ? "text-good" : "text-bad"}>{dS >= 0 ? "up" : "down"} {fmtPct0(Math.abs(dS))}</strong> vs {pm ? monthName(pm) : "the previous period"}. The cancel rate is {fmtPct(s.cancelRate)}{f.baselineRate !== null ? <> against a {fmtPct(f.baselineRate)} norm</> : null}
            {f.focus && f.d.anomaly ? <>; {f.focus.state} accounts for {fmtPct0(f.focus.contribution)} of the cancellations above normal.</> : <>, within the normal range.</>}
          </p>
        )}
      </Card>

      <Card className="flex flex-col p-5 sm:p-6 lg:col-span-3">
        <Head title="When customers cancel" sub={`${monthName(month)} cancellations by lifecycle stage`} onOpen={() => openKpi("post")} />
        <div className="mt-4 flex items-baseline gap-2">
          <span className="num-display text-[44px] leading-none">{fmtPct(s.postPct, 0)}</span>
          <span className="text-[12.5px] text-mute">after the due date</span>
        </div>
        {p?.postPct != null && s.postPct != null && <div className="mt-1 text-[12px] font-semibold text-bad">{fmtPp(s.postPct - p.postPct)} vs {monthShort(pm!)}</div>}
        <SegmentBar
          className="mt-auto pt-5"
          segments={[
            { id: "pre", label: "Pre ODD", value: s.preCancels, color: "var(--color-slate-soft)", detail: fmtInt(s.preCancels) },
            { id: "on", label: "On ODD", value: s.onCancels, color: "#ffc72c", detail: fmtInt(s.onCancels) },
            { id: "post", label: "Post ODD", value: s.postCancels, color: C.bad, detail: fmtInt(s.postCancels), emphasis: true },
          ]}
        />
      </Card>

      <Card className="flex flex-col items-center p-5 sm:p-6 lg:col-span-3">
        <div className="w-full"><Head title="Cancel rate" sub="Against the internal baseline" onOpen={() => openKpi("cancelRate")} /></div>
        <div className="mt-auto pt-4">
          <Gauge
            value={s.cancelRate}
            max={gaugeMax}
            reference={f.baselineRate}
            size={210}
            center={<span className="num-display text-[46px] leading-none">{fmtPct(s.cancelRate)}</span>}
            label={f.baselineRate !== null ? <>Baseline {fmtPct(f.baselineRate)} <span className="font-semibold text-bad">{fmtPp((s.cancelRate ?? 0) - f.baselineRate, 1)}</span></> : undefined}
          />
        </div>
      </Card>
    </section>
  );
}

function Head({ title, sub, onOpen }: { title: string; sub: string; onOpen: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[16px] font-semibold tracking-tight">{title}</div>
        <div className="mt-0.5 text-[12px] text-mute">{sub}</div>
      </div>
      <button onClick={onOpen} aria-label={`Open ${title} deep dive`} className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-mute transition hover:bg-panel hover:text-white">
        <ArrowUpRight className="size-4" />
      </button>
    </div>
  );
}
