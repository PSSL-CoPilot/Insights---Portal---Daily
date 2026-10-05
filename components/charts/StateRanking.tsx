"use client";

import { RankedBars, type RankedRow } from "./RankedBars";
import { C } from "./shared";
import { fmtInt, fmtPct, fmtPct0, fmtSignedPct } from "@/lib/format";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { channelRows, findFocusChannel, findHotspot, stateRows, type KpiDef, type StateRow } from "@/lib/data/metrics";
import { ArrowUpRight } from "lucide-react";
import { Badge, cn } from "../ui/primitives";

export type PlanKind = "state" | "channel";

/** Rows for either dimension, keyed by `name`, plus the data-detected focus row. */
export function planRows(model: DataModel, month: MonthKey, kind: PlanKind): { rows: (Omit<StateRow, "state"> & { name: string })[]; focus: string | null } {
  if (kind === "channel") {
    const f = findFocusChannel(model, month);
    return { rows: channelRows(model, month).map((r) => ({ ...r, name: r.channel })), focus: f && (f.contribution ?? 0) > 0.25 ? f.channel : null };
  }
  const h = findHotspot(model, month);
  return { rows: stateRows(model, month).map((r) => ({ ...r, name: r.state })), focus: h && (h.cancelsMoM ?? 0) > 0.15 ? h.state : null };
}

/** Horizontal ranking of states (or channels) for a KPI. The data-detected focus stands out; every bar is clickable. */
export function StateRanking({
  model, month, def, selectedState, onSelect, kind = "state",
}: { model: DataModel; month: MonthKey; def: KpiDef; selectedState?: string | null; onSelect?: (name: string) => void; kind?: PlanKind }) {
  const { rows, focus } = planRows(model, month, kind);
  const fmt = (v: number | null) => (v === null ? "n/a" : def.unit === "pct" ? fmtPct(v) : fmtInt(v));
  const sorted = rows.map((r) => ({ r, v: r.snapshot[def.key] ?? null })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  if (!sorted.some((x) => x.v !== null)) {
    return <div className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-mute">{def.label} is not available by {kind} for this month.</div>;
  }
  const bars: RankedRow[] = sorted.map(({ r, v }) => {
    // Growth measures (sales, installs) are never flagged as a problem focus.
    const isHot = def.good !== "up" && focus === r.name;
    return {
      id: r.name,
      label: (
        <span className="flex items-center gap-2">
          {r.name}
          {isHot && <Badge tone="bad" className="!px-1.5 !py-0 text-[9.5px] tracking-wider">FOCUS</Badge>}
        </span>
      ),
      value: v,
      valueLabel: fmt(v),
      sub: r.cancelsMoM !== null ? `Cancellations ${fmtSignedPct(r.cancelsMoM)} vs prior month` : undefined,
      color: isHot ? C.bad : selectedState === r.name ? C.orange : C.lilac,
      emphasis: isHot || selectedState === r.name,
      onClick: onSelect ? () => onSelect(r.name) : undefined,
      tip: `Open ${r.name}`,
    };
  });
  return <RankedBars rows={bars} />;
}

export function StateTable({
  model, month, selectedState, onSelect, onDrill, kind = "state", highlightFocus = true,
}: { model: DataModel; month: MonthKey; selectedState?: string | null; onSelect?: (s: string) => void; onDrill?: (s: string) => void; kind?: PlanKind; highlightFocus?: boolean }) {
  const { rows, focus } = planRows(model, month, kind);
  const sorted = [...rows].sort((a, b) => (b.cancels ?? 0) - (a.cancels ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="text-right text-[11px] uppercase tracking-wider text-mute">
            <th className="pb-2 pl-3 text-left font-semibold">{kind === "state" ? "State" : "Channel"}</th>
            <th className="pb-2 font-semibold">Sales</th>
            <th className="pb-2 font-semibold">Installs</th>
            <th className="pb-2 font-semibold">Cancels</th>
            <th className="pb-2 font-semibold">Cancel rate</th>
            <th className="pb-2 font-semibold">Growth vs Aug pace</th>
            <th className="pb-2 font-semibold">Post ODD</th>
            <th className="pb-2 pr-3 font-semibold">Pending contact</th>
            {onDrill && <th className="pb-2 pr-3" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isHot = highlightFocus && focus === r.name;
            return (
              <tr
                key={r.name}
                onClick={onSelect ? () => onSelect(r.name) : undefined}
                className={cn("border-t border-line-2 text-right transition", onSelect && "cursor-pointer hover:bg-subtle", isHot && "bg-bad-soft", selectedState === r.name && "bg-indigo-soft")}
              >
                <td className="py-2.5 pl-3 text-left font-semibold">
                  <span className="flex items-center gap-2">{r.name}{isHot && <span className="size-1.5 rounded-full bg-bad" />}</span>
                </td>
                <td className="num py-2.5">{fmtInt(r.sales)}</td>
                <td className="num py-2.5">{fmtInt(r.installs)}</td>
                <td className="num py-2.5 font-semibold">{fmtInt(r.cancels)}</td>
                <td className="num py-2.5">{fmtPct(r.cancelRate)}</td>
                <td className={cn("num py-2.5 font-semibold", (r.cancelsMoM ?? 0) > 0.005 ? "text-bad" : (r.cancelsMoM ?? 0) < -0.005 ? "text-good" : "text-mute")}>{fmtSignedPct(r.cancelsMoM)}</td>
                <td className="num py-2.5">{fmtPct0(r.postPct)}</td>
                <td className="num py-2.5 pr-3">{fmtPct0(r.pendingPct)}</td>
                {onDrill && (
                  <td className="py-1.5 pr-2 text-right">
                    <button onClick={(e) => { e.stopPropagation(); onDrill(r.name); }} title={`Open the ${r.name} analysis`}
                      className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-panel px-2.5 text-[11.5px] font-semibold text-white transition-transform duration-200 hover:-translate-y-px">
                      Drill <ArrowUpRight className="size-3" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
