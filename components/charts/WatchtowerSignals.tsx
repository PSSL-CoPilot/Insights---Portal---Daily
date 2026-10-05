"use client";

import { RankedBars, type RankedRow } from "./RankedBars";
import { C } from "./shared";
import { fmtInt, fmtPct0, fmtPp } from "@/lib/format";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { getSnapshot, prevMonth, watchSignals } from "@/lib/data/metrics";
import { Badge } from "../ui/primitives";

const KEY: Record<string, string> = { noAction: "noActionPct", pending: "pendingPct", action: "actionPct", jeopardy: "jeopardyPct", bsw: "bswPct" };

/** The five Watchtower states as ranked bars. The strongest actionable early warning signal is emphasised. */
export function WatchtowerSignals({ model, month, state }: { model: DataModel; month: MonthKey; state: string | null }) {
  const sig = watchSignals(model, month, state);
  const pm = prevMonth(model, month);
  const prev = pm ? getSnapshot(model, pm, state) : null;
  const strongest = [...sig].filter((s) => s.actionable && s.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];

  if (!sig.some((s) => s.pct !== null)) {
    return <div className="py-8 text-center text-sm text-mute">Watchtower signal data is not available for this selection.</div>;
  }

  const rows: RankedRow[] = sig.map((s) => {
    const p = prev?.[KEY[s.id]] ?? null;
    const d = s.pct !== null && p !== null ? s.pct - p : null;
    const key = strongest?.id === s.id;
    return {
      id: s.id,
      label: (
        <span className="flex items-center gap-2">
          {s.label}
          {key && <Badge tone="warn" className="!px-1.5 !py-0 text-[9.5px] tracking-wider">EARLY WARNING</Badge>}
        </span>
      ),
      value: s.pct,
      valueLabel: `${fmtPct0(s.pct)}${s.count !== null ? ` · ${fmtInt(s.count)}` : ""}`,
      sub: s.id === "noAction" ? "No prior warning" : s.actionable ? "Warning before cancellation" : undefined,
      chip: d !== null && Math.abs(d) >= 0.005 ? { text: fmtPp(d), tone: s.actionable ? (d > 0 ? "bad" : "good") : d > 0 ? "good" : "bad" } : undefined,
      color: s.id === "noAction" ? C.slate : key ? C.orange : s.id === "bsw" || s.id === "jeopardy" ? C.lilac : C.indigo,
      emphasis: key,
    };
  });
  return <RankedBars rows={rows} max={1} />;
}
