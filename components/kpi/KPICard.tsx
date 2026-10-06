"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { assess, getSnapshot, kpiMeaning, prevMonth, series, snapVal, type KpiDef } from "@/lib/data/metrics";
import type { DataModel, MonthKey } from "@/lib/data/types";
import { fmtCompact, fmtInt, fmtPctSmart, fmtPp, fmtSignedPct, monthShort } from "@/lib/format";
import { Badge, cn, dirTone, toneColor } from "../ui/primitives";
import { Sparkline } from "../ui/Sparkline";

export function formatKpiValue(def: KpiDef, v: number | null, full = false): string {
  if (v === null) return "n/a";
  if (def.unit === "pct") return fmtPctSmart(v);
  return full || Math.abs(v) < 10000 ? fmtInt(v) : fmtCompact(v);
}

/** Compact count formatting used on cards: 7238 → "7.2K", 380 → "380". */
export function formatCompactKpi(def: KpiDef, v: number | null): string {
  if (v === null) return "n/a";
  if (def.unit === "pct") return fmtPctSmart(v);
  return Math.abs(v) >= 1000 ? fmtCompact(v) : fmtInt(v);
}

const SPOTLIGHT = new Set(["post", "pending"]);

export function KPICard({
  def, model, month, state, onClick, delay = 0, selected,
}: { def: KpiDef; model: DataModel; month: MonthKey; state: string | null; onClick: () => void; delay?: number; selected?: boolean }) {
  const snap = getSnapshot(model, month, state);
  const value = snapVal(snap, def.key);
  const pm = prevMonth(model, month);
  const prevVal = pm ? snapVal(getSnapshot(model, pm, state), def.key) : null;
  const a = assess(model, def, month, state);
  const d = a.delta;
  const spark = series(model, def.key, state).filter((p) => p.month <= month).map((p) => p.value);
  const companion = def.companion ? snapVal(snap, def.companion.key) : null;
  const meaning = kpiMeaning(model, def, month, state);
  const spotlight = SPOTLIGHT.has(def.id) && a.status === "critical";
  const unavailable = value === null;

  const dir = d ? (d.value > 0 ? "up" : d.value < 0 ? "down" : "flat") : "flat";
  const Arrow = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const tone = dirTone(def.good, d?.value);
  const deltaTxt = d ? (d.kind === "pp" ? fmtPp(d.value) : fmtSignedPct(d.value)) : "n/a";

  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group relative flex min-h-[158px] animate-rise flex-col justify-between overflow-hidden rounded-[22px] border p-4 text-left shadow-card transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        spotlight ? "border-panel bg-panel text-white" : a.status === "critical" ? "border-bad/40 bg-card" : "border-line bg-card hover:border-soft",
        selected && "ring-2 ring-brand",
        unavailable && "opacity-70",
      )}
      aria-label={`${def.label}: ${formatKpiValue(def, value)}. Open deep dive.`}
    >
      {spotlight && <div className="glow pointer-events-none absolute -right-14 -top-14 size-44" />}
      <div className="relative flex items-start justify-between gap-2">
        <div className={cn("text-[12px] font-semibold leading-tight", spotlight ? "text-white/70" : "text-mute")}>{def.label}</div>
        {a.anomaly && a.status !== "neutral" && (
          <Badge tone={a.status === "critical" ? "bad" : "warn"} className={cn("!px-1.5 !py-0 text-[9.5px] tracking-wider", spotlight && "!bg-brand !text-[#111]")}>
            {spotlight ? "FOCUS" : "EXCEPTION"}
          </Badge>
        )}
      </div>

      <div className="relative mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="num-display text-[34px] leading-none tracking-tight">{formatCompactKpi(def, value)}</div>
          {companion !== null && (
            <div className={cn("mt-1.5 text-[11px]", spotlight ? "text-white/60" : "text-mute")}>
              {fmtInt(companion)} <span className="opacity-80">{def.companion!.label.replace(/ cancels$/i, "")}</span>
            </div>
          )}
        </div>
        <div className="shrink-0">
          <Sparkline values={spark} color={spotlight ? "#FFC72C" : toneColor(tone)} width={84} height={34} />
        </div>
      </div>

      <div className={cn("relative mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-[11.5px]", spotlight ? "border-white/15" : "border-line-2")}>
        <span className={cn("flex items-center gap-1 font-semibold", tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : spotlight ? "text-white/70" : "text-mute")}>
          <Arrow className="size-3.5" />
          <span className="num">{deltaTxt}</span>
          <span className={cn("font-normal", spotlight ? "text-white/50" : "text-soft")}>vs prior period</span>
        </span>
        <span className={cn("num", spotlight ? "text-white/50" : "text-soft")} title={pm ? `${monthShort(pm)} value` : undefined}>
          {pm && prevVal !== null ? `${monthShort(pm)} ${formatCompactKpi(def, prevVal)}` : ""}
        </span>
      </div>

      {meaning && <div className={cn("relative mt-2 line-clamp-2 text-[11px] leading-snug", spotlight ? "text-white/60" : "text-mute")}>{meaning}</div>}
    </button>
  );
}
