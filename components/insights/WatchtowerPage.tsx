"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronRight, Radar } from "lucide-react";
import { PageInsights } from "../story/PageInsights";
import { WatchtowerAgencies } from "./WatchtowerAgencies";
import { useApp } from "../AppContext";
import { Badge, Card, cn, LinkButton, SectionTitle } from "../ui/primitives";
import { C } from "../charts/shared";
import { Donut } from "../charts/Donut";
import { findHotspot, getSnapshot, prevMonth, reasonStats, watchSignals, type SignalRow } from "@/lib/data/metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, monthLabel, monthName, slugToState, stateSlug } from "@/lib/format";
import { pendingLevel } from "@/lib/story/pages";

const SIGNAL_META: Record<SignalRow["id"], { kpi?: string; tone: string; meaning: string }> = {
  noAction: { tone: C.slate, meaning: "No Watchtower warning before the cancellation; these were difficult to anticipate." },
  pending: { kpi: "pending", tone: C.orange, meaning: "Customer contact unresolved: the strongest early warning signal, and one Brightspeed can act on." },
  action: { kpi: "action", tone: C.brand, meaning: "Action required even without technical jeopardy." },
  jeopardy: { kpi: "jeopardy", tone: C.lilac, meaning: "Technical installation risk: a secondary signal this period." },
  bsw: { kpi: "bsw", tone: C.lilac, meaning: "Predictive BSW delay model: remains low, so build readiness is not the driver." },
};
const PREV_KEY: Record<string, string> = { noAction: "noActionPct", pending: "pendingPct", action: "actionPct", jeopardy: "jeopardyPct", bsw: "bswPct" };

export function WatchtowerPage() {
  const { model, month, state, setState, openKpi } = useApp();
  const sp = useSearchParams();
  const hot = useMemo(() => findHotspot(model, month), [model, month]);
  const fromUrl = slugToState(sp.get("state") ?? "", model.states);
  useEffect(() => {
    if (fromUrl) setState(fromUrl);
  }, [fromUrl, setState]);
  const scope = state && model.states.includes(state) ? state : null;
  // The story follows the state filter; without one it tells the focus state's story.
  const storyState = scope ?? hot?.state ?? model.states[0] ?? null;

  const sig = watchSignals(model, month, scope);
  const pm = prevMonth(model, month);
  const prev = pm ? getSnapshot(model, pm, scope) : null;
  const strongest = [...sig].filter((s) => s.actionable && s.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const flagged = sig.filter((s) => s.actionable).reduce((a, s) => a + (s.pct ?? 0), 0);
  const cancels = getSnapshot(model, month, scope).cancels;
  const where = scope ?? "the portfolio";

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow={`Watchtower · ${monthLabel(month)} · ${scope ?? "Portfolio"}`}
        title="Could we see the cancellation coming?"
        sub="The Watchtower state of each order before it cancelled, read as an early warning story. This is the insights interpretation layer, not a replica of Watchtower."
        right={scope ? <button onClick={() => setState(null)} className="rounded-full border border-line bg-card px-4 py-2 text-[12.5px] font-semibold text-mute shadow-card hover:border-ink hover:text-ink">Show portfolio</button> : undefined}
      />
      <PageInsights page="watchtower" scope={scope} />

      {!sig.some((s) => s.pct !== null) ? (
        <Card className="p-8 text-center text-sm text-mute">Watchtower signal data is not available for {where} in {monthLabel(month)}. Select the latest month or clear the state filter.</Card>
      ) : (
        <>
          {/* 1 · headline */}
          <Card className="warm-wash grid overflow-hidden md:grid-cols-[1fr_1.4fr]">
            <div className="flex flex-wrap items-center gap-6 p-6 sm:p-8">
              <Donut
                size={190}
                thickness={24}
                data={sig.filter((x) => x.pct !== null).map((x) => ({ name: x.label, value: x.pct as number, color: x.id === "noAction" ? "var(--color-line)" : x.id === strongest?.id ? "var(--color-bad)" : SIGNAL_META[x.id].tone, detail: fmtInt(x.count) }))}
                center={<div><div className="num-display text-[40px] leading-none">{fmtPct0(flagged)}</div><div className="mt-1 text-[10.5px] font-medium text-mute">flagged early</div></div>}
              />
              <div className="min-w-[180px] flex-1">
                <div className="eyebrow">Visible before cancellation</div>
                <div className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{fmtPct0(flagged)} of {monthName(month)} cancellations in {where} carried a Watchtower warning{cancels ? `: approximately ${fmtInt(Math.round(flagged * cancels))} of ${fmtInt(cancels)} orders` : ""}.</div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
              <div className="flex items-center gap-2"><span className="bs-gradient grid size-8 place-items-center rounded-lg text-[#111]"><Radar className="size-4" /></span><span className="eyebrow">What the signals say</span></div>
              {strongest && (
                <p className="text-[15px] leading-relaxed text-ink-2">
                  <strong className="text-ink">{strongest.label}</strong> is the leading signal at <strong className="text-ink">{fmtPct0(strongest.pct)}</strong>
                  {prev?.[PREV_KEY[strongest.id]] != null && strongest.pct !== null ? <> ({fmtPp(strongest.pct - (prev[PREV_KEY[strongest.id]] as number))} versus {pm ? monthName(pm) : "previous period"})</> : null}.
                  {pendingLevel(model, month, scope).elevated
                    ? <> Customer contact warnings are materially stronger than technical or BSW risk, so most of what was visible in advance was a <em>customer engagement</em> issue that proactive outreach can address.</>
                    : <> That is in line with its usual level of {fmtPct0(pendingLevel(model, month, scope).normal)}, so there is no customer engagement problem to fix here.</>}
                </p>
              )}
              <p className="text-xs text-soft">Signals describe orders that later cancelled; they indicate visibility, not proven preventability.</p>
            </div>
          </Card>

          {/* 2 · signals */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <h3 className="text-[17px] font-semibold tracking-tight">Watchtower state before cancellation</h3>
              <span className="text-xs text-mute">Select a signal for its trend and state breakdown</span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {sig.map((s, i) => {
                const meta = SIGNAL_META[s.id];
                const key = strongest?.id === s.id;
                const pv = prev ? prev[PREV_KEY[s.id]] : null;
                const d = s.pct !== null && pv !== null && pv !== undefined ? s.pct - pv : null;
                const t = d === null || Math.abs(d) < 0.005 ? "neutral" : s.actionable ? (d > 0 ? "bad" : "good") : d > 0 ? "good" : "bad";
                return (
                  <button
                    key={s.id}
                    disabled={!meta.kpi}
                    onClick={() => meta.kpi && openKpi(meta.kpi, "signals", scope)}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className={cn(
                      "relative flex h-full animate-rise flex-col overflow-hidden rounded-[22px] border p-5 text-left shadow-card transition",
                      meta.kpi && "hover:-translate-y-0.5 hover:shadow-pop",
                      key ? "border-panel bg-panel text-white" : "border-line bg-card",
                    )}
                  >
                    {key && <div className="glow pointer-events-none absolute -right-12 -top-12 size-40" />}
                    <div className="relative flex min-h-[32px] items-start justify-between gap-2">
                      <div className={cn("text-[12px] font-semibold leading-tight", key ? "text-white/70" : "text-mute")}>{s.label}</div>
                      {key && <Badge tone="brand" className="!px-1.5 !py-0 text-[9.5px]">LEADING</Badge>}
                    </div>
                    <div className="num-display relative mt-2 text-[40px] leading-none">{fmtPct0(s.pct)}</div>
                    <div className={cn("relative mt-2 text-xs", key ? "text-white/60" : "text-mute")}>
                      {s.count !== null ? `${fmtInt(s.count)} cancellations` : "n/a"}
                      {d !== null && Math.abs(d) >= 0.005 && <span className={cn("ml-2 font-bold", t === "bad" ? "text-bad" : t === "good" ? "text-good" : "")}>{fmtPp(d)}</span>}
                    </div>
                    <div className={cn("relative mt-4 h-1.5 overflow-hidden rounded-full", key ? "bg-white/15" : "bg-line-2")}>
                      <div className="h-full rounded-full" style={{ width: `${(s.pct ?? 0) * 100}%`, background: key ? C.brand : meta.tone }} />
                    </div>
                    <p className={cn("relative mt-3 text-[12px] leading-snug", key ? "text-white/60" : "text-mute")}>{meta.meaning}</p>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {(!scope || scope === model.story.focusState) && <WatchtowerAgencies />}

      {/* 3 · story */}
      {storyState && <SignalStory storyState={storyState} onChange={(s) => setState(s)} />}

      <Card className="flex flex-wrap items-center justify-between gap-4 bg-panel p-6 text-white">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">From signal to action</div>
          <div className="mt-1 text-[18px] font-semibold">The warning was visible. The next step is to act on it.</div>
        </div>
        <Link href={`/actions?month=${month}`} className="bs-gradient group inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-[#111] transition-transform duration-300 hover:-translate-y-0.5">
          What should we do next? <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Card>

      {/* 4 · by state */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
          <div className="text-[15px] font-semibold">Signals by state · {model.watchMonth ? monthLabel(model.watchMonth) : ""}</div>
          <span className="text-xs text-mute">Select a state to tell its story</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-right text-[11px] uppercase tracking-wider text-mute">
                <th className="px-6 py-2.5 text-left font-semibold">State</th><th className="font-semibold">No action</th><th className="font-semibold">Pending contact</th><th className="font-semibold">Action needed</th><th className="font-semibold">In jeopardy</th><th className="font-semibold">BSW delay</th><th className="px-6 text-left font-semibold">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {model.watchtower.map((w) => {
                const isHot = w.state === hot?.state && (w.pendingPct ?? 0) >= 0.35;
                const on = !w.isPortfolio && w.state === storyState;
                return (
                  <tr key={w.state} onClick={() => setState(w.isPortfolio ? null : w.state)} className={cn("cursor-pointer border-t border-line-2 text-right transition hover:bg-subtle", w.isPortfolio && "bg-subtle font-semibold", isHot && "bg-bad-soft", on && "outline outline-2 -outline-offset-2 outline-brand")}>
                    <td className="px-6 py-2.5 text-left font-semibold">{w.state}</td>
                    <td className="num">{fmtPct0(w.noActionPct)}</td>
                    <td className={cn("num font-semibold", isHot && "text-bad")}>{fmtPct0(w.pendingPct)}</td>
                    <td className="num">{fmtPct0(w.actionPct)}</td>
                    <td className="num">{fmtPct0(w.jeopardyPct)}</td>
                    <td className="num">{fmtPct0(w.bswPct)}</td>
                    <td className="px-6 text-left text-xs text-mute">{w.interpretation ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ warning → cancellation story
function SignalStory({ storyState, onChange }: { storyState: string; onChange: (s: string) => void }) {
  const { model, month } = useApp();
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [storyState]);
  const s = getSnapshot(model, month, storyState);
  const port = getSnapshot(model, month, null);
  const rs = reasonStats(model, month, storyState);
  const late = rs.filter((r) => r.lateStage);
  const lateCount = late.reduce((a, r) => a + (r.count ?? 0), 0);
  const lateShare = s.custMiss ? lateCount / s.custMiss : null;
  const portLate = reasonStats(model, month, null).filter((r) => r.lateStage).reduce((a, r) => a + (r.count ?? 0), 0);
  const portLateShare = port.custMiss ? portLate / port.custMiss : null;

  const nodes: { title: string; big: string; sub: string; pct: number | null; bench: string; detail: ReactNode; cta?: ReactNode }[] = [
    {
      title: "Warning signal", big: fmtPct0(s.pendingPct), sub: "Pending Customer Contact", pct: s.pendingPct, bench: `Portfolio ${fmtPct0(port.pendingPct)}`,
      detail: <>Before cancelling, <strong>{fmtPct0(s.pendingPct)}</strong> of {storyState} orders were in <strong>Pending Customer Contact</strong>. The risk was visible in Watchtower, but no proactive customer outreach followed.</>,
      cta: <LinkButton href={`/actions?month=${month}#confirm`} variant="primary" size="sm">Appointment confirmation action</LinkButton>,
    },
    {
      title: "Timing", big: fmtPct0(s.postPct), sub: "Cancelled after ODD", pct: s.postPct, bench: `Portfolio ${fmtPct0(port.postPct)}`,
      detail: <>The customer was still unconfirmed when the Original Due Date passed: <strong>{fmtPct0(s.postPct)}</strong> of cancellations occurred after ODD ({fmtInt(s.postCancels)} orders).</>,
      cta: <LinkButton href={`/cancellations?tab=timing&month=${month}`} size="sm">Review timing</LinkButton>,
    },
    {
      title: "Classification", big: fmtPct0(s.custPct), sub: "Customer Miss", pct: s.custPct, bench: `Portfolio ${fmtPct0(port.custPct)}`,
      detail: <><strong>{fmtPct0(s.custPct)}</strong> are classified as <strong>Customer Miss</strong> ({fmtInt(s.custMiss)} orders) against Company Miss of {fmtPct0(s.coPct)}: the order is lost at the customer, not in the network.</>,
      cta: <LinkButton href={`/cancellations?tab=class&month=${month}`} size="sm">Review classification</LinkButton>,
    },
    {
      title: "Reason", big: fmtPct0(lateShare), sub: "No Access, Reschedule, Tech on Job", pct: lateShare, bench: `Portfolio ${fmtPct0(portLateShare)}`,
      detail: <>{fmtInt(lateCount)} Customer Miss cancellations are <strong>{late.map((r) => r.label).join(", ")}</strong>: late stage appointment readiness failures.</>,
      cta: <LinkButton href={`/cancellations?tab=miss&month=${month}&state=${stateSlug(storyState)}`} size="sm">Review Customer Miss</LinkButton>,
    },
    {
      title: "Outcome", big: fmtInt(s.cancels), sub: `Cancellations · ${fmtPct(s.cancelRate)} rate`, pct: s.cancelRate !== null && port.cancelRate ? Math.min(1, s.cancelRate / (port.cancelRate * 1.6)) : null, bench: `Portfolio rate ${fmtPct(port.cancelRate)}`,
      detail: <>The result: <strong>{fmtInt(s.cancels)}</strong> cancellations in {monthLabel(month)} at a <strong>{fmtPct(s.cancelRate)}</strong> cancel rate. Each earlier stage was an opportunity to intervene.</>,
      cta: <LinkButton href={`/actions?month=${month}`} variant="primary" size="sm">View recommended actions</LinkButton>,
    },
  ];

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow="Warning signal to final cancellation" title={`How a warning becomes a cancellation in ${storyState}`} sub="Five stages, each shown as a share of the state’s cancellations with the portfolio benchmark. Select a stage to read what it means." />
        <label className="flex items-center gap-2 text-[12px] font-semibold text-mute">
          State
          <select value={storyState} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-full border border-line bg-card px-3.5 text-[13px] font-semibold text-ink outline-none hover:border-ink">
            {model.states.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>

      <ol className="grid gap-3 lg:grid-cols-5">
        {nodes.map((n, i) => (
          <li key={n.title} className="relative">
            <button
              onClick={() => setActive(i)}
              aria-current={active === i}
              className={cn(
                "flex h-full w-full flex-col rounded-[22px] border p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop",
                active === i ? "border-panel bg-panel text-white" : "border-line bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("grid size-6 place-items-center rounded-full text-[11px] font-bold", active === i ? "bs-gradient text-[#111]" : "bg-line-2 text-mute")}>{i + 1}</span>
                <span className={cn("text-[11px] font-bold uppercase tracking-wider", active === i ? "text-brand" : "text-mute")}>{n.title}</span>
              </div>
              <div className="num-display mt-3 text-[32px] leading-none">{n.big}</div>
              <div className={cn("mt-1.5 min-h-[34px] text-[12px] leading-snug", active === i ? "text-white/65" : "text-mute")}>{n.sub}</div>
              <div className={cn("mt-auto h-1.5 overflow-hidden rounded-full", active === i ? "bg-white/15" : "bg-line-2")}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (n.pct ?? 0) * 100)}%`, background: i === 0 ? C.orange : active === i ? C.brand : C.indigo }} />
              </div>
              <div className={cn("mt-2 text-[11px]", active === i ? "text-white/50" : "text-soft")}>{n.bench}</div>
            </button>
            {i < nodes.length - 1 && (
              <span className="absolute -right-[13px] top-1/2 z-10 hidden size-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-card text-mute shadow-card lg:grid" aria-hidden>
                <ChevronRight className="size-3.5" />
              </span>
            )}
          </li>
        ))}
      </ol>

      <Card className="mt-5 animate-rise p-5 sm:p-6" key={`${active}-${storyState}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex max-w-3xl gap-3">
            <span className="bs-gradient grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-[#111]">{active + 1}</span>
            <div className="text-[15px] leading-relaxed text-ink-2">{nodes[active].detail}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {nodes[active].cta}
            {active < nodes.length - 1 && <button onClick={() => setActive(active + 1)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold transition hover:border-ink">Next stage <ArrowRight className="size-3.5" /></button>}
          </div>
        </div>
      </Card>
    </section>
  );
}
