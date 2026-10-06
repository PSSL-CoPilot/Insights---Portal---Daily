"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../AppContext";
import { KPICard } from "../kpi/KPICard";
import { CancelClassification } from "../charts/CancelClassification";
import { CustomerMissDrivers } from "../charts/CustomerMissDrivers";
import { WatchtowerSignals } from "../charts/WatchtowerSignals";
import { ODD_COLORS } from "../charts/ODDTimingChart";
import { C, TipCard, axisProps } from "../charts/shared";
import { RankedBars } from "../charts/RankedBars";
import { StateChannelMatrix } from "./PlanOverview";
import { Sparkline } from "../ui/Sparkline";
import { Badge, Button, Card, cn, dirTone } from "../ui/primitives";
import { assess, chartDays, findFocusChannel, findHotspot, getSnapshot, isChannel, kpiById, prevMonth, scopeName, series } from "@/lib/data/metrics";
import { stateStory, type StoryPoint } from "@/lib/data/narratives";
import { buildScopeNarrative } from "@/lib/story/narrative";
import { NarrativeBlock } from "../story/NarrativeList";
import { ChannelIcon } from "../story/ChannelIcon";
import { fmtCompact, fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthLabel, monthName, monthShort, stateSlug } from "@/lib/format";

const KPI_STRIP = ["sales", "installs", "cancels", "cancelRate", "post", "cust", "pending", "onTime"] as const;

function GrowthCard({ model, scope, month }: { model: ReturnType<typeof useApp>["model"]; scope: string; month: string }) {
  const a = assess(model, kpiById("cancels")!, month, scope);
  const pm = prevMonth(model, month);
  const spark = series(model, "cancels", scope).filter((p) => p.month <= month).map((p) => p.value);
  const tone = dirTone("down", a.delta?.value);
  return (
    <div className={cn("flex min-h-[158px] flex-col justify-between rounded-[22px] border bg-card p-4 shadow-card", a.status === "critical" ? "border-bad/40" : "border-line")}>
      <div className="text-[12px] font-semibold text-mute">Cancellation growth vs {pm ? monthName(pm) : "prior"}</div>
      <div className="flex items-end justify-between gap-2">
        <div className={cn("num text-[34px] font-semibold leading-none tracking-tight", tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "")}>{fmtSignedPct(a.delta?.value ?? null)}</div>
        <Sparkline values={spark} color={tone === "bad" ? C.bad : C.good} width={84} height={34} />
      </div>
      <div className="border-t border-line-2 pt-2.5 text-[11.5px] text-mute">{fmtInt(a.delta?.previous ?? null)} to {fmtInt(a.delta?.current ?? null)} cancellations{a.anomaly ? " · exception" : ""}</div>
    </div>
  );
}

function Insight({ point }: { point: StoryPoint }) {
  return (
    <div className={cn("mt-5 flex gap-3 rounded-2xl border px-4 py-3.5 text-[14px] leading-relaxed", point.tone === "bad" ? "border-bad/25 bg-bad-soft" : point.tone === "good" ? "border-good/25 bg-good-soft" : "border-line bg-subtle")}>
      <Lightbulb className={cn("mt-0.5 size-4 shrink-0", point.tone === "bad" ? "text-bad" : point.tone === "good" ? "text-good" : "text-mute")} />
      <p className="text-ink-2">{point.text}</p>
    </div>
  );
}

interface StepDef {
  id: string;
  title: string;
  question: string;
  render: () => ReactNode;
}

/** State or channel detail for Detailed Analysis: KPI strip and every analysis section at once (no step gating). */
export function StateDrilldown({ scope }: { scope: string }) {
  const { model, month, openKpi } = useApp();
  const channel = isChannel(scope);
  const name = scopeName(scope);
  const pm = prevMonth(model, month);
  const cur = getSnapshot(model, month, scope);
  const prev = pm ? getSnapshot(model, pm, scope) : null;
  const port = getSnapshot(model, month, null);
  const story = useMemo(() => stateStory(model, month, scope), [model, month, scope]);
  const hot = channel ? findFocusChannel(model, month)?.channel : findHotspot(model, month)?.state;
  const cancelMoM = assess(model, kpiById("cancels")!, month, scope);
  const isHot = hot === name && (cancelMoM.delta?.value ?? 0) > 0.15;

  const compare = [
    { name: "Unique Sales", a: prev?.sales ?? null, b: cur.sales, unit: "n", good: "up" as const },
    { name: "Installs", a: prev?.installs ?? null, b: cur.installs, unit: "n", good: "up" as const },
    { name: "Cancellations", a: prev?.cancels ?? null, b: cur.cancels, unit: "n", good: "down" as const },
    { name: "Cancel rate", a: prev?.cancelRate ?? null, b: cur.cancelRate, unit: "p", good: "down" as const },
  ];
  const idx = useMemo(() => {
    const s = series(model, "sales", scope), c = series(model, "cancels", scope), i = series(model, "installs", scope);
    const b = (arr: typeof s) => arr[0]?.value ?? null;
    return chartDays(model).map((m, k) => {
      const f = (arr: typeof s) => (arr[k].value !== null && b(arr) ? (arr[k].value! / b(arr)!) * 100 : null);
      return { label: monthShort(m), Sales: f(s), Installs: f(i), Cancellations: f(c) };
    });
  }, [model, scope, month]);

  const timing = [
    { label: pm ? monthName(pm) : "Prior", ...pick(prev) },
    { label: monthName(month), ...pick(cur) },
  ].filter((r) => r.pre !== null);

  // State × channel mix for this plan (published for the drill month).
  const mix = model.stateChannel.filter((r) => (channel ? r.channel === name : r.state === name));

  const steps: StepDef[] = [
    {
      id: "change",
      title: `How did ${name} change?`,
      question: `${pm ? monthName(pm) : "Prior"} vs ${monthName(month)}`,
      render: () => (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {compare.map((c) => {
              const t = c.a !== null && c.b !== null ? dirTone(c.good, c.b - c.a) : "neutral";
              return (
                <div key={c.name} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-start justify-between">
                    <div className="eyebrow">{c.name}</div>
                    {c.a !== null && c.b !== null && (
                      <span className={cn("num text-xs font-bold", t === "bad" ? "text-bad" : t === "good" ? "text-good" : "text-mute")}>{c.unit === "p" ? fmtPp(c.b - c.a, 1) : fmtSignedPct(c.b / c.a - 1)}</span>
                    )}
                  </div>
                  <div className="num mt-1 text-2xl font-semibold">{c.unit === "p" ? fmtPct(c.b) : fmtCompact(c.b)}</div>
                  <div className="h-[110px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ n: pm ? monthShort(pm) : "Prior", v: c.a }, { n: monthShort(month), v: c.b }]} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
                        <XAxis dataKey="n" {...axisProps} />
                        <YAxis hide domain={[0, "dataMax"]} />
                        <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <TipCard title={c.name} rows={[{ label: String(payload[0].payload.n), value: c.unit === "p" ? fmtPct(payload[0].payload.v) : fmtInt(payload[0].payload.v) }]} /> : null} />
                        <Bar isAnimationActive dataKey="v" radius={[8, 8, 0, 0]} animationDuration={700}>
                          <Cell fill={C.slate} />
                          <Cell fill={t === "bad" ? C.bad : t === "good" ? C.good : C.indigo} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-card p-4">
            <div className="mb-1 text-[13px] font-semibold">Growth since {monthShort(chartDays(model)[0])} (indexed, {monthShort(chartDays(model)[0])} = 100)</div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={idx} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="label" {...axisProps} dy={6} />
                  <YAxis {...axisProps} width={40} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={(v) => String(Math.round(v))} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? <TipCard title={String(label)} rows={payload.map((p) => ({ label: String(p.name), value: Number(p.value).toFixed(0), color: String(p.color) }))} /> : null} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Line isAnimationActive type="monotone" dataKey="Sales" stroke={C.good} strokeWidth={2} dot={false} />
                  <Line isAnimationActive type="monotone" dataKey="Installs" stroke={C.brand} strokeWidth={2} dot={false} />
                  <Line isAnimationActive type="monotone" dataKey="Cancellations" stroke={C.bad} strokeWidth={2.75} dot={{ r: 3, fill: C.card, stroke: C.bad, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Insight point={story.change} />
        </>
      ),
    },
    {
      id: "when",
      title: "When are customers cancelling?",
      question: "Pre · On · Post ODD",
      render: () => (
        <>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
            <div className="flex flex-col justify-center rounded-2xl bg-panel p-6 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Post ODD share · {monthName(month)}</div>
              <div className="num-display bs-gradient-text mt-2 text-[64px] leading-none">{fmtPct0(cur.postPct)}</div>
              <div className="mt-2 text-sm text-white/70">
                {fmtInt(cur.postCancels)} of {fmtInt(cur.cancels)} cancellations after the Original Due Date
                {prev?.postPct != null && <> · {fmtPct0(prev.postPct)} in {monthShort(pm!)}</>}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {(["pre", "on", "post"] as const).map((b) => (
                  <div key={b} className="rounded-xl bg-white/[0.08] px-2 py-2.5">
                    <div className="text-[10.5px] uppercase tracking-wider text-white/50">{b} ODD</div>
                    <div className="num text-lg font-semibold">{fmtPct0(cur[`${b}Pct`])}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <div className="mb-2 text-[13px] font-semibold">Share of cancellations by timing</div>
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timing} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barSize={38}>
                    <XAxis type="number" hide domain={[0, 1]} />
                    <YAxis type="category" dataKey="label" {...axisProps} width={78} tick={{ fill: C.ink, fontSize: 12.5, fontWeight: 600 }} />
                    <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <TipCard title={String(payload[0].payload.label)} rows={[{ label: "Post ODD", value: fmtPct0(payload[0].payload.post), color: ODD_COLORS.post }, { label: "On ODD", value: fmtPct0(payload[0].payload.on), color: ODD_COLORS.on }, { label: "Pre ODD", value: fmtPct0(payload[0].payload.pre), color: ODD_COLORS.pre }]} /> : null} />
                    <Bar isAnimationActive dataKey="pre" stackId="s" fill={ODD_COLORS.pre} name="Pre ODD" radius={[10, 0, 0, 10]} label={{ position: "center", formatter: (v: unknown) => fmtPct0(Number(v)), fontSize: 11, fill: "#222" }} />
                    <Bar isAnimationActive dataKey="on" stackId="s" fill={ODD_COLORS.on} name="On ODD" label={{ position: "center", formatter: (v: unknown) => fmtPct0(Number(v)), fontSize: 11, fill: "#222" }} />
                    <Bar isAnimationActive dataKey="post" stackId="s" fill={ODD_COLORS.post} name="Post ODD" radius={[0, 10, 10, 0]} label={{ position: "center", formatter: (v: unknown) => fmtPct0(Number(v)), fontSize: 12, fontWeight: 700, fill: "#fff" }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <Insight point={story.timing} />
        </>
      ),
    },
    {
      id: "who",
      title: "Who is driving the miss?",
      question: "Customer · Company · Faux",
      render: () => (
        <>
          <Card className="p-5 sm:p-6"><CancelClassification model={model} month={month} state={scope} /></Card>
          <Insight point={story.who} />
        </>
      ),
    },
    ...(!channel
      ? [{
          id: "why",
          title: "Why are customers cancelling?",
          question: "Customer Miss reasons",
          render: () => (
            <>
              <Card className="p-5 sm:p-6"><CustomerMissDrivers model={model} month={month} state={scope} /></Card>
              <Insight point={story.why} />
            </>
          ),
        } as StepDef]
      : []),
    {
      id: "mix",
      title: channel ? `Which states drive ${name}?` : `Which channels drive ${name}?`,
      question: channel ? "State mix" : "Channel mix",
      render: () => {
        const top = [...mix].sort((a, b) => (b.cancelGrowth ?? -1) - (a.cancelGrowth ?? -1))[0];
        return (
          <>
            {month !== model.drillMonth || !mix.length ? (
              <Card className="p-8 text-center text-sm text-mute">The state and channel cross view is published for {model.drillMonth ? monthLabel(model.drillMonth) : "the latest month"} only.</Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                <Card className="p-5 sm:p-6">
                  <div className="mb-3 text-[13px] font-semibold">Cancellations by {channel ? "state" : "channel"} · {monthLabel(month)}</div>
                  <RankedBars rows={[...mix].sort((a, b) => (b.cancels ?? 0) - (a.cancels ?? 0)).map((r) => {
                    const label = channel ? r.state : r.channel;
                    const t = dirTone("down", r.cancelGrowth);
                    return {
                      id: label, label, value: r.cancels, valueLabel: `${fmtInt(r.cancels)} · ${fmtPct(r.cancelRate)}`,
                      sub: `Post ODD ${fmtPct0(r.postPct)} · Pending ${fmtPct0(r.pendingPct)}`,
                      chip: r.cancelGrowth !== null ? { text: fmtSignedPct(r.cancelGrowth), tone: t } : undefined,
                      color: r === top && (r.cancelGrowth ?? 0) > 0.15 ? C.bad : C.indigo, emphasis: r === top && (r.cancelGrowth ?? 0) > 0.15,
                    };
                  })} />
                </Card>
                <StateChannelMatrix highlight={name} />
              </div>
            )}
            {top && month === model.drillMonth && (
              <Insight point={{
                tone: (top.cancelGrowth ?? 0) > 0.15 ? "bad" : "neutral",
                text: (top.cancelGrowth ?? 0) > 0.15
                  ? `${channel ? top.state : top.channel} is the priority within ${name}: cancellations ${fmtSignedPct(top.cancelGrowth)} at a ${fmtPct(top.cancelRate)} cancel rate, with ${fmtPct0(top.pendingPct)} Pending Customer Contact.`
                  : `No ${channel ? "state" : "channel"} within ${name} stands out; movement is broadly consistent.`,
              }} />
            )}
          </>
        );
      },
    },
    {
      id: "seen",
      title: "Could we see it coming?",
      question: "Watchtower signals",
      render: () => (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <Card className="p-5 sm:p-6">
              <div className="mb-3 text-[13px] font-semibold">Watchtower state of {name} cancellations</div>
              <WatchtowerSignals model={model} month={month} state={scope} />
            </Card>
            <Card className="flex flex-col justify-center p-6">
              <div className="eyebrow mb-2">Pending Customer Contact</div>
              <div className="flex items-end gap-3">
                <span className="num-display text-[52px] leading-none">{fmtPct0(cur.pendingPct)}</span>
                {prev?.pendingPct != null && cur.pendingPct !== null && <span className={cn("num pb-1.5 text-base font-bold", cur.pendingPct > prev.pendingPct ? "text-bad" : "text-good")}>{fmtPp(cur.pendingPct - prev.pendingPct)}</span>}
              </div>
              <div className="mt-2 text-sm text-mute">Portfolio: {fmtPct0(port.pendingPct)} · BSW Delay Predicted {fmtPct0(cur.bswPct)} · Install in Jeopardy {fmtPct0(cur.jeopardyPct)}</div>
              <div className="mt-4 h-px bg-line" />
              <p className="mt-4 text-[13px] leading-relaxed text-mute">A principal early warning signal: unresolved customer contact is visible <strong className="text-ink">before</strong> the customer cancels.</p>
            </Card>
          </div>
          <Insight point={story.seen} />
          <div className="mt-6 flex justify-center">
            <Link href={`/watchtower?month=${month}${channel ? "" : `&state=${stateSlug(name)}`}`} className="bs-gradient group inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-[#111] shadow-pop transition-transform duration-300 hover:-translate-y-0.5">
              Explore in Watchtower <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        {KPI_STRIP.slice(0, 5).map((id, i) => (
          <KPICard key={id} def={kpiById(id)!} model={model} month={month} state={scope} onClick={() => openKpi(id, "trend", scope)} delay={i * 40} />
        ))}
        <GrowthCard model={model} scope={scope} month={month} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {steps.map((s, i) => (
          <section key={s.id} className={cn("animate-rise rounded-[26px] border border-line/80 bg-card p-5 shadow-card sm:p-6 dark:border-white/[0.06]", (s.id === "change" || s.id === "mix") && "xl:col-span-2")} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[18px] font-semibold tracking-tight">{s.title}</h3>
              <span className="eyebrow">{s.question}</span>
            </div>
            {s.render()}
          </section>
        ))}
      </div>
    </div>
  );
}

function pick(s: ReturnType<typeof getSnapshot> | null) {
  return { pre: s?.prePct ?? null, on: s?.onPct ?? null, post: s?.postPct ?? null };
}
