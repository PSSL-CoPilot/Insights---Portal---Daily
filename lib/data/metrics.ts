/**
 * Pure, client-safe analytics over the normalized `DataModel`.
 * Nothing in here knows about React or the filesystem — the same functions power the
 * KPI grid, modals, drill-downs, insights, and the Ask-Anything engine.
 */
import type { DataModel, MonthKey, ReasonRow, StateMonthlyRow } from "./types";
import { monthName } from "../format";
import { SEL, parseKey, parseSel, selectionSnapshot } from "./daily";

export const nk = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/%/g, "pct").replace(/[^a-z0-9]/g, "");

// ------------------------------------------------------------------ KPI registry
export type GroupId = "health" | "timing" | "responsibility" | "drivers" | "watch";

export const GROUPS: { id: GroupId; label: string; question: string }[] = [
  { id: "health", label: "Business health", question: "What changed?" },
  { id: "timing", label: "Cancellation timing", question: "When are customers leaving?" },
  { id: "responsibility", label: "Responsibility", question: "Who owns the miss?" },
  { id: "drivers", label: "Customer Miss drivers", question: "Why are customers cancelling?" },
  { id: "watch", label: "Watchtower leading indicators", question: "Could we see it coming?" },
];

export type KpiUnit = "count" | "pct";

export interface KpiDef {
  id: string;
  label: string;
  group: GroupId;
  unit: KpiUnit;
  /** Snapshot key holding the headline value. */
  key: string;
  /** Which direction is "good" for the business. */
  good: "up" | "down" | "neutral";
  /** Optional count shown beneath a percentage KPI. */
  companion?: { key: string; label: string };
  /** Label used in the workbook's "Dashboard KPI" sheet (for executive-meaning captions). */
  cardLabel?: string;
  blurb: string;
}

const reasonKey = (label: string) => `reason:${nk(label)}`;

export const REASON_LABELS = {
  buyers: "Buyer’s Remorse",
  cancel: "Customer Requested Cancel",
  noAccess: "No Access / Not Home",
  resched: "Customer Requested Reschedule",
  tech: "Cancelled while Tech on Job",
  other: "Other Customer Miss",
} as const;

/** Reasons that signal late-stage appointment-readiness problems (used for highlighting). */
export const LATE_STAGE_REASONS = [REASON_LABELS.noAccess, REASON_LABELS.resched, REASON_LABELS.tech].map(nk);
export const isLateStageReason = (label: string) => LATE_STAGE_REASONS.includes(nk(label));

export const KPI_DEFS: KpiDef[] = [
  { id: "sales", label: "Unique Sales", group: "health", unit: "count", key: "sales", good: "up", cardLabel: "Unique Sales", blurb: "Monthly qualifying acquisition sales." },
  { id: "installs", label: "Installs", group: "health", unit: "count", key: "installs", good: "up", cardLabel: "Installs", blurb: "Orders completed as installed service." },
  { id: "cancels", label: "Total Cancellations", group: "health", unit: "count", key: "cancels", good: "down", cardLabel: "Total Cancellations", blurb: "Orders cancelled in the period." },
  { id: "cancelRate", label: "Cancel Rate", group: "health", unit: "pct", key: "cancelRate", good: "down", cardLabel: "Cancel Rate", blurb: "Cancellations ÷ Unique Sales." },
  { id: "onTime", label: "On Time Install %", group: "health", unit: "pct", key: "onTimePct", good: "up", cardLabel: "On Time Install %", blurb: "Share of installs completed on the committed date." },

  { id: "pre", label: "Pre ODD Cancels %", group: "timing", unit: "pct", key: "prePct", good: "neutral", companion: { key: "preCancels", label: "Pre ODD cancels" }, cardLabel: "Pre ODD Cancels %", blurb: "Cancelled before the Original Due Date." },
  { id: "on", label: "On ODD Cancels %", group: "timing", unit: "pct", key: "onPct", good: "neutral", companion: { key: "onCancels", label: "On ODD cancels" }, cardLabel: "On ODD Cancels %", blurb: "Cancelled on the Original Due Date." },
  { id: "post", label: "Post ODD Cancels %", group: "timing", unit: "pct", key: "postPct", good: "down", companion: { key: "postCancels", label: "Post ODD cancels" }, cardLabel: "Post ODD Cancels %", blurb: "Cancelled after the Original Due Date: a late stage failure." },

  { id: "cust", label: "Customer Miss %", group: "responsibility", unit: "pct", key: "custPct", good: "down", companion: { key: "custMiss", label: "Customer Miss cancels" }, cardLabel: "Customer Miss %", blurb: "Customer-side cancellation classification." },
  { id: "co", label: "Company Miss %", group: "responsibility", unit: "pct", key: "coPct", good: "down", companion: { key: "coMiss", label: "Company Miss cancels" }, cardLabel: "Company Miss %", blurb: "Brightspeed operational miss classification." },
  { id: "faux", label: "Faux Cancel %", group: "responsibility", unit: "pct", key: "fauxPct", good: "neutral", companion: { key: "faux", label: "Faux cancels" }, cardLabel: "Faux Cancel %", blurb: "Cancellation with no true revenue loss." },
  { id: "true", label: "True Cancels", group: "responsibility", unit: "count", key: "trueCancels", good: "down", cardLabel: "True Cancels", blurb: "Customer Miss plus Company Miss." },

  { id: "r-cancel", label: REASON_LABELS.cancel, group: "drivers", unit: "count", key: reasonKey(REASON_LABELS.cancel), good: "down", cardLabel: REASON_LABELS.cancel, blurb: "Customer explicitly asked to cancel." },
  { id: "r-noaccess", label: REASON_LABELS.noAccess, group: "drivers", unit: "count", key: reasonKey(REASON_LABELS.noAccess), good: "down", cardLabel: REASON_LABELS.noAccess, blurb: "Technician could not access the premises." },
  { id: "r-resched", label: REASON_LABELS.resched, group: "drivers", unit: "count", key: reasonKey(REASON_LABELS.resched), good: "down", cardLabel: REASON_LABELS.resched, blurb: "Customer asked to reschedule, then cancelled." },
  { id: "r-tech", label: REASON_LABELS.tech, group: "drivers", unit: "count", key: reasonKey(REASON_LABELS.tech), good: "down", cardLabel: REASON_LABELS.tech, blurb: "Customer cancelled while the technician was on site." },
  { id: "r-buyers", label: REASON_LABELS.buyers, group: "drivers", unit: "count", key: reasonKey(REASON_LABELS.buyers), good: "down", cardLabel: REASON_LABELS.buyers, blurb: "Customer changed their mind after ordering." },

  { id: "pending", label: "Pending Customer Contact %", group: "watch", unit: "pct", key: "pendingPct", good: "down", cardLabel: "Pending Customer Contact %", blurb: "Share of cancellations that carried an unresolved customer contact state." },
  { id: "action", label: "Action Needed Not Jeopardy %", group: "watch", unit: "pct", key: "actionPct", good: "down", cardLabel: "Action Needed Not Jeopardy %", blurb: "Action required even without technical jeopardy." },
  { id: "jeopardy", label: "Install in Jeopardy %", group: "watch", unit: "pct", key: "jeopardyPct", good: "down", cardLabel: "Install in Jeopardy %", blurb: "Watchtower installation risk state." },
  { id: "bsw", label: "BSW Delay Predicted %", group: "watch", unit: "pct", key: "bswPct", good: "down", cardLabel: "BSW Delay Predicted %", blurb: "Existing predictive BSW delay signal." },
];

export const kpiById = (id: string) => KPI_DEFS.find((k) => k.id === id);

// ------------------------------------------------------------------ scopes
/** A scope is `null` (portfolio), a state name, or a channel encoded as `ch:<name>`. */
export const CH = "ch:";
export const isChannel = (scope: string | null | undefined): scope is string => !!scope && scope.startsWith(CH);
export const chScope = (channel: string) => `${CH}${channel}`;
export const scopeName = (scope: string | null | undefined, fallback = "Portfolio") =>
  !scope ? fallback : isChannel(scope) ? scope.slice(CH.length) : (scope as string).startsWith(SEL) ? Object.values(parseSel(scope)).flat().join(" · ") : scope;

// ------------------------------------------------------------------ month helpers
export const prevMonth = (m: DataModel, month: MonthKey): MonthKey | null => {
  // Day-wise: the selection against its comparison period (the period just before it), a single day against the day before.
  if (m.daily?.periods) {
    if (month === m.latestMonth) return m.baselineMonth ?? null;
    if (month.includes("~")) return null;
  }
  const i = m.months.indexOf(month);
  return i > 0 ? m.months[i - 1] : null;
};
export const monthsUpTo = (m: DataModel, month: MonthKey) => m.months.filter((x) => x <= month);

// ------------------------------------------------------------------ snapshots
export type Snapshot = Record<string, number | null>;

const snapCache = new WeakMap<DataModel, Map<string, Snapshot>>();

function sumReasons(rows: ReasonRow[], month: MonthKey, state: string | null): Snapshot {
  const out: Snapshot = {};
  for (const r of rows) {
    if (r.month !== month || (state && r.state !== state)) continue;
    const k = `reason:${nk(r.reason)}`;
    out[k] = (out[k] ?? 0) + (r.count ?? 0);
  }
  return out;
}

const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/** Every measure the app knows for (month, state). `state = null` → portfolio. Missing data stays `null`. */
export function getSnapshot(model: DataModel, month: MonthKey, state: string | null): Snapshot {
  let byModel = snapCache.get(model);
  if (!byModel) snapCache.set(model, (byModel = new Map()));
  const ck = `${month}|${state ?? ""}`;
  const hit = byModel.get(ck);
  if (hit) return hit;

  const s: Snapshot = {};
  if (state?.startsWith(SEL) && model.daily) {
    const x = selectionSnapshot(model, month, state);
    Object.assign(s, x.values);
    for (const [label, v] of Object.entries(x.reasons)) s[`reason:${nk(label)}`] = v;
    s.trueCancels = add(s.custMiss ?? null, s.coMiss ?? null);
    byModel.set(ck, s);
    return s;
  }
  if (!state) {
    const mo = model.monthlyOverview.find((r) => r.month === month);
    const od = model.oddTiming.find((r) => r.month === month);
    const cl = model.classification.find((r) => r.month === month);
    Object.assign(s, {
      sales: mo?.sales ?? null, installs: mo?.installs ?? null, cancels: mo?.cancels ?? null,
      cancelRate: mo?.cancelRate ?? null, onTimePct: mo?.onTimePct ?? null,
      prePct: od?.prePct ?? mo?.prePct ?? null, onPct: od?.onPct ?? mo?.onPct ?? null, postPct: od?.postPct ?? mo?.postPct ?? null,
      preCancels: od?.preCancels ?? null, onCancels: od?.onCancels ?? null, postCancels: od?.postCancels ?? null,
      custPct: cl?.custPct ?? mo?.custPct ?? null, coPct: cl?.coPct ?? mo?.coPct ?? null, fauxPct: cl?.fauxPct ?? mo?.fauxPct ?? null,
      custMiss: cl?.custMiss ?? null, coMiss: cl?.coMiss ?? null, faux: cl?.faux ?? null,
      pendingPct: mo?.pendingPct ?? null, actionPct: mo?.actionPct ?? null, jeopardyPct: mo?.jeopardyPct ?? null, bswPct: mo?.bswPct ?? null,
    });
    // installs-to-sales style derivations
    const w = [s.pendingPct, s.actionPct, s.jeopardyPct, s.bswPct];
    s.noActionPct = w.every((x) => x !== null) ? Math.max(0, 1 - (w as number[]).reduce((a, b) => a + b, 0)) : null;
  } else if (isChannel(state)) {
    const ch = model.channels?.find((r) => r.month === month && r.channel === scopeName(state));
    Object.assign(s, {
      sales: ch?.sales ?? null, installs: ch?.installs ?? null, cancels: ch?.cancels ?? null, cancelRate: ch?.cancelRate ?? null, onTimePct: ch?.onTimePct ?? null,
      prePct: ch?.prePct ?? null, onPct: ch?.onPct ?? null, postPct: ch?.postPct ?? null,
      preCancels: ch?.preCancels ?? null, onCancels: ch?.onCancels ?? null, postCancels: ch?.postCancels ?? null,
      custPct: ch?.custPct ?? null, coPct: ch?.coPct ?? null, fauxPct: ch?.fauxPct ?? null,
      custMiss: ch?.custMiss ?? null, coMiss: ch?.coMiss ?? null, faux: ch?.faux ?? null,
      pendingPct: ch?.pendingPct ?? null, jeopardyPct: ch?.jeopardyPct ?? null, bswPct: ch?.bswPct ?? null, actionPct: ch?.actionPct ?? null,
    });
  } else {
    const sm = model.stateMonthly.find((r) => r.month === month && r.state === state);
    const dr = month === model.drillMonth ? model.stateDrill.find((r) => r.state === state) : undefined;
    const wt = month === model.watchMonth ? model.watchtower.find((r) => !r.isPortfolio && r.state === state) : undefined;
    Object.assign(s, {
      sales: sm?.sales ?? dr?.sales ?? null, installs: sm?.installs ?? dr?.installs ?? null, cancels: sm?.cancels ?? dr?.cancels ?? null,
      cancelRate: sm?.cancelRate ?? dr?.cancelRate ?? null, onTimePct: sm?.onTimePct ?? dr?.onTimePct ?? null,
      prePct: sm?.prePct ?? dr?.prePct ?? null, onPct: sm?.onPct ?? dr?.onPct ?? null, postPct: sm?.postPct ?? dr?.postPct ?? null,
      preCancels: sm?.preCancels ?? null, onCancels: sm?.onCancels ?? null, postCancels: sm?.postCancels ?? null,
      custPct: sm?.custPct ?? dr?.custPct ?? null, coPct: sm?.coPct ?? null, fauxPct: sm?.fauxPct ?? null,
      custMiss: sm?.custMiss ?? null, coMiss: sm?.coMiss ?? null, faux: sm?.faux ?? null,
      pendingPct: sm?.pendingPct ?? dr?.pendingPct ?? wt?.pendingPct ?? null,
      actionPct: sm?.actionPct ?? wt?.actionPct ?? null, jeopardyPct: sm?.jeopardyPct ?? wt?.jeopardyPct ?? null, bswPct: sm?.bswPct ?? wt?.bswPct ?? null,
      noActionPct: wt?.noActionPct ?? null,
    });
  }
  if (s.noActionPct == null && [s.pendingPct, s.actionPct, s.jeopardyPct, s.bswPct].every((x) => x != null)) {
    s.noActionPct = Math.max(0, 1 - (s.pendingPct! + s.actionPct! + s.jeopardyPct! + s.bswPct!));
  }
  // The Dashboard KPI hotspot block carries the prior-month Pending Customer Contact % for its state.
  if (state && state === model.hotspotState && s.pendingPct === null && model.drillMonth && month === prevMonth(model, model.drillMonth)) {
    const b = model.hotspotBlock.find((r) => /pending/i.test(r.metric));
    if (b?.august != null) s.pendingPct = b.august;
  }
  s.trueCancels = add(s.custMiss ?? null, s.coMiss ?? null);
  Object.assign(s, sumReasons(model.customerMissReasons, month, state));
  byModel.set(ck, s);
  return s;
}

export const snapVal = (s: Snapshot, key: string) => s[key] ?? null;

// ------------------------------------------------------------------ deltas & series
export interface Delta {
  /** Value to display: relative change for counts, percentage-point change for pct KPIs. */
  value: number;
  kind: "rel" | "pp";
  current: number;
  previous: number;
}

export function deltaOf(unit: KpiUnit, cur: number | null, prev: number | null): Delta | null {
  if (cur === null || prev === null) return null;
  if (unit === "pct") return { value: cur - prev, kind: "pp", current: cur, previous: prev };
  if (prev === 0) return null;
  return { value: cur / prev - 1, kind: "rel", current: cur, previous: prev };
}

export interface SeriesPoint {
  month: MonthKey;
  value: number | null;
}

export function series(model: DataModel, key: string, state: string | null): SeriesPoint[] {
  return model.months.map((month) => ({ month, value: snapVal(getSnapshot(model, month, state), key) }));
}

export function kpiDelta(model: DataModel, def: KpiDef, month: MonthKey, state: string | null): Delta | null {
  const pm = prevMonth(model, month);
  if (!pm) return null;
  return deltaOf(def.unit, snapVal(getSnapshot(model, month, state), def.key), snapVal(getSnapshot(model, pm, state), def.key));
}

// ------------------------------------------------------------------ assessment (red / amber / green)
export type Status = "critical" | "warning" | "healthy" | "neutral";

export interface Assessment {
  status: Status;
  /** True when the latest move is much larger than the historical month-to-month noise. */
  anomaly: boolean;
  delta: Delta | null;
  /** Typical historical absolute MoM move used as the baseline (same unit as delta.value). */
  baseline: number | null;
  /** |delta| ÷ baseline. */
  multiple: number | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * Data-driven status: compares the selected month's move with the historical month-to-month
 * noise of the same series (median |Δ|), so thresholds adapt to whatever the workbook contains.
 */
export function assess(model: DataModel, def: KpiDef, month: MonthKey, state: string | null): Assessment {
  const delta = kpiDelta(model, def, month, state);
  if (!delta) return { status: "neutral", anomaly: false, delta: null, baseline: null, multiple: null };

  // Day-wise: history is the monthly series (Jan to Aug), and short ranges also clear the day to day noise
  // (ponytail: one portfolio noise figure for every measure; per-measure noise if single days misfire).
  const mo = model.daily?.monthly;
  const noise = model.daily?.days ? model.daily.noise / Math.sqrt(model.daily.days) : 0;
  const floor = Math.max(def.unit === "pct" ? 0.01 : 0.02, def.unit === "pct" ? noise * Math.abs(delta.previous) : noise);
  const hist = mo
    ? mo.months.filter((x) => x <= model.daily!.src).map((x) => ({ month: x, value: snapVal(getSnapshot(mo, x, state), def.key) }))
    : series(model, def.key, state).filter((p) => p.month < month);
  const moves: number[] = [];
  for (let i = 1; i < hist.length; i++) {
    const d = deltaOf(def.unit, hist[i].value, hist[i - 1].value);
    if (d) moves.push(d.value);
  }
  const baseline = Math.max(median(moves.map(Math.abs)), floor);
  const trend = median(moves);
  const mag = Math.abs(delta.value);
  const multiple = mag / baseline;
  const anomaly = moves.length >= 2 ? multiple >= 2.5 : mag >= floor * 3;

  const dir = delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat";
  const bad = def.good !== "neutral" && dir !== "flat" && dir !== def.good;
  const goodMove = def.good !== "neutral" && dir === def.good;

  let status: Status = "neutral";
  if (def.good === "neutral") status = anomaly ? "warning" : "neutral";
  else if (bad && anomaly) status = "critical";
  else if (bad && multiple >= 1.5) status = "warning";
  else if (bad && Math.abs(trend) >= floor && Math.sign(trend) === (def.good === "up" ? 1 : -1)) status = "warning"; // trend reversal
  else if (goodMove && multiple >= 1.5) status = "healthy";
  return { status, anomaly, delta, baseline, multiple };
}

// ------------------------------------------------------------------ normal level (day-wise)
const normalCache = new WeakMap<DataModel, Map<string, number | null>>();
/** Day-wise: the scope's usual cancel rate, the average of its monthly rates before the daily data starts. */
export function normalRate(model: DataModel, scope: string | null): number | null {
  const mo = model.daily?.monthly;
  if (!mo) return null;
  let c = normalCache.get(mo);
  if (!c) normalCache.set(mo, (c = new Map()));
  const k = scope ?? "";
  if (!c.has(k)) {
    const v = mo.months.filter((x) => x <= model.daily!.src).map((x) => getSnapshot(mo, x, scope).cancelRate).filter((x): x is number => x !== null);
    c.set(k, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  }
  return c.get(k) ?? null;
}

// ------------------------------------------------------------------ states
export interface StateRow {
  state: string;
  sales: number | null;
  installs: number | null;
  cancels: number | null;
  cancelRate: number | null;
  cancelsMoM: number | null;
  prevCancels: number | null;
  /** Share of the portfolio's cancellation increase contributed by this state (day-wise: share of the cancellations above normal). */
  contribution: number | null;
  /** Day-wise: the usual cancel rate and the cancellations above it. */
  normal?: number | null;
  excess?: number | null;
  postPct: number | null;
  custPct: number | null;
  pendingPct: number | null;
  onTimePct: number | null;
  snapshot: Snapshot;
}

export function stateRows(model: DataModel, month: MonthKey): StateRow[] {
  const pm = prevMonth(model, month);
  const rows = model.states.map((state) => {
    const s = getSnapshot(model, month, state);
    const p = pm ? getSnapshot(model, pm, state) : null;
    const sm = model.stateMonthly.find((r) => r.month === month && r.state === state);
    const drill = month === model.drillMonth ? model.stateDrill.find((r) => r.state === state) : undefined;
    const mom = sm?.cancelsMoM ?? drill?.cancelGrowth ?? (p?.cancels && s.cancels !== null ? s.cancels / p.cancels - 1 : null);
    return {
      state, sales: s.sales, installs: s.installs, cancels: s.cancels, cancelRate: s.cancelRate, cancelsMoM: mom ?? null,
      prevCancels: p?.cancels ?? null, contribution: null as number | null,
      postPct: s.postPct, custPct: s.custPct, pendingPct: s.pendingPct, onTimePct: s.onTimePct, snapshot: s,
    };
  });
  return withExcess(model, rows, (r) => r.state);
}

/** Contribution: day-wise, each row's share of the cancellations above normal; otherwise its share of the cancellations above normal. */
function withExcess<R extends Omit<StateRow, "state">>(model: DataModel, rows: R[], scope: (r: R) => string): R[] {
  if (model.daily) {
    rows.forEach((r) => { r.normal = normalRate(model, scope(r)); r.excess = r.normal !== null && r.cancels !== null && r.sales !== null ? r.cancels - r.sales * r.normal : null; });
    const tot = rows.reduce((a, r) => a + Math.max(0, r.excess ?? 0), 0);
    if (tot > 0) rows.forEach((r) => (r.contribution = r.excess == null ? null : Math.max(0, r.excess) / tot));
    return rows;
  }
  const totalInc = rows.reduce((a, r) => a + ((r.cancels ?? 0) - (r.prevCancels ?? 0)), 0);
  if (totalInc > 0) rows.forEach((r) => (r.contribution = r.prevCancels !== null && r.cancels !== null ? (r.cancels - r.prevCancels) / totalInc : null));
  return rows;
}

export interface ChannelRow extends Omit<StateRow, "state"> {
  channel: string;
}

export function channelRows(model: DataModel, month: MonthKey): ChannelRow[] {
  const pm = prevMonth(model, month);
  const rows = model.channelNames.map((channel) => {
    const s = getSnapshot(model, month, chScope(channel));
    const p = pm ? getSnapshot(model, pm, chScope(channel)) : null;
    return {
      channel, sales: s.sales, installs: s.installs, cancels: s.cancels, cancelRate: s.cancelRate,
      cancelsMoM: p?.cancels && s.cancels !== null ? s.cancels / p.cancels - 1 : null, prevCancels: p?.cancels ?? null, contribution: null as number | null,
      postPct: s.postPct, custPct: s.custPct, pendingPct: s.pendingPct, onTimePct: s.onTimePct, snapshot: s,
    };
  });
  return withExcess(model, rows, (r) => chScope(r.channel));
}

/** The channel contributing most to the cancellation increase. */
export function findFocusChannel(model: DataModel, month: MonthKey): ChannelRow | null {
  const rows = channelRows(model, month);
  return rows.length ? [...rows].sort((a, b) => (b.contribution ?? -Infinity) - (a.contribution ?? -Infinity) || (b.cancelsMoM ?? 0) - (a.cancelsMoM ?? 0))[0] : null;
}

/** The state with the sharpest cancellation growth (falls back to volume when growth is unavailable). */
export function findHotspot(model: DataModel, month: MonthKey): StateRow | null {
  const rows = stateRows(model, month);
  if (!rows.length) return null;
  // Day-wise: the state furthest above its own normal cancel rate.
  if (model.daily) return [...rows].sort((a, b) => ((b.cancelRate ?? 0) - (b.normal ?? 0)) - ((a.cancelRate ?? 0) - (a.normal ?? 0)))[0];
  return [...rows].sort((a, b) => (b.cancelsMoM ?? -Infinity) - (a.cancelsMoM ?? -Infinity) || (b.cancels ?? 0) - (a.cancels ?? 0))[0];
}

// ------------------------------------------------------------------ portfolio-level derived facts
/** Cancellations above what the prior-months average cancel rate would have produced on this period's sales. */
export function excessCancels(model: DataModel, month: MonthKey, state: string | null = null) {
  const prior = model.baselineMonth ? [model.baselineMonth] : model.months.filter((m) => m < month);
  const rates = prior.map((m) => getSnapshot(model, m, state).cancelRate).filter((x): x is number => x !== null);
  const cur = getSnapshot(model, month, state);
  if (!rates.length || cur.sales === null || cur.cancels === null) return null;
  const baselineRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const expected = baselineRate * cur.sales;
  return { baselineRate, expected, excess: cur.cancels - expected };
}

export interface SignalRow {
  id: "noAction" | "pending" | "action" | "jeopardy" | "bsw";
  label: string;
  pct: number | null;
  count: number | null;
  /** Early-warning (something Brightspeed could act on before cancellation). */
  actionable: boolean;
}

export function watchSignals(model: DataModel, month: MonthKey, state: string | null): SignalRow[] {
  const s = getSnapshot(model, month, state);
  const c = s.cancels;
  const row = (id: SignalRow["id"], label: string, key: string, actionable: boolean): SignalRow => {
    const pct = s[key] ?? null;
    return { id, label, pct, count: pct !== null && c !== null ? Math.round(pct * c) : null, actionable };
  };
  return [
    row("noAction", "No Action Needed", "noActionPct", false),
    row("pending", "Pending Customer Contact", "pendingPct", true),
    row("action", "Action Needed Not Jeopardy", "actionPct", true),
    row("jeopardy", "Install in Jeopardy", "jeopardyPct", true),
    row("bsw", "BSW Delay Predicted", "bswPct", true),
  ];
}

export interface ReasonStat {
  label: string;
  key: string;
  count: number | null;
  share: number | null;
  prevCount: number | null;
  mom: number | null;
  lateStage: boolean;
}

/** Customer-miss reasons for (month, state), ranked by count, with MoM growth computed from the counts. */
export function reasonStats(model: DataModel, month: MonthKey, state: string | null): ReasonStat[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const r of model.customerMissReasons) {
    const k = nk(r.reason);
    if (!seen.has(k)) {
      seen.add(k);
      labels.push(r.reason);
    }
  }
  const cur = getSnapshot(model, month, state);
  const pm = prevMonth(model, month);
  const prev = pm ? getSnapshot(model, pm, state) : null;
  const total = labels.reduce((a, l) => a + (cur[`reason:${nk(l)}`] ?? 0), 0);
  return labels
    .map((label) => {
      const key = `reason:${nk(label)}`;
      const count = cur[key] ?? null;
      const prevCount = prev ? prev[key] ?? null : null;
      return {
        label, key, count, share: count !== null && total ? count / total : null, prevCount,
        mom: count !== null && prevCount ? count / prevCount - 1 : null, lateStage: isLateStageReason(label),
      };
    })
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

/** Sheet-provided flag / insight for a reason row (e.g. "SEPTEMBER HOTSPOT"). */
export function reasonAnnotation(model: DataModel, month: MonthKey, state: string, label: string) {
  const r = model.customerMissReasons.find((x) => x.month === month && x.state === state && nk(x.reason) === nk(label));
  return r ? { flag: r.flag, insight: r.insight } : null;
}

export const stateMonthlyFor = (model: DataModel, state: string): StateMonthlyRow[] =>
  model.stateMonthly.filter((r) => r.state === state).sort((a, b) => a.month.localeCompare(b.month));

/** Executive-meaning caption from the workbook, only valid for the workbook's headline month at portfolio scope. */
export function kpiMeaning(model: DataModel, def: KpiDef, month: MonthKey, state: string | null): string | null {
  if (state || month !== model.latestMonth || !def.cardLabel) return null;
  return model.kpiCards.find((c) => nk(c.label) === nk(def.cardLabel))?.meaning || null;
}

// ------------------------------------------------------------------ trend narrative
export function describeTrend(model: DataModel, def: KpiDef, month: MonthKey, state: string | null): string {
  const scope = scopeName(state);
  const pts = series(model, def.key, state).filter((p) => p.value !== null && p.month <= month);
  const a = assess(model, def, month, state);
  const name = def.label.replace(/ %$/, "");
  const band = (a: number, b: number) => `${fmt(a)} to ${fmt(b)}`;
  if (pts.length < 3 || !a.delta) return `${scope}: only ${pts.length} month(s) of ${name} are available, so a trend cannot yet be described.`;
  const prior = pts.slice(0, -1).map((p) => p.value as number);
  const lo = Math.min(...prior), hi = Math.max(...prior);
  const fmt = (v: number) => (def.unit === "pct" ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US"));
  const first = model.months[0], lastPrior = prior.length ? pts[pts.length - 2].month : month;
  const mname = monthName;
  const chg = def.unit === "pct" ? `${a.delta.value >= 0 ? "+" : "−"}${Math.abs(a.delta.value * 100).toFixed(0)} pp` : `${a.delta.value >= 0 ? "+" : "−"}${Math.abs(a.delta.value * 100).toFixed(0)}%`;
  // Day-wise: the period total is compared with its comparison period; the daily values give the range.
  if (model.daily) {
    const pm = prevMonth(model, month);
    const [s0, e0] = parseKey(month);
    const days = pts.filter((p) => p.month.length === 10 && p.month >= s0 && p.month <= e0).map((p) => p.value as number);
    const span = days.length > 1 ? ` Day by day it ranged from ${fmt(Math.min(...days))} to ${fmt(Math.max(...days))}.` : "";
    return `${scope} ${name}: ${fmt(a.delta.current)} in ${mname(month)} against ${fmt(a.delta.previous)} in ${pm ? mname(pm) : "the previous period"} (${chg}), ${a.anomaly ? `about ${a.multiple!.toFixed(1)}× the usual movement` : "within normal variation"}.${span}`;
  }
  if (a.anomaly) {
    const verb = a.delta.value > 0 ? "jumped" : "dropped";
    return `${scope} ${name} stayed within ${band(lo, hi)} from ${mname(first)} through ${mname(lastPrior)}, then ${verb} to ${fmt(a.delta.current)} in ${mname(month)} (${chg} vs the previous period): about ${a.multiple!.toFixed(1)}× the usual day to day movement.`;
  }
  return `${scope} ${name} has moved within ${band(lo, hi)} since ${mname(first)}; ${mname(month)} came in at ${fmt(a.delta.current)} (${chg} vs the previous period), which is within normal variation.`;
}

/** An agency counts as deteriorating when its cancel rate runs this far above its own history. */
export const AGENCY_GAP_THRESHOLD = 0.05;
