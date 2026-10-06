"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Eye, Lightbulb } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../AppContext";
import { TrendChart } from "../charts/TrendChart";
import { ODDTimingChart } from "../charts/ODDTimingChart";
import { CustomerMissDrivers } from "../charts/CustomerMissDrivers";
import { WatchtowerSignals } from "../charts/WatchtowerSignals";
import { RankedBars, type RankedRow } from "../charts/RankedBars";
import { planRows } from "../charts/StateRanking";
import { Donut } from "../charts/Donut";
import { CancelClassification } from "../charts/CancelClassification";
import { AgencySignals, AgencyTrend, RepRanking, RepSignals } from "../analysis/charts";
import { analysisHref } from "@/lib/story/links";
import { C, TipCard, axisProps } from "../charts/shared";
import { cn } from "../ui/primitives";
import { ChannelIcon } from "./ChannelIcon";
import { assess, isChannel, kpiById, periodReference, scopeName, series } from "@/lib/data/metrics";
import { riskFactors as factorsHighestFirst, storyFacts } from "@/lib/story/facts";
import { agencyCoaching, buildRecommendations } from "@/lib/story/narrative";
import type { EvidenceSpec } from "@/lib/story/types";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthName, monthShort, stateSlug } from "@/lib/format";

export const TEAL = "var(--color-teal)";
export const NAVY = "var(--color-observed)";

/** Next 5 / Next 30 days switch. One horizon for the whole app, so every outlook, plan and action follows it. */
export function HorizonToggle({ className }: { className?: string }) {
  const { model, horizon, setHorizon } = useApp();
  if (!model.daily) return null;
  return (
    <div className={cn("inline-flex rounded-full border border-line bg-card p-0.5 shadow-card", className)} role="group" aria-label="Outlook horizon">
      {([5, 30] as const).map((h) => (
        <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h}
          className={horizon === h ? "rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas" : "rounded-full px-2.5 py-1 text-[11px] font-semibold text-mute hover:text-ink"}>
          Next {h} Days
        </button>
      ))}
    </div>
  );
}

/** Evidence kinds that look forward: they carry the horizon switch. */
const FORWARD = new Set(["forecast", "forecast-scope", "interventions", "sales-prevention", "high-value", "measures", "outlook"]);

/** Tiny inline "See evidence" control. */
export function EvidenceToggle({ open, onToggle, controls, className }: { open: boolean; onToggle: () => void; controls: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        "ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-[11px] font-semibold transition-colors",
        open ? "border-panel bg-panel text-white" : "border-line bg-card text-mute hover:border-ink hover:text-ink",
        className,
      )}
    >
      <Eye className="size-3" />
      {open ? "Hide evidence" : "See evidence"}
      <ChevronDown className={cn("size-3 transition-transform duration-300", open && "rotate-180")} />
    </button>
  );
}

/** Animated inline panel: chart evidence plus a one sentence interpretation. */
export function EvidencePanel({ spec, open, id, className }: { spec: EvidenceSpec; open: boolean; id: string; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="evidence"
          id={id}
          role="region"
          aria-label={spec.title}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ height: { duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }, opacity: { duration: 0.22 } }}
          className={cn("overflow-hidden", className)}
        >
          <motion.div
            initial={{ y: 8 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            className="mt-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12.5px] font-semibold text-ink">{spec.title}</div>
              {FORWARD.has(spec.kind) && <HorizonToggle />}
            </div>
            <EvidenceBody spec={spec} />
            <p className="mt-3 flex gap-2 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-2">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand-2" />
              {spec.interpretation}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EvidenceBody({ spec }: { spec: EvidenceSpec }) {
  const { model, month } = useApp();
  const router = useRouter();
  const go = (href: string) => router.push(href);

  switch (spec.kind) {
    case "trend": {
      const a = assess(model, kpiById("cancels")!, month, spec.scope);
      return <TrendChart points={series(model, "cancelRate", spec.scope)} reference={periodReference(model, month, "cancelRate", spec.scope, "pct")} unit="pct" color={a.anomaly ? C.bad : C.indigo} selected={month} anomaly={a.anomaly} height={190} name={`${scopeName(spec.scope)} cancel rate`} />;
    }
    case "ranking": {
      const { rows } = planRows(model, month, spec.dim);
      const key = spec.metric;
      const data = [...rows].sort((a, b) => (b.snapshot[key] ?? 0) - (a.snapshot[key] ?? 0));
      const bars: RankedRow[] = data.map((r) => {
        const hi = spec.highlight.includes(r.name);
        return {
          id: r.name,
          label: <span className="flex items-center gap-2">{spec.dim === "channel" && <ChannelIcon channel={r.name} className="size-3.5 text-mute" />}{r.name}</span>,
          value: r.snapshot[key] ?? null,
          valueLabel: key === "cancelRate" ? fmtPct(r.cancelRate) : fmtInt(r.cancels),
          chip: r.cancelsMoM !== null ? { text: fmtSignedPct(r.cancelsMoM), tone: r.cancelsMoM > 0.15 ? "bad" : "neutral" } : undefined,
          color: hi ? C.bad : C.slate, emphasis: hi, dim: spec.highlight.length > 0 && !hi,
          onClick: () => go(analysisHref(spec.dim === "state" ? { state: r.name } : { channel: r.name }, month)),
        };
      });
      return <RankedBars rows={bars} dense />;
    }
    case "scope-channels":
    case "channel-states": {
      const rows = model.stateChannel
        .filter((r) => (spec.kind === "scope-channels" ? r.state === spec.state : r.channel === spec.channel))
        .sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0));
      if (!rows.length || month !== model.drillMonth) return <Unavailable text="The state by channel cross view is published for the latest month only." />;
      const name = (r: (typeof rows)[number]) => (spec.kind === "scope-channels" ? r.channel : r.state);
      return (
        <RankedBars
          dense
          max={Math.max(...rows.map((r) => r.cancelRate ?? 0)) * 1.05}
          rows={rows.map((r) => {
            const hi = spec.highlight.includes(name(r));
            return {
              id: name(r),
              label: <span className="flex items-center gap-2">{spec.kind === "scope-channels" && <ChannelIcon channel={r.channel} className="size-3.5 text-mute" />}{name(r)}</span>,
              sub: `${fmtInt(r.cancels)} of ${fmtInt(r.sales)} sales`,
              value: r.cancelRate, valueLabel: fmtPct(r.cancelRate), color: hi ? C.bad : C.slate, emphasis: hi,
              onClick: () => go(analysisHref({ state: r.state, channel: r.channel }, month)),
            };
          })}
        />
      );
    }
    case "agencies": {
      const ag = model.story.agencies;
      if (!ag.length) return <Unavailable text="Agency detail is not available in the workbook." />;
      return (
        <RankedBars
          dense
          max={Math.max(...ag.map((a) => a.cancelRate ?? 0)) * 1.05}
          rows={[...ag].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).map((a) => {
            const hi = spec.highlight.includes(a.agency);
            return {
              id: a.agency,
              label: <span className="flex items-center gap-2"><ChannelIcon channel={a.channel} className="size-3.5 text-mute" />{a.agency}</span>,
              sub: `${a.channel} · own history ${fmtPct(a.baseline)}`,
              value: a.cancelRate, valueLabel: fmtPct(a.cancelRate),
              chip: a.gap !== null ? { text: fmtPp(a.gap), tone: hi ? "bad" : "neutral" } : undefined,
              color: hi ? C.bad : C.slate, emphasis: hi,
              onClick: () => go(analysisHref({ agency: a.agency }, month)),
            };
          })}
        />
      );
    }
    case "cohorts": {
      const rows = model.story.cohorts.filter((c) => c.agency === spec.agency && (c.sales ?? 0) > 0);
      return (
        <RankedBars dense max={1} rows={rows.map((c) => ({
          id: c.cohort, label: c.cohort, sub: `${fmtPct0(c.salesShare)} of sales · ${fmtPct(c.rate)} cancel rate`,
          value: c.cancelShare, valueLabel: `${fmtPct0(c.cancelShare)} of cancels`, color: (c.cancelShare ?? 0) > (c.salesShare ?? 0) ? C.bad : C.slate,
        }))} />
      );
    }
    case "drivers": return <DriversEvidence />;
    case "timing":
      return <ODDTimingChart model={model} state={spec.scope} mode="pct" selected={month} focus="post" height={210} />;
    case "reasons":
      return <CustomerMissDrivers model={model} month={month} state={spec.scope} showInsight={false} />;
    case "watch":
      return <WatchtowerSignals model={model} month={month} state={spec.scope} />;
    case "forecast":
      return <ForecastEvidence />;
    case "forecast-scope":
      return <ForecastScopeEvidence scope={spec.scope} />;
    case "interventions":
      return <InterventionBars />;
    case "classification":
      return <CancelClassification model={model} month={month} state={spec.scope} compact />;
    case "agency-trend":
      return <AgencyTrend model={model} agency={spec.agency} month={month} height={200} />;
    case "agency-signals":
      return <AgencySignals model={model} agency={spec.agency} />;
    case "reps":
      return <RepRanking reps={model.story.reps.filter((r) => (spec.agencies ?? [spec.agency]).includes(r.agency) && (r.sales ?? 0) > 0)} highlight={spec.highlight} onSelect={(id) => go(analysisHref({ rep: id }, month))} limit={14} />;
    case "rep-signals":
      return <RepSignals model={model} rep={spec.rep} />;
    case "measures":
      return <MeasuresTable />;
    case "sales-quality":
      return <SalesQualityEvidence />;
    case "sales-prevention":
      return <SalesPreventionEvidence />;
    case "high-value":
      return <HighValueEvidence />;
  }
}

const riskFactors = factorsHighestFirst;

function FactorBars({ factors }: { factors: { label: string; v: number | null }[] }) {
  return (
    <div className="space-y-3">
      {factors.map((x, i) => (
        <div key={x.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="text-ink-2"><span className="mr-1.5 text-mute">{i + 1}.</span>{x.label}</span><span className="num font-semibold">{fmtPct0(x.v)}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-line-2">
            <motion.div className="h-full w-full rounded-full" style={{ background: TEAL, transformOrigin: "0 50%" }} initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, (x.v ?? 0) / 0.7) }} transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rep mix change, the risk factors, coaching by agency, then the representatives behind the loss. */
function SalesQualityEvidence() {
  const { model, month } = useApp();
  const router = useRouter();
  const f = storyFacts(model, month);
  if (!model.story.agencies.length) return <Unavailable text="Agency detail is not available in the workbook." />;
  const weakList = [...f.weakAgencies].sort((x, y) => x.agency.localeCompare(y.agency));
  const weak = new Set(weakList.map((a) => a.agency));
  const reps = model.story.reps.filter((r) => weak.has(r.agency));
  const crit = reps.filter((r) => /critical/i.test(r.band) && (r.sales ?? 0) > 0);
  // Who to coach is read from each rep's last 30 days (a few days of one rep's sales are too few): the two riskiest per agency.
  const coachPool = (model.daily?.monthly?.story.reps ?? model.story.reps).filter((r) => weak.has(r.agency) && (r.sales ?? 0) >= 10);
  const coach = weakList.flatMap((a) => coachPool.filter((r) => r.agency === a.agency).sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0)).slice(0, 2));
  const newer = (agency: string) => model.story.cohorts.find((c) => c.agency === agency && /new/i.test(c.cohort) && (c.sales ?? 0) > 0) ?? null;
  const mixRows = weakList.map((a) => ({ a, c: newer(a.agency) })).filter((x) => x.c);
  const keySignal = (a: (typeof weakList)[number]) => {
    const k = agencyCoaching(a).focus, c = newer(a.agency);
    if (/newer/.test(k) && c) return `Newer reps: ${fmtPct0(c.salesShare)} of sales, ${fmtPct0(c.cancelShare)} of cancellations`;
    if (/confirmation/.test(k)) return `${fmtPct0(a.failedConfirm)} of orders fail independent confirmation`;
    if (/competitor/.test(k)) return `Competitor mentioned on ${fmtPct0(a.competitor)}, promotion-dependent ${fmtPct0(a.promo)}`;
    return `Low intent ${fmtPct0(a.lowIntent)}`;
  };
  return (
    <div className="space-y-5">
      {mixRows.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">What changed in the sales team</div>
          <div className="space-y-2.5">
            {mixRows.map(({ a, c }) => (
              <div key={a.agency} className="rounded-2xl bg-card p-3.5 shadow-card">
                <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]"><span className="font-semibold">{a.agency}: newer and replacement reps</span><span className="text-[12px] text-mute">{fmtPct(c!.rate)} cancel rate</span></div>
                {[{ l: "Share of sales", v: c!.salesShare, col: C.slate }, { l: "Share of cancellations", v: c!.cancelShare, col: C.bad }].map((x) => (
                  <div key={x.l} className="mt-1.5 flex items-center gap-3 text-[12px]">
                    <span className="w-[140px] shrink-0 text-mute">{x.l}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line-2"><motion.div className="h-full w-full rounded-full" style={{ background: x.col, transformOrigin: "0 50%" }} initial={{ scaleX: 0 }} animate={{ scaleX: x.v ?? 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} /></div>
                    <span className="num w-10 text-right font-semibold">{fmtPct0(x.v)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">Risk factors in these agencies' orders</div>
        <FactorBars factors={riskFactors(f)} />
      </div>
      <div>
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">Coaching by agency</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {weakList.map((a) => (
            <button key={a.agency} type="button" onClick={() => router.push(analysisHref({ agency: a.agency }, month))} className="rounded-2xl border border-line bg-card p-4 text-left shadow-card transition hover:shadow-pop">
              <div className="flex items-baseline justify-between gap-2"><span className="text-[13.5px] font-semibold">{a.agency}</span><span className="text-[11.5px] text-mute">{a.channel}</span></div>
              <div className="mt-2 flex items-baseline gap-2"><span className="num-display text-[26px] leading-none text-bad">{fmtPct(a.cancelRate)}</span><span className="text-[12px] font-semibold text-bad">{fmtPp(a.gap)}</span></div>
              <div className="mt-1 text-[11.5px] text-mute">vs own history {fmtPct(a.baseline)}</div>
              <div className="mt-2.5 text-[12.5px] text-ink-2">{keySignal(a)}</div>
              <div className="mt-2.5 rounded-xl bg-teal-soft px-3 py-2 text-[12.5px] font-medium text-teal">{agencyCoaching(a).action}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[12px] text-mute">Every other source stays close to its own history{f.steadyAgencies.length ? ` (${fmtPp(Math.min(...f.steadyAgencies.map((a) => a.gap ?? 0)))} to ${fmtPp(Math.max(...f.steadyAgencies.map((a) => a.gap ?? 0)))})` : ""}.</p>
      </div>
      <div>
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">Reps to coach first{model.daily ? " (last 30 days)" : ""}</div>
        <RepRanking reps={coach} limit={coach.length} onSelect={(id) => router.push(analysisHref({ rep: id }, month))} />
        <p className="mt-2 px-3 text-[12px] text-mute">
          <strong className="text-ink">{crit.length} of {reps.filter((r) => (r.sales ?? 0) > 0).length}</strong> active representatives in these agencies are in the Critical band (above 40%), making <strong className="text-ink">{fmtPct0(f.criticalRepShare)}</strong> of their sales.
        </p>
      </div>
    </div>
  );
}

/** October prevention: score risky orders on the sales quality factors, then the targeted action and saves. */
function SalesPreventionEvidence() {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const ro = f.riskyOrders;
  const iv = f.interventions.sales;
  const factors = riskFactors(f);
  const example = model.story.exampleOrder;
  if (ro.orders === null) return <Unavailable text="The outlook is not available in the workbook." />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card p-4 shadow-card"><div className="num-display text-[30px] leading-none">{fmtInt(ro.orders)}</div><div className="mt-1.5 text-[12px] text-mute">{ro.channels.join(" and ")} orders to score, {f.forecast.month ? monthName(f.forecast.month).toLowerCase() : "next 30 days"}</div></div>
        <div className="rounded-2xl bg-card p-4 shadow-card"><div className="num-display text-[30px] leading-none text-bad">{fmtInt(ro.projected)}</div><div className="mt-1.5 text-[12px] text-mute">projected to cancel without action ({fmtPct0(ro.rate)})</div></div>
        <div className="rounded-2xl bg-teal p-4 text-white shadow-card dark:text-[#06201f]"><div className="num-display text-[30px] leading-none">{fmtInt(iv?.saves ?? null)}</div><div className="mt-1.5 text-[12px] opacity-90">cancellations avoided by verifying risky orders</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-mute">Risk factors in these agencies' orders</div>
          <FactorBars factors={factors} />
        </div>
        {example.length > 0 && (
          <div className="rounded-2xl border border-teal/25 bg-card p-4">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-teal">Example scored order</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
              {example.map((e) => (
                <div key={e.label} className="contents">
                  <dt className="text-mute">{e.label}</dt>
                  <dd className={/recommended/i.test(e.label) ? "text-right font-semibold text-teal" : "text-right font-semibold"}>{e.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      {iv && <div className="rounded-2xl bg-teal-soft px-4 py-3 text-[13px] text-teal"><strong>Targeted action:</strong> {iv.action}.</div>}
    </div>
  );
}

/** Delivery risk segmentation: risk x Customer Lifetime Value (CLTV) x ODD x readiness, with the action for each segment. */
function HighValueEvidence() {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const hv = f.highValue;
  const iv = f.interventions.install;
  const segs = model.story.segments.filter((s) => !s.isTotal);
  if (!segs.length) return <Unavailable text="The delivery risk segmentation is not available in the workbook." />;
  const tone = (s: (typeof segs)[number]) =>
    s === hv.accelerate ? { ring: "border-teal/40 bg-teal-soft/50", text: "text-teal" }
    : s === hv.resetOdd ? { ring: "border-bad/30 bg-bad-soft/40", text: "text-bad" }
    : s === hv.handOff ? { ring: "border-warn/30 bg-warn-soft/40", text: "text-warn" }
    : { ring: "border-line bg-card", text: "text-mute" };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2 text-[13px] text-mute">
        <span className="num-display text-[28px] leading-none text-ink">{fmtInt(hv.total)}</span>
        {f.focus?.state} delivery-risk orders, split by cancellation risk, Customer Lifetime Value (CLTV), ODD and permit and construction readiness
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {segs.map((s) => {
          const t = tone(s);
          return (
            <div key={s.segment} className={cn("rounded-2xl border p-4", t.ring)}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="num-display text-[30px] leading-none">{fmtInt(s.orders)}</span>
                <span className={cn("text-right text-[12.5px] font-semibold", t.text)}>{s.action}</span>
              </div>
              <div className="mt-2 text-[13px] font-medium text-ink">{s.segment}</div>
              <div className="mt-0.5 text-[12px] text-mute">{s.signal}{s.objective ? ` · ${s.objective}` : ""}</div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        {model.story.exampleInstall.length > 0 && (
          <div className="rounded-2xl border border-teal/25 bg-card p-4">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-teal">Readiness status: example order</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px] sm:grid-cols-4">
              {model.story.exampleInstall.map((e) => (
                <div key={e.label}>
                  <dt className="text-mute">{e.label}</dt>
                  <dd className={/recommended/i.test(e.label) ? "font-semibold text-teal" : "font-semibold"}>{e.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {iv && (
          <div className="flex flex-col justify-center rounded-2xl bg-teal px-5 py-4 text-white dark:text-[#06201f]">
            <div className="num-display text-[32px] leading-none">{fmtInt(iv.saves)}</div>
            <div className="mt-1 text-[12px] opacity-90">potential saves</div>
          </div>
        )}
      </div>
      {iv && <div className="rounded-2xl bg-teal-soft px-4 py-3 text-[13px] text-teal"><strong>Recommended action:</strong> {iv.action}.</div>}
    </div>
  );
}

function MeasuresTable() {
  const { model } = useApp();
  const rows = model.story.measures;
  if (!rows.length) return <Unavailable text="Success measures are not available in the workbook." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-wider text-mute">
            <th className="pb-2 font-semibold">Measure</th><th className="pb-2 text-right font-semibold">Actual</th><th className="pb-2 text-right font-semibold">No action</th><th className="pb-2 text-right font-semibold">Target</th><th className="pb-2 pl-4 font-semibold">Role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.measure} className="border-t border-line-2">
              <td className="py-2 font-medium">{m.measure}</td>
              <td className="num py-2 text-right">{m.actual}</td>
              <td className="num py-2 text-right text-bad">{m.noAction}</td>
              <td className="num py-2 text-right font-semibold text-teal">{m.target}</td>
              <td className="py-2 pl-4 text-mute">{m.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Unavailable({ text }: { text: string }) {
  return <div className="py-6 text-center text-[13px] text-mute">{text}</div>;
}

const DRIVER_COLOR: Record<string, string> = { contact: "var(--color-bad)", sales: "#f5a524", company: "var(--color-slate-soft)", faux: "var(--color-line)" };

function DriversEvidence() {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const parts = model.story.drivers.filter((d) => d.kind !== "total");
  if (!parts.length) return <Unavailable text="Primary driver attribution is not available in the workbook." />;
  const pending = f.focusSnap?.pendingPct ?? null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-6">
        <Donut
          size={170}
          thickness={22}
          data={parts.map((d) => ({ name: d.driver, value: d.cancels ?? 0, color: DRIVER_COLOR[d.kind] ?? C.slate, detail: fmtInt(d.cancels) }))}
          center={<div><div className="num-display text-[26px] leading-none">{fmtInt(parts.reduce((a, d) => a + (d.cancels ?? 0), 0))}</div><div className="mt-1 text-[10.5px] text-mute">cancellations</div></div>}
        />
        <ul className="min-w-[240px] flex-1 space-y-2.5">
          {parts.map((d) => (
            <li key={d.driver} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 gap-2.5">
                <span className="mt-1.5 h-2.5 w-5 shrink-0 rounded-full" style={{ background: DRIVER_COLOR[d.kind] ?? C.slate }} />
                <span className="min-w-0">
                  <span className={d.kind === "contact" || d.kind === "sales" ? "font-semibold text-ink" : "text-ink-2"}>{d.driver}</span>
                  <span className="block truncate text-[11.5px] text-mute">{d.interpretation}</span>
                </span>
              </span>
              <span className="num shrink-0 font-semibold">{fmtInt(d.cancels)} · {fmtPct0(d.share)}</span>
            </li>
          ))}
        </ul>
      </div>
      {pending !== null && (
        <div className="rounded-xl border border-dashed border-line bg-card px-3 py-2.5 text-[12.5px] text-ink-2">
          <span className="font-semibold text-ink">Different measure:</span> {fmtPct0(pending)} of {f.focus?.state} cancellations carried a Pending Customer Contact <em>signal</em>. A status, not the primary cause, so it does not add to the shares above.
        </div>
      )}
    </div>
  );
}

function ForecastEvidence() {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const fc = f.forecast;
  const FM = fc.month ? monthShort(fc.month) : "Next";
  const data = [
    { label: "Baseline", value: fc.baseline, fill: C.slateDeep },
    ...(f.prev ? [{ label: `${monthShort(f.prev)} actual`, value: fc.prevActual, fill: C.slateDeep }] : []),
    { label: `${monthShort(month)} actual`, value: fc.actual, fill: C.bad },
    { label: `${FM}: no action`, value: fc.noAction, fill: "#f08a80" },
    { label: `${FM}: intervention`, value: fc.intervention, fill: TEAL },
  ].filter((d) => d.value !== null);
  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} interval={0} tick={{ fill: C.axis, fontSize: 10.5 }} />
          <YAxis {...axisProps} width={38} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} domain={[0, "auto"]} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={({ active, payload }) => active && payload?.[0] ? <TipCard title={String(payload[0].payload.label)} rows={[{ label: "Cancel rate", value: fmtPct(payload[0].value as number) }]} /> : null} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={700}>
            {data.map((d) => <Cell key={d.label} fill={d.fill} />)}
            <LabelList dataKey="value" position="top" formatter={(v: unknown) => fmtPct(v as number)} style={{ fill: "var(--color-ink)", fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <InterventionBars />
    </div>
  );
}

function InterventionBars() {
  const { model, month } = useApp();
  const { items, dedup } = buildRecommendations(model, month);
  if (!items.length) return null;
  return (
    <div>
      <RankedBars dense max={Math.max(...items.map((i) => i.saves ?? 0)) * 1.1} rows={items.map((i) => ({
        id: i.id, label: i.label, sub: i.action, value: i.saves, valueLabel: `${fmtInt(i.saves)} saves`, color: TEAL,
      }))} />
      {dedup !== null && <div className="mt-2 px-3 text-right text-[12px] text-mute">Counted once per order: <strong className="num text-ink">{fmtInt(dedup)}</strong> orders potentially protected</div>}
    </div>
  );
}

function ForecastScopeEvidence({ scope }: { scope: string }) {
  const { model, month } = useApp();
  const st = model.story;
  const FM = st.forecastMonth ? monthName(st.forecastMonth) : "Next month";
  const channel = isChannel(scope);
  const rows = channel
    ? st.forecastChannels.filter((r) => !r.isTotal).map((r) => ({ name: r.channel, prev: r.prevRate, next: r.rate }))
    : st.forecastStates.filter((r) => !r.isTotal).map((r) => ({ name: r.state, prev: r.prevRate, next: r.rate }));
  if (!rows.length) return <Unavailable text="The outlook is not available in the workbook." />;
  const sel = scopeName(scope);
  const data = rows.sort((a, b) => (b.next ?? 0) - (a.next ?? 0));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[11.5px] text-mute">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: C.slateDeep }} />{monthName(month)} actual</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "#f08a80" }} />{FM}: no action</span>
        {channel && st.focusState && <span>{st.focusState} channels</span>}
      </div>
      <ResponsiveContainer width="100%" height={Math.max(190, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <YAxis type="category" dataKey="name" {...axisProps} width={112} interval={0} tick={({ x, y, payload }) => (
            <text x={x} y={y} dy={4} textAnchor="end" fontSize={11.5} fontWeight={payload.value === sel ? 700 : 500} fill={payload.value === sel ? "var(--color-ink)" : "var(--color-mute)"}>{payload.value}</text>
          )} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={({ active, payload }) => active && payload?.length ? <TipCard title={String(payload[0].payload.name)} rows={[{ label: `${monthShort(month)} actual`, value: fmtPct(payload[0].payload.prev) }, { label: `${FM}: no action`, value: fmtPct(payload[0].payload.next) }]} /> : null} />
          <Bar dataKey="prev" fill={C.slateDeep} radius={[0, 4, 4, 0]} isAnimationActive animationDuration={600}>
            {data.map((d) => <Cell key={d.name} fillOpacity={d.name === sel ? 1 : 0.45} />)}
          </Bar>
          <Bar dataKey="next" fill="#f08a80" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={700}>
            {data.map((d) => <Cell key={d.name} fill={d.name === sel ? C.bad : "#f08a80"} fillOpacity={d.name === sel ? 1 : 0.5} />)}
            <LabelList dataKey="next" position="right" formatter={(v: unknown) => fmtPct0(v as number)} style={{ fill: "var(--color-ink)", fontSize: 10.5, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
