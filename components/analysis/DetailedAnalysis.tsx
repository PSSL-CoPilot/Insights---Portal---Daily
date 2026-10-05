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
import { useSelection } from "./useSelection";
import { buildSelectionNarrative } from "@/lib/story/analysis";
import { storyFacts } from "@/lib/story/facts";
import { AGENCY_GAP_THRESHOLD, chScope } from "@/lib/data/metrics";
import type { Selection } from "@/lib/story/links";
import { fmtInt, fmtPct, fmtPct0, monthLabel, monthName } from "@/lib/format";

const ease = [0.2, 0.8, 0.2, 1] as const;

/**
 * Detailed Analysis: one page from portfolio down to the individual representative. Insights sit
 * on top and every entity in them (state, channel, agency, representative) filters this page in
 * place; the matching detail appears underneath. No step by step reveal.
 */
export function DetailedAnalysis() {
  const { model, month } = useApp();
  const { sel, select, agency, rep } = useSelection();
  const points = useMemo(() => buildSelectionNarrative(model, month, sel), [model, month, sel.state, sel.channel, sel.agency, sel.rep]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewKey = `${sel.state}|${sel.channel}|${sel.agency}|${sel.rep}|${month}`;
  // A new selection brings the insights back into view.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [viewKey]);
  const label = rep ? `${rep.id} · ${rep.agency}` : agency ? `${agency.agency} · ${agency.channel}` : [sel.state, sel.channel].filter(Boolean).join(" · ") || "All states, channels and agencies";

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow={`Detailed Analysis · ${monthLabel(month)}`}
        title={rep ? `Representative ${rep.id}` : agency ? agency.agency : sel.state && sel.channel ? `${sel.state} · ${sel.channel}` : sel.state ?? sel.channel ?? "What is happening, and where?"}
        sub="Start with the insights. Select any state, channel, agency or representative (in the insights or the filters) to focus the whole page."
      />

      <NarrativeBlock points={points} resetKey={viewKey} eyebrow={label} />

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

function Detail({ sel, select }: { sel: Selection; select: (s: Partial<Selection>) => void }) {
  const { model, month } = useApp();
  const st = model.story;
  const rep = sel.rep ? st.reps.find((r) => r.id === sel.rep) : null;
  const agency = sel.agency ? st.agencies.find((a) => a.agency === sel.agency) : null;
  if (rep) return <RepDetail rep={rep} select={select} />;
  if (agency) return <AgencyDetail agency={agency} select={select} />;
  if (sel.state && sel.channel) return <PairDetail state={sel.state} channel={sel.channel} select={select} />;
  const open = (k: "state" | "channel", name: string) => select(k === "state" ? { state: name } : { channel: name });
  if (sel.state) {
    return (
      <>
        <SectionHead title={`${sel.state} in detail`} sub="Every measure for the selected state, side by side." />
        <StateDrilldown scope={sel.state} />
        {st.focusState === sel.state && <AgencyTable agencies={st.agencies} select={select} />}
      </>
    );
  }
  if (sel.channel) {
    const ag = st.agencies.filter((a) => a.channel === sel.channel);
    return (
      <>
        <SectionHead title={`${sel.channel} in detail`} sub="Every measure for the selected channel, side by side." />
        <StateDrilldown scope={chScope(sel.channel)} />
        {ag.length > 0 && <AgencyTable agencies={ag} select={select} title={`${st.focusState ?? ""} ${sel.channel} agencies`} />}
      </>
    );
  }
  return (
    <>
      <PlanSection kind="state" open={open} />
      <PlanSection kind="channel" open={open} />
      <StateChannelMatrix onState={(s) => select({ state: s })} onChannel={(c) => select({ channel: c })} />
      <AgencyTable agencies={st.agencies} select={select} />
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
function PairDetail({ state, channel, select }: { state: string; channel: string; select: (s: Partial<Selection>) => void }) {
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
        {fc ? <Tile label={`${model.story.forecastMonth ? monthName(model.story.forecastMonth) : "Next month"} outlook`} value={fmtPct(fc.rate)} sub={<>no action · baseline {fmtPct(fc.baseline)}</>} tone="bad" /> : <Tile label="Pending contact" value={fmtPct0(row.pendingPct)} />}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`${channel} in every state`} sub="Select a state to compare">
          <RankedBars dense max={max} rows={sameChannel.map((r) => ({ id: r.state, label: r.state, sub: `${fmtInt(r.cancels)} of ${fmtInt(r.sales)} sales`, value: r.cancelRate, valueLabel: fmtPct(r.cancelRate), color: r.state === state ? C.bad : C.slate, emphasis: r.state === state, onClick: () => select({ state: r.state, channel }) }))} />
        </Panel>
        <Panel title={`Every channel in ${state}`} sub="Select a channel to compare">
          <RankedBars dense max={max} rows={sameState.map((r) => ({ id: r.channel, label: <span className="flex items-center gap-2"><ChannelIcon channel={r.channel} className="size-3.5 text-mute" />{r.channel}</span>, sub: `${fmtInt(r.cancels)} of ${fmtInt(r.sales)} sales`, value: r.cancelRate, valueLabel: fmtPct(r.cancelRate), color: r.channel === channel ? C.bad : C.slate, emphasis: r.channel === channel, onClick: () => select({ state, channel: r.channel }) }))} />
        </Panel>
      </div>
      {ag.length > 0 && <AgencyTable agencies={ag} select={select} title={`${state} ${channel} agencies`} />}
    </>
  );
}

// ------------------------------------------------------------------ filters
function FilterBar({ sel, select }: { sel: Selection; select: (s: Partial<Selection>) => void }) {
  const { model, month } = useApp();
  const f = storyFacts(model, month);
  const st = model.story;
  const agencies = [...st.agencies].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  const reps = sel.agency ? st.reps.filter((r) => r.agency === sel.agency).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)) : [];
  const crumbs: { key: keyof Selection; label: string; icon: typeof MapPin; clear: Partial<Selection> }[] = [];
  if (sel.state) crumbs.push({ key: "state", label: sel.state, icon: MapPin, clear: { state: null } });
  if (sel.channel) crumbs.push({ key: "channel", label: sel.channel, icon: Network, clear: { channel: null } });
  if (sel.agency) crumbs.push({ key: "agency", label: sel.agency, icon: Building2, clear: { agency: null } });
  if (sel.rep) crumbs.push({ key: "rep", label: sel.rep, icon: UserRound, clear: { rep: null } });

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => select({ state: null, channel: null, agency: null, rep: null })} className={cn("flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition", crumbs.length ? "bg-subtle text-mute hover:text-ink" : "bg-panel text-white")}>
          <Layers className="size-3.5" /> All
        </button>
        {crumbs.map((c) => (
          <span key={c.key} className="flex items-center gap-2">
            <ChevronRight className="size-3.5 text-soft" />
            <span className="flex h-9 items-center gap-1.5 rounded-full bg-panel pl-3.5 pr-1.5 text-[12.5px] font-semibold text-white">
              <c.icon className="size-3.5 text-brand" />{c.label}
              <button onClick={() => select(c.clear)} aria-label={`Clear ${c.label}`} className="grid size-6 place-items-center rounded-full transition hover:bg-white/15"><X className="size-3" /></button>
            </span>
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2.5 border-t border-line-2 pt-4">
        <Row label="State">
          {model.states.map((s) => (
            <Chip key={s} on={sel.state === s} onClick={() => select({ state: sel.state === s ? null : s })} dot={f.focus?.state === s}>{s}</Chip>
          ))}
        </Row>
        <Row label="Channel">
          {model.channelNames.map((c) => (
            <Chip key={c} on={sel.channel === c} onClick={() => select({ channel: sel.channel === c ? null : c })} dot={f.outlierChannels.some((x) => x.channel === c)}>
              <ChannelIcon channel={c} className="size-3.5" />{c}
            </Chip>
          ))}
        </Row>
        {agencies.length > 0 && (
          <Row label="Agency">
            {agencies.map((a) => (
              <Chip key={a.agency} on={sel.agency === a.agency} onClick={() => select({ agency: sel.agency === a.agency ? null : a.agency })} dot={(a.gap ?? 0) >= AGENCY_GAP_THRESHOLD}>{a.agency}</Chip>
            ))}
          </Row>
        )}
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
                {reps.map((r) => <option key={r.id} value={r.id}>{r.id} · {fmtPct(r.rate)} · {r.band}</option>)}
              </select>
              <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-mute" />
            </label>
          </Row>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-mute"><span className="size-1.5 rounded-full bg-bad" /> Outside its normal range in {monthName(month)}{st.focusState ? ` · Agencies and representatives are recorded for ${st.focusState}` : ""}</div>
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
