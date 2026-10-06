"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Area, AreaChart, Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Crosshair, Flame } from "lucide-react";
import { PageInsights } from "../story/PageInsights";
import { useApp } from "../AppContext";
import { ODDTimingChart, ODD_COLORS, type OddBucket } from "../charts/ODDTimingChart";
import { TrendChart } from "../charts/TrendChart";
import { CancelClassification, CLASS_COLORS } from "../charts/CancelClassification";
import { CustomerMissDrivers } from "../charts/CustomerMissDrivers";
import { C, TipCard, axisProps } from "../charts/shared";
import { Badge, Card, cn, RichText, SectionTitle, Tabs } from "../ui/primitives";
import { Sparkline } from "../ui/Sparkline";
import { assess, getSnapshot, kpiById, prevMonth, reasonAnnotation, reasonStats, series , periodReference, chartDays } from "@/lib/data/metrics";
import { diagnose, focusInsight, type FocusKind } from "@/lib/data/narratives";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthLabel, monthName, monthShort, stateSlug } from "@/lib/format";

type Tab = "timing" | "miss" | "class";
const TABS: { id: Tab; label: string }[] = [
  { id: "timing", label: "Cancellation Timing" },
  { id: "miss", label: "Customer Miss" },
  { id: "class", label: "Classification" },
];
const BUCKETS: { id: OddBucket; label: string; cnt: string; pct: string; blurb: string }[] = [
  { id: "pre", label: "PRE ODD", cnt: "preCancels", pct: "prePct", blurb: "Before the Original Due Date" },
  { id: "on", label: "ON ODD", cnt: "onCancels", pct: "onPct", blurb: "On the Original Due Date" },
  { id: "post", label: "POST ODD", cnt: "postCancels", pct: "postPct", blurb: "After the Original Due Date" },
];

const ODD_NAMES: Record<OddBucket, string> = { pre: "Pre ODD", on: "On ODD", post: "Post ODD" };

export function CancellationsPage() {
  const sp = useSearchParams();
  const rawTab = sp.get("tab");
  const [tab, setTab] = useState<Tab>(rawTab === "miss" || rawTab === "class" ? rawTab : "timing");
  useEffect(() => {
    if (rawTab === "timing" || rawTab === "miss" || rawTab === "class") setTab(rawTab);
  }, [rawTab]);
  const bucket = sp.get("bucket");

  return (
    <div className="space-y-7">
      <SectionTitle
        eyebrow="Cancellations"
        title={tab === "timing" ? "When are customers cancelling?" : tab === "miss" ? "Why are customers cancelling?" : "Who owns the miss?"}
        right={<Tabs tabs={TABS} value={tab} onChange={setTab} />}
      />
      <PageInsights page="cancellations" />
      <FocusInsightCard kind={tab} />
      {tab === "timing" && <TimingView initialBucket={bucket === "pre" || bucket === "on" || bucket === "post" ? bucket : null} />}
      {tab === "miss" && <CustomerMissView />}
      {tab === "class" && <ClassView />}
    </div>
  );
}

// ------------------------------------------------------------------ focus insight
/** Arranges the tab's cancellation measure by state and names the focus state and, where relevant, the focus channel. */
function FocusInsightCard({ kind }: { kind: FocusKind }) {
  const { model, month, state, setState } = useApp();
  const f = useMemo(() => focusInsight(model, month, kind), [model, month, kind]);
  const fmtV = (v: number | null) => (f.unit === "pct" ? fmtPct0(v) : fmtInt(v));
  const fmtG = (v: number | null) => (kind === "class" ? fmtPp(v) : fmtSignedPct(v));
  return (
    <Card className="grid gap-6 overflow-hidden p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="bs-gradient grid size-9 place-items-center rounded-xl text-[#111]"><Crosshair className="size-[18px]" /></span>
          <div className="eyebrow">Focus insight · {monthLabel(month)}</div>
        </div>
        <h3 className="mt-3 text-[18px] font-semibold tracking-tight">{f.title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2"><RichText text={f.text} /></p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-mute">
          <span>{f.valueLabel} by state</span><span>{kind === "class" ? "Change" : "vs prior"}</span>
        </div>
        <div className="space-y-1">
          {f.ranked.map((r) => {
            const on = state === r.state;
            const hot = f.focusState === r.state;
            return (
              <button key={r.state} onClick={() => setState(on ? null : r.state)} title={on ? "Clear state filter" : `Filter this view to ${r.state}`}
                className={cn("grid w-full grid-cols-[1fr_auto_64px] items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition hover:bg-subtle", hot && "bg-bad-soft", on && "ring-2 ring-brand")}>
                <span className="flex items-center gap-2 font-semibold">{r.state}{hot && <Badge tone="bad" className="!px-1.5 !py-0 text-[9.5px]">FOCUS</Badge>}</span>
                <span className="num text-mute">{fmtV(r.value)}</span>
                <span className={cn("num text-right font-bold", (r.growth ?? 0) > 0.005 ? "text-bad" : (r.growth ?? 0) < -0.005 ? "text-good" : "text-mute")}>{fmtG(r.growth)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-soft">Select a state to filter this page; select it again to clear.</p>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ timing
function TimingView({ initialBucket }: { initialBucket: OddBucket | null }) {
  const { model, month, state, setMonth } = useApp();
  const [mode, setMode] = useState<"count" | "pct">("count");
  const [bucket, setBucket] = useState<OddBucket | null>(initialBucket);
  const pm = prevMonth(model, month);
  const s = getSnapshot(model, month, state);
  const p = pm ? getSnapshot(model, pm, state) : null;
  const shift = s.postPct !== null && p?.postPct != null ? s.postPct - p.postPct : null;
  const shares = chartDays(model).map((m) => {
    const x = getSnapshot(model, m, state);
    return { month: m, label: monthShort(m), pre: x.prePct, on: x.onPct, post: x.postPct };
  });
  const shown = BUCKETS.filter((b) => !bucket || b.id === bucket);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {BUCKETS.map((x) => {
          const spark = series(model, x.pct, state).filter((q) => q.month <= month).map((q) => q.value);
          const cur = s[x.pct];
          const prev = p ? p[x.pct] : null;
          const d = cur !== null && prev !== null && prev !== undefined ? cur - prev : null;
          const hot = x.id === "post" && (d ?? 0) > 0.05;
          const sel = bucket === x.id;
          return (
            <button
              key={x.id}
              onClick={() => setBucket(sel ? null : x.id)}
              aria-pressed={sel}
              className={cn("rounded-[22px] border p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop", hot ? "border-panel bg-panel text-white" : "border-line bg-card", sel && "ring-2 ring-brand", bucket && !sel && "opacity-60")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-bold tracking-wider" style={{ color: hot ? C.brand : undefined }}>
                  <span className="size-2.5 rounded-full" style={{ background: ODD_COLORS[x.id] }} />
                  {x.label}
                </div>
                {hot ? <Badge tone="brand">DOMINANT</Badge> : sel ? <Badge tone="ink">SELECTED</Badge> : null}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="num-display text-[46px] leading-none">{fmtPct0(cur)}</div>
                  <div className={cn("mt-2 text-[13px]", hot ? "text-white/60" : "text-mute")}>
                    {fmtInt(s[x.cnt])} cancellations · <span className={cn("font-semibold", x.id === "post" && (d ?? 0) > 0.005 ? "text-bad" : x.id === "post" && (d ?? 0) < -0.005 ? "text-good" : "")}>{fmtPp(d)}</span> vs prior period
                  </div>
                </div>
                <Sparkline values={spark} color={hot ? C.brand : ODD_COLORS[x.id] === C.brand ? "#e0a800" : x.id === "pre" ? C.slateDeep : C.orange} width={92} height={40} />
              </div>
              <div className={cn("mt-3 text-xs", hot ? "text-white/50" : "text-soft")}>{x.blurb} · select to isolate</div>
            </button>
          );
        })}
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Pre, On and Post ODD cancellations · {state ?? "Portfolio"}</div>
            {shift !== null && Math.abs(shift) >= 0.03 && (
              <div className="mt-1 flex items-center gap-2 text-[13px] text-mute">
                <Flame className="size-4 text-bad" />
                <span>
                  <strong className="text-ink">{monthName(month)}: structural shift.</strong> Post ODD share {fmtPct0(p?.postPct)} to {fmtPct0(s.postPct)} ({fmtPp(shift)}); Pre ODD {fmtPct0(p?.prePct)} to {fmtPct0(s.prePct)}.
                </span>
              </div>
            )}
          </div>
          <Tabs tabs={[{ id: "count", label: "Volume" }, { id: "pct", label: "Share" }]} value={mode} onChange={setMode} size="sm" />
        </div>
        <ODDTimingChart model={model} state={state} mode={mode} selected={month} focus={bucket} height={320} onSelectMonth={setMonth} />
        <p className="mt-1 text-xs text-soft">The selected period ends on the emphasised day. Select a day to look at it on its own.</p>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[15px] font-semibold">{bucket ? `${BUCKETS.find((b) => b.id === bucket)!.label} share` : "Pre, On and Post ODD share"} over time · {state ?? "Portfolio"}</div>
          {bucket && <button onClick={() => setBucket(null)} className="text-xs font-semibold text-mute underline">Show all three</button>}
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={shares} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} onClick={(e) => { const i = Number(e?.activeIndex); if (shares[i]) setMonth(shares[i].month); }}>
              <defs>
                {BUCKETS.map((b) => (
                  <linearGradient key={b.id} id={`odd-${b.id}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor={ODD_COLORS[b.id]} stopOpacity={0.35} />
                    <stop offset="1" stopColor={ODD_COLORS[b.id]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...axisProps} dy={6} />
              <YAxis {...axisProps} width={44} domain={[0, bucket ? "auto" : 0.8]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TipCard title={String(label)} rows={payload.map((q) => ({ label: String(q.name), value: fmtPct(Number(q.value)), color: String(q.color) }))} /> : null)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {shown.map((b) => (
                <Area isAnimationActive key={b.id} type="monotone" dataKey={b.id} name={ODD_NAMES[b.id]} stroke={b.id === "on" ? "#e0a800" : ODD_COLORS[b.id]} strokeWidth={b.id === "post" ? 2.75 : 2.25} fill={`url(#odd-${b.id})`} dot={{ r: 3, fill: C.card, strokeWidth: 2 }} animationDuration={600} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ customer miss
function CustomerMissView() {
  const { model, month, state, setMonth } = useApp();
  const pm = prevMonth(model, month);
  const s = getSnapshot(model, month, state);
  const p = pm ? getSnapshot(model, pm, state) : null;
  const stats = useMemo(() => reasonStats(model, month, state), [model, month, state]);
  const d = useMemo(() => diagnose(model, month), [model, month]);
  const pattern = d.anomaly && d.hotspot && state === d.hotspot.state && stats.some((r) => r.lateStage && (r.mom ?? 0) > 0.25);
  const total = stats.reduce((a, r) => a + (r.count ?? 0), 0);
  const custD = p?.custMiss != null && s.custMiss !== null ? s.custMiss / p.custMiss - 1 : null;

  return (
    <div className="space-y-6">
      {pattern && (
        <Card className="animate-rise border-bad/30 bg-bad-soft p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-bad text-white">
              <Flame className="size-4" />
            </span>
            <div>
              <div className="text-[15px] font-semibold">Customer readiness pattern detected in {state}</div>
              <p className="mt-1 text-sm text-ink-2">
                {stats.filter((r) => r.lateStage && (r.mom ?? 0) > 0.25).map((r) => `${r.label} ${fmtSignedPct(r.mom)}`).join(" · ")}: customers unavailable, rescheduling, or cancelling with the technician on site, alongside a {fmtPct0(s.postPct)} Post ODD share.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatBox label="Customer Miss cancellations" value={fmtInt(s.custMiss)} sub={custD !== null ? `${fmtSignedPct(custD)} vs ${monthShort(pm!)}` : undefined} tone={custD === null ? undefined : custD > 0 ? "bad" : "good"} />
        <StatBox label="Customer Miss share" value={fmtPct(s.custPct)} sub={p?.custPct != null && s.custPct !== null ? `${fmtPp(s.custPct - p.custPct)} vs ${monthShort(pm!)}` : undefined} tone={p?.custPct != null && s.custPct !== null ? (s.custPct > p.custPct ? "bad" : "good") : undefined} />
        <StatBox label="With a named reason" value={fmtInt(total)} sub={s.custMiss ? `${fmtPct0(total / s.custMiss)} of Customer Miss` : undefined} />
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-1 text-[15px] font-semibold">Customer Miss trend · {state ?? "Portfolio"}</div>
        <TrendChart points={series(model, "custMiss", state)} reference={periodReference(model, month, "custMiss", state, "count")} unit="count" color={C.orange} selected={month} name="Customer Miss cancellations" anomaly={assess(model, kpiById("cust")!, month, state).anomaly} onSelectMonth={setMonth} height={260} />
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-3 text-[15px] font-semibold">Ranked drivers · {monthLabel(month)}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-right text-[11px] uppercase tracking-wider text-mute">
                <th className="pb-2 text-left font-semibold">#</th>
                <th className="pb-2 text-left font-semibold">Reason</th>
                <th className="pb-2 font-semibold">Count</th>
                <th className="pb-2 font-semibold">Share</th>
                <th className="pb-2 font-semibold">Prior</th>
                <th className="pb-2 font-semibold">vs prior period</th>
                <th className="pb-2 pl-4 text-left font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((r, i) => {
                const hot = r.lateStage && (r.mom ?? 0) > 0.25;
                const anno = state ? reasonAnnotation(model, month, state, r.label) : null;
                return (
                  <tr key={r.key} className={cn("border-t border-line-2 text-right", hot && "bg-bad-soft")}>
                    <td className="py-2.5 text-left text-mute">{i + 1}</td>
                    <td className="py-2.5 text-left font-semibold">
                      {r.label} {hot && <Badge tone="bad" className="ml-1 !px-1.5 !py-0 text-[9.5px]">RISING</Badge>}
                    </td>
                    <td className="num py-2.5 font-semibold">{fmtInt(r.count)}</td>
                    <td className="num py-2.5">{fmtPct0(r.share)}</td>
                    <td className="num py-2.5 text-mute">{fmtInt(r.prevCount)}</td>
                    <td className={cn("num py-2.5 font-semibold", (r.mom ?? 0) > 0.02 ? "text-bad" : (r.mom ?? 0) < -0.02 ? "text-good" : "text-mute")}>{fmtSignedPct(r.mom)}</td>
                    <td className="py-2.5 pl-4 text-left text-xs text-mute">{anno?.insight ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <div className="mb-3 text-[15px] font-semibold">Driver mix</div>
        <CustomerMissDrivers model={model} month={month} state={state} showInsight={false} />
      </Card>
    </div>
  );
}

function StatBox({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "good" }) {
  return (
    <Card className="p-5">
      <div className="eyebrow">{label}</div>
      <div className="num-display mt-2 text-[34px] leading-none">{value}</div>
      {sub && <div className={cn("mt-2 text-[13px] font-semibold", tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "font-normal text-mute")}>{sub}</div>}
    </Card>
  );
}

// ------------------------------------------------------------------ classification
function ClassView() {
  const { model, month, state } = useApp();
  const data = chartDays(model).map((m) => {
    const s = getSnapshot(model, m, state);
    return { label: monthShort(m), "Customer Miss": s.custPct, "Company Miss": s.coPct, Faux: s.fauxPct };
  });
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-4 text-[15px] font-semibold">
          {state ?? "Portfolio"} · {monthLabel(month)}
        </div>
        <CancelClassification model={model} month={month} state={state} />
      </Card>
      <Card className="p-5 sm:p-6">
        <div className="mb-2 text-[15px] font-semibold">Share of cancellations over time</div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...axisProps} dy={6} />
              <YAxis {...axisProps} width={44} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <TipCard title={String(label)} rows={payload.map((q) => ({ label: String(q.name), value: fmtPct(Number(q.value)), color: String(q.color) }))} /> : null)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line isAnimationActive type="monotone" dataKey="Customer Miss" stroke={CLASS_COLORS.cust} strokeWidth={2.75} dot={{ r: 3 }} />
              <Line isAnimationActive type="monotone" dataKey="Company Miss" stroke={CLASS_COLORS.co} strokeWidth={2.25} dot={false} />
              <Line isAnimationActive type="monotone" dataKey="Faux" stroke={CLASS_COLORS.faux} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
