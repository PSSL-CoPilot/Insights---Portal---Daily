"use client";

import { RankedBars, type RankedRow } from "./RankedBars";
import { C } from "./shared";
import { fmtInt, fmtPct0, fmtSignedPct } from "@/lib/format";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { reasonAnnotation, reasonStats } from "@/lib/data/metrics";
import { Badge } from "../ui/primitives";

/** Ranked customer-miss reasons. Late stage / anomalous reasons are highlighted from the data (growth + sheet flags). */
export function CustomerMissDrivers({ model, month, state, showInsight = true }: { model: DataModel; month: MonthKey; state: string | null; showInsight?: boolean }) {
  const stats = reasonStats(model, month, state);
  const rows: RankedRow[] = stats.map((r) => {
    const hot = r.mom !== null && r.mom > 0.25 && r.lateStage;
    const anno = state ? reasonAnnotation(model, month, state, r.label) : null;
    return {
      id: r.key,
      label: (
        <span className="flex items-center gap-2">
          {r.label}
          {hot && <Badge tone="bad" className="!px-1.5 !py-0 text-[9.5px] tracking-wider">RISING</Badge>}
        </span>
      ),
      value: r.count,
      valueLabel: `${fmtInt(r.count)} · ${fmtPct0(r.share)}`,
      sub: showInsight && anno?.insight ? anno.insight : undefined,
      chip: r.mom !== null ? { text: fmtSignedPct(r.mom), tone: r.mom > 0.02 ? "bad" : r.mom < -0.02 ? "good" : "neutral" } : undefined,
      color: hot ? C.bad : r.lateStage ? C.orange : C.lilac,
      emphasis: hot,
      tip: r.prevCount !== null ? `Prior month: ${fmtInt(r.prevCount)}` : undefined,
    };
  });
  if (!rows.some((r) => r.value)) return <div className="py-8 text-center text-sm text-mute">No Customer Miss reason data is available for this selection.</div>;
  return <RankedBars rows={rows} />;
}
