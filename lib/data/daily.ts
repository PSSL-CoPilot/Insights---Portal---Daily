/**
 * Day-wise model. The server reads the daily sheets (September 1 to 30) once (`attachDaily`); the browser
 * then re-expresses any selected date range in the app's existing DataModel shape (`rangeModel`), so every
 * page, chart and story keeps working unchanged.
 *  - Period keys: a single day is "2026-09-05"; a range is "<end>~<start>" ("2026-09-10~2026-09-03"),
 *    so plain string ordering still places a range at its last day.
 *  - Every period is compared with August at the same number of days ("August pace": August ÷ 31 × days).
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
  // ---- set by rangeModel
  start?: string;
  end?: string;
  /** Number of days in the selected range. */
  days?: number;
  /** The monthly model (Jan to Sep): month to month history for the anomaly test. */
  monthly?: DataModel;
}

// ------------------------------------------------------------------ keys
export const rangeKey = (start: string, end: string) => (start === end ? end : `${end}~${start}`);
export const parseKey = (k: MonthKey): [string, string] => (k.includes("~") ? [k.split("~")[1], k.split("~")[0]] : [k, k]);
export const isRangeKey = (k: MonthKey) => k.includes("~");
export const validKey = (m: DataModel, k: MonthKey | null | undefined) => {
  if (!k || !m.daily) return false;
  const [s, e] = parseKey(k);
  return s <= e && m.daily.dates.includes(s) && m.daily.dates.includes(e);
};
/** Default selection: the whole month to date. */
export const defaultKey = (m: DataModel) => rangeKey(m.daily!.dates[0], m.daily!.dates[m.daily!.dates.length - 1]);

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
    date: { kind: "d", headers: ["First Flagged"] }, value: { kind: "p", headers: ["Value That Day"], ...opt }, days: { kind: "n", headers: ["Days Before Month End"], ...opt }, meaning: { kind: "s", headers: ["Meaning"], ...opt },
  }, wb, issues);
  const pr = T("October Prediction Summary", {
    scope: { kind: "s", headers: ["Scope"] }, sales10: { kind: "n", headers: ["Oct 1 to 10 Predicted Sales"] }, cancels10: { kind: "n", headers: ["Oct 1 to 10 Cancels (no action)"] },
    rate10: { kind: "p", headers: ["Oct 1 to 10 Rate (no action)"] }, cancelsWith10: { kind: "n", headers: ["Oct 1 to 10 Cancels (with action)"] }, rateWith10: { kind: "p", headers: ["Oct 1 to 10 Rate (with action)"] },
    avoided10: { kind: "n", headers: ["Oct 1 to 10 Avoided"] }, salesMonth: { kind: "n", headers: ["October Predicted Sales"] }, rateMonth: { kind: "p", headers: ["October Rate (no action)"] },
    cancelsWithMonth: { kind: "n", headers: ["October Cancels (with action)"] }, rateWithMonth: { kind: "p", headers: ["October Rate (with action)"] }, avoidedMonth: { kind: "n", headers: ["October Avoided"] },
  }, wb, issues);
  const pd = T("October Daily Prediction", {
    date: { kind: "d", headers: ["Date"] }, scope: { kind: "s", headers: ["Scope"] }, sales: { kind: "n", headers: ["Predicted Sales"] }, cancels: { kind: "n", headers: ["Predicted Cancels (no action)"] },
    low: { kind: "n", headers: ["Prediction Range Low"] }, high: { kind: "n", headers: ["Prediction Range High"] }, cancelsWith: { kind: "n", headers: ["Predicted Cancels (with action from Oct 1)"] }, avoided: { kind: "n", headers: ["Cancellations Avoided"] },
  }, wb, issues);

  const dates = [...new Set(st.map((r) => s(r.date)))].filter(Boolean).sort();
  const src = [...m.months].filter((x) => x < dates[0].slice(0, 7)).pop()!;
  // Noise: each day's portfolio cancellations against its centred 7 day mean (weekday swings, not trend).
  const daily = dates.map((d) => sum(st.filter((r) => r.date === d).map((r) => n(r.cancels))));
  const dev = daily.slice(3, -3).map((v, i) => Math.abs(v / (sum(daily.slice(i, i + 7)) / 7) - 1));

  return {
    ...m,
    daily: {
      dates, src, srcDays: new Date(Date.UTC(+src.slice(0, 4), +src.slice(5, 7), 0)).getUTCDate(), noise: median(dev) || 0.05,
      detection: det.map((r) => ({ signal: s(r.signal), scope: s(r.scope), threshold: s(r.threshold), date: (r.date as string) ?? null, value: (r.value as number) ?? null, daysBefore: (r.days as number) ?? null, meaning: s(r.meaning) })),
      prediction: pr.map((r) => ({ scope: s(r.scope), sales10: r.sales10 as number, cancels10: r.cancels10 as number, rate10: r.rate10 as number, cancelsWith10: r.cancelsWith10 as number, rateWith10: r.rateWith10 as number, avoided10: r.avoided10 as number, salesMonth: r.salesMonth as number, rateMonth: r.rateMonth as number, cancelsWithMonth: r.cancelsWithMonth as number, rateWithMonth: r.rateWithMonth as number, avoidedMonth: r.avoidedMonth as number })),
      predictionDaily: pd.map((r) => ({ date: s(r.date), scope: s(r.scope), sales: r.sales as number, cancels: r.cancels as number, low: r.low as number, high: r.high as number, cancelsWith: r.cancelsWith as number, avoided: r.avoided as number })),
      raw,
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

export function rangeModel(m: DataModel, key: MonthKey): DataModel {
  const D = m.daily!;
  const [start, end] = parseKey(key);
  const sel = D.dates.filter((d) => d >= start && d <= end);
  const ix = byDate(D.raw);
  // Periods: every single day (the daily trend) plus the selected range.
  const keys = isRangeKey(key) ? [...D.dates, key] : [...D.dates];
  const daysOf = (k: string) => (k === key ? sel : [k]);
  const total = (t: keyof Raw, k: string, f: (r: Row) => boolean, field: string) => {
    let v = 0;
    for (const d of daysOf(k)) for (const r of ix[t].get(d) ?? []) if (f(r)) v += n(r[field]);
    return v;
  };

  // Baselines: August at one day ("-avg") and at the selected number of days ("-avg~N").
  const dayBase = `${D.src}-avg`, rangeBase = isRangeKey(key) ? `${D.src}-avg~${sel.length}` : dayBase;
  const bases: [string, number][] = [[dayBase, 1 / D.srcDays], ...(rangeBase !== dayBase ? [[rangeBase, sel.length / D.srcDays] as [string, number]] : [])];
  const scaleRows = <R extends { month: string }>(rows: R[], counts: (keyof R)[]): R[] =>
    bases.flatMap(([bk, f]) => rows.filter((r) => r.month === D.src).map((r) => {
      const o = { ...r, month: bk };
      counts.forEach((c) => { const v = r[c] as number | null; (o as Record<string, unknown>)[c as string] = v === null ? null : Math.round(v * f); });
      return o;
    }));
  const rangeScale = sel.length / D.srcDays;
  const sc = (v: number | null) => (v === null ? null : Math.round(v * rangeScale));

  const STATES = m.states, CH = m.channelNames;
  const septOnTime = (state: string | null) => (state ? m.stateMonthly.find((r) => r.state === state && r.month === start.slice(0, 7)) : m.monthlyOverview.find((r) => r.month === start.slice(0, 7)))?.onTimePct ?? null;

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
      onTimePct: septOnTime(state),
    });
  }
  const SM_COUNTS: (keyof StateMonthlyRow)[] = ["sales", "installs", "cancels", "preCancels", "onCancels", "postCancels", "custMiss", "coMiss", "faux"];

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
      onTimePct: septOnTime(null),
    };
  };
  const monthlyOverview = [...scaleRows(m.monthlyOverview, ["sales", "installs", "cancels"]), ...keys.map(portRow)];
  const oddTiming = [
    ...scaleRows(m.oddTiming, ["preCancels", "onCancels", "postCancels"]),
    ...keys.map((k) => { const rows = byKey.get(k)!, c = tot(rows, "cancels"); return { month: k, preCancels: tot(rows, "preCancels"), prePct: rate(tot(rows, "preCancels"), c), onCancels: tot(rows, "onCancels"), onPct: rate(tot(rows, "onCancels"), c), postCancels: tot(rows, "postCancels"), postPct: rate(tot(rows, "postCancels"), c) }; }),
  ];
  const classification = [
    ...scaleRows(m.classification, ["custMiss", "coMiss", "faux"]),
    ...keys.map((k) => { const rows = byKey.get(k)!, c = tot(rows, "cancels"); return { month: k, custMiss: tot(rows, "custMiss"), custPct: rate(tot(rows, "custMiss"), c), coMiss: tot(rows, "coMiss"), coPct: rate(tot(rows, "coMiss"), c), faux: tot(rows, "faux"), fauxPct: rate(tot(rows, "faux"), c) }; }),
  ];

  // ---- reasons
  const reasonNames = [...new Set(D.raw.rs.map((r) => s(r.reason)))];
  const customerMissReasons: ReasonRow[] = [
    ...scaleRows(m.customerMissReasons, ["count"]),
    ...keys.flatMap((k) => STATES.flatMap((state) => {
      const counts = reasonNames.map((reason) => total("rs", k, (r) => r.state === state && r.reason === reason, "count"));
      const t = sum(counts);
      return reasonNames.map((reason, i) => ({ month: k, state, reason, count: counts[i], share: rate(counts[i], t), mom: null, flag: null, insight: null }));
    })),
  ];

  // ---- channels (timing and Watchtower mix estimated from each state's mix, weighted by the channel's cancellations there)
  const scv = (k: string, state: string, ch: string, field: string) => total("scd", k, (r) => r.state === state && r.channel === ch, field);
  const channels: ChannelMonthlyRow[] = [
    ...scaleRows(m.channels ?? [], ["sales", "installs", "cancels", "preCancels", "onCancels", "postCancels", "custMiss", "coMiss", "faux"]),
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
  const baseState = scaleRows(m.stateMonthly, SM_COUNTS);
  const lastBase = (state: string) => baseState.find((r) => r.state === state && r.month === rangeBase);
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
  const agv = (name: string, field: string) => total("ag", key, (r) => r.agency === name, field);
  story.agencies = m.story.agencies.map((a): AgencySnapshotRow => {
    const sales = agv(a.agency, "sales"), cancels = agv(a.agency, "cancels"), r = rate(cancels, sales);
    return { ...a, prevSales: sc(a.prevSales), prevCancels: sc(a.prevCancels), sales, cancels, cancelRate: r, gap: r !== null && a.baseline !== null ? r - a.baseline : null };
  });
  // Rep bands stay the Watchtower September band: a few days of one rep's sales are too few to re-band.
  const rpv = (id: string, field: string) => total("rp", key, (r) => r.id === id, field);
  story.reps = m.story.reps.map((x): RepRow => { const sales = rpv(x.id, "sales"), cancels = rpv(x.id, "cancels"); return { ...x, prevSales: sc(x.prevSales), prevCancels: sc(x.prevCancels), sales, cancels, rate: rate(cancels, sales) }; });
  story.cohorts = m.story.cohorts.map((c): RepCohortRow => {
    const mine = story.reps.filter((r) => r.agency === c.agency && r.cohort === c.cohort), all = story.reps.filter((r) => r.agency === c.agency);
    if (!mine.length) return c; // cohort without representative detail keeps its monthly figures
    const sales = sum(mine.map((r) => r.sales ?? 0)), cancels = sum(mine.map((r) => r.cancels ?? 0));
    return { ...c, prevSales: sc(c.prevSales), prevCancels: sc(c.prevCancels), sales, cancels, rate: rate(cancels, sales), salesShare: rate(sales, sum(all.map((r) => r.sales ?? 0))), cancelShare: rate(cancels, sum(all.map((r) => r.cancels ?? 0))) };
  });
  // Primary attribution keeps September's mix, restated on the focus state's cancellations in the range.
  const focusC = last.find((r) => r.state === m.story.focusState)?.cancels ?? 0;
  const parts = m.story.drivers.filter((d) => d.kind !== "total");
  const split = alloc(focusC, parts.map((d) => d.cancels ?? 0));
  story.drivers = [...parts.map((d, i) => ({ ...d, cancels: split[i], share: rate(split[i], focusC) })), ...m.story.drivers.filter((d) => d.kind === "total").map((d) => ({ ...d, cancels: focusC, share: 1 }))];
  const rc = m.story.reclass.filter((r) => !r.isTotal);
  const rRec = alloc(focusC, rc.map((r) => r.recorded ?? 0)), rAdj = alloc(focusC, rc.map((r) => r.adjusted ?? 0));
  story.reclass = [...rc.map((r, i) => ({ ...r, recorded: rRec[i], recordedShare: rate(rRec[i], focusC), adjusted: rAdj[i], adjustedShare: rate(rAdj[i], focusC) })), ...m.story.reclass.filter((r) => r.isTotal).map((r) => ({ ...r, recorded: focusC, adjusted: focusC }))];

  return {
    ...m,
    months: D.dates, latestMonth: key, drillMonth: key, watchMonth: key, baselineMonth: rangeBase, dayBaseline: dayBase,
    kpiCards: [], hotspotBlock: [], executiveQuestions: [],
    monthlyOverview, stateMonthly: [...baseState, ...stateRows], oddTiming, classification, customerMissReasons, channels,
    stateDrill, watchtower, stateChannel, story,
    daily: { ...D, start, end, days: sel.length, monthly: m },
  };
}
