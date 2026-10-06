"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { parseKey, rangeKey } from "@/lib/data/daily";
import { monthLabel } from "@/lib/format";
import { cn } from "../ui/primitives";

const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Travel-site style range picker: click a start date, then an end date (the range previews on hover);
 * click the same date twice for a single day. Only dates with data can be picked.
 */
export function DateRangePicker({ dates, value, onChange, presets }: { dates: string[]; value: string; onChange: (key: string) => void; presets: { label: string; key: string }[] }) {
  const [open, setOpen] = useState(false);
  const [start, end] = parseKey(value);
  const [draft, setDraft] = useState<string | null>(null); // first click, waiting for the end date
  const [hover, setHover] = useState<string | null>(null);
  const months = useMemo(() => [...new Set(dates.map((d) => d.slice(0, 7)))], [dates]);
  const [page, setPage] = useState(() => months.indexOf(end.slice(0, 7)));
  const box = useRef<HTMLDivElement>(null);
  const has = useMemo(() => new Set(dates), [dates]);

  const close = () => { setOpen(false); setDraft(null); setHover(null); };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const pick = (d: string) => {
    if (!draft) return setDraft(d);
    const [a, b] = d < draft ? [d, draft] : [draft, d];
    onChange(rangeKey(a, b));
    close();
  };

  // What to paint: the committed range, or the draft previewed to the hovered date.
  const [lo, hi] = draft ? [draft, hover ?? draft].sort() : [start, end];
  const ym = months[Math.max(0, page)] ?? end.slice(0, 7);
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => iso(y, m, i + 1))];
  const days = (a: string, b: string) => dates.filter((d) => d >= a && d <= b).length;

  return (
    <div ref={box} className="relative">
      <button onClick={() => (open ? close() : (setPage(months.indexOf(end.slice(0, 7))), setOpen(true)))} aria-haspopup="dialog" aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-full border border-line/80 bg-card pl-4 pr-3 text-[13px] font-semibold text-ink shadow-card outline-none transition hover:shadow-pop focus-visible:ring-4 focus-visible:ring-brand/30 dark:border-white/[0.06]">
        <CalendarDays className="size-4 text-brand-2" />
        {presets.find((p) => p.key === value) && <span className="hidden whitespace-nowrap text-mute md:inline">{presets.find((p) => p.key === value)!.label} ·</span>}
        <span className="whitespace-nowrap">{monthLabel(value)}</span>
        <ChevronDown className={cn("size-4 text-mute transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Select dates"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute right-0 top-[52px] z-50 w-[380px] max-w-[calc(100vw-32px)] origin-top-right rounded-[20px] border border-line/80 bg-card p-4 shadow-pop dark:border-white/[0.08]">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-mute">Quick filters</div>
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button key={p.label} onClick={() => { onChange(p.key); close(); }}
                  className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                    value === p.key ? "border-brand-2 bg-brand-2 text-white" : "border-line/80 text-mute hover:border-brand-2/60 hover:text-ink dark:border-white/[0.08]")}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setPage((p) => p - 1)} disabled={page <= 0} aria-label="Previous month" className="grid size-8 place-items-center rounded-full text-mute transition hover:bg-line-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
              <div className="text-[14px] font-semibold">{MONTHS[m]} {y}</div>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= months.length - 1} aria-label="Next month" className="grid size-8 place-items-center rounded-full text-mute transition hover:bg-line-2 disabled:opacity-30"><ChevronRight className="size-4" /></button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-mute">
              {WEEK.map((w) => <div key={w} className="pb-1.5">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover(null)}>
              {cells.map((d, i) => {
                if (!d) return <div key={`x${i}`} />;
                const ok = has.has(d), inRange = d >= lo && d <= hi, edge = d === lo || d === hi;
                return (
                  <div key={d} className={cn("relative h-9", inRange && lo !== hi && "bg-brand-soft", d === lo && lo !== hi && "rounded-l-full", d === hi && lo !== hi && "rounded-r-full")}>
                    <button disabled={!ok} onClick={() => pick(d)} onMouseEnter={() => setHover(d)} aria-label={monthLabel(d)} aria-pressed={edge}
                      className={cn("relative z-10 mx-auto grid size-9 place-items-center rounded-full text-[13px] transition",
                        !ok && "cursor-not-allowed text-mute/40 line-through decoration-transparent",
                        ok && !edge && "font-medium text-ink hover:ring-2 hover:ring-brand-2/50",
                        edge && "bg-brand-2 font-semibold text-white shadow-card")}>
                      {+d.slice(8)}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-3 text-[12px] dark:border-white/[0.06]">
              <span className="text-mute">{draft ? "Now select the end date" : "Select a start date, then an end date"}</span>
              <span className="font-semibold">{draft ? `${days(lo, hi)} day${days(lo, hi) > 1 ? "s" : ""}` : `${days(start, end)} day${days(start, end) > 1 ? "s" : ""}`}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
