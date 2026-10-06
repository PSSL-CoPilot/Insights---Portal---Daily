"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { GenieMark } from "../ui/Marks";
import { useApp } from "../AppContext";
import { Modal } from "../ui/Modal";
import { Badge, Card, cn, Delta, dirTone, RichText, Tabs } from "../ui/primitives";
import { TrendChart } from "../charts/TrendChart";
import { StateRanking, StateTable } from "../charts/StateRanking";
import { ODDTimingChart, ODD_COLORS, type OddBucket } from "../charts/ODDTimingChart";
import { CancelClassification } from "../charts/CancelClassification";
import { CustomerMissDrivers } from "../charts/CustomerMissDrivers";
import { WatchtowerSignals } from "../charts/WatchtowerSignals";
import { ChannelBreakdown } from "./ChannelBreakdown";
import { formatCompactKpi, formatKpiValue } from "./KPICard";
import {
  assess, chScope, describeTrend, getSnapshot, kpiById, kpiMeaning, prevMonth, reasonStats, scopeName, series, snapVal, watchSignals, type KpiDef,
  chartDays, periodReference,
} from "@/lib/data/metrics";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthLabel, monthName, monthShort, stateSlug } from "@/lib/format";
import { analysisHref } from "@/lib/story/links";

type TabId = "trend" | "states" | "channels" | "odd" | "class" | "drivers" | "signals";

const SIMPLE = new Set(["sales", "installs", "onTime"]);

const BASE_TABS: { id: TabId; label: string }[] = [
  { id: "trend", label: "Trend" },
  { id: "states", label: "States" },
  { id: "channels", label: "Channels" },
  { id: "odd", label: "ODD Timing" },
  { id: "class", label: "Classification" },
  { id: "drivers", label: "Drivers" },
];

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className={cn("num mt-1 text-2xl font-semibold", tone === "bad" && "text-bad", tone === "good" && "text-good")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

/** One or two line read out that closes every tab. */
function TabInsight({ text, sub }: { text: string; sub?: string | null }) {
  return (
    <Card className="flex gap-4 border-brand/60 bg-brand-soft p-5">
      <GenieMark size={36} className="shrink-0" />
      <div>
        <div className="eyebrow mb-1">Insight</div>
        <p className="text-[14.5px] leading-relaxed text-ink-2"><RichText text={text} /></p>
        {sub && <p className="mt-2 text-[13px] text-mute">{sub}</p>}
      </div>
    </Card>
  );
}

/** Leader and biggest mover for a KPI across states or channels, worded by business direction. */
function dimInsight(model: DataModel, month: MonthKey, def: KpiDef, kind: "state" | "channel"): string {
  const pm = prevMonth(model, month);
  const names = kind === "state" ? model.states : model.channelNames;
  const rows = names.map((n) => {
    const sc = kind === "state" ? n : chScope(n);
    const v = getSnapshot(model, month, sc)[def.key] ?? null;
    const p = pm ? getSnapshot(model, pm, sc)[def.key] ?? null : null;
    return { n, v, d: v !== null && p !== null ? (def.unit === "pct" ? v - p : p ? v / p - 1 : null) : null };
  }).filter((r) => r.v !== null);
  if (!rows.length) return `${def.label} is not recorded by ${kind}.`;
  const fmt = (v: number | null) => (def.unit === "pct" ? fmtPct(v) : fmtInt(v));
  const fd = (d: number | null) => (def.unit === "pct" ? fmtPp(d) : fmtSignedPct(d));
  const lead = [...rows].sort((a, b) => b.v! - a.v!)[0];
  const moved = rows.filter((r) => r.d !== null);
  if (!moved.length) return `**${lead.n}** has the highest ${def.label} at **${fmt(lead.v)}**.`;
  const up = [...moved].sort((a, b) => b.d! - a.d!)[0], down = [...moved].sort((a, b) => a.d! - b.d!)[0];
  if (def.good === "up") return `**${lead.n}** leads ${def.label} at **${fmt(lead.v)}**. Strongest growth: **${up.n}** (${fd(up.d)})${down.d! < 0 ? `; ${down.n} declined (${fd(down.d)}) and warrants attention` : "; every " + kind + " grew"}.`;
  return `**${lead.n}** has the highest ${def.label} at **${fmt(lead.v)}**. The largest increase is in **${up.n}** (${fd(up.d)})${down.d! < 0 ? `, while ${down.n} improved (${fd(down.d)})` : ""}.`;
}

export function KPIDetailModal() {
  const { kpiModal, closeKpi } = useApp();
  const def = kpiModal ? kpiById(kpiModal.id) : undefined;
  if (!kpiModal || !def) return null;
  return <ModalBody key={`${kpiModal.id}|${kpiModal.state ?? ""}`} def={def} initialTab={kpiModal.tab as TabId | undefined} initialState={kpiModal.state} onClose={closeKpi} />;
}

function ModalBody({ def, initialTab, initialState, onClose }: { def: KpiDef; initialTab?: TabId; initialState?: string | null; onClose: () => void }) {
  const { model, month, state: globalState, setMonth, setState } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(initialTab ?? "trend");
  const [focus, setFocus] = useState<string | null>(initialState !== undefined ? initialState : globalState);
  const [oddMode, setOddMode] = useState<"count" | "pct">("count");
  const [bucket, setBucket] = useState<OddBucket | null>(null);

  // Sales, installs and on time install are volume measures: cancellation timing, classification and drivers do not apply.
  const tabs = SIMPLE.has(def.id) ? BASE_TABS.slice(0, 3) : def.group === "watch" ? [...BASE_TABS, { id: "signals" as TabId, label: "Signals" }] : BASE_TABS;
  const a = useMemo(() => assess(model, def, month, focus), [model, def, month, focus]);
  const tone = dirTone(def.good, a.delta?.value);
  const snap = getSnapshot(model, month, focus);
  const value = snapVal(snap, def.key);
  const pm = prevMonth(model, month);
  const p = pm ? getSnapshot(model, pm, focus) : null;
  const pts = series(model, def.key, focus);
  const meaning = kpiMeaning(model, def, month, focus);
  const where = scopeName(focus);
  const q = `month=${month}`;

  const drill = (kind: "state" | "channel") => (name: string) => {
    onClose();
    if (kind === "state") setState(name);
    router.push(analysisHref(kind === "state" ? { state: name } : { channel: name }, month));
  };

  const crumbs = [def.label, scopeName(focus, "All states"), tabs.find((t) => t.id === tab)?.label ?? ""];
  const pp = (k: string) => (snap[k] !== null && p?.[k] != null ? (snap[k] as number) - (p[k] as number) : null);
  const reasons = reasonStats(model, month, focus && !focus.startsWith("ch:") ? focus : null);
  const fastest = [...reasons].filter((r) => r.mom !== null).sort((x, y) => (y.mom ?? 0) - (x.mom ?? 0));
  const strongest = watchSignals(model, month, focus).filter((s) => s.actionable && s.pct !== null).sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0))[0];

  return (
    <Modal
      open
      onClose={onClose}
      header={
        <div className="px-5 pb-4 pt-5 sm:px-7">
          <div className="eyebrow mb-2 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-brand" /> {def.label}: deep dive
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pr-12">
            <div className="num-display text-[44px] leading-none tracking-tight">{formatCompactKpi(def, value)}</div>
            <div className="flex items-center gap-2 pb-1">
              <Delta value={a.delta?.value ?? null} kind={a.delta?.kind ?? "rel"} tone={tone} className="!text-base" />
              <span className="text-sm text-mute">vs {pm ? monthName(pm) : "previous period"}</span>
              {a.anomaly && tone === "bad" && <Badge tone="bad">EXCEPTION · {a.multiple!.toFixed(1)}× normal move</Badge>}
            </div>
            <div className="ml-auto hidden flex-wrap items-center gap-2 pb-1 md:flex">
              <Badge>{monthLabel(month)}</Badge>
              <Badge tone={focus ? "ink" : "neutral"}>{scopeName(focus, "All states")}</Badge>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs tabs={tabs} value={tab} onChange={setTab} size="sm" />
            <div className="flex items-center gap-1 text-[12px] text-mute">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3" />}
                  <button
                    onClick={() => (i === 1 ? (setFocus(null), setTab("states")) : undefined)}
                    className={cn(i === crumbs.length - 1 ? "font-semibold text-ink" : i === 1 && focus ? "underline decoration-dotted hover:text-ink" : "")}
                  >
                    {c}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <div key={tab} className="page-enter space-y-5">
        {tab === "trend" && (
          <>
            <Card className="p-5 sm:p-6">
              <div className="mb-1">
                <div className="text-[15px] font-semibold">{def.label} · {pts.length ? `${monthShort(pts[0].month)} to ${monthShort(pts[pts.length - 1].month)}` : ""}</div>
                <div className="text-xs text-mute">{where} · select a point to look at that day</div>
              </div>
              {pts.filter((x) => x.value !== null).length < 2 ? (
                <div className="py-16 text-center text-sm text-mute">Not enough history to draw a trend for {where}.</div>
              ) : (
                <TrendChart points={pts} reference={periodReference(model, month, def.key, focus, def.unit)} unit={def.unit} color={tone === "good" ? "#12a150" : tone === "bad" ? "#d92d20" : undefined} selected={month} anomaly={a.anomaly && tone === "bad"} name={def.label} onSelectMonth={setMonth} />
              )}
            </Card>
            <div className="grid gap-4 md:grid-cols-3">
              <Stat label={`Current · ${monthShort(month)}`} value={formatKpiValue(def, value, true)} />
              <Stat label={`Previous · ${pm ? monthShort(pm) : "n/a"}`} value={formatKpiValue(def, a.delta?.previous ?? null, true)} />
              <Stat label="Change vs prior period" value={a.delta ? (a.delta.kind === "pp" ? fmtPp(a.delta.value) : fmtSignedPct(a.delta.value)) : "n/a"} tone={tone === "neutral" ? undefined : tone} sub={a.baseline !== null ? `Typical move ≈ ${def.unit === "pct" ? fmtPp(a.baseline) : fmtSignedPct(a.baseline)}` : undefined} />
            </div>
            <TabInsight text={describeTrend(model, def, month, focus)} sub={meaning} />
          </>
        )}

        {tab === "states" && (
          <>
            <div className="grid gap-5">
              <Card className="p-5">
                <div className="mb-3">
                  <div className="text-[15px] font-semibold">{def.label} by state · {monthLabel(month)}</div>
                  <div className="text-xs text-mute">Select a state to focus this deep dive on it.</div>
                </div>
                <StateRanking model={model} month={month} def={def} selectedState={focus} onSelect={(s) => setFocus(focus === s ? null : s)} />
              </Card>
              <Card className="p-5">
                <div className="mb-3 text-[15px] font-semibold">State detail</div>
                <StateTable model={model} month={month} selectedState={focus} onSelect={(s) => setFocus(focus === s ? null : s)} onDrill={drill("state")} highlightFocus={def.good !== "up"} />
              </Card>
            </div>
            <TabInsight text={dimInsight(model, month, def, "state")} />
          </>
        )}

        {tab === "channels" && (
          <>
            <div className="grid gap-5">
              <Card className="p-5">
                <div className="mb-3 text-[15px] font-semibold">{def.label} by channel · {monthLabel(month)}</div>
                <ChannelBreakdown model={model} month={month} def={def} />
              </Card>
              <Card className="p-5">
                <div className="mb-3 text-[15px] font-semibold">Channel detail</div>
                <StateTable model={model} month={month} kind="channel" onDrill={drill("channel")} highlightFocus={def.good !== "up"} />
              </Card>
            </div>
            <TabInsight text={dimInsight(model, month, def, "channel")} />
          </>
        )}

        {tab === "odd" && (
          <>
            <Card className="p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">When are customers cancelling? · {where}</div>
                  <div className="text-xs text-mute">Pre, On and Post Original Due Date · select a bar to change month</div>
                </div>
                <Tabs tabs={[{ id: "count", label: "Volume" }, { id: "pct", label: "Share" }]} value={oddMode} onChange={setOddMode} size="sm" />
              </div>
              <ODDTimingChart model={model} state={focus} mode={oddMode} selected={month} focus={bucket} onSelectMonth={setMonth} />
            </Card>
            <div className="grid gap-4 md:grid-cols-3">
              {(["pre", "on", "post"] as const).map((b) => {
                const key = `${b}Pct`;
                const dd = pp(key);
                return (
                  <button key={b} onClick={() => setBucket(bucket === b ? null : b)} className={cn("rounded-2xl border bg-card p-4 text-left transition-colors hover:border-ink", bucket === b ? "border-ink ring-2 ring-brand/50" : "border-line")}>
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-mute"><span className="size-2.5 rounded-full" style={{ background: ODD_COLORS[b] }} />{b === "pre" ? "Pre ODD" : b === "on" ? "On ODD" : "Post ODD"}</div>
                    <div className="mt-1 flex items-baseline gap-2"><span className="num text-2xl font-semibold">{fmtPct0(snap[key])}</span><span className={cn("num text-xs font-semibold", b === "post" && (dd ?? 0) > 0.005 ? "text-bad" : b === "post" && (dd ?? 0) < -0.005 ? "text-good" : "text-mute")}>{fmtPp(dd)}</span></div>
                    <div className="text-xs text-mute">{fmtInt(snap[`${b}Cancels`])} cancellations</div>
                  </button>
                );
              })}
            </div>
            <TabInsight text={`Post ODD accounts for **${fmtPct0(snap.postPct)}** of ${where} cancellations (${fmtPp(pp("postPct"))} versus ${pm ? monthName(pm) : "previous period"}), with Pre ODD at ${fmtPct0(snap.prePct)} and On ODD at ${fmtPct0(snap.onPct)}. ${(pp("postPct") ?? 0) > 0.03 ? "Customers are increasingly lost after the committed date." : "The timing mix is broadly stable."}`} />
          </>
        )}

        {tab === "class" && (
          <>
            <Card className="p-5 sm:p-6">
              <div className="mb-4 text-[15px] font-semibold">Customer Miss · Company Miss · Faux · {where} · {monthLabel(month)}</div>
              <CancelClassification model={model} month={month} state={focus} />
            </Card>
            <Card className="p-5 sm:p-6">
              <div className="mb-1 text-[15px] font-semibold">Customer Miss share over time</div>
              <TrendChart points={series(model, "custPct", focus)} reference={periodReference(model, month, "custPct", focus, "pct")} unit="pct" selected={month} name="Customer Miss %" height={220} onSelectMonth={setMonth} />
            </Card>
            <TabInsight text={`Customer Miss is **${fmtPct0(snap.custPct)}** of ${where} cancellations (${fmtPp(pp("custPct"))}), Company Miss ${fmtPct0(snap.coPct)} (${fmtPp(pp("coPct"))}). ${(pp("custPct") ?? 0) > 0.01 ? "The shift is toward customer side causes, pointing to engagement rather than operations." : "Responsibility mix is broadly unchanged."}`} />
          </>
        )}

        {tab === "drivers" && (
          <>
            <Card className="p-5 sm:p-6">
              <div className="mb-3">
                <div className="text-[15px] font-semibold">Customer Miss reasons · {focus && !focus.startsWith("ch:") ? focus : "Portfolio"} · {monthLabel(month)}</div>
                <div className="text-xs text-mute">Ranked by volume; chips show the change against the previous period. Reasons are recorded by state.</div>
              </div>
              <CustomerMissDrivers model={model} month={month} state={focus && !focus.startsWith("ch:") ? focus : null} />
            </Card>
            <TabInsight text={fastest.length ? `Fastest growing reason: **${fastest[0].label}** (${fmtSignedPct(fastest[0].mom)})${fastest[1] ? `, followed by ${fastest[1].label} (${fmtSignedPct(fastest[1].mom)})` : ""}. The largest by volume is ${reasons[0]?.label} (${fmtInt(reasons[0]?.count)}).` : "No reason detail is available for this selection."} />
          </>
        )}

        {tab === "signals" && (
          <>
            <Card className="p-5 sm:p-6">
              <div className="mb-3 text-[15px] font-semibold">Watchtower state before cancellation · {where} · {monthLabel(month)}</div>
              <WatchtowerSignals model={model} month={month} state={focus} />
            </Card>
            <TabInsight text={strongest ? `**${strongest.label}** is the leading warning signal at **${fmtPct0(strongest.pct)}** of ${where} cancellations${strongest.count !== null ? ` (${fmtInt(strongest.count)} orders)` : ""}; it is visible before the customer cancels and is the natural trigger for outreach.` : "Watchtower signals are not available for this selection."} />
          </>
        )}
      </div>
    </Modal>
  );
}
