/**
 * Canonical story facts for a month. Every narrative, evidence panel and player scene reads its
 * figures from here (which reads the workbook backed model), so a number is derived exactly once.
 */
import type { AgencySnapshotRow, DataModel, DriverRow, ForecastStateRow, InterventionRow, MonthKey, PairRow, RepCohortRow, SegmentRow } from "../data/types";
import { diagnose, type Diagnosis } from "../data/narratives";
import {
  AGENCY_GAP_THRESHOLD, assess, channelRows, excessCancels, getSnapshot, kpiById, prevMonth, reasonStats, stateRows,
  type ChannelRow, type ReasonStat, type Snapshot, type StateRow,
} from "../data/metrics";


export { AGENCY_GAP_THRESHOLD };
/** A channel inside a state is an outlier when its cancel rate exceeds the state's other channels by this much. */
const CHANNEL_OUTLIER_GAP = 0.08;

export interface ChannelFact {
  channel: string;
  rate: number | null;
  sales: number | null;
  cancels: number | null;
  outlier: boolean;
}

export interface StoryFacts {
  model: DataModel;
  month: MonthKey;
  prev: MonthKey | null;
  d: Diagnosis;
  port: Snapshot;
  portPrev: Snapshot | null;
  /** Size of the cancellation move relative to normal month to month noise. */
  multiple: number | null;
  /** Internal reference cancel rate (workbook baseline view when present, else prior months average). */
  baselineRate: number | null;
  /** State that explains the exception (null when the month is in line with trend). */
  focus: StateRow | null;
  focusSnap: Snapshot | null;
  focusPrev: Snapshot | null;
  /** Cancellation growth range across the remaining states. */
  otherGrowth: [number, number] | null;
  otherRate: [number, number] | null;
  focusChannels: ChannelFact[];
  outlierChannels: ChannelFact[];
  normalChannelRate: [number, number] | null;
  portfolioChannels: ChannelRow[];
  /** True when the agency, attribution and forecast sheets describe this period and focus state. */
  hasStory: boolean;
  weakAgencies: AgencySnapshotRow[];
  steadyAgencies: AgencySnapshotRow[];
  cohort: RepCohortRow | null;
  signals: { lowIntent: number | null; promo: number | null; competitor: number | null; failedConfirm: number | null };
  drivers: Partial<Record<DriverRow["kind"], DriverRow>>;
  /** Cancellations that move from Customer Miss to Company Miss after journey evidence review. */
  reclassMoved: number | null;
  lateDrivers: ReasonStat[];
  forecast: { month: MonthKey | null; baseline: number | null; prevActual: number | null; actual: number | null; noAction: number | null; intervention: number | null };
  forecastFocus: ForecastStateRow | null;
  forecastOthers: [number, number] | null;
  interventions: Partial<Record<InterventionRow["kind"], InterventionRow>>;
  contactRisk: { orders: number | null; projected: number | null; protectable: number | null };
  /** Next month orders in the outlier channels of the focus state: the population the sales quality score runs on. */
  riskyOrders: { channels: string[]; orders: number | null; projected: number | null; rate: number | null };
  /** Share of the deteriorating agencies' sales made by Critical band representatives. */
  criticalRepShare: number | null;
  /** Rep risk: share of the deteriorating agencies' sales made by High or Critical band representatives. */
  repRiskShare: number | null;
  /** Delivery risk segmentation (cancellation risk x Customer Lifetime Value (CLTV) x ODD x permit / construction readiness). */
  highValue: { total: number | null; accelerate: SegmentRow | null; resetOdd: SegmentRow | null; handOff: SegmentRow | null; standard: SegmentRow | null };
  /** Day-wise: how much riskier the orders the score runs on are over the plan's horizon than over 30 days (1 at 30 days). */
  scoreLift: number;
  /** Example scored order and example delivery-risk order, restated on the plan's horizon. */
  exampleOrder: PairRow[];
  exampleInstall: PairRow[];
}

const cache = new WeakMap<DataModel, Map<MonthKey, StoryFacts>>();
const range = (xs: (number | null)[]): [number, number] | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};
const weighted = <T,>(rows: T[], w: (r: T) => number | null, v: (r: T) => number | null) => {
  let num = 0, den = 0;
  for (const r of rows) {
    const a = w(r), b = v(r);
    if (a !== null && b !== null) {
      num += a * b;
      den += a;
    }
  }
  return den ? num / den : null;
};

/**
 * The five sales quality risk factors for the deteriorating agencies, highest first. `scored`: their share in
 * the orders the score runs on over the plan's horizon (the observed shares times `scoreLift`).
 */
export function riskFactors(f: StoryFacts, scored = false): { id: string; label: string; short: string; v: number | null }[] {
  const sg = f.signals;
  const k = (v: number | null) => (v === null || !scored ? v : Math.min(0.95, v * f.scoreLift));
  const rep = k(f.repRiskShare);
  return [
    { id: "rep", label: "Rep risk (sales from High or Critical reps)", short: `rep risk (${pct(rep)} of sales from High or Critical reps)`, v: rep },
    { id: "lowIntent", label: "Low intent in sales transcript", short: `low intent (${pct(k(sg.lowIntent))})`, v: k(sg.lowIntent) },
    { id: "promo", label: "Promotion sensitivity", short: `promotion sensitivity (${pct(k(sg.promo))})`, v: k(sg.promo) },
    { id: "competitor", label: "Competitor mentioned", short: `competitor mention (${pct(k(sg.competitor))})`, v: k(sg.competitor) },
    { id: "failedConfirm", label: "Price or offer mismatch (fails independent confirmation)", short: `price or offer mismatch (${pct(k(sg.failedConfirm))} fail independent confirmation)`, v: k(sg.failedConfirm) },
  ].sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
}

/**
 * Day-wise: the next `h` days are mostly orders sold in the last few days, so the score runs on the recent mix.
 * Half of the weak agencies' cancel rate lift (last `h` days vs last 30) carries into the risk factors and the
 * example scores. ponytail: half-lift heuristic; read per-order factor shares instead once the daily sheets carry them.
 */
function scoreLiftOf(model: DataModel, weak: Set<string>): number {
  const D = model.daily, h = D?.horizon ?? 30;
  if (!D?.end || h >= 30) return 1;
  const days = D.dates.filter((d) => d <= D.end!);
  const rateOver = (n: number) => {
    const ds = new Set(days.slice(-n));
    let s0 = 0, c0 = 0;
    for (const r of D.raw.ag) if (ds.has(String(r.date)) && weak.has(String(r.agency))) { s0 += Number(r.sales) || 0; c0 += Number(r.cancels) || 0; }
    return s0 ? c0 / s0 : null;
  };
  const a = rateOver(h), b = rateOver(30);
  return a && b ? Math.max(1, 1 + (a / b - 1) / 2) : 1;
}

/** Example rows restated on the horizon: scores times the lift, dates inside the next `h` days (30 days keeps the workbook). */
function restateExamples(model: DataModel, lift: number) {
  const D = model.daily, h = D?.horizon ?? 30, st = model.story;
  if (!D?.end) return { exampleOrder: st.exampleOrder, exampleInstall: st.exampleInstall };
  const day = (n: number) => new Date(Date.parse(`${D.end}T00:00:00Z`) + n * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const near = h < 30, odd = 5;
  const scale = (v: string) => v.replace(/\d+/, (x) => String(Math.min(99, Math.round(Number(x) * lift))));
  return {
    exampleOrder: st.exampleOrder.flatMap((r) =>
      /propensity/i.test(r.label) ? [{ ...r, value: scale(r.value) }, { label: "Expected installation", value: day(near ? odd - 1 : 12) }]
      : near && /recommended action/i.test(r.label) ? [{ ...r, value: `${r.value} within 24 hours` }] : [r]),
    exampleInstall: !near ? st.exampleInstall : st.exampleInstall.map((r) =>
      /risk/i.test(r.label) ? { ...r, value: scale(r.value) }
      : /current odd/i.test(r.label) ? { ...r, value: day(odd) }
      : /earlier slot/i.test(r.label) ? { ...r, value: day(odd - 2) }
      : /recommended action/i.test(r.label) ? { ...r, value: `${r.value} this week` } : r),
  };
}
const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

export function storyFacts(model: DataModel, month: MonthKey): StoryFacts {
  let byMonth = cache.get(model);
  if (!byMonth) cache.set(model, (byMonth = new Map()));
  const hit = byMonth.get(month);
  if (hit) return hit;

  const prev = prevMonth(model, month);
  const d = diagnose(model, month);
  const port = getSnapshot(model, month, null);
  const portPrev = prev ? getSnapshot(model, prev, null) : null;
  const a = assess(model, kpiById("cancels")!, month, null);
  const st = model.story;

  const focus = d.anomaly && d.hotspot && (model.daily ? (d.hotspot.cancelRate ?? 0) - (d.hotspot.normal ?? 1) >= 0.03 : (d.hotspot.cancelsMoM ?? 0) > 0.15) ? d.hotspot : null;
  const others = stateRows(model, month).filter((r) => r.state !== focus?.state);

  // Channels inside the focus state (the state × channel cross view is published for the drill month).
  const sc = focus && month === model.drillMonth ? model.stateChannel.filter((r) => r.state === focus.state) : [];
  const focusChannels: ChannelFact[] = sc
    .map((r) => ({ channel: r.channel, rate: r.cancelRate, sales: r.sales, cancels: r.cancels, outlier: false }))
    .sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));
  const rates = focusChannels.map((c) => c.rate).filter((x): x is number => x !== null).sort((x, y) => x - y);
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
  // Day-wise: which channels are the problem is read from the last 30 days, so every period names the same ones.
  const ref = model.daily?.stable.channelRate;
  const refRate = (c: ChannelFact) => (ref && focus ? ref[`${focus.state}|${c.channel}`] ?? null : c.rate);
  const refRates = focusChannels.map(refRate).filter((x): x is number => x !== null).sort((x, y) => x - y);
  const refMedian = ref ? (refRates.length ? refRates[Math.floor(refRates.length / 2)] : null) : median;
  focusChannels.forEach((c) => { const r = refRate(c); c.outlier = refMedian !== null && r !== null && r - refMedian >= CHANNEL_OUTLIER_GAP; });
  const outlierChannels = focusChannels.filter((c) => c.outlier);

  const hasStory = !!focus && st.focusState === focus.state && st.month === month;
  // Day-wise: the partners that broke from their own history over the last 30 days stay the named ones for any period.
  const agencyRef = model.daily?.stable.agencyGap;
  const isWeak = (x: (typeof st.agencies)[number]) => ((agencyRef ? agencyRef[x.agency] : x.gap) ?? 0) >= AGENCY_GAP_THRESHOLD;
  const weakAgencies = hasStory ? st.agencies.filter(isWeak).sort((x, y) => (y.gap ?? 0) - (x.gap ?? 0)) : [];
  const steadyAgencies = hasStory ? st.agencies.filter((x) => !isWeak(x)) : [];
  const weakNames = new Set(weakAgencies.map((x) => x.agency));
  const cohort = hasStory
    ? st.cohorts
        .filter((c) => weakNames.has(c.agency) && (c.salesShare ?? 0) > 0 && (c.cancelShare ?? 0) > (c.salesShare ?? 0))
        .sort((x, y) => ((y.cancelShare ?? 0) - (y.salesShare ?? 0)) - ((x.cancelShare ?? 0) - (x.salesShare ?? 0)))[0] ?? null
    : null;

  const drivers: StoryFacts["drivers"] = {};
  if (hasStory) for (const r of st.drivers) drivers[r.kind] ??= r;
  const coRow = hasStory ? st.reclass.find((r) => /company/i.test(r.classification)) : undefined;

  const view = (k: string, m?: MonthKey | null) => st.forecastViews.find((v) => v.kind === k && (m === undefined || v.month === m?.slice(0, 7)))?.rate ?? null;
  const ex = excessCancels(model, month);
  const forecastFocus = hasStory ? st.forecastStates.find((r) => r.state === focus!.state) ?? null : null;
  const interventions: StoryFacts["interventions"] = {};
  if (hasStory) for (const r of st.interventions) interventions[r.kind] ??= r;

  const f: StoryFacts = {
    model, month, prev, d, port, portPrev,
    multiple: a.multiple,
    baselineRate: view("baseline") ?? ex?.baselineRate ?? null,
    focus,
    focusSnap: focus ? getSnapshot(model, month, focus.state) : null,
    focusPrev: focus && prev ? getSnapshot(model, prev, focus.state) : null,
    otherGrowth: range(others.map((r) => r.cancelsMoM)),
    otherRate: range(others.map((r) => r.cancelRate)),
    focusChannels,
    outlierChannels,
    normalChannelRate: range(focusChannels.filter((c) => !c.outlier).map((c) => c.rate)),
    portfolioChannels: channelRows(model, month).sort((x, y) => (y.contribution ?? -Infinity) - (x.contribution ?? -Infinity)),
    hasStory,
    weakAgencies,
    steadyAgencies,
    cohort,
    signals: {
      lowIntent: weighted(weakAgencies, (x) => x.sales, (x) => x.lowIntent),
      promo: weighted(weakAgencies, (x) => x.sales, (x) => x.promo),
      competitor: weighted(weakAgencies, (x) => x.sales, (x) => x.competitor),
      failedConfirm: weighted(weakAgencies, (x) => x.sales, (x) => x.failedConfirm),
    },
    drivers,
    reclassMoved: coRow?.adjusted != null && coRow.recorded != null ? coRow.adjusted - coRow.recorded : null,
    lateDrivers: reasonStats(model, month, focus?.state ?? null).filter((r) => r.lateStage && (r.mom ?? 0) > 0.25).sort((x, y) => (y.mom ?? 0) - (x.mom ?? 0)),
    forecast: hasStory
      ? { month: st.forecastMonth, baseline: view("baseline"), prevActual: model.daily ? portPrev?.cancelRate ?? null : prev ? view("actual", prev) : null, actual: model.daily ? port.cancelRate : view("actual", month), noAction: view("noAction"), intervention: view("intervention") }
      : { month: null, baseline: null, prevActual: null, actual: null, noAction: null, intervention: null },
    forecastFocus,
    forecastOthers: hasStory ? range(st.forecastStates.filter((r) => !r.isTotal && r.state !== focus!.state).map((r) => r.rate)) : null,
    interventions,
    riskyOrders: { channels: [], orders: null, projected: null, rate: null },
    highValue: { total: null, accelerate: null, resetOdd: null, handOff: null, standard: null },
    criticalRepShare: null,
    repRiskShare: null,
    contactRisk: {
      orders: hasStory ? st.contactRisk[0]?.value ?? null : null,
      projected: hasStory ? st.contactRisk[1]?.value ?? null : null,
      protectable: hasStory ? st.contactRisk[2]?.value ?? null : null,
    },
    scoreLift: scoreLiftOf(model, weakNames),
    exampleOrder: [],
    exampleInstall: [],
  };
  Object.assign(f, restateExamples(model, f.scoreLift));
  if (hasStory) {
    const rows = st.forecastChannels.filter((r) => !r.isTotal && outlierChannels.some((c) => c.channel === r.channel));
    const orders = rows.reduce((a, r) => a + (r.sales ?? 0), 0), projected = rows.reduce((a, r) => a + (r.cancels ?? 0), 0);
    f.riskyOrders = { channels: rows.map((r) => r.channel), orders: rows.length ? orders : null, projected: rows.length ? projected : null, rate: orders ? projected / orders : null };
    const reps = st.reps.filter((r) => weakNames.has(r.agency));
    const total = reps.reduce((a, r) => a + (r.sales ?? 0), 0);
    f.repRiskShare = total ? reps.filter((r) => /critical|high/i.test(r.band)).reduce((a, r) => a + (r.sales ?? 0), 0) / total : null;
    f.criticalRepShare = total ? reps.filter((r) => /critical/i.test(r.band)).reduce((a, r) => a + (r.sales ?? 0), 0) / total : null;
    const segs = st.segments.filter((x) => !x.isTotal);
    const pick = (re: RegExp) => segs.find((x) => re.test(x.action)) ?? null;
    f.highValue = {
      total: st.segments.find((x) => x.isTotal)?.orders ?? (segs.length ? segs.reduce((a, x) => a + (x.orders ?? 0), 0) : null),
      accelerate: pick(/accelerat/i), resetOdd: pick(/reset|escalat/i), handOff: pick(/contact rescue|hand/i), standard: pick(/maintain|monitor/i),
    };
  }
  byMonth.set(month, f);
  return f;
}
