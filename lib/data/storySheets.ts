/**
 * Optional story sheets: agency and representative quality, primary driver attribution,
 * the October outlook and the prevention plan. Sheets are found by name suffix and the
 * state they describe is read from their title rows, so nothing here assumes a particular state.
 */
import type * as XLSX from "xlsx";
import type {
  AgencyMonthRow, AgencySnapshotRow, CountRow, DataIssue, DriverKind, DriverRow, ForecastChannelRow, ForecastStateRow,
  ForecastViewKind, ForecastViewRow, InterventionKind, InterventionRow, MeasureRow, MonthKey, OutcomeRow, PairRow,
  ReclassRow, RepCohortRow, RepRow, SegmentRow, StoryData,
} from "./types";
import { monthFromText, parseTable, sheetGrid, sheetTitles, type Row, type TableSpec } from "./tableParser";

const opt = { required: false } as const;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
const isTotal = (v: unknown) => /^\s*(total|deduplicated total)\b/i.test(s(v));

export const STORY_SHEET_PATTERNS = {
  agencyMonthly: /agency monthly$/i,
  agencySnapshot: /agency (september|snapshot|month)$/i,
  cohorts: /rep(resentative)? cohorts$/i,
  reps: /sales representatives$/i,
  drivers: /primary drivers$/i,
  forecast: /forecast$/i,
  prevention: /prevention$/i,
} as const;

const agencyMonthlySpec: TableSpec = {
  month: { kind: "m", headers: ["Month"] },
  agency: { kind: "s", headers: ["Agency"] },
  channel: { kind: "s", headers: ["Channel"], ...opt },
  sales: { kind: "n", headers: ["Unique Sales", "Sales"] },
  cancels: { kind: "n", headers: ["Cancellations", "Cancels"] },
  cancelRate: { kind: "p", headers: ["Cancel Rate"], ...opt },
  completionRate: { kind: "p", headers: ["Completion Rate"], ...opt },
  disposition: { kind: "s", headers: ["Partner Disposition", "Disposition"], ...opt },
  baseline: { kind: "p", headers: ["Agency*Baseline", "Baseline"], ...opt },
  gap: { kind: "p", headers: ["Gap to Own Baseline*", "Gap*"], ...opt },
};

const signalCols: TableSpec = {
  lowIntent: { kind: "p", headers: ["Low Intent Transcript*"], ...opt },
  promo: { kind: "p", headers: ["Promotion Dependent*"], ...opt },
  competitor: { kind: "p", headers: ["Competitor Mention*"], ...opt },
  failedConfirm: { kind: "p", headers: ["Failed Independent Confirmation*"], ...opt },
};

const agencySnapSpec: TableSpec = {
  agency: { kind: "s", headers: ["Agency"] },
  channel: { kind: "s", headers: ["Channel"], ...opt },
  baseline: { kind: "p", headers: ["Historical Cancel Rate*", "Baseline"], ...opt },
  prevSales: { kind: "n", headers: ["Aug Sales", "Prior Sales"], ...opt },
  prevCancels: { kind: "n", headers: ["Aug Cancels", "Prior Cancels"], ...opt },
  sales: { kind: "n", headers: ["Sep Sales", "Sales"] },
  cancels: { kind: "n", headers: ["Sep Cancels", "Cancels"] },
  cancelRate: { kind: "p", headers: ["Sep Cancel Rate", "Cancel Rate"], ...opt },
  gap: { kind: "p", headers: ["Increase vs Own Baseline*", "Gap*"], ...opt },
  disposition: { kind: "s", headers: ["Disposition"], ...opt },
  pattern: { kind: "s", headers: ["Main Pattern", "Pattern"], ...opt },
  ...signalCols,
};

const cohortSpec: TableSpec = {
  agency: { kind: "s", headers: ["Agency"] },
  cohort: { kind: "s", headers: ["Cohort"] },
  reps: { kind: "n", headers: ["Representatives", "Reps"], ...opt },
  prevSales: { kind: "n", headers: ["Aug Sales"], ...opt },
  prevCancels: { kind: "n", headers: ["Aug Cancels"], ...opt },
  prevRate: { kind: "p", headers: ["Aug Cancel Rate"], ...opt },
  sales: { kind: "n", headers: ["Sep Sales"] },
  cancels: { kind: "n", headers: ["Sep Cancels"] },
  rate: { kind: "p", headers: ["Sep Cancel Rate"], ...opt },
  salesShare: { kind: "p", headers: ["Share of Agency*Sales"], ...opt },
  cancelShare: { kind: "p", headers: ["Share of Agency*Cancels"], ...opt },
  band: { kind: "s", headers: ["Watchtower Band", "Band"], ...opt },
};

const repSpec: TableSpec = {
  id: { kind: "s", headers: ["Rep ID"] },
  agency: { kind: "s", headers: ["Agency"] },
  channel: { kind: "s", headers: ["Channel"], ...opt },
  cohort: { kind: "s", headers: ["Cohort"], ...opt },
  tenure: { kind: "n", headers: ["Tenure*"], ...opt },
  prevSales: { kind: "n", headers: ["Aug Sales"], ...opt },
  prevCancels: { kind: "n", headers: ["Aug Cancels"], ...opt },
  sales: { kind: "n", headers: ["Sep Sales"] },
  cancels: { kind: "n", headers: ["Sep Cancels"] },
  rate: { kind: "p", headers: ["Sep Cancel Rate"], ...opt },
  band: { kind: "s", headers: ["Watchtower Band", "Band"], ...opt },
  ...signalCols,
};

const driverSpec: TableSpec = {
  driver: { kind: "s", headers: ["Primary Driver"] },
  cancels: { kind: "n", headers: ["Cancels"] },
  share: { kind: "p", headers: ["Share"], ...opt },
  interpretation: { kind: "s", headers: ["Interpretation"], ...opt },
};

const reclassSpec: TableSpec = {
  classification: { kind: "s", headers: ["Classification"] },
  recorded: { kind: "n", headers: ["Recorded Cancels"] },
  recordedShare: { kind: "p", headers: ["Recorded Share"], ...opt },
  adjusted: { kind: "n", headers: ["Evidence-Adjusted Cancels", "Adjusted Cancels"] },
  adjustedShare: { kind: "p", headers: ["Evidence-Adjusted Share", "Adjusted Share"], ...opt },
  meaning: { kind: "s", headers: ["Meaning"], ...opt },
};

const viewSpec: TableSpec = {
  view: { kind: "s", headers: ["View"] },
  rate: { kind: "p", headers: ["Cancel Rate"] },
  interpretation: { kind: "s", headers: ["Interpretation"], ...opt },
};

const fStateSpec: TableSpec = {
  state: { kind: "s", headers: ["State"] },
  sales: { kind: "n", headers: ["*Sales"] },
  cancels: { kind: "n", headers: ["Predicted Cancels"] },
  rate: { kind: "p", headers: ["Predicted Cancel Rate"], ...opt },
  prevRate: { kind: "p", headers: ["Sep* Cancel Rate", "Actual Cancel Rate", "Prior Cancel Rate"], ...opt },
};

const fChannelSpec: TableSpec = {
  channel: { kind: "s", headers: ["*Channel"] },
  prevRate: { kind: "p", headers: ["*Actual Rate"], ...opt },
  sales: { kind: "n", headers: ["*Sales"] },
  cancels: { kind: "n", headers: ["*Predicted Cancels"] },
  rate: { kind: "p", headers: ["*Predicted Rate"], ...opt },
  delta: { kind: "p", headers: ["Delta*"], ...opt },
  baseline: { kind: "p", headers: ["Internal Baseline", "Baseline"], ...opt },
  risk: { kind: "s", headers: ["Risk"], ...opt },
};

const interventionSpec: TableSpec = {
  name: { kind: "s", headers: ["Intervention"] },
  saves: { kind: "n", headers: ["Potential Saves", "Saves"] },
  share: { kind: "p", headers: ["Share of Total Saves", "Share"], ...opt },
  action: { kind: "s", headers: ["Primary Action", "Action"], ...opt },
  population: { kind: "s", headers: ["Population"], ...opt },
};

const outcomeSpec: TableSpec = {
  label: { kind: "s", headers: ["Scenario", "Outcome", "Case"] },
  cancels: { kind: "n", headers: ["Expected Cancels"] },
  rate: { kind: "p", headers: ["Cancel Rate*"], ...opt },
};

const segmentSpec: TableSpec = {
  segment: { kind: "s", headers: ["*Installation Segment", "Segment"] },
  orders: { kind: "n", headers: ["Orders"] },
  signal: { kind: "s", headers: ["Driver Signal", "Signal"], ...opt },
  action: { kind: "s", headers: ["Action"], ...opt },
  objective: { kind: "s", headers: ["Objective"], ...opt },
};

const measureSpec: TableSpec = {
  measure: { kind: "s", headers: ["Measure"] },
  actual: { kind: "s", headers: ["*Actual"] },
  noAction: { kind: "s", headers: ["*No Action"] },
  target: { kind: "s", headers: ["Target"] },
  role: { kind: "s", headers: ["KPI Role", "Role"], ...opt },
  meaning: { kind: "s", headers: ["Success Meaning", "Meaning"], ...opt },
};

const contactPopSpec: TableSpec = {
  label: { kind: "s", headers: ["Contact Risk Population"] },
  value: { kind: "n", headers: ["Orders"] },
};
const contactRuleSpec: TableSpec = {
  label: { kind: "s", headers: ["Contact Risk Signal"] },
  value: { kind: "s", headers: ["Preventive Response"] },
};
const exampleOrderSpec: TableSpec = {
  label: { kind: "s", headers: ["Example Order Signal"] },
  value: { kind: "s", headers: ["Example Value"] },
};
const exampleInstallSpec: TableSpec = {
  label: { kind: "s", headers: ["Example Installation Signal"] },
  value: { kind: "s", headers: ["Example Value"] },
};

const driverKind = (t: string): DriverKind =>
  isTotal(t) ? "total" : /sales|agency|rep/i.test(t) ? "sales" : /contact|appointment/i.test(t) ? "contact" : /company|operational/i.test(t) ? "company" : /faux/i.test(t) ? "faux" : "other";
const interventionKind = (t: string): InterventionKind =>
  isTotal(t) ? "total" : /sales quality|agency|representative/i.test(t) ? "sales" : /install|bsw|odd/i.test(t) ? "install" : /contact|root cause/i.test(t) ? "contact" : "other";
const viewKind = (t: string): ForecastViewKind =>
  /baseline/i.test(t) ? "baseline" : /no action|no intervention/i.test(t) ? "noAction" : /intervention/i.test(t) ? "intervention" : /actual/i.test(t) ? "actual" : "other";
const outcomeKind = (t: string): OutcomeRow["kind"] =>
  /prevent/i.test(t) ? "prevented" : /no (action|intervention)/i.test(t) ? "noAction" : /intervention/i.test(t) ? "intervention" : "other";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "August actual" → "<year>-08" using the year of a reference month. */
function monthInLabel(label: string, refYear: string | null): MonthKey | null {
  const m = label.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (!m || !refYear) return null;
  return `${refYear}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}`;
}

export const emptyStory = (): StoryData => ({
  focusState: null, month: null, agencyMonthly: [], agencies: [], cohorts: [], reps: [], drivers: [], reclass: [],
  forecastMonth: null, forecastViews: [], forecastStates: [], forecastChannels: [], interventions: [], outcomes: [],
  segments: [], measures: [], contactRisk: [], contactRules: [], exampleOrder: [], exampleInstall: [],
});

/** Reads consecutive tables from one sheet, each search starting after the previous table. */
function tableReader(grid: unknown[][], sheet: string, issues: DataIssue[]) {
  let cursor = 0;
  return (spec: TableSpec): Row[] => {
    const t = parseTable(grid, spec, { sheet, startRow: cursor, stopAtBlank: true, optional: true }, issues);
    if (!t) return [];
    cursor = t.endRow + 1;
    return t.rows;
  };
}

export function parseStorySheets(
  wb: XLSX.WorkBook,
  ctx: { states: string[]; drillMonth: MonthKey | null; latestMonth: MonthKey | null },
  issues: DataIssue[],
  onSheet: (name: string, rows: number) => void,
): StoryData {
  const out = emptyStory();
  const find = (re: RegExp) => wb.SheetNames.find((x) => re.test(x.trim()));
  const titles: string[] = [];
  const open = (re: RegExp) => {
    const name = find(re);
    if (!name) return null;
    const grid = sheetGrid(wb.Sheets[name]);
    titles.push(...sheetTitles(grid).slice(0, 1));
    return { name, grid, read: tableReader(grid, name, issues) };
  };

  const am = open(STORY_SHEET_PATTERNS.agencyMonthly);
  if (am) {
    out.agencyMonthly = am.read(agencyMonthlySpec).filter((r) => r.month && r.agency).map((r) => ({
      month: r.month as string, agency: s(r.agency), channel: s(r.channel), sales: n(r.sales), cancels: n(r.cancels),
      cancelRate: n(r.cancelRate) ?? (n(r.cancels) !== null && n(r.sales) ? (r.cancels as number) / (r.sales as number) : null),
      completionRate: n(r.completionRate), disposition: s(r.disposition), baseline: n(r.baseline), gap: n(r.gap),
    }) satisfies AgencyMonthRow);
    onSheet(am.name, out.agencyMonthly.length);
  }

  const as = open(STORY_SHEET_PATTERNS.agencySnapshot);
  if (as) {
    out.agencies = as.read(agencySnapSpec).filter((r) => r.agency && !isTotal(r.agency)).map((r) => ({
      agency: s(r.agency), channel: s(r.channel), baseline: n(r.baseline), prevSales: n(r.prevSales), prevCancels: n(r.prevCancels),
      sales: n(r.sales), cancels: n(r.cancels),
      cancelRate: n(r.cancelRate) ?? (n(r.cancels) !== null && n(r.sales) ? (r.cancels as number) / (r.sales as number) : null),
      gap: n(r.gap), disposition: s(r.disposition), pattern: s(r.pattern),
      lowIntent: n(r.lowIntent), promo: n(r.promo), competitor: n(r.competitor), failedConfirm: n(r.failedConfirm),
    }) satisfies AgencySnapshotRow);
    out.agencies.forEach((a) => {
      if (a.gap === null && a.cancelRate !== null && a.baseline !== null) a.gap = a.cancelRate - a.baseline;
    });
    onSheet(as.name, out.agencies.length);
  }

  const co = open(STORY_SHEET_PATTERNS.cohorts);
  if (co) {
    out.cohorts = co.read(cohortSpec).filter((r) => r.agency && r.cohort).map((r) => ({
      agency: s(r.agency), cohort: s(r.cohort), reps: n(r.reps), prevSales: n(r.prevSales), prevCancels: n(r.prevCancels), prevRate: n(r.prevRate),
      sales: n(r.sales), cancels: n(r.cancels), rate: n(r.rate), salesShare: n(r.salesShare), cancelShare: n(r.cancelShare), band: s(r.band),
    }) satisfies RepCohortRow);
    onSheet(co.name, out.cohorts.length);
  }

  const rp = open(STORY_SHEET_PATTERNS.reps);
  if (rp) {
    out.reps = rp.read(repSpec).filter((r) => r.id).map((r) => ({
      id: s(r.id), agency: s(r.agency), channel: s(r.channel), cohort: s(r.cohort), tenure: n(r.tenure),
      prevSales: n(r.prevSales), prevCancels: n(r.prevCancels), sales: n(r.sales), cancels: n(r.cancels), rate: n(r.rate), band: s(r.band),
      lowIntent: n(r.lowIntent), promo: n(r.promo), competitor: n(r.competitor), failedConfirm: n(r.failedConfirm),
    }) satisfies RepRow);
    onSheet(rp.name, out.reps.length);
  }

  const dr = open(STORY_SHEET_PATTERNS.drivers);
  if (dr) {
    out.drivers = dr.read(driverSpec).filter((r) => r.driver).map((r) => ({
      kind: driverKind(s(r.driver)), driver: s(r.driver), cancels: n(r.cancels), share: n(r.share), interpretation: s(r.interpretation),
    }) satisfies DriverRow);
    out.reclass = dr.read(reclassSpec).filter((r) => r.classification).map((r) => ({
      classification: s(r.classification), isTotal: isTotal(r.classification), recorded: n(r.recorded), recordedShare: n(r.recordedShare),
      adjusted: n(r.adjusted), adjustedShare: n(r.adjustedShare), meaning: s(r.meaning),
    }) satisfies ReclassRow);
    onSheet(dr.name, out.drivers.length + out.reclass.length);
  }

  const fc = open(STORY_SHEET_PATTERNS.forecast);
  if (fc) {
    out.forecastMonth = monthFromText(sheetTitles(fc.grid).join(" "));
    const year = (out.forecastMonth ?? ctx.latestMonth)?.slice(0, 4) ?? null;
    out.forecastViews = fc.read(viewSpec).filter((r) => r.view).map((r) => {
      const kind = viewKind(s(r.view));
      return { kind, view: s(r.view), month: kind === "baseline" ? null : monthInLabel(s(r.view), year), rate: n(r.rate), interpretation: s(r.interpretation) } satisfies ForecastViewRow;
    });
    out.forecastStates = fc.read(fStateSpec).filter((r) => r.state).map((r) => ({
      state: s(r.state), isTotal: isTotal(r.state), sales: n(r.sales), cancels: n(r.cancels),
      rate: n(r.rate) ?? (n(r.cancels) !== null && n(r.sales) ? (r.cancels as number) / (r.sales as number) : null), prevRate: n(r.prevRate),
    }) satisfies ForecastStateRow);
    out.forecastChannels = fc.read(fChannelSpec).filter((r) => r.channel).map((r) => ({
      channel: s(r.channel), isTotal: isTotal(r.channel) || ctx.states.includes(s(r.channel)), prevRate: n(r.prevRate), sales: n(r.sales),
      cancels: n(r.cancels), rate: n(r.rate), delta: n(r.delta), baseline: n(r.baseline), risk: s(r.risk),
    }) satisfies ForecastChannelRow);
    onSheet(fc.name, out.forecastViews.length + out.forecastStates.length + out.forecastChannels.length);
  }

  const pv = open(STORY_SHEET_PATTERNS.prevention);
  if (pv) {
    out.interventions = pv.read(interventionSpec).filter((r) => r.name).map((r) => ({
      kind: interventionKind(s(r.name)), name: s(r.name), saves: n(r.saves), share: n(r.share), action: s(r.action), population: s(r.population),
    }) satisfies InterventionRow);
    out.outcomes = pv.read(outcomeSpec).filter((r) => r.label).map((r) => ({ kind: outcomeKind(s(r.label)), label: s(r.label), cancels: n(r.cancels), rate: n(r.rate) }) satisfies OutcomeRow);
    out.segments = pv.read(segmentSpec).filter((r) => r.segment).map((r) => ({
      segment: s(r.segment), isTotal: isTotal(r.segment), orders: n(r.orders), signal: s(r.signal), action: s(r.action), objective: s(r.objective),
    }) satisfies SegmentRow);
    out.measures = pv.read(measureSpec).filter((r) => r.measure).map((r) => ({
      measure: s(r.measure), actual: s(r.actual), noAction: s(r.noAction), target: s(r.target), role: s(r.role), meaning: s(r.meaning),
    }) satisfies MeasureRow);
    out.contactRisk = pv.read(contactPopSpec).filter((r) => r.label).map((r) => ({ label: s(r.label), value: n(r.value) }) satisfies CountRow);
    out.contactRules = pv.read(contactRuleSpec).filter((r) => r.label).map((r) => ({ label: s(r.label), value: s(r.value) }) satisfies PairRow);
    out.exampleOrder = pv.read(exampleOrderSpec).filter((r) => r.label).map((r) => ({ label: s(r.label), value: s(r.value) }) satisfies PairRow);
    out.exampleInstall = pv.read(exampleInstallSpec).filter((r) => r.label).map((r) => ({ label: s(r.label), value: s(r.value) }) satisfies PairRow);
    onSheet(pv.name, out.interventions.length + out.outcomes.length + out.segments.length + out.measures.length);
  }

  // Which state do the agency / attribution sheets describe? Longest name first so "West Virginia" beats "Virginia".
  const byLength = [...ctx.states].sort((a, b) => b.length - a.length);
  for (const t of titles) {
    const st = byLength.find((x) => t.toLowerCase().includes(x.toLowerCase()));
    if (st) {
      out.focusState = st;
      break;
    }
  }
  out.month = ctx.drillMonth;

  // Reconciliation checks: surfaced as warnings, never silently corrected.
  const tot = out.drivers.find((d) => d.kind === "total");
  const parts = out.drivers.filter((d) => d.kind !== "total").reduce((a, d) => a + (d.cancels ?? 0), 0);
  if (tot?.cancels != null && parts && Math.abs(parts - tot.cancels) > 1) {
    issues.push({ level: "warn", sheet: dr?.name ?? "Primary Drivers", message: `Primary drivers sum to ${parts} but the total row shows ${tot.cancels}.` });
  }
  const dedup = out.interventions.find((i) => i.kind === "total");
  const prevented = out.outcomes.find((o) => o.kind === "prevented");
  if (dedup?.saves != null && prevented?.cancels != null && dedup.saves !== prevented.cancels) {
    issues.push({ level: "warn", sheet: pv?.name ?? "Prevention", message: `Deduplicated saves (${dedup.saves}) differ from the prevented cancellations (${prevented.cancels}).` });
  }
  return out;
}
