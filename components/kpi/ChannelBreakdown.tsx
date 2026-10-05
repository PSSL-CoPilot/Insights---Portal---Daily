"use client";

import { Layers } from "lucide-react";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { RankedBars, type RankedRow } from "../charts/RankedBars";
import { C } from "../charts/shared";
import { dirTone, EmptyState } from "../ui/primitives";
import { chScope, deltaOf, findFocusChannel, getSnapshot, kpiById, prevMonth, type KpiDef } from "@/lib/data/metrics";
import { fmtInt, fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";

/** Any KPI split by sales channel, ranked, with the month over month change coloured by business direction. */
export function ChannelBreakdown({ model, month, def = kpiById("cancels")!, onSelect }: { model: DataModel; month: MonthKey; def?: KpiDef; onSelect?: (channel: string) => void }) {
  if (!model.channelNames.length) {
    return (
      <EmptyState title="Channel data not available" icon={<Layers className="size-5" />}>
        Add a sheet named <strong>Channel Monthly</strong> to the workbook and this view fills in automatically.
      </EmptyState>
    );
  }
  const pm = prevMonth(model, month);
  const focus = findFocusChannel(model, month);
  const rows = model.channelNames.map((c) => {
    const v = getSnapshot(model, month, chScope(c))[def.key] ?? null;
    const p = pm ? getSnapshot(model, pm, chScope(c))[def.key] ?? null : null;
    return { c, v, d: deltaOf(def.unit, v, p) };
  });
  if (!rows.some((r) => r.v !== null)) return <div className="py-8 text-center text-sm text-mute">{def.label} is not recorded by channel.</div>;
  const total = def.unit === "count" ? rows.reduce((a, r) => a + (r.v ?? 0), 0) || 1 : null;
  const bars: RankedRow[] = [...rows]
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
    .map((r) => {
      const tone = dirTone(def.good, r.d?.value);
      const isFocus = def.good !== "up" && focus?.channel === r.c && (focus.contribution ?? 0) > 0.25;
      return {
        id: r.c, label: <span className="flex items-center gap-2">{r.c}{isFocus && <span className="rounded-full bg-bad-soft px-1.5 text-[9.5px] font-bold tracking-wider text-bad">FOCUS</span>}</span>,
        value: r.v,
        valueLabel: def.unit === "pct" ? fmtPct(r.v) : `${fmtInt(r.v)} · ${fmtPct((r.v ?? 0) / total!, 0)}`,
        chip: r.d ? { text: r.d.kind === "pp" ? fmtPp(r.d.value) : fmtSignedPct(r.d.value), tone } : undefined,
        color: isFocus ? C.bad : C.indigo, emphasis: isFocus,
        onClick: onSelect ? () => onSelect(r.c) : undefined, tip: onSelect ? `Open the ${r.c} analysis` : undefined,
      };
    });
  return <RankedBars rows={bars} />;
}
