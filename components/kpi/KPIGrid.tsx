"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useApp } from "../AppContext";
import { GROUPS, KPI_DEFS, type GroupId } from "@/lib/data/metrics";
import { monthLabel } from "@/lib/format";
import { KPICard } from "./KPICard";
import { Badge, SectionTitle } from "../ui/primitives";

const COLS: Record<GroupId, string> = {
  health: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  timing: "grid-cols-1 sm:grid-cols-3",
  responsibility: "grid-cols-2 xl:grid-cols-4",
  drivers: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  watch: "grid-cols-2 xl:grid-cols-4",
};

export function KPIGrid() {
  const { model, month, setMonth, state, setState, openKpi } = useApp();
  let n = 0;
  return (
    <section id="kpis" className="scroll-mt-24">
      <SectionTitle
        eyebrow="Key performance indicators"
        title="Where does it hurt?"
        sub="Every card is interactive: open one to trace it through states, channels, timing, classification and drivers."
        right={
          <div className="flex items-center gap-2.5">
            {state && (
              <button onClick={() => setState(null)} className="flex h-10 items-center gap-1.5 rounded-full bg-panel px-3.5 text-[12.5px] font-semibold text-white" title="Clear state filter">
                <MapPin className="size-3.5 text-brand" /> {state} ✕
              </button>
            )}
            <label className="relative block">
              <span className="sr-only">Month</span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 cursor-pointer appearance-none rounded-full border border-line bg-card pl-4 pr-9 text-[13px] font-semibold shadow-card outline-none hover:border-ink focus:border-ink"
              >
                {[...model.months].reverse().map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
            </label>
          </div>
        }
      />

      <div className="mt-6 space-y-9">
        {GROUPS.map((g, gi) => {
          const defs = KPI_DEFS.filter((k) => k.group === g.id);
          return (
            <div key={g.id}>
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-panel text-[11px] font-bold text-brand">{gi + 1}</span>
                <h3 className="text-[15px] font-semibold tracking-tight">{g.label}</h3>
                <Badge className="hidden sm:inline-flex">{g.question}</Badge>
              </div>
              <div className={`grid gap-3.5 ${COLS[g.id]}`}>
                {defs.map((d) => (
                  <KPICard key={d.id} def={d} model={model} month={month} state={state} onClick={() => openKpi(d.id)} delay={(n++ % 10) * 35} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
