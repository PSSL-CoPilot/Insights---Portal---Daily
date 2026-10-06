"use client";

import { Donut } from "./Donut";
import { C } from "./shared";
import { fmtInt, fmtPct, fmtPct0, fmtPp } from "@/lib/format";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { getSnapshot, prevMonth } from "@/lib/data/metrics";
import { cn } from "../ui/primitives";

export const CLASS_COLORS = { cust: C.orange, co: C.slateDeep, faux: C.brand } as const;

/** Customer Miss / Company Miss / Faux donut with a supporting table (share, volume, MoM shift). */
export function CancelClassification({ model, month, state, compact }: { model: DataModel; month: MonthKey; state: string | null; compact?: boolean }) {
  const s = getSnapshot(model, month, state);
  const pm = prevMonth(model, month);
  const p = pm ? getSnapshot(model, pm, state) : null;
  const rows = [
    { id: "cust", name: "Customer Miss", pct: s.custPct, n: s.custMiss, prev: p?.custPct ?? null, color: CLASS_COLORS.cust, blurb: "Customer side" },
    { id: "co", name: "Company Miss", pct: s.coPct, n: s.coMiss, prev: p?.coPct ?? null, color: CLASS_COLORS.co, blurb: "Brightspeed operational" },
    { id: "faux", name: "Faux Cancel", pct: s.fauxPct, n: s.faux, prev: p?.fauxPct ?? null, color: CLASS_COLORS.faux, blurb: "No true revenue loss" },
  ];
  const dominant = [...rows].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const data = rows.filter((r) => r.pct !== null).map((r) => ({ name: r.name, value: r.pct as number, color: r.color, detail: fmtInt(r.n) }));
  return (
    <div className={cn("flex flex-wrap items-center gap-8", compact && "gap-5")}>
      <Donut
        size={compact ? 168 : 200}
        data={data}
        center={
          <div>
            <div className="num-display text-[26px] leading-none">{fmtPct0(dominant.pct)}</div>
            <div className="mt-1 text-[11px] font-medium text-mute">{dominant.name}</div>
          </div>
        }
      />
      <div className="min-w-[280px] flex-1">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-mute">
              <th className="pb-2 font-semibold">Class</th>
              <th className="pb-2 text-right font-semibold">Share</th>
              <th className="pb-2 text-right font-semibold">Cancels</th>
              <th className="pb-2 text-right font-semibold">vs prior period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.pct !== null && r.prev !== null ? r.pct - r.prev : null;
              return (
                <tr key={r.id} className="border-t border-line-2">
                  <td className="py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <span className="ml-[18px] text-[11px] text-mute">{r.blurb}</span>
                  </td>
                  <td className="num py-2.5 text-right font-semibold">{fmtPct(r.pct)}</td>
                  <td className="num py-2.5 text-right">{fmtInt(r.n)}</td>
                  <td className={cn("num py-2.5 text-right text-xs font-semibold", d === null ? "text-soft" : Math.abs(d) < 0.005 ? "text-mute" : r.id === "cust" || r.id === "co" ? (d > 0 ? "text-bad" : "text-good") : "text-mute")}>
                    {fmtPp(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
