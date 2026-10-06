/**
 * Day-wise model. The server reads the daily sheets (September 1 to 30) once (`attachDaily`); the browser
 * then re-expresses any selected date range in the app's existing DataModel shape (`rangeModel`), so every
 * page, chart and story keeps working unchanged.
 *  - Period keys: a single day is "2026-09-05"; a range is "<end>~<start>" ("2026-09-10~2026-09-03"),
 *    so plain string ordering still places a range at its last day; month to date adds "~mtd".
 *  - Every period (month to date included) is compared with the period just before it: a day with the day
 *    before, N days with the previous N days.
 *  - The last date in the workbook is "today"; the main story is the last 30 days.
 *  - The story sheets (agencies, reps, drivers) are restated on the selected days.
 */
import type * as XLSX from "xlsx";
import type {
  AgencySnapshotRow, ChannelMonthlyRow, DataIssue, DataModel, MonthKey, MonthlyOverviewRow, ReasonRow, RepCohortRow, RepRow,
  StateChannelRow, StateMonthlyRow,
} from "./types";
import { getSheet, parseTable, sheetGrid, type Row, type TableSpec } from "./tableParser";

const opt = { required: false } as const;

export interface DetectionRow { signal: string; scope: string; threshold: string; date: string | null; value: number | null; daysBefore: number | null; meaning: string }
export interface PredictionRow {
  scope: string; sales10: number | null; cancels10: number | null; rate10: number | null; cancelsWith10: number | null; rateWith10: number | null;
  avoided10: number | null; salesMonth: number | null; rateMonth: number | null; cancelsWithMonth: number | null; rateWithMonth: number | null; avoidedMonth: number | null;
}
export interface DailyPredictionRow { date: string; scope: string; sales: number | null; cancels: number | null; low: number | null; high: number | null; cancelsWith: number | null; avoided: number | null }
type Raw = Record<"st" | "wt" | "rs" | "scd" | "ag" | "rp", Row[]>;
export interface Preset { id: "latest" | "5" | "7" | "30" | "mtd"; label: string; key: MonthKey }
export interface DailyExtras {
  /** Every day with data (ISO), ascending. */
  dates: string[];
  /** Monthly month the daily data follows (August) and its day count. */
  src: MonthKey;
  srcDays: number;
  /** Typical day to day deviation of portfolio cancellations (relative): the noise floor for short ranges. */
  noise: number;
  detection: DetectionRow[];
  prediction: PredictionRow[];
  predictionDaily: DailyPredictionRow[];
  raw: Raw;
  /** Weekday weights (Sun..Sat, mean 1) read from the daily sales, so a Wednesday is compared with an August Wednesday. */
  dow: number[];
  /** The last 30 days: which agencies broke from their own history and each state x channel cancel rate.
   *  The story names the same partners and channels whatever period is selected. */
  stable: { agencyGap: Record<string, number | null>; channelRate: Record<string, number | null> };
  // ---- set by rangeModel
  start?: string;
  end?: string;
  /** Number of days in the selected range. */
  days?: number;
  /** Days behind every period key of the range model (the selection, its comparison period and each day). */
  periods?: Record<string, string[]>;
  /** Next 5 / 30 days from the selected end date (portfolio). */
  outlook?: Record<5 | 30, Forecast>;
  /** Forward-looking horizon the plan, the actions and the outlook use (5 or 30 days). */
  horizon?: Horizon;
  /** The monthly model (Jan to Sep): month to month history for the anomaly test. */
  monthly?: DataModel;
}

// ------------------------------------------------------------------ keys
export const rangeKey = (start: string, end: string) => (start === end ? end : `${end}~${start}`);
export const parseKey = (k: MonthKey): [string, string] => { const [e, s] = k.split("~"); return [!s || s === "mtd" ? e : s, e]; };
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** The comparison period: the same number of days immediately before. Null when the data does not reach back that far. */
export function prevKeyOf(m: DataModel, key: MonthKey): MonthKey | null {
  const D = m.daily!, [s, e] = parseKey(key);
  const i = D.dates.indexOf(s), j = D.dates.indexOf(e), len = j - i + 1;
  return i - len < 0 ? null : rangeKey(D.dates[i - len], D.dates[i - 1]);
}
export const isRangeKey = (k: MonthKey) => k.includes("~");
export const validKey = (m: DataModel, k: MonthKey | null | undefined) => {
  if (!k || !m.daily) return false;
  const [s, e] = parseKey(k);
  return s <= e && m.daily.dates.includes(s) && m.daily.dates.includes(e);
};
/** Quick filters, all ending today (the last date with data). */
export function presets(m: DataModel): Preset[] {
  const d = m.daily!.dates, today = d[d.length - 1], from = (n: number) => d[Math.max(0, d.length - n)];
  return [
    { id: "latest", label: "Latest day", key: today },
    { id: "5", label: "Last 5 days", key: rangeKey(from(5), today) },
    { id: "7", label: "Last 7 days", key: rangeKey(from(7), today) },
    { id: "30", label: "Last 30 days", key: rangeKey(from(30), today) },
    { id: "mtd", label: "Month to date", key: `${today}~${d.find((x) => x.slice(0, 7) === today.slice(0, 7))!}~mtd` },
  ];
}
/** Default selection: the last 30 days (the main story). */
export const defaultKey = (m: DataModel) => presets(m).find((p) => p.id === "30")!.key;

// ------------------------------------------------------------------ server: read the daily sheets
const T = (sheet: string, spec: TableSpec, wb: XLSX.WorkBook, issues: DataIssue[]): Row[] => {
  const ws = getSheet(wb, sheet);
  if (!ws) return [];
  return parseTable(sheetGrid(ws), spec, { sheet, stopAtBlank: true, optional: true }, issues)?.rows ?? [];
};
const n = (v: unknown) => (typeof v === "number" ? v : 0);
const s = (v: unknown) => (v == null ? "" : String(v));
const rate = (a: number, b: number) => (b ? a / b : null);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };

export function attachDaily(m: DataModel, wb: XLSX.WorkBook): DataModel {
  const issues = m.issues;
  const st = T("Daily State", {
    date: { kind: "d", headers: ["Date"] }, state: { kind: "s", headers: ["State"] },
    sales: { kind: "n", headers: ["Unique Sales"] }, installs: { kind: "n", headers: ["Installs"] }, cancels: { kind: "n", headers: ["Cancellations"] },
    pre: { kind: "n", headers: ["Pre ODD Cancels"] }, on: { kind: "n", headers: ["On ODD Cancels"] }, post: { kind: "n", headers: ["Post ODD Cancels"] },
    cust: { kind: "n", headers: ["Customer Miss"] }, co: { kind: "n", headers: ["Company Miss"] }, faux: { kind: "n", headers: ["Faux Cancels"] },
    onTime: { kind: "p", headers: ["On Time Install %"], ...opt },
  }, wb, issues);
  if (!st.length) return m; // not a day-wise workbook
  const raw: Raw = {
    st,
    wt: T("Daily Watchtower", {
      date: { kind: "d", headers: ["Date"] }, state: { kind: "s", headers: ["State"] },
      pending: { kind: "n", headers: ["Pending Customer Contact"] }, action: { kind: "n", headers: ["Action Needed Not Jeopardy"] },
      jeopardy: { kind: "n", headers: ["Install in Jeopardy"] }, bsw: { kind: "n", headers: ["BSW Delay Predicted"] },
    }, wb, issues),
    rs: T("Daily Customer Miss Reasons", { date: { kind: "d", headers: ["Date"] }, state: { kind: "s", headers: ["State"] }, reason: { kind: "s", headers: ["Reason"] }, count: { kind: "n", headers: ["Count"] } }, wb, issues),
    scd: T("Daily State x Channel", { date: { kind: "d", headers: ["Date"] }, state: { kind: "s", headers: ["State"] }, channel: { kind: "s", headers: ["Channel"] }, sales: { kind: "n", headers: ["Unique Sales"] }, installs: { kind: "n", headers: ["Installs"] }, cancels: { kind: "n", headers: ["Cancellations"] } }, wb, issues),
    ag: T("Daily NC Agency", { date: { kind: "d", headers: ["Date"] }, agency: { kind: "s", headers: ["Agency"] }, sales: { kind: "n", headers: ["Unique Sales"] }, cancels: { kind: "n", headers: ["Cancellations"] } }, wb, issues),
    rp: T("Daily NC Reps", { date: { kind: "d", headers: ["Date"] }, id: { kind: "s", headers: ["Rep ID"] }, sales: { kind: "n", headers: ["Unique Sales"] }, cancels: { kind: "n", headers: ["Cancellations"] } }, wb, issues),
  };
  const det = T("Detection Timeline", {
    signal: { kind: "s", headers: ["Signal"] }, scope: { kind: "s", headers: ["Scope"] }, threshold: { kind: "s", headers: ["Threshold"], ...opt },
    date: { kind: "d", headers: ["First Flagged"] }, value: { kind: "p", headers: ["Value That Day"], ...opt }, days: { kind: "n", headers: ["Days Before Today", "Days Before Month End"], ...opt }, meaning: { kind: "s", headers: ["Meaning"], ...opt },
  }, wb, issues);
  const pr = T("October Prediction Summary", {
    scope: { kind: "s", headers: ["Scope"] }, sales10: { kind: "n", headers: ["Next 10 Days Predicted Sales"] }, cancels10: { kind: "n", headers: ["Next 10 Days Cancels (no action)"] },
    rate10: { kind: "p", headers: ["Next 10 Days Rate (no action)"] }, cancelsWith10: { kind: "n", headers: ["Next 10 Days Cancels (with action)"] }, rateWith10: { kind: "p", headers: ["Next 10 Days Rate (with action)"] },
    avoided10: { kind: "n", headers: ["Next 10 Days Avoided"] }, salesMonth: { kind: "n", headers: ["October Predicted Sales"] }, rateMonth: { kind: "p", headers: ["October Rate (no action)"] },
    cancelsWithMonth: { kind: "n", headers: ["October Cancels (with action)"] }, rateWithMonth: { kind: "p", headers: ["October Rate (with action)"] }, avoidedMonth: { kind: "n", headers: ["October Avoided"] },
  }, wb, issues);
  const pd = T("October Daily Prediction", {
    date: { kind: "d", headers: ["Date"] }, scope: { kind: "s", headers: ["Scope"] }, sales: { kind: "n", headers: ["Predicted Sales"] }, cancels: { kind: "n", headers: ["Predicted Cancels (no action)"] },
    low: { kind: "n", headers: ["Prediction Range Low"] }, high: { kind: "n", headers: ["Prediction Range High"] }, cancelsWith: { kind: "n", headers: ["Predicted Cancels (with action)"] }, avoided: { kind: "n", headers: ["Cancellations Avoided"] },
  }, wb, issues);

  const dates = [...new Set(st.map((r) => s(r.date)))].filter(Boolean).sort();
  const src = [...m.months].filter((x) => x < dates[0].slice(0, 7)).pop()!;
  // Noise: each day's portfolio cancellations against its centred 7 day mean (weekday swings, not trend).
  const daily = dates.map((d) => sum(st.filter((r) => r.date === d).map((r) => n(r.cancels))));
  const dev = daily.slice(3, -3).map((v, i) => Math.abs(v / (sum(daily.slice(i, i + 7)) / 7) - 1));
  const salesByDay = dates.map((d) => sum(st.filter((r) => r.date === d).map((r) => n(r.sales))));
  const avgSales = sum(salesByDay) / dates.length;
  const dow = [0, 1, 2, 3, 4, 5, 6].map((w) => { const v = salesByDay.filter((_, i) => new Date(`${dates[i]}T00:00:00Z`).getUTCDay() === w); return v.length ? sum(v) / v.length / avgSales : 1; });
  const w30 = new Set(dates.slice(-30)), in30 = (r: Row) => w30.has(s(r.date));
  const agencyGap = Object.fromEntries(m.story.agencies.map((a) => {
    const rows = raw.ag.filter((r) => in30(r) && r.agency === a.agency), r = rate(sum(rows.map((x) => n(x.cancels))), sum(rows.map((x) => n(x.sales))));
    return [a.agency, r !== null && a.baseline !== null ? r - a.baseline : null];
  }));
  const channelRate: Record<string, number | null> = {};
  for (const r of raw.scd.filter(in30)) { const k = `${r.state}|${r.channel}`; channelRate[k] = 0; }
  for (const k of Object.keys(channelRate)) { const rows = raw.scd.filter((r) => in30(r) && `${r.state}|${r.channel}` === k); channelRate[k] = rate(sum(rows.map((x) => n(x.cancels))), sum(rows.map((x) => n(x.sales)))); }

  return {
    ...m,
    daily: {
      dates, src, srcDays: new Date(Date.UTC(+src.slice(0, 4), +src.slice(5, 7), 0)).getUTCDate(), noise: median(dev) || 0.05,
      detection: det.map((r) => ({ signal: s(r.signal), scope: s(r.scope), threshold: s(r.threshold), date: (r.date as string) ?? null, value: (r.value as number) ?? null, daysBefore: (r.days as number) ?? null, meaning: s(r.meaning) })),
      prediction: pr.map((r) => ({ scope: s(r.scope), sales10: r.sales10 as number, cancels10: r.cancels10 as number, rate10: r.rate10 as number, cancelsWith10: r.cancelsWith10 as number, rateWith10: r.rateWith10 as number, avoided10: r.avoided10 as number, salesMonth: r.salesMonth as number, rateMonth: r.rateMonth as number, cancelsWithMonth: r.cancelsWithMonth as number, rateWithMonth: r.rateWithMonth as number, avoidedMonth: r.avoidedMonth as number })),
      predictionDaily: pd.map((r) => ({ date: s(r.date), scope: s(r.scope), sales: r.sales as number, cancels: r.cancels as number, low: r.low as number, high: r.high as number, cancelsWith: r.cancelsWith as number, avoided: r.avoided as number })),
      raw, dow, stable: { agencyGap, channelRate },
    },
  };
}

// ------------------------------------------------------------------ browser: one model per selected range
/** Rows of each daily table grouped by date (built once per workbook). */
const indexCache = new WeakMap<Raw, Record<keyof Raw, Map<string, Row[]>>>();
function byDate(raw: Raw) {
  let ix = indexCache.get(raw);
  if (!ix) {
    ix = {} as Record<keyof Raw, Map<string, Row[]>>;
    for (const k of Object.keys(raw) as (keyof Raw)[]) {
      const mp = new Map<string, Row[]>();
      for (const r of raw[k]) { const d = s(r.date); mp.set(d, [...(mp.get(d) ?? []), r]); }
      ix[k] = mp;
    }
    indexCache.set(raw, ix);
  }
  return ix;
}

/** Largest remainder split of `total` by `weights` (counts that still add up). */
function alloc(total: number, weights: number[]) {
  const W = sum(weights) || 1;
  const raw = weights.map((w) => (w / W) * total);
  const out = raw.map(Math.floor);
  let rest = total - sum(out);
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest-- > 0) out[i]++; });
  return out;
}

export function rangeModel(m: DataModel, key: MonthKey, horizon: Horizon = 30): DataModel {
  const D = m.daily!;
  const [start, end] = parseKey(key);
  const sel = D.dates.filter((d) => d >= start && d <= end);
  const ix = byDate(D.raw);
  const prev = prevKeyOf(m, key);
  const [ps, pe] = prev ? parseKey(prev) : ["", ""];
  const prevSel = D.dates.filter((d) => d >= ps && d <= pe);
  // Periods: every single day (the daily trend), the selected range and its comparison period.
  const keys = [...D.dates, ...[key, prev].filter((k): k is string => !!k && isRangeKey(k))];
  const periods: Record<string, string[]> = { [key]: sel, ...(prev ? { [prev]: prevSel } : {}) };
  const daysOf = (k: string) => periods[k] ?? [k];
  const total = (t: keyof Raw, k: string, f: (r: Row) => boolean, field: string) => {
    let v = 0;
    for (const d of daysOf(k)) for (const r of ix[t].get(d) ?? []) if (f(r)) v += n(r[field]);
    return v;
  };


  const STATES = m.states, CH = m.channelNames;
  /** On Time Install %, weighted by installs over the period's days. */
  const onTimeOf = (k: string, state: string | null) => {
    let w = 0, v = 0;
    for (const d of daysOf(k)) for (const r of ix.st.get(d) ?? []) if ((!state || r.state === state) && typeof r.onTime === "number") { w += n(r.installs); v += n(r.installs) * n(r.onTime); }
    return w ? v / w : null;
  };

  // ---- states
  const stateRows: StateMonthlyRow[] = [];
  for (const k of keys) for (const state of STATES) {
    const f = (r: Row) => r.state === state;
    const v = (field: string) => total("st", k, f, field), w = (field: string) => total("wt", k, f, field);
    const cancels = v("cancels"), sales = v("sales");
    stateRows.push({
      month: k, state, sales, installs: v("installs"), cancels, cancelRate: rate(cancels, sales), cancelsMoM: null,
      preCancels: v("pre"), prePct: rate(v("pre"), cancels), onCancels: v("on"), onPct: rate(v("on"), cancels), postCancels: v("post"), postPct: rate(v("post"), cancels),
      custMiss: v("cust"), custPct: rate(v("cust"), cancels), coMiss: v("co"), coPct: rate(v("co"), cancels), faux: v("faux"), fauxPct: rate(v("faux"), cancels),
      pendingPct: rate(w("pending"), cancels), actionPct: rate(w("action"), cancels), jeopardyPct: rate(w("jeopardy"), cancels), bswPct: rate(w("bsw"), cancels),
      onTimePct: onTimeOf(k, state),
    });
  }

  // ---- portfolio
  const byKey = new Map<string, StateMonthlyRow[]>();
  for (const r of stateRows) byKey.set(r.month, [...(byKey.get(r.month) ?? []), r]);
  const tot = (rows: StateMonthlyRow[], f: keyof StateMonthlyRow) => sum(rows.map((r) => (r[f] as number | null) ?? 0));
  const wsum = (rows: StateMonthlyRow[], f: keyof StateMonthlyRow) => sum(rows.map((r) => ((r[f] as number | null) ?? 0) * (r.cancels ?? 0)));
  const portRow = (k: string): MonthlyOverviewRow => {
    const rows = byKey.get(k)!, c = tot(rows, "cancels"), sa = tot(rows, "sales");
    return {
      month: k, sales: sa, salesMoM: null, installs: tot(rows, "installs"), installRate: rate(tot(rows, "installs"), sa), cancels: c, cancelsMoM: null, cancelRate: rate(c, sa),
      prePct: rate(tot(rows, "preCancels"), c), onPct: rate(tot(rows, "onCancels"), c), postPct: rate(tot(rows, "postCancels"), c),
      custPct: rate(tot(rows, "custMiss"), c), coPct: rate(tot(rows, "coMiss"), c), fauxPct: rate(tot(rows, "faux"), c),
      pendingPct: rate(wsum(rows, "pendingPct"), c), actionPct: rate(wsum(rows, "actionPct"), c), jeopardyPct: rate(wsum(rows, "jeopardyPct"), c), bswPct: rate(wsum(rows, "bswPct"), c),
      onTimePct: onTimeOf(k, null),
    };
  };
  const monthlyOverview = keys.map(portRow);
  const oddTiming = [
    ...keys.map((k) => { const rows = byKey.get(k)!, c = tot(rows, "cancels"); return { month: k, preCancels: tot(rows, "preCancels"), prePct: rate(tot(rows, "preCancels"), c), onCancels: tot(rows, "onCancels"), onPct: rate(tot(rows, "onCancels"), c), postCancels: tot(rows, "postCancels"), postPct: rate(tot(rows, "postCancels"), c) }; }),
  ];
  const classification = [
    ...keys.map((k) => { const rows = byKey.get(k)!, c = tot(rows, "cancels"); return { month: k, custMiss: tot(rows, "custMiss"), custPct: rate(tot(rows, "custMiss"), c), coMiss: tot(rows, "coMiss"), coPct: rate(tot(rows, "coMiss"), c), faux: tot(rows, "faux"), fauxPct: rate(tot(rows, "faux"), c) }; }),
  ];

  // ---- reasons
  const reasonNames = [...new Set(D.raw.rs.map((r) => s(r.reason)))];
  const customerMissReasons: ReasonRow[] = [
    ...keys.flatMap((k) => STATES.flatMap((state) => {
      const counts = reasonNames.map((reason) => total("rs", k, (r) => r.state === state && r.reason === reason, "count"));
      const t = sum(counts);
      return reasonNames.map((reason, i) => ({ month: k, state, reason, count: counts[i], share: rate(counts[i], t), mom: null, flag: null, insight: null }));
    })),
  ];

  // ---- channels (timing and Watchtower mix estimated from each state's mix, weighted by the channel's cancellations there)
  const scv = (k: string, state: string, ch: string, field: string) => total("scd", k, (r) => r.state === state && r.channel === ch, field);
  const channels: ChannelMonthlyRow[] = [
    ...keys.flatMap((k) => CH.map((ch) => {
      const per = STATES.map((state) => ({ c: scv(k, state, ch, "cancels"), sr: byKey.get(k)!.find((r) => r.state === state)! }));
      const cancels = sum(per.map((p) => p.c)), sales = sum(STATES.map((state) => scv(k, state, ch, "sales")));
      const est = (f: keyof StateMonthlyRow) => rate(sum(per.map((p) => p.c * ((p.sr[f] as number | null) ?? 0))), cancels);
      const cnt = (f: keyof StateMonthlyRow) => { const v = est(f); return v === null ? null : Math.round(v * cancels); };
      return {
        month: k, channel: ch, sales, installs: sum(STATES.map((state) => scv(k, state, ch, "installs"))), cancels, cancelRate: rate(cancels, sales),
        preCancels: cnt("prePct"), prePct: est("prePct"), onCancels: cnt("onPct"), onPct: est("onPct"), postCancels: cnt("postPct"), postPct: est("postPct"),
        custMiss: cnt("custPct"), custPct: est("custPct"), coMiss: cnt("coPct"), coPct: est("coPct"), faux: cnt("fauxPct"), fauxPct: est("fauxPct"),
        pendingPct: est("pendingPct"), actionPct: est("actionPct"), jeopardyPct: est("jeopardyPct"), bswPct: est("bswPct"), onTimePct: null,
      };
    })),
  ];

  // ---- selected range: drill, Watchtower, state x channel
  const last = byKey.get(key)!;
  const lastBase = (state: string) => (prev ? byKey.get(prev)?.find((r) => r.state === state) : undefined);
  const stateDrill = last.map((r) => ({ state: r.state, sales: r.sales, installs: r.installs, cancels: r.cancels, cancelRate: r.cancelRate, cancelGrowth: r.cancels !== null && lastBase(r.state)?.cancels ? r.cancels / lastBase(r.state)!.cancels! - 1 : null, prePct: r.prePct, onPct: r.onPct, postPct: r.postPct, custPct: r.custPct, pendingPct: r.pendingPct, onTimePct: r.onTimePct }));
  const watchRow = (state: string, r: { pendingPct: number | null; actionPct: number | null; jeopardyPct: number | null; bswPct: number | null }, isPortfolio: boolean) => ({
    state, isPortfolio, pendingPct: r.pendingPct, actionPct: r.actionPct, jeopardyPct: r.jeopardyPct, bswPct: r.bswPct,
    noActionPct: Math.max(0, 1 - (r.pendingPct ?? 0) - (r.actionPct ?? 0) - (r.jeopardyPct ?? 0) - (r.bswPct ?? 0)), interpretation: null,
  });
  const watchtower = [...last.map((r) => watchRow(r.state, r, false)), watchRow("Portfolio", portRow(key), true)];
  const stateChannel: StateChannelRow[] = STATES.flatMap((state) => CH.map((ch) => {
    const sr = last.find((r) => r.state === state)!;
    const c = scv(key, state, ch, "cancels"), sa = scv(key, state, ch, "sales");
    return { state, channel: ch, sales: sa, installs: scv(key, state, ch, "installs"), cancels: c, cancelRate: rate(c, sa), cancelGrowth: null, postPct: sr.postPct, custPct: sr.custPct, pendingPct: sr.pendingPct };
  }));

  // ---- story restated on the selected days
  const story = { ...m.story, month: key };
  const pv = (t: keyof Raw, f: (r: Row) => boolean, field: string) => (prev ? total(t, prev, f, field) : null);
  const agv = (name: string, field: string) => total("ag", key, (r) => r.agency === name, field);
  story.agencies = m.story.agencies.map((a): AgencySnapshotRow => {
    const sales = agv(a.agency, "sales"), cancels = agv(a.agency, "cancels"), r = rate(cancels, sales);
    return { ...a, prevSales: pv("ag", (x) => x.agency === a.agency, "sales"), prevCancels: pv("ag", (x) => x.agency === a.agency, "cancels"), sales, cancels, cancelRate: r, gap: r !== null && a.baseline !== null ? r - a.baseline : null };
  });
  // Rep bands stay the Watchtower September band: a few days of one rep's sales are too few to re-band.
  const rpv = (id: string, field: string) => total("rp", key, (r) => r.id === id, field);
  story.reps = m.story.reps.map((x): RepRow => { const sales = rpv(x.id, "sales"), cancels = rpv(x.id, "cancels"); return { ...x, prevSales: pv("rp", (r) => r.id === x.id, "sales"), prevCancels: pv("rp", (r) => r.id === x.id, "cancels"), sales, cancels, rate: rate(cancels, sales) }; });
  story.cohorts = m.story.cohorts.map((c): RepCohortRow => {
    const mine = story.reps.filter((r) => r.agency === c.agency && r.cohort === c.cohort), all = story.reps.filter((r) => r.agency === c.agency);
    if (!mine.length) return c; // cohort without representative detail keeps its monthly figures
    const sales = sum(mine.map((r) => r.sales ?? 0)), cancels = sum(mine.map((r) => r.cancels ?? 0));
    const ps = sum(mine.map((r) => r.prevSales ?? 0)), pc = sum(mine.map((r) => r.prevCancels ?? 0));
    return { ...c, prevSales: prev ? ps : null, prevCancels: prev ? pc : null, prevRate: prev ? rate(pc, ps) : null, sales, cancels, rate: rate(cancels, sales), salesShare: rate(sales, sum(all.map((r) => r.sales ?? 0))), cancelShare: rate(cancels, sum(all.map((r) => r.cancels ?? 0))) };
  });
  // Primary attribution keeps September's mix, restated on the focus state's cancellations in the range.
  const focusC = last.find((r) => r.state === m.story.focusState)?.cancels ?? 0;
  const parts = m.story.drivers.filter((d) => d.kind !== "total");
  const split = alloc(focusC, parts.map((d) => d.cancels ?? 0));
  story.drivers = [...parts.map((d, i) => ({ ...d, cancels: split[i], share: rate(split[i], focusC) })), ...m.story.drivers.filter((d) => d.kind === "total").map((d) => ({ ...d, cancels: focusC, share: 1 }))];
  const rc = m.story.reclass.filter((r) => !r.isTotal);
  const rRec = alloc(focusC, rc.map((r) => r.recorded ?? 0)), rAdj = alloc(focusC, rc.map((r) => r.adjusted ?? 0));
  story.reclass = [...rc.map((r, i) => ({ ...r, recorded: rRec[i], recordedShare: rate(rRec[i], focusC), adjusted: rAdj[i], adjustedShare: rate(rAdj[i], focusC) })), ...m.story.reclass.filter((r) => r.isTotal).map((r) => ({ ...r, recorded: focusC, adjusted: focusC }))];

  const out: DataModel = {
    ...m,
    months: D.dates, latestMonth: key, drillMonth: key, watchMonth: key, baselineMonth: prev,
    kpiCards: [], hotspotBlock: [], executiveQuestions: [],
    monthlyOverview, stateMonthly: stateRows, oddTiming, classification, customerMissReasons, channels,
    stateDrill, watchtower, stateChannel, story,
    daily: { ...D, start, end, days: sel.length, monthly: m, periods },
  };
  return withOutlook(out, horizon);
}

// ------------------------------------------------------------------ outlook from the selected end date
export type Horizon = 5 | 30;
/** Forward-looking horizon of a model (30 days unless the viewer picked 5). */
export const hz = (m: DataModel): Horizon => m.daily?.horizon ?? 30;
export interface Forecast { from: string; to: string; days: number; sales: number; cancels: number; avoided: number; rateNo: number | null; rateWith: number | null }
/** Portfolio effect of the three actions k days after they start: builds over about a week toward a ~13% reduction. */
export const ACTION_EFFECT = (k: number) => 0.133 * (1 - Math.exp(-k / 5));
export interface Scope { states?: string[]; channels?: string[]; agencies?: string[] }
/** Row filter for a scope. Agencies are a complete selection on their own (each belongs to one state and channel). */
const inScope = (sc: Scope) => (r: Row) =>
  sc.agencies?.length ? sc.agencies.includes(s(r.agency)) : (!sc.states?.length || sc.states.includes(s(r.state))) && (!sc.channels?.length || sc.channels.includes(s(r.channel)));
const tableFor = (sc: Scope): keyof Raw => (sc.agencies?.length ? "ag" : sc.channels?.length ? "scd" : "st");

/**
 * Prediction for the next `days` days after the selected end date: without action the last 7 days' cancel
 * rate holds on a weekday shaped sales level; with the three actions starting the next day, the rate falls
 * by ACTION_EFFECT. One engine for the panel, the outlook, the prevention plan and the actions.
 */
export function forecast(m: DataModel, days: number, sc: Scope = {}): Forecast {
  const D = m.daily!, end = D.end ?? D.dates[D.dates.length - 1];
  const ix = byDate(D.raw), t = tableFor(sc), f = inScope(sc);
  const i = D.dates.indexOf(end), last7 = D.dates.slice(Math.max(0, i - 6), i + 1);
  const wOf = (d: string) => D.dow[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const focus = m.story.focusState;
  // The actions remove cancellations above the focus state's normal rate, sized so the portfolio as a whole
  // moves by ACTION_EFFECT; cells at their normal level are left as they are.
  const norm = (m.daily?.monthly ?? m).stateMonthly.filter((r) => r.state === focus && r.month <= D.src).map((r) => r.cancelRate ?? 0);
  const focusNormal = norm.length ? sum(norm) / norm.length : 0;
  const over = (r: Row) => Math.max(0, n(r.cancels) - n(r.sales) * focusNormal);
  let s7 = 0, c7 = 0, x7 = 0, t7x = 0, p7 = 0, p7x = 0;
  for (const d of last7) {
    for (const r of ix[t].get(d) ?? []) {
      const inFocus = t === "ag" || r.state === focus;
      if (inFocus) t7x += over(r);
      if (f(r)) { s7 += n(r.sales); c7 += n(r.cancels); if (inFocus) x7 += over(r); }
    }
    for (const r of ix.st.get(d) ?? []) { p7 += n(r.cancels); if (r.state === focus) p7x += over(r); }
  }
  // Excess measured on finer cells is rescaled to the state total, so parts never add up to more than the whole.
  const share = c7 && t7x ? (x7 * (p7x / t7x)) / c7 : 0, lift = p7x ? p7 / p7x : 0;
  const level = s7 / (sum(last7.map(wOf)) || 1), r0 = s7 ? c7 / s7 : 0;
  let sales = 0, cancels = 0, avoided = 0;
  for (let k = 1; k <= days; k++) { const sk = level * wOf(shiftDay(end, k)); sales += sk; cancels += sk * r0; avoided += sk * r0 * share * Math.min(1, ACTION_EFFECT(k) * lift); }
  return { from: shiftDay(end, 1), to: shiftDay(end, days), days, sales: Math.round(sales), cancels: Math.round(cancels), avoided: Math.round(avoided), rateNo: rate(cancels, sales), rateWith: rate(cancels - avoided, sales) };
}

/** Day-wise: an agency's 7 day cancel rate for every day up to the selected end date. */
export function agencyDays(m: DataModel, agency: string) {
  const D = m.daily!, ix = byDate(D.raw), days = D.dates.filter((d) => d <= (D.end ?? d));
  const per = days.map((d) => { let s0 = 0, c0 = 0; for (const r of ix.ag.get(d) ?? []) if (r.agency === agency) { s0 += n(r.sales); c0 += n(r.cancels); } return { s: s0, c: c0 }; });
  return days.map((d, i) => { const w = per.slice(Math.max(0, i - 6), i + 1), sales = sum(w.map((x) => x.s)), cancels = sum(w.map((x) => x.c)); return { month: d, sales, cancels, cancelRate: rate(cancels, sales) }; });
}

/** Restates the outlook and prevention plan on the next `h` days (5 or 30) from the selected date. */
function withOutlook(m: DataModel, h: Horizon): DataModel {
  const D = m.daily!, st = m.story, focus = st.focusState;
  const outlook = { 5: forecast(m, 5), 30: forecast(m, 30) };
  const f30 = outlook[h]; // the plan's horizon
  // Prevention layers keep the workbook's split; the total is what the engine predicts the actions avoid.
  const ivs = st.interventions.filter((x) => x.kind !== "total");
  const total = f30.avoided, split = alloc(total, ivs.map((x) => x.saves ?? 0));
  const saves = Object.fromEntries(ivs.map((x, i) => [x.kind, split[i]])) as Record<string, number>;
  const contact = { protectable: saves.contact ?? 0, projected: 0, orders: 0 };
  contact.projected = Math.round(contact.protectable / 0.57); contact.orders = Math.round(contact.projected / 0.55);
  const accRes = Math.round((saves.install ?? 0) / 0.52), seg = { accelerate: Math.round(accRes * 0.448), reset: 0, handOff: Math.round(accRes * 0.403), standard: Math.round(accRes * 0.537) };
  seg.reset = accRes - seg.accelerate;
  const segTotal = accRes + seg.handOff + seg.standard;
  // Channels and states for the next 30 days
  const ref = D.stable.channelRate, chRates = m.channelNames.map((c) => ref[`${focus}|${c}`] ?? 0).sort((a, b) => a - b);
  const med = chRates[Math.floor(chRates.length / 2)];
  const outl = m.channelNames.filter((c) => (ref[`${focus}|${c}`] ?? 0) - med >= 0.08);
  const chF = Object.fromEntries(m.channelNames.map((c) => [c, forecast(m, h, { states: focus ? [focus] : [], channels: [c] })]));
  const risky = outl.reduce((a, c) => a + chF[c].sales, 0);
  // States are split from the portfolio total so they add up to it exactly (separate rounding would drift by one).
  const raw = m.states.map((s0) => forecast(m, h, { states: [s0] }));
  const cS = alloc(f30.cancels, raw.map((x) => x.cancels)), sS = alloc(f30.sales, raw.map((x) => x.sales));
  const stF = Object.fromEntries(m.states.map((s0, i) => [s0, { ...raw[i], cancels: cS[i], sales: sS[i], rateNo: rate(cS[i], sS[i]) }]));
  const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
  const portSnap = m.monthlyOverview.find((r) => r.month === m.latestMonth)!;
  const focusSnap = m.stateMonthly.find((r) => r.month === m.latestMonth && r.state === focus);
  const story = {
    ...st,
    forecastMonth: `next${h}`,
    forecastViews: st.forecastViews.map((v) => (v.kind === "noAction" ? { ...v, rate: f30.rateNo } : v.kind === "intervention" ? { ...v, rate: f30.rateWith } : v)),
    forecastStates: st.forecastStates.map((r) => { const x = r.isTotal ? f30 : stF[r.state]; return { ...r, sales: x.sales, cancels: x.cancels, rate: x.rateNo, prevRate: r.isTotal ? portSnap.cancelRate : m.stateMonthly.find((y) => y.month === m.latestMonth && y.state === r.state)?.cancelRate ?? null }; }),
    forecastChannels: st.forecastChannels.map((r) => { const x = r.isTotal ? forecast(m, h, { states: focus ? [focus] : [] }) : chF[r.channel]; return x ? { ...r, sales: x.sales, cancels: x.cancels, rate: x.rateNo, delta: x.rateNo !== null && r.prevRate !== null ? x.rateNo - r.prevRate : r.delta, risk: r.isTotal ? r.risk : (x.rateNo ?? 0) > 0.25 ? "Critical" : "Monitor" } : r; }),
    interventions: st.interventions.map((x) => {
      const v = x.kind === "total" ? total : saves[x.kind] ?? x.saves;
      const population = x.kind === "sales" ? `${Math.round(risky).toLocaleString("en-US")} ${outl.join(" / ")} orders in the next ${h} days / Critical reps`
        : x.kind === "install" ? `${segTotal} ${focus} delivery-risk orders` : x.kind === "contact" ? `${contact.orders} ${focus} contact-risk orders (~${contact.projected} projected cancels)` : x.population;
      return { ...x, saves: v, share: rate(v ?? 0, total), population };
    }),
    outcomes: st.outcomes.map((o) => (o.kind === "noAction" ? { ...o, cancels: f30.cancels, rate: f30.rateNo } : o.kind === "intervention" ? { ...o, cancels: f30.cancels - total, rate: f30.rateWith } : o.kind === "prevented" ? { ...o, cancels: total, rate: rate(total, f30.cancels) } : o)),
    segments: st.segments.map((x) => {
      const o = x.isTotal ? segTotal : /accelerat/i.test(x.action) ? seg.accelerate : /reset|escalat/i.test(x.action) ? seg.reset : /contact rescue|hand/i.test(x.action) ? seg.handOff : seg.standard;
      return { ...x, orders: o };
    }),
    contactRisk: st.contactRisk.map((c, i) => ({ ...c, value: [contact.orders, contact.projected, contact.protectable][i] ?? c.value })),
    measures: st.measures.map((x) =>
      /^cancel rate/i.test(x.measure) ? { ...x, actual: pct(portSnap.cancelRate), noAction: pct(f30.rateNo), target: pct(f30.rateWith) }
      : /post odd/i.test(x.measure) ? { ...x, actual: pct(portSnap.postPct), noAction: pct(portSnap.postPct === null ? null : portSnap.postPct + 0.01), target: pct(portSnap.postPct === null ? null : portSnap.postPct - 0.04) }
      : /pending/i.test(x.measure) ? { ...x, actual: pct(focusSnap?.pendingPct ?? null), noAction: pct(focusSnap?.pendingPct == null ? null : focusSnap.pendingPct + 0.02), target: pct(focusSnap?.pendingPct == null ? null : focusSnap.pendingPct - 0.1) }
      : /odd miss|bsw/i.test(x.measure) ? { ...x, actual: `${segTotal} high-risk orders`, noAction: `${segTotal} risk pool` } : x),
  };
  return { ...m, story, daily: { ...D, outlook, horizon: h } };
}

// ------------------------------------------------------------------ any combination of states, channels and agencies
export const SEL = "sel:";
export const selScope = (sc: Scope) => SEL + [sc.states ?? [], sc.channels ?? [], sc.agencies ?? []].map((a) => a.join(",")).join("|");
export const parseSel = (scope: string): Scope => { const [a = "", b = "", c = ""] = scope.slice(SEL.length).split("|"); const l = (x: string) => x.split(",").filter(Boolean); return { states: l(a), channels: l(b), agencies: l(c) }; };

/**
 * Every measure for a combination over a period. Sales, installs and cancellations come from the lowest level
 * cells (state x channel, or agency); lifecycle, classification, Watchtower and reasons are recorded by state
 * and are applied in proportion to the combination's cancellations in each state.
 */
export function selectionSnapshot(m: DataModel, month: MonthKey, scope: string): { values: Record<string, number | null>; reasons: Record<string, number> } {
  const D = m.daily!, sc = parseSel(scope), ix = byDate(D.raw);
  const days = D.periods?.[month] ?? (D.dates.includes(month) ? [month] : []);
  const focus = m.story.focusState;
  const byState: Record<string, { s: number; i: number; c: number }> = {};
  const add = (st: string, sales: number, inst: number, canc: number) => { const o = (byState[st] ??= { s: 0, i: 0, c: 0 }); o.s += sales; o.i += inst; o.c += canc; };
  const f = inScope(sc);
  for (const d of days) {
    if (sc.agencies?.length) for (const r of ix.ag.get(d) ?? []) { if (f({ ...r, state: focus })) add(focus ?? "", n(r.sales), NaN, n(r.cancels)); }
    else for (const r of ix.scd.get(d) ?? []) if (f(r)) add(s(r.state), n(r.sales), n(r.installs), n(r.cancels));
  }
  const stTot = (st: string, field: string) => { let v = 0; for (const d of days) for (const r of ix.st.get(d) ?? []) if (r.state === st) v += n(r[field]); return v; };
  const wtTot = (st: string, field: string) => { let v = 0; for (const d of days) for (const r of ix.wt.get(d) ?? []) if (r.state === st) v += n(r[field]); return v; };
  const acc: Record<string, number> = {}, reasons: Record<string, number> = {};
  let sales = 0, installs = 0, cancels = 0, otW = 0, otV = 0;
  for (const [st, o] of Object.entries(byState)) {
    const sc0 = stTot(st, "cancels"), share = sc0 ? o.c / sc0 : 0;
    sales += o.s; cancels += o.c;
    installs += Number.isNaN(o.i) ? o.s * (stTot(st, "installs") / (stTot(st, "sales") || 1)) : o.i;
    for (const k of ["pre", "on", "post", "cust", "co", "faux"]) acc[k] = (acc[k] ?? 0) + stTot(st, k) * share;
    for (const k of ["pending", "action", "jeopardy", "bsw"]) acc[k] = (acc[k] ?? 0) + wtTot(st, k) * share;
    for (const d of days) for (const r of ix.rs.get(d) ?? []) if (r.state === st) reasons[s(r.reason)] = (reasons[s(r.reason)] ?? 0) + n(r.count) * share;
    for (const d of days) for (const r of ix.st.get(d) ?? []) if (r.state === st && typeof r.onTime === "number") { otW += n(r.installs) * share; otV += n(r.installs) * share * n(r.onTime); }
  }
  const p = (k: string) => (cancels ? (acc[k] ?? 0) / cancels : null), c = (k: string) => (cancels ? Math.round(acc[k] ?? 0) : null);
  const w = [p("pending"), p("action"), p("jeopardy"), p("bsw")];
  return {
    values: {
      sales, installs: Math.round(installs), cancels, cancelRate: rate(cancels, sales), onTimePct: otW ? otV / otW : null,
      prePct: p("pre"), onPct: p("on"), postPct: p("post"), preCancels: c("pre"), onCancels: c("on"), postCancels: c("post"),
      custPct: p("cust"), coPct: p("co"), fauxPct: p("faux"), custMiss: c("cust"), coMiss: c("co"), faux: c("faux"),
      pendingPct: w[0], actionPct: w[1], jeopardyPct: w[2], bswPct: w[3],
      noActionPct: w.every((x) => x !== null) ? Math.max(0, 1 - sum(w as number[])) : null,
    },
    reasons: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, Math.round(v)])),
  };
}
