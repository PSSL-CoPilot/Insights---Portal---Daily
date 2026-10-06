import type { MonthKey } from "./data/types";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const isDay = (m: MonthKey) => m.length === 10;
const isRange = (m: MonthKey) => m.includes("~");
const dayShort = (d: string) => `${MONTH_LONG[+d.slice(5, 7) - 1].slice(0, 3)} ${+d.slice(8, 10)}`;
/** "2026-09-10~2026-09-03" → "Sep 3 to 10" (the key puts the end first so it sorts at its last day). */
const rangeName = (m: MonthKey) => {
  const [end, start] = m.split("~");
  return start.slice(5, 7) === end.slice(5, 7) ? `${dayShort(start)} to ${+end.slice(8, 10)}` : `${dayShort(start)} to ${dayShort(end)}`;
};
/** Day-wise outlook keys: "next5" / "next30", the days after the selected end date. */
const isNext = (m: MonthKey) => /^next\d+$/.test(m);
const nextN = (m: MonthKey) => m.slice(4);
export const monthShort = (m: MonthKey) => (isNext(m) ? `Next ${nextN(m)}d` : isRange(m) ? rangeName(m) : isDay(m) ? dayShort(m) : MONTH_LONG[+m.slice(5, 7) - 1]?.slice(0, 3) ?? m);
export const monthName = (m: MonthKey) => (isNext(m) ? `Next ${nextN(m)} days` : isRange(m) ? rangeName(m) : isDay(m) ? dayShort(m) : MONTH_LONG[+m.slice(5, 7) - 1] ?? m);
export const monthLabel = (m: MonthKey) => (isNext(m) ? `Next ${nextN(m)} days` : isRange(m) ? `${rangeName(m)}, ${m.slice(0, 4)}` : isDay(m) ? `${dayShort(m)}, ${m.slice(0, 4)}` : `${monthName(m)} ${m.slice(0, 4)}`);

export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : Math.round(v).toLocaleString("en-US"));

export function fmtCompact(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "n/a";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(digits)}M`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(digits)}K`;
  return String(Math.round(v));
}

/** Fraction → "18.7%". */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "n/a";
  return `${(v * 100).toFixed(digits)}%`;
}
export const fmtPct0 = (v: number | null | undefined) => fmtPct(v, 0);

/** Signed relative change: 0.30 → "+30%". */
export function fmtSignedPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "n/a";
  const p = v * 100;
  const z = Number(Math.abs(p).toFixed(digits)) === 0;
  return `${z ? "" : p > 0 ? "+" : "−"}${Math.abs(p).toFixed(digits)}%`;
}

/** Signed percentage-point change: 0.15 → "+15 pp". */
export function fmtPp(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "n/a";
  const p = v * 100;
  const z = Number(Math.abs(p).toFixed(digits)) === 0;
  return `${z ? "" : p > 0 ? "+" : "−"}${Math.abs(p).toFixed(digits)} pp`;
}

export const stateSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const slugToState = (slug: string, states: string[]) => states.find((s) => stateSlug(s) === slug) ?? null;

export function fmtDate(iso: string | null): string {
  if (!iso) return "n/a";
  const [, m, d] = iso.split("-");
  return `${monthShort(`2000-${m}`)} ${+d}`;
}

/** Percent with 0 decimals when the value is (nearly) whole, else 1 decimal: keeps "57%" and "18.7%" both tidy. */
export function fmtPctSmart(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  const p = v * 100;
  return Math.abs(p - Math.round(p)) < 0.05 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
}
