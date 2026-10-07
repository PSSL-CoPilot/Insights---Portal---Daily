"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, ChevronRight, Layers, MapPin, Network, UserRound, X } from "lucide-react";
import { useApp } from "../AppContext";
import { Card, cn, SectionTitle } from "../ui/primitives";
import { NarrativeBlock } from "../story/NarrativeList";
import { ChannelIcon } from "../story/ChannelIcon";
import { PlanSection, StateChannelMatrix } from "../drilldown/PlanOverview";
import { StateDrilldown } from "../drilldown/StateDrilldown";
import { RankedBars } from "../charts/RankedBars";
import { C } from "../charts/shared";
import { AgencyDetail, AgencyTable, Panel, RepDetail, Tile } from "./AgencyViews";
import { RepRanking } from "./charts";
import { availableAgencies, useSelection } from "./useSelection";
import { buildSelectionNarrative, selectionLabel, selectionScope } from "@/lib/story/analysis";
import { storyFacts } from "@/lib/story/facts";
import { AGENCY_GAP_THRESHOLD, chScope, getSnapshot, prevMonth } from "@/lib/data/metrics";
import { forecast, hz, parseSel } from "@/lib/data/daily";
import type { Selection, SelectionPatch } from "@/lib/story/links";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthLabel, monthName } from "@/lib/format";

const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * Detailed Analysis: one page from portfolio down to the individual representative. Insights sit
 * on top and every entity in them (state, channel, agency, representative) filters this page in
 * place; the matching detail appears underneath. No step by step reveal.
 */
export function DetailedAnalysis() {
  const { model, month } = useApp();
  const { sel, select, rep } = useSelection();
  const points = useMemo(() => buildSelectionNarrative(model, month, sel), [model, month, sel]);
  const viewKey = `${sel.states}|${sel.channels}|${sel.agencies}|${sel.rep}|${month}`;
  // A new selection brings the insights back into view.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [viewKey]);
  const label = selectionLabel(model, sel);

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow={`Detailed Analysis · ${monthLabel(month)}`}
        title={rep ? `Representative ${rep.id}` : label || "What is happening, and where?"}
        sub={label ? `${label} · every number, chart and insight below is for this selection and ${monthLabel(month)}.` : "Start with the insights. Select any states, channels, agencies or a representative (in the insights or the filters) to focus the whole page."}
      />

      <NarrativeBlock points={points} resetKey={viewKey} eyebrow={label || "All states, channels and agencies"} />

      <FilterBar sel={sel} select={select} />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={viewKey}
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.2 } }}
          transition={{ duration: 0.5, ease }}
          className="space-y-6"
        >
          <Detail sel={sel} select={select} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** The detail under the insights for a selection; also shown in the story player's dialog. */
export function Detail({ sel, select }: { sel: Selection; select: (s: SelectionPatch) => void }) {
  const { model } = useApp();
  const st = model.story;
  const { states: S, channels: C, agencies: A } = sel;
  const rep = sel.rep ? st.reps.find((r) => r.id === sel.rep) : null;
  if (rep) return <RepDetail rep={rep} select={select} />;
  const agency = A.length === 1 ? st.agencies.find((a) => a.agency === A[0]) : null;
  if (agency) return <AgencyDetail agency={agency} select={select} />;
  const open = (k: "state" | "channel", name: string) => select(k === "state" ? { states: [name] } : { channels: [name] });
  if (!S.length && !C.length && !A.length) {
    return (
      <>
        <PlanSection kind="state" open={open} />
        <PlanSection kind="channel" open={open} />
        <StateChannelMatrix onState={(s) => select({ states: [s] })} onChannel={(c) => select({ channels: [c] })} />
        <AgencyTable agencies={st.agencies} select={select} />
      </>
    );
  }
  if (S.length === 1 && !C.length && !A.length) {
    return (
      <>
        <SectionHead title={`${S[0]} in detail`} sub="Every measure for the selected state, side by side." />
        <StateDrilldown scope={S[0]} />
        {st.focusState === S[0] && <AgencyTable agencies={st.agencies} select={select} />}
      </>
    );
  }
  if (!S.length && C.length === 1 && !A.length) {
    const ag = st.agencies.filter((a) => a.channel === C[0]);
    return (
      <>
        <SectionHead title={`${C[0]} in detail`} sub="Every measure for the selected channel, side by side." />
        <StateDrilldown scope={chScope(C[0])} />
        {ag.length > 0 && <AgencyTable agencies={ag} select={select} title={`${st.focusState ?? ""} ${C[0]} agencies`} />}
      </>
    );
  }
  if (S.length === 1 && C.length === 1 && !A.length) return <PairDetail state={S[0]} channel={C[0]} select={select} />;
  return <ComboDetail sel={sel} select={select} />;
}

/** Any other combination: measures for exactly this selection, the cells or agencies inside it and its representatives. */
function ComboDetail({ sel, select }: { sel: Selection; select: (s: SelectionPatch) => void }) {
  const { model, month } = useApp();
  const scope = selectionScope(model, sel)!;
  const pm = prevMonth(model, month);
  const cur = getSnapshot(model, month, scope), prev = pm ? getSnapshot(model, pm, scope) : null;
  const fc = model.daily ? forecast(model, hz(model), parseSel(scope)) : null;
  const { states: S, channels: CH, agencies: A } = sel;
  const cells = A.length ? [] : model.stateChannel.filter((r) => (!S.length || S.includes(r.state)) && (!CH.length || CH.includes(r.channel))).sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0));
  const ags = availableAgencies(model, sel).filter((a) => !A.length || A.includes(a.agency));
  const reps = A.length ? model.story.reps.filter((r) => A.includes(r.agency) && (r.sales ?? 0) > 0) : [];
  const dRate = cur.cancelRate !== null && prev?.cancelRate != null ? cur.cancelRate - prev.cancelRate : null;
  const rel = (a: number | null, b: number | null | undefined) => (a !== null && b ? a / b - 1 : null);
  const max = Math.max(0.01, ...cells.map((r) => r.cancelRate ?? 0)) * 1.05;
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Unique Sales" value={fmtInt(cur.sales)} sub={<>{fmtSignedPct(rel(cur.sales, prev?.sales))} vs prior period</>} />
        <Tile label="Cancellations" value={fmtInt(cur.cancels)} sub={<>{fmtSignedPct(rel(cur.cancels, prev?.cancels))} vs prior period</>} tone={(rel(cur.cancels, prev?.cancels) ?? 0) > 0.02 ? "bad" : "neutral"} />
        <Tile label="Cancel rate" value={fmtPct(cur.cancelRate)} sub={<>{dRate === null ? "n/a" : fmtPp(dRate)} vs prior period</>} tone={(cur.cancelRate ?? 0) > 0.2 ? "bad" : "neutral"} />
        <Tile label="Post ODD" value={fmtPct0(cur.postPct)} sub={<>Customer Miss {fmtPct0(cur.custPct)}</>} />
        <Tile label="Pending contact" value={fmtPct0(cur.pendingPct)} sub="share of cancellations" />
        {fc && <Tile label={`Next ${hz(model)} days`} value={fmtPct(fc.rateNo)} sub={<>no action · {fmtPct(fc.rateWith)} with action</>} tone={(fc.rateNo ?? 0) > 0.2 ? "bad" : "neutral"} />}
      </div>
      {cells.length > 1 && (
        <Panel title="Cells in this selection" sub="State and channel cells, by cancel rate. Select one to focus on it.">
          <RankedBars dense max={max} rows={cells.map((r) => ({
            id: `${r.state}|${r.channel}`, label: <span className="flex items-center gap-2"><ChannelIcon channel={r.channel} className="size-3.5 text-mute" />{r.state} · {r.channel}</span>,
            sub: `${fmtInt(r.cancels)} of ${fmtInt(r.sales)} sales`, value: r.cancelRate, valueLabel: fmtPct(r.cancelRate),
            color: (r.cancelRate ?? 0) > 0.25 ? C.bad : C.slate, emphasis: (r.cancelRate ?? 0) > 0.25, onClick: () => select({ states: [r.state], channels: [r.channel] }),
          }))} />
        </Panel>
      )}
      {ags.length > 0 && <AgencyTable agencies={ags} select={select} title="Agencies in this selection" />}
      {reps.length > 0 && (
        <Panel title="Representatives in the selected agencies" sub="By cancel rate for the selected dates. Select a representative for their signals.">
          <RepRanking reps={reps} onSelect={(id) => select({ rep: id })} limit={16} />
        </Panel>
      )}
      <SectionHead title="Every measure for this selection" sub="Lifecycle, classification and Watchtower mixes are recorded by state and applied in proportion to this selection's cancellations." />
      <StateDrilldown scope={scope} />
    </>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h3 className="text-[20px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-0.5 text-[13px] text-mute">{sub}</p>
    </div>
  );
}

/** One state and one channel together (published for the latest month). */
function PairDetail({ state, channel, select }: { state: string; channel: string; select: (s: SelectionPatch) => void }) {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const row = month === model.drillMonth ? model.stateChannel.find((r) => r.state === state && r.channel === channel) : undefined;
  const sameChannel = model.stateChannel.filter((r) => r.channel === channel).sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0));
  const sameState = model.stateChannel.filter((r) => r.state === state).sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0));
  const ag = model.story.focusState === state ? model.story.agencies.filter((a) => a.channel === channel) : [];
  const fc = model.story.focusState === state ? model.story.forecastChannels.find((r) => !r.isTotal && r.channel === channel) : null;
  const max = Math.max(...model.stateChannel.map((r) => r.cancelRate ?? 0)) * 1.05;
  if (!row) {
    return <Card className="p-8 text-center text-[13.5px] text-mute">The state by channel view is published for {model.drillMonth ? monthLabel(model.drillMonth) : "the latest month"} only. Select that month to see {state} {channel}.</Card>;
  }
  const bad = (row.cancelRate ?? 0) > (f.port.cancelRate ?? 1) + 0.05;
  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Unique Sales" value={fmtInt(row.sales)} />
        <Tile label="Installs" value={fmtInt(row.installs)} />
        <Tile label="Cancellations" value={fmtInt(row.cancels)} tone={bad ? "bad" : "neutral"} />
        <Tile label="Cancel rate" value={fmtPct(row.cancelRate)} sub={<>portfolio {fmtPct(f.port.cancelRate)}</>} tone={bad ? "bad" : "neutral"} />
        <Tile label="Post ODD" value={fmtPct0(row.postPct)} sub={<>Customer Miss {fmtPct0(row.custPct)}</>} />
        {fc ? <Tile label={`Next ${hz(model)} days`} value={fmtPct(fc.rate)} sub={<>no action · baseline {fmtPct(fc.baseline)}</>} tone="bad" /> : <Tile label="Pending contact" value={fmtPct0(row.pendingPct)} />}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`${channel} in every state`} sub="Select a state to compare">
          <RankedBars dense max={max} rows={sameChannel.map((r) => ({ id: r.state, label: r.state, sub: `${fmtInt(r.cancels)} of ${fmtInt(r.sales)} sales`, value: r.cancelRate, valueLabel: fmtPct(r.cancelRate), color: r.state === state ? C.bad : C.slate, emphasis: r.state === state, onClick: () => select({ states: [r.state], channels: [channel] }) }))} />
        </Panel>
        <Panel title={`Every channel in ${state}`} sub="Select a channel to compare">
          <RankedBars dense max={max} rows={sameState.map((r) => ({ id: r.channel, label: <span className="flex items-center gap-2"><ChannelIcon channel={r.channel} className="size-3.5 text-mute" />{r.channel}</span>, sub: `${fmtInt(r.cancels)} of ${fmtInt(r.sales)} sales`, value: r.cancelRate, valueLabel: fmtPct(r.cancelRate), color: r.channel === channel ? C.bad : C.slate, emphasis: r.channel === channel, onClick: () => select({ states: [state], channels: [r.channel] }) }))} />
        </Panel>
      </div>
      {ag.length > 0 && <AgencyTable agencies={ag} select={select} title={`${state} ${channel} agencies`} />}
    </>
  );
}

// ------------------------------------------------------------------ filters
/** Multi-select filters. Agencies cascade: only those that belong to the selected states and channels are offered. */
function FilterBar({ sel, select }: { sel: Selection; select: (s: SelectionPatch) => void }) {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const st = model.story;
  const agencies = availableAgencies(model, sel).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  const reps = sel.agencies.length ? st.reps.filter((r) => sel.agencies.includes(r.agency) && (r.sales ?? 0) > 0).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)) : [];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const crumbs: { label: string; icon: typeof MapPin; clear: SelectionPatch }[] = [
    ...sel.states.map((s) => ({ label: s, icon: MapPin, clear: { states: sel.states.filter((x) => x !== s) } })),
    ...sel.channels.map((c) => ({ label: c, icon: Network, clear: { channels: sel.channels.filter((x) => x !== c) } })),
    ...sel.agencies.map((a) => ({ label: a, icon: Building2, clear: { agencies: sel.agencies.filter((x) => x !== a) } })),
    ...(sel.rep ? [{ label: sel.rep, icon: UserRound, clear: { rep: null } }] : []),
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => select({ states: [], channels: [], agencies: [], rep: null })} className={cn("flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition", crumbs.length ? "border border-line bg-card text-mute hover:text-ink" : "bg-panel text-white")}>
          <Layers className="size-3.5" /> All
        </button>
        {crumbs.map((c) => (
          <span key={c.label} className="flex items-center gap-2">
            <ChevronRight className="size-3.5 text-soft" />
            <span className="flex h-9 items-center gap-1.5 rounded-full bg-panel pl-3.5 pr-1.5 text-[12.5px] font-semibold text-white">
              <c.icon className="size-3.5 text-brand" />{c.label}
              <button onClick={() => select(c.clear)} aria-label={`Clear ${c.label}`} className="grid size-6 place-items-center rounded-full transition hover:bg-white/15"><X className="size-3" /></button>
            </span>
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2.5 border-t border-line-2 pt-4">
        <Row label="States">
          {model.states.map((s) => (
            <Chip key={s} on={sel.states.includes(s)} onClick={() => select({ states: toggle(sel.states, s) })} dot={f.focus?.state === s}>{s}</Chip>
          ))}
        </Row>
        <Row label="Channels">
          {model.channelNames.map((c) => (
            <Chip key={c} on={sel.channels.includes(c)} onClick={() => select({ channels: toggle(sel.channels, c) })} dot={f.outlierChannels.some((x) => x.channel === c)}>
              <ChannelIcon channel={c} className="size-3.5" />{c}
            </Chip>
          ))}
        </Row>
        <Row label="Agencies">
          {agencies.length ? agencies.map((a) => (
            <Chip key={a.agency} on={sel.agencies.includes(a.agency)} onClick={() => select({ agencies: toggle(sel.agencies, a.agency), rep: null })} dot={f.weakAgencies.some((x) => x.agency === a.agency) || (!f.weakAgencies.length && (a.gap ?? 0) >= AGENCY_GAP_THRESHOLD)}>{a.agency}</Chip>
          )) : <span className="text-[12.5px] text-mute">No agencies in this selection. Agencies are recorded for {st.focusState ?? "the focus state"}.</span>}
        </Row>
        {reps.length > 0 && (
          <Row label="Representative">
            <label className="relative">
              <span className="sr-only">Representative</span>
              <select
                value={sel.rep ?? ""}
                onChange={(e) => select({ rep: e.target.value || null })}
                className="h-8 cursor-pointer appearance-none rounded-full border border-line bg-card pl-3.5 pr-8 text-[12.5px] font-semibold outline-none transition hover:border-ink"
              >
                <option value="">All {reps.length} representatives</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.agency} · {fmtPct(r.rate)} · {r.band}</option>)}
              </select>
              <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-mute" />
            </label>
          </Row>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-mute"><span className="size-1.5 rounded-full bg-bad" /> Outside its normal range in {monthName(month)} · select several states, channels or agencies to combine them</div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, dot, children }: { on: boolean; onClick: () => void; dot?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "relative flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition",
        on ? "border-panel bg-panel text-white" : "border-line bg-card text-ink-2 hover:border-ink hover:text-ink",
      )}
    >
      {children}
      {dot && <span className={cn("size-1.5 rounded-full", on ? "bg-brand" : "bg-bad")} />}
    </button>
  );
}
