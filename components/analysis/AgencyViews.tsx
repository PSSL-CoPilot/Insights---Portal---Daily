"use client";

import { motion } from "motion/react";
import { ArrowUpRight, UserRound, Users } from "lucide-react";
import { useApp } from "../AppContext";
import { Badge, Card, cn } from "../ui/primitives";
import { Donut } from "../charts/Donut";
import { ChannelIcon } from "../story/ChannelIcon";
import { AgencySignals, AgencyTrend, RepRanking, RepSignals, SIGNALS, bandColor } from "./charts";
import type { AgencySnapshotRow, RepRow } from "@/lib/data/types";
import type { Selection } from "@/lib/story/links";
import { AGENCY_GAP_THRESHOLD } from "@/lib/data/metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthName } from "@/lib/format";

type Select = (s: Partial<Selection>) => void;

export function Panel({ title, sub, children, className, right }: { title: string; sub?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <Card className={cn("animate-rise p-5 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
          {sub && <p className="mt-0.5 text-[12.5px] text-mute">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "bad" | "good" | "neutral" }) {
  return (
    <div className="animate-rise rounded-[22px] border border-line/80 bg-card p-4 shadow-card dark:border-white/[0.06]">
      <div className="text-[12px] font-semibold text-mute">{label}</div>
      <div className={cn("num-display mt-2 text-[32px] leading-none", tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "")}>{value}</div>
      {sub && <div className="mt-2 text-[11.5px] text-mute">{sub}</div>}
    </div>
  );
}

const weak = (a: AgencySnapshotRow) => (a.gap ?? 0) >= AGENCY_GAP_THRESHOLD;

/** Every agency or source for the focus state, ranked by how far it moved from its own history. */
export function AgencyTable({ agencies, select, selected, title, sub }: { agencies: AgencySnapshotRow[]; select: Select; selected?: string | null; title?: string; sub?: string }) {
  const { model, month } = useApp();
  if (!agencies.length) return null;
  const rows = [...agencies].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  const max = Math.max(...rows.map((r) => r.cancelRate ?? 0));
  return (
    <Panel title={title ?? `${model.story.focusState ?? ""} agencies and sources`} sub={sub ?? `${monthName(month)} cancel rate against each agency's own January to August history. Select an agency for its representatives.`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-mute">
              <th className="pb-2.5 font-semibold">Agency</th>
              <th className="pb-2.5 text-right font-semibold">Sales</th>
              <th className="pb-2.5 text-right font-semibold">Cancels</th>
              <th className="w-[26%] pb-2.5 pl-6 font-semibold">Cancel rate vs own history</th>
              <th className="pb-2.5 text-right font-semibold">Change</th>
              <th className="pb-2.5 pl-5 font-semibold">Pattern</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <motion.tr
                key={a.agency}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => select({ agency: a.agency })}
                className={cn("group cursor-pointer border-t border-line-2 transition-colors hover:bg-subtle", selected === a.agency && "bg-subtle")}
              >
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", weak(a) ? "bg-bad-soft text-bad" : "bg-subtle text-mute")}><ChannelIcon channel={a.channel} className="size-3.5" /></span>
                    <div>
                      <div className="font-semibold">{a.agency}</div>
                      <div className="text-[11.5px] text-mute">{a.channel} · {a.disposition || "n/a"}</div>
                    </div>
                  </div>
                </td>
                <td className="num py-3 text-right">{fmtInt(a.sales)}<div className="text-[11px] text-soft">{fmtInt(a.prevSales)} prior</div></td>
                <td className="num py-3 text-right">{fmtInt(a.cancels)}</td>
                <td className="py-3 pl-6">
                  <div className="flex items-center gap-3">
                    <div className="relative h-2.5 flex-1 rounded-full bg-line-2">
                      <motion.div className="absolute inset-y-0 left-0 w-full rounded-full" style={{ background: weak(a) ? "var(--color-bad)" : "var(--color-slate-soft)", transformOrigin: "0 50%" }} initial={{ scaleX: 0 }} animate={{ scaleX: (a.cancelRate ?? 0) / max }} transition={{ duration: 0.8, delay: 0.1 + i * 0.04 }} />
                      {a.baseline !== null && <span className="absolute -top-1 h-[18px] w-[2px] rounded bg-ink" style={{ left: `${(a.baseline / max) * 100}%` }} />}
                    </div>
                    <span className="num w-12 text-right font-semibold">{fmtPct(a.cancelRate)}</span>
                  </div>
                </td>
                <td className={cn("num py-3 text-right font-bold", weak(a) ? "text-bad" : "text-mute")}>{fmtPp(a.gap)}</td>
                <td className="max-w-[220px] truncate py-3 pl-5 text-ink-2">{a.pattern || "n/a"}</td>
                <td className="py-3 pl-2 text-right"><ArrowUpRight className="ml-auto size-4 text-soft transition group-hover:text-ink" /></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-mute"><span className="h-3 w-[2px] rounded bg-ink" /> Own January to August history</div>
    </Panel>
  );
}

/** Representatives of one agency. */
export function RepTable({ reps, select, selected }: { reps: RepRow[]; select: Select; selected?: string | null }) {
  const rows = [...reps].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full min-w-[900px] text-[12.5px]">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-[10.5px] uppercase tracking-wider text-mute">
            <th className="pb-2.5 font-semibold">Representative</th>
            <th className="pb-2.5 font-semibold">Cohort</th>
            <th className="pb-2.5 text-right font-semibold">Tenure</th>
            <th className="pb-2.5 text-right font-semibold">Sales</th>
            <th className="pb-2.5 text-right font-semibold">Cancels</th>
            <th className="pb-2.5 text-right font-semibold">Rate</th>
            <th className="pb-2.5 pl-4 font-semibold">Band</th>
            {SIGNALS.map((s) => <th key={s.key} className="pb-2.5 text-right font-semibold" title={s.label}>{s.label.split(" ")[0]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => select({ rep: r.id })} className={cn("cursor-pointer border-t border-line-2 transition-colors hover:bg-subtle", selected === r.id && "bg-subtle")}>
              <td className="py-2.5 font-semibold">{r.id}</td>
              <td className="py-2.5 text-ink-2">{r.cohort}</td>
              <td className="num py-2.5 text-right">{r.tenure !== null ? `${fmtInt(r.tenure)} mo` : "n/a"}</td>
              <td className="num py-2.5 text-right">{fmtInt(r.sales)}</td>
              <td className="num py-2.5 text-right">{fmtInt(r.cancels)}</td>
              <td className="num py-2.5 text-right font-semibold">{fmtPct(r.rate)}</td>
              <td className="py-2.5 pl-4"><span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold"><span className="size-2 rounded-full" style={{ background: bandColor(r.band) }} />{r.band || "n/a"}</span></td>
              {SIGNALS.map((s) => <td key={s.key} className="num py-2.5 text-right text-ink-2">{fmtPct0(r[s.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgencyDetail({ agency, select }: { agency: AgencySnapshotRow; select: Select }) {
  const { model, month } = useApp();
  const cohorts = model.story.cohorts.filter((c) => c.agency === agency.agency);
  const reps = model.story.reps.filter((r) => r.agency === agency.agency);
  const w = weak(agency);
  const prevRate = agency.prevSales ? (agency.prevCancels ?? 0) / agency.prevSales : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="Unique Sales" value={fmtInt(agency.sales)} sub={<>{fmtSignedPct(agency.prevSales ? (agency.sales ?? 0) / agency.prevSales - 1 : null)} vs Aug pace</>} />
        <Tile label="Cancellations" value={fmtInt(agency.cancels)} sub={<>{fmtInt(agency.prevCancels)} Aug pace</>} tone={w ? "bad" : "neutral"} />
        <Tile label="Cancel rate" value={fmtPct(agency.cancelRate)} sub={<> Aug pace {fmtPct(prevRate)}</>} tone={w ? "bad" : "neutral"} />
        <Tile label="Own history" value={fmtPct(agency.baseline)} sub="January to August average" />
        <Tile label="Change vs own history" value={fmtPp(agency.gap)} sub={agency.disposition ? `Disposition: ${agency.disposition}` : undefined} tone={w ? "bad" : "good"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Cancel rate by month" sub={`${agency.agency} against its own January to August history`}>
          <AgencyTrend model={model} agency={agency.agency} month={month} height={250} />
        </Panel>
        <Panel title="Order quality signals" sub="Share of the agency's orders showing each risk signal">
          <AgencySignals model={model} agency={agency.agency} />
        </Panel>
      </div>

      {cohorts.length > 0 && (
        <Panel title="Representative cohorts" sub="Share of the agency's sales vs share of its cancellations">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cohorts.map((c) => {
              const over = (c.cancelShare ?? 0) > (c.salesShare ?? 0) + 0.05;
              return (
                <div key={c.cohort} className={cn("rounded-[20px] border p-4", over ? "border-bad/30 bg-bad-soft/40" : "border-line bg-subtle/50")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[13.5px] font-semibold leading-snug">{c.cohort}</div>
                    <Badge tone={/critical/i.test(c.band) ? "bad" : /high|watch/i.test(c.band) ? "warn" : "neutral"}>{c.band || "n/a"}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-mute"><Users className="size-3.5" />{fmtInt(c.reps)} representatives</div>
                  <div className="mt-3 flex items-center gap-4">
                    <Donut size={92} thickness={11} data={[{ name: "Share of cancellations", value: c.cancelShare ?? 0, color: over ? "var(--color-bad)" : "var(--color-slate-soft)" }, { name: "Rest", value: 1 - (c.cancelShare ?? 0), color: "var(--color-line-2)" }]} center={<span className="num text-[15px] font-semibold">{fmtPct0(c.cancelShare)}</span>} />
                    <div className="space-y-1 text-[12px]">
                      <div><span className="text-mute">Sales share</span> <span className="num font-semibold">{fmtPct0(c.salesShare)}</span></div>
                      <div><span className="text-mute">Cancel share</span> <span className="num font-semibold">{fmtPct0(c.cancelShare)}</span></div>
                      <div><span className="text-mute">Cancel rate</span> <span className="num font-semibold">{fmtPct(c.rate)}</span></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {reps.length > 0 && (
        <Panel title={`Representatives (${reps.length})`} sub="Ranked by cancel rate. Select a representative to see their signals.">
          <RepTable reps={reps} select={select} />
        </Panel>
      )}
    </div>
  );
}

export function RepDetail({ rep, select }: { rep: RepRow; select: Select }) {
  const { model, month } = useApp();
  const peers = model.story.reps.filter((r) => r.agency === rep.agency);
  const rank = [...peers].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)).findIndex((r) => r.id === rep.id) + 1;
  const prevRate = rep.prevSales ? (rep.prevCancels ?? 0) / rep.prevSales : null;
  const crit = /critical|high/i.test(rep.band);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Unique Sales" value={fmtInt(rep.sales)} sub={(rep.prevSales ?? 0) > 0 ? <>{fmtInt(rep.prevSales)} Aug pace</> : "New in the period"} />
        <Tile label="Cancellations" value={fmtInt(rep.cancels)} sub={(rep.prevSales ?? 0) > 0 ? <>{fmtInt(rep.prevCancels)} Aug pace</> : undefined} tone={crit ? "bad" : "neutral"} />
        <Tile label="Cancel rate" value={fmtPct(rep.rate)} sub={prevRate !== null ? <> Aug pace {fmtPct(prevRate)}</> : undefined} tone={crit ? "bad" : "neutral"} />
        <Tile label="Watchtower band" value={rep.band || "n/a"} sub="Low ≤15%, Watch ≤25%, High ≤40%, Critical above" tone={crit ? "bad" : "neutral"} />
        <Tile label="Tenure" value={rep.tenure !== null ? `${fmtInt(rep.tenure)} mo` : "n/a"} sub={rep.cohort} />
        <Tile label="Rank in agency" value={`${rank} / ${peers.length}`} sub={`by ${monthName(month)} cancel rate`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Order quality signals" sub={`${rep.id} against ${rep.agency} and the steady agencies`}>
          <RepSignals model={model} rep={rep.id} />
        </Panel>
        <Panel title={`${rep.agency} representatives`} sub="Highlighted: this representative" right={<button onClick={() => select({ agency: rep.agency, rep: null })} className="flex items-center gap-1 rounded-full bg-subtle px-3 py-1.5 text-[12px] font-semibold text-mute transition hover:text-ink"><UserRound className="size-3.5" />Back to agency</button>}>
          <RepRanking reps={peers} highlight={rep.id} onSelect={(id) => select({ rep: id })} />
        </Panel>
      </div>
    </div>
  );
}
