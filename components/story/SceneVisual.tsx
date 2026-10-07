"use client";

import { Fragment, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, ShieldCheck, TrendingDown, Zap } from "lucide-react";
import { cn } from "../ui/primitives";
import { Donut } from "../charts/Donut";
import { Gauge } from "../charts/Gauge";
import { ChannelIcon } from "./ChannelIcon";
import { BAND } from "./USStoryMap";
import type { SceneVisual } from "@/lib/story/types";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct } from "@/lib/format";

const ease = [0.2, 0.8, 0.2, 1] as const;
// Theme aware colours (CSS variables follow light and dark mode).
const RED = "var(--color-bad)";
const AMBER = "#f5a524";
const TEAL = "var(--color-teal)";
const MUTED = "var(--color-slate-soft)";
const ODD = [
  { key: "pre", label: "Pre ODD", color: "var(--color-slate-soft)" },
  { key: "on", label: "On ODD", color: AMBER },
  { key: "post", label: "Post ODD", color: RED },
] as const;
const SAVE_COLORS = ["var(--color-teal)", "#5fb3d9", "#9ad6a6"];

function Panel({ title, children, className, tone = "observed" }: { title?: string; children: ReactNode; className?: string; tone?: "observed" | "preventive" }) {
  return (
    <div
      className={cn(
        "rounded-[26px] border p-5 shadow-card sm:p-6",
        tone === "preventive" ? "border-teal/25 bg-card" : "border-line/80 bg-card dark:border-white/[0.06]",
        className,
      )}
    >
      {title && (
        <div className="mb-4 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-mute">
          {tone === "preventive" && <span className="size-1.5 rounded-full bg-teal" />}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** Horizontal bar that grows with a transform (scaleX), never a width animation. */
function Bar({ value, max, color, delay = 0, height = 10, className }: { value: number | null; max: number; color: string; delay?: number; height?: number; className?: string }) {
  const w = value === null || max <= 0 ? 0 : Math.min(1, value / max);
  return (
    <div className={cn("relative w-full overflow-hidden rounded-full bg-line-2", className)} style={{ height }}>
      <motion.div
        className="absolute inset-y-0 left-0 w-full rounded-full"
        style={{ background: color, transformOrigin: "0 50%" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: w }}
        transition={{ duration: 0.95, ease, delay }}
      />
    </div>
  );
}

const rise = (i: number, base = 0.2) => ({
  initial: { opacity: 0, y: 14, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.55, ease, delay: base + i * 0.08 },
});

export function SceneVisualView({ visual, actions, onSelectState }: { visual: SceneVisual; actions?: ReactNode; onSelectState?: (state: string) => void }) {
  switch (visual.kind) {
    case "map":
      return visual.zoom ? <FocusCallout states={visual.states} zoom={visual.zoom} onSelect={onSelectState} /> : <MapLegend states={visual.states} onSelect={onSelectState} />;
    case "channels": {
      const max = Math.max(...visual.rows.map((r) => r.rate ?? 0)) * 1.08;
      return (
        <Panel title={`${visual.state} cancel rate by channel`}>
          <div className="space-y-3.5">
            {visual.rows.map((r, i) => (
              <motion.div key={r.channel} {...rise(i)} className="grid grid-cols-[minmax(120px,170px)_1fr_68px] items-center gap-4">
                <div className={cn("flex items-center gap-2.5 text-[15px]", r.outlier ? "font-semibold text-ink" : "text-mute")}>
                  <span className={cn("grid size-8 place-items-center rounded-full", r.outlier ? "bg-bad-soft text-bad" : "bg-subtle text-mute")}><ChannelIcon channel={r.channel} className="size-4" /></span>
                  {r.channel}
                </div>
                <Bar value={r.rate} max={max} color={r.outlier ? RED : MUTED} delay={0.3 + i * 0.08} height={r.outlier ? 14 : 9} />
                <div className={cn("num text-right text-[16px] font-semibold", r.outlier ? "text-bad" : "text-mute")}>{fmtPct(r.rate)}</div>
              </motion.div>
            ))}
          </div>
          {visual.normal && <div className="mt-5 text-[13px] text-mute">Other channels: {fmtPct0(visual.normal[0])} to {fmtPct0(visual.normal[1])}</div>}
        </Panel>
      );
    }
    case "agencies": {
      const max = Math.max(...visual.rows.map((r) => Math.max(r.rate ?? 0, r.baseline ?? 0))) * 1.08;
      return (
        <div className="grid gap-4 md:grid-cols-3">
          {visual.rows.map((r, i) => (
            <motion.div key={r.agency} {...rise(i, 0.15)} className="flex flex-col rounded-[24px] border border-line/80 bg-card p-5 shadow-card dark:border-white/[0.06]">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[16px] font-semibold text-ink">{r.agency}</div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">
                  <ChannelIcon channel={r.channel} className="size-3 shrink-0" />{r.channel}
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="num-display text-[34px] leading-none text-bad">{fmtPct0(r.rate)}</span>
                <span className="text-[12.5px] text-mute">cancel rate, <span className="num font-semibold text-bad">{fmtPp(r.gap)}</span> vs <span className="num">{fmtPct0(r.baseline)}</span> history</span>
              </div>
              <div className="relative mt-2.5">
                <Bar value={r.rate} max={max} color={RED} delay={0.3 + i * 0.1} height={10} />
                {r.baseline !== null && (
                  <motion.span aria-hidden className="absolute -top-1 h-[calc(100%+8px)] w-[2px] rounded bg-ink" style={{ left: `${(r.baseline / max) * 100}%` }}
                    initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ delay: 1 + i * 0.1 }} />
                )}
              </div>
              {r.cohort && (
                <div className="mt-5 border-t border-line-2 pt-4">
                  <div className="text-[13px] font-semibold text-ink">{r.cohort.cohort}</div>
                  <div className="mt-3 flex items-center justify-around gap-3">
                    {[
                      { label: "of sales", v: r.cohort.salesShare, color: MUTED },
                      { label: "of cancellations", v: r.cohort.cancelShare, color: RED },
                    ].map((x, j) => (
                      <motion.div key={x.label} {...rise(j, 0.8 + i * 0.15)} className="text-center">
                        <Donut size={84} thickness={10} data={[{ name: x.label, value: x.v ?? 0, color: x.color }, { name: "Rest", value: 1 - (x.v ?? 0), color: "var(--color-line-2)" }]} center={<span className="num-display text-[18px] leading-none">{fmtPct0(x.v)}</span>} />
                        <div className="mt-1.5 text-[11.5px] text-mute">{x.label}</div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl bg-bad-soft px-3 py-1.5 text-center text-[12px] font-semibold text-bad">Their cancel rate {fmtPct(r.cohort.rate)}</div>
                </div>
              )}
              <div className="mt-auto pt-4 text-[12.5px] leading-snug text-ink-2"><span className="font-semibold text-teal">Coach:</span> {r.focus}</div>
            </motion.div>
          ))}
        </div>
      );
    }
    case "sales-signals":
      return (
        <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
          {visual.stats && (
            <div className="grid gap-3 sm:grid-cols-3 md:col-span-2">
              {[
                { v: visual.stats.orders, l: `${visual.stats.month} orders to score`, cls: "bg-card" },
                { v: visual.stats.projected, l: "projected to cancel without action", cls: "bg-card text-bad" },
                { v: visual.stats.saves, l: "cancellations avoided by verifying risky orders", cls: "bg-teal text-white dark:text-[#06201f]" },
              ].map((s, i) => (
                <motion.div key={s.l} {...rise(i, 0.1)} className={cn("rounded-[20px] p-4 shadow-card", s.cls)}>
                  <div className="num-display text-[34px] leading-none">{fmtInt(s.v)}</div>
                  <div className="mt-1.5 text-[12.5px] opacity-80">{s.l}</div>
                </motion.div>
              ))}
            </div>
          )}
          <Panel title="Risk factors used to score orders" tone="preventive">
            <div className="space-y-4">
              {visual.signals.map((s, i) => (
                <motion.div key={s.label} {...rise(i)}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[14px]">
                    <span className="text-ink-2">{s.label}</span>
                    <span className="num-display text-[24px] leading-none">{fmtPct0(s.value)}</span>
                  </div>
                  <Bar value={s.value} max={0.7} color={AMBER} delay={0.3 + i * 0.1} />
                </motion.div>
              ))}
            </div>
          </Panel>
          <Panel title="Example order score" tone="preventive">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13.5px]">
              {visual.example.map((e, i) => (
                <motion.div key={e.label} {...rise(i, 0.45)} className="contents">
                  <dt className="text-mute">{e.label}</dt>
                  <dd className={cn("text-right font-semibold", /critical|low|high|yes/i.test(e.value) ? "text-warn" : "text-ink")}>{e.value}</dd>
                </motion.div>
              ))}
            </dl>
            <motion.div {...rise(0, 1.3)} className="mt-5 flex items-center gap-2 rounded-2xl bg-teal px-4 py-3 text-[14px] font-semibold text-white dark:text-[#06201f]">
              <ShieldCheck className="size-4" /> {visual.action || "Verify before installation"}
            </motion.div>
          </Panel>
        </div>
      );
    case "split": {
      const color = (k: string) => (k === "contact" ? RED : k === "sales" ? AMBER : k === "company" ? MUTED : "var(--color-line)");
      return (
        <Panel title={`Primary cause of ${fmtInt(visual.total)} cancellations, one per order`}>
          <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <motion.div {...rise(0, 0.1)} className="mx-auto">
              <Donut
                size={210}
                thickness={28}
                data={visual.parts.map((p) => ({ name: p.label, value: p.cancels ?? 0, color: color(p.kind), detail: fmtInt(p.cancels) }))}
                center={<div><div className="num-display text-[36px] leading-none">{fmtInt(visual.total)}</div><div className="mt-1 text-[11px] text-mute">cancellations</div></div>}
              />
            </motion.div>
            <div className="grid gap-3 sm:grid-cols-2">
              {visual.parts.map((p, i) => (
                <motion.div key={p.kind} {...rise(i, 0.5)} className={cn("rounded-2xl p-4", p.emphasis ? "border border-line bg-card shadow-card" : "border border-line bg-card")}>
                  <div className="flex items-center gap-2 text-[12.5px] text-mute"><span className="h-2.5 w-5 rounded-full" style={{ background: color(p.kind) }} />{p.label}</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className={cn("num-display leading-none", p.emphasis ? "text-[34px]" : "text-[24px] text-ink-2")}>{fmtInt(p.cancels)}</span>
                    <span className="num text-[15px] font-semibold text-mute">{fmtPct0(p.share)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          {visual.signal !== null && (
            <motion.div {...rise(0, 1.9)} className="mt-5 rounded-2xl border border-dashed border-line p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-mute">Pending Customer Contact <em>signal</em>: a status, not a cause</span>
                <span className="num-display text-[22px] leading-none">{fmtPct0(visual.signal)}</span>
              </div>
              <Bar value={visual.signal} max={1} color="var(--color-slate-soft)" delay={2} height={6} />
            </motion.div>
          )}
        </Panel>
      );
    }
    case "timing":
      return (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Panel title="When cancellations happen: Pre, On and Post ODD">
            <div className="mb-4 flex flex-wrap gap-4 text-[12px] text-mute">
              {ODD.map((o) => <span key={o.key} className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full" style={{ background: o.color }} />{o.label}</span>)}
            </div>
            <div className="space-y-4">
              {visual.rows.map((r, i) => (
                <motion.div key={r.label} {...rise(i)}>
                  <div className={cn("mb-1.5 flex items-baseline justify-between text-[13.5px]", r.emphasis ? "font-semibold text-ink" : "text-ink-2")}>
                    <span>{r.label}</span>
                    <span className="num">Post ODD <span className={cn("num-display text-[22px]", r.emphasis ? "text-bad" : "text-ink")}>{fmtPct0(r.post)}</span></span>
                  </div>
                  <div className="flex h-7 w-full gap-1 overflow-hidden rounded-full">
                    {ODD.map((o, j) => {
                      const v = r[o.key];
                      return (
                        <motion.div
                          key={o.key}
                          className="flex h-full items-center justify-center rounded-full text-[11.5px] font-semibold"
                          style={{ width: `${(v ?? 0) * 100}%`, background: o.color, color: o.key === "pre" ? "var(--color-ink)" : "#fff", transformOrigin: "0 50%" }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.7, ease, delay: 0.25 + i * 0.25 + j * 0.12 }}
                        >
                          {(v ?? 0) >= 0.08 ? fmtPct0(v) : ""}
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </Panel>
          {visual.drivers.length > 0 && (
            <Panel title="Fastest growing late stage reasons">
              <div className="space-y-4">
                {visual.drivers.map((d, i) => (
                  <motion.div key={d.label} {...rise(i, 0.8)}>
                    <div className="flex items-center justify-between gap-3 text-[14px]">
                      <span className="text-ink-2">{d.label}</span>
                      <span className="num rounded-full bg-bad-soft px-2.5 py-0.5 text-[12.5px] font-bold text-bad">{fmtSignedPct(d.mom)}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-mute">{fmtInt(d.count)} cancellations</div>
                  </motion.div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      );
    case "journey":
      return <JourneyFlow nodes={visual.nodes} />;
    case "install":
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visual.segments.map((s, i) => (
              <motion.div key={s.label} {...rise(i)} className="rounded-[22px] border border-teal/20 bg-card p-4 shadow-card">
                <div className="num-display text-[34px] leading-none">{fmtInt(s.orders)}</div>
                <div className="mt-2 text-[12.5px] leading-snug text-mute">{s.label}</div>
                <div className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-teal"><ArrowRight className="size-3.5" />{s.action}</div>
              </motion.div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            {visual.example.length > 0 && (
              <Panel title="Example order" tone="preventive" className="!p-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                  {visual.example.map((e) => (
                    <Fragment key={e.label}><dt className="text-mute">{e.label}</dt><dd className={cn("text-right font-semibold", /recommended/i.test(e.label) ? "text-teal" : "text-ink")}>{e.value}</dd></Fragment>
                  ))}
                </dl>
              </Panel>
            )}
            {visual.saves !== null && (
              <motion.div {...rise(0, 0.9)} className="flex flex-col justify-center rounded-[22px] bg-teal px-7 py-5 text-white dark:text-[#06201f]">
                <div className="num-display text-[44px] leading-none">{fmtInt(visual.saves)}</div>
                <div className="mt-1 text-[13px] font-semibold">potential saves, {visual.period}</div>
              </motion.div>
            )}
          </div>
        </div>
      );
    case "contact": {
      const max = Math.max(...visual.funnel.map((f) => f.value ?? 0));
      return (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Panel title={`Contact risk population, ${visual.period}`} tone="preventive">
            <div className="space-y-5">
              {visual.funnel.map((f, i) => (
                <motion.div key={f.label} {...rise(i)}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]"><span className="text-ink-2">{f.label}</span><span className="num-display text-[30px] leading-none">{fmtInt(f.value)}</span></div>
                  <Bar value={f.value} max={max} color={i === visual.funnel.length - 1 ? TEAL : i === 1 ? RED : MUTED} delay={0.3 + i * 0.3} height={12} />
                </motion.div>
              ))}
            </div>
          </Panel>
          <Panel title="Rules that trigger the rescue" tone="preventive">
            <ul className="space-y-3">
              {visual.rules.map((r, i) => (
                <motion.li key={r.label} {...rise(i, 1)} className="grid grid-cols-[22px_1fr] gap-2 text-[13.5px]">
                  <span className="grid size-5 place-items-center rounded-full bg-teal-soft text-teal"><Check className="size-3" /></span>
                  <span><span className="text-mute">{r.label}:</span> <span className="font-semibold text-ink">{r.value}</span></span>
                </motion.li>
              ))}
            </ul>
          </Panel>
        </div>
      );
    }
    case "outlook": {
      const max = Math.max(...visual.steps.map((s) => s.rate ?? 0)) * 1.18;
      const color = (i: number, mode: string) => (mode === "observed" ? (i === 0 ? MUTED : RED) : i === visual.steps.length - 1 ? TEAL : RED);
      return (
        <Panel title="Portfolio cancel rate">
          <div className="flex h-[300px] items-end gap-3 sm:gap-6">
            {visual.steps.map((s, i) => {
              const projected = s.mode === "preventive" && i < visual.steps.length - 1;
              return (
                <div key={s.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <motion.div {...rise(i, 0.45 + i * 0.35)} className="num-display text-[26px] leading-none sm:text-[32px]">{fmtPct(s.rate)}</motion.div>
                  <motion.div
                    className={cn("w-full rounded-t-[18px]", projected && "border-2 border-dashed")}
                    style={{
                      height: `${((s.rate ?? 0) / max) * 100}%`,
                      background: projected ? "color-mix(in srgb, var(--color-bad) 18%, transparent)" : color(i, s.mode),
                      borderColor: projected ? RED : undefined,
                      transformOrigin: "50% 100%",
                    }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.85, ease, delay: 0.3 + i * 0.35 }}
                  />
                  <div className={cn("text-center text-[12.5px] leading-tight", s.mode === "preventive" ? "font-semibold text-teal" : "text-mute")}>{s.label}</div>
                </div>
              );
            })}
          </div>
          {visual.saves !== null && (
            <motion.div {...rise(0, 1.9)} className="mt-5 flex items-center gap-2 rounded-2xl bg-teal-soft px-4 py-3 text-[13.5px] text-teal">
              <TrendingDown className="size-4" /> About <strong className="num">{fmtInt(visual.saves)}</strong> orders protected by targeted intervention
            </motion.div>
          )}
        </Panel>
      );
    }
    case "recommendations":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[auto_1fr]">
            {visual.total !== null && (
              <motion.div {...rise(0, 0.1)} className="flex items-center justify-center rounded-[26px] bg-card p-5 shadow-card">
                <Donut
                  size={190}
                  thickness={22}
                  data={visual.items.map((r, i) => ({ name: r.label, value: r.saves ?? 0, color: SAVE_COLORS[i % 3], detail: `${fmtInt(r.saves)} saves` }))}
                  center={<div><div className="num-display text-[34px] leading-none">{fmtInt(visual.total)}</div><div className="mt-1 text-[11px] text-mute">orders protected</div></div>}
                />
              </motion.div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {visual.items.map((r, i) => (
                <motion.div key={r.id} {...rise(i, 0.25)} className="flex flex-col rounded-[22px] border border-teal/20 bg-card p-5 shadow-card">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-teal"><span className="size-2 rounded-full" style={{ background: SAVE_COLORS[i % 3] }} />{r.label}</div>
                  <div className="num-display mt-3 text-[40px] leading-none">{fmtInt(r.saves)}</div>
                  <div className="mt-1 text-[12px] text-mute">potential saves</div>
                  <div className="mt-3 text-[13px] leading-snug text-ink-2">{r.action}</div>
                </motion.div>
              ))}
            </div>
          </div>
          {actions && <motion.div {...rise(0, 1)}>{actions}</motion.div>}
        </div>
      );
  }
}

type MapRows = Extract<SceneVisual, { kind: "map" }>["states"];

/** State chips coloured by band (each opens the state's analysis) and the colour key. */
function MapLegend({ states, onSelect }: { states: MapRows; onSelect?: (state: string) => void }) {
  const rows = [...states].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {rows.map((s, i) => (
          <motion.button key={s.name} type="button" {...rise(i, 0.9)} onClick={() => onSelect?.(s.name)} disabled={!onSelect}
            title={onSelect ? `Open ${s.name} analysis` : undefined}
            className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] shadow-card ring-1 ring-black/10 transition-transform enabled:hover:-translate-y-0.5"
            style={{ background: BAND[s.severity].fill, color: BAND[s.severity].text }}>
            <span className="font-medium">{s.name}</span>
            <span className="num font-bold">{s.label}</span>
          </motion.button>
        ))}
      </div>
      <motion.div {...rise(rows.length, 0.9)} className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11.5px] text-mute">
        <span>Cancellation change vs the previous period{onSelect ? " (select a state for its analysis)" : ""}</span>
        {Object.values(BAND).map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[4px] ring-1 ring-black/10" style={{ background: b.fill }} />{b.label}</span>
        ))}
      </motion.div>
    </div>
  );
}

function FocusCallout({ states, zoom, onSelect }: { states: MapRows; zoom: string; onSelect?: (state: string) => void }) {
  const s = states.find((x) => x.name === zoom);
  if (!s) return null;
  const b = BAND[s.severity];
  return (
    <motion.button type="button" {...rise(0, 2.2)} onClick={() => onSelect?.(zoom)} disabled={!onSelect} title={onSelect ? `Open ${zoom} analysis` : undefined}
      className="inline-flex items-center gap-3 rounded-full border border-line/80 bg-card py-2 pl-2 pr-5 shadow-card transition-transform enabled:hover:-translate-y-0.5 dark:border-white/[0.06]">
      <span className="grid size-10 place-items-center rounded-full text-[13px] font-bold" style={{ background: b.fill, color: b.text }}>{zoom.split(" ").map((w) => w[0]).join("")}</span>
      <span className="text-[14px] font-semibold text-ink">{zoom}</span>
      <span className="num-display text-[26px] leading-none" style={{ color: s.severity === "high" ? "var(--color-bad)" : undefined }}>{s.label}</span>
    </motion.button>
  );
}

const SEV = {
  neutral: { ring: "var(--color-slate-soft)", bg: "var(--color-card)" },
  warning: { ring: AMBER, bg: "color-mix(in srgb, #f5a524 12%, var(--color-card))" },
  critical: { ring: RED, bg: "color-mix(in srgb, var(--color-bad) 12%, var(--color-card))" },
} as const;

/** Lifecycle chain that lights up step by step, moving from neutral to warning to critical. */
function JourneyFlow({ nodes }: { nodes: Extract<SceneVisual, { kind: "journey" }>["nodes"] }) {
  const step = 0.85;
  return (
    <Panel title="Representative order journey">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {nodes.map((n, i) => {
          const s = SEV[n.severity];
          return (
            <motion.li
              key={n.label}
              className="relative"
              initial={{ opacity: 0.15, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.55, ease, delay: 0.3 + i * step }}
            >
              <div className="relative h-full rounded-[20px] border-2 p-4 shadow-card" style={{ borderColor: s.ring, background: s.bg }}>
                <div className="flex items-center justify-between">
                  <span className="num grid size-7 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: s.ring }}>{i + 1}</span>
                  {n.badge && (
                    <motion.span
                      className="num rounded-full bg-bad px-2.5 py-0.5 text-[13px] font-bold text-white"
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.25, 1] }}
                      transition={{ duration: 0.6, delay: 0.6 + i * step }}
                    >
                      {n.badge}
                    </motion.span>
                  )}
                </div>
                <div className="mt-2.5 text-[14.5px] font-semibold leading-snug text-ink">{n.label}</div>
              </div>
              {i < nodes.length - 1 && (i + 1) % 4 !== 0 && (
                <motion.span
                  aria-hidden
                  className="absolute -right-4 top-1/2 hidden h-[2px] w-4 sm:block"
                  style={{ background: SEV[nodes[i + 1].severity].ring, transformOrigin: "0 50%" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.4, delay: 0.75 + i * step }}
                />
              )}
            </motion.li>
          );
        })}
      </ol>
      <motion.div className="mt-6 flex items-center gap-2 text-[13px] text-mute" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + nodes.length * step }}>
        <Zap className="size-4 text-teal" /> Every step before the cancellation is visible in Watchtower, so each can trigger a preventive action.
      </motion.div>
    </Panel>
  );
}
