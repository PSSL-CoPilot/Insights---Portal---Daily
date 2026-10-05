/**
 * Converts a parsed workbook into the typed `DataModel`.
 * Every sheet has a declarative column spec (aliases allow small header changes),
 * and everything the UI shows flows from here — nothing is hard-coded downstream.
 */
import type * as XLSX from "xlsx";
import { attachDaily } from "./daily";
import type {
  ChannelMonthlyRow,
  ClassificationRow,
  DataIssue,
  DataModel,
  DictionaryRow,
  ExecQuestionRow,
  HotspotRow,
  JourneyStep,
  KpiCardRow,
  MonthKey,
  MonthlyOverviewRow,
  OddTimingRow,
  ReasonRow,
  SheetStatus,
  StateDrillRow,
  StateChannelRow,
  StateMonthlyRow,
  WatchtowerRow,
} from "./types";
import { getSheet, monthFromText, parseTable, sheetGrid, sheetTitles, type Row, type TableSpec } from "./tableParser";
import { parseStorySheets } from "./storySheets";

export const SHEETS = {
  kpi: "Dashboard KPI",
  monthly: "Monthly Overview",
  stateMonthly: "State Monthly",
  stateDrill: "September State Drill",
  odd: "ODD Timing",
  classification: "Cancel Classification",
  reasons: "Customer Miss Reasons",
  watchtower: "Watchtower Signals",
  journey: "Example Customer Journey",
  questions: "Executive Questions",
  dictionary: "Data Dictionary",
  channels: "Channel Monthly",
  stateChannel: "September State x Channel",
} as const;

const REQUIRED_SHEETS = [
  SHEETS.kpi,
  SHEETS.monthly,
  SHEETS.stateMonthly,
  SHEETS.stateDrill,
  SHEETS.odd,
  SHEETS.classification,
  SHEETS.reasons,
  SHEETS.watchtower,
  SHEETS.journey,
  SHEETS.questions,
  SHEETS.dictionary,
];

// ---------------------------------------------------------------- column specs
const opt = { required: false } as const;

const monthlySpec: TableSpec = {
  month: { kind: "m", headers: ["Month"] },
  sales: { kind: "n", headers: ["Unique Sales"] },
  salesMoM: { kind: "r", headers: ["Sales MoM %"], ...opt },
  installs: { kind: "n", headers: ["Installs"] },
  installRate: { kind: "p", headers: ["Install Rate"], ...opt },
  cancels: { kind: "n", headers: ["Cancellations"] },
  cancelsMoM: { kind: "r", headers: ["Cancels MoM %"], ...opt },
  cancelRate: { kind: "p", headers: ["Cancel Rate"], ...opt },
  prePct: { kind: "p", headers: ["Pre-ODD %"], ...opt },
  onPct: { kind: "p", headers: ["On-ODD %"], ...opt },
  postPct: { kind: "p", headers: ["Post-ODD %"], ...opt },
  custPct: { kind: "p", headers: ["Customer Miss %"], ...opt },
  coPct: { kind: "p", headers: ["Company Miss %"], ...opt },
  fauxPct: { kind: "p", headers: ["Faux %"], ...opt },
  pendingPct: { kind: "p", headers: ["Pending Customer Contact %"], ...opt },
  actionPct: { kind: "p", headers: ["Action Needed Not Jeopardy %"], ...opt },
  jeopardyPct: { kind: "p", headers: ["Install in Jeopardy %"], ...opt },
  bswPct: { kind: "p", headers: ["BSW Delay Predicted %"], ...opt },
  onTimePct: { kind: "p", headers: ["On-Time Install %"], ...opt },
};

const stateMonthlySpec: TableSpec = {
  month: { kind: "m", headers: ["Month"] },
  state: { kind: "s", headers: ["State"] },
  sales: { kind: "n", headers: ["Unique Sales"] },
  installs: { kind: "n", headers: ["Installs"] },
  cancels: { kind: "n", headers: ["Cancellations"] },
  cancelRate: { kind: "p", headers: ["Cancel Rate"], ...opt },
  cancelsMoM: { kind: "r", headers: ["Cancels MoM %"], ...opt },
  preCancels: { kind: "n", headers: ["Pre-ODD Cancels"], ...opt },
  prePct: { kind: "p", headers: ["Pre-ODD %"], ...opt },
  onCancels: { kind: "n", headers: ["On-ODD Cancels"], ...opt },
  onPct: { kind: "p", headers: ["On-ODD %"], ...opt },
  postCancels: { kind: "n", headers: ["Post-ODD Cancels"], ...opt },
  postPct: { kind: "p", headers: ["Post-ODD %"], ...opt },
  custMiss: { kind: "n", headers: ["Customer Miss"], ...opt },
  custPct: { kind: "p", headers: ["Customer Miss %"], ...opt },
  coMiss: { kind: "n", headers: ["Company Miss"], ...opt },
  coPct: { kind: "p", headers: ["Company Miss %"], ...opt },
  faux: { kind: "n", headers: ["Faux Cancels", "Faux"], ...opt },
  fauxPct: { kind: "p", headers: ["Faux %"], ...opt },
  pendingPct: { kind: "p", headers: ["Pending Customer Contact %"], ...opt },
  actionPct: { kind: "p", headers: ["Action Needed Not Jeopardy %"], ...opt },
  jeopardyPct: { kind: "p", headers: ["Install in Jeopardy %"], ...opt },
  bswPct: { kind: "p", headers: ["BSW Delay Predicted %"], ...opt },
  onTimePct: { kind: "p", headers: ["On-Time Install %"], ...opt },
};

const stateDrillSpec: TableSpec = {
  state: { kind: "s", headers: ["State"] },
  sales: { kind: "n", headers: ["Unique Sales"] },
  installs: { kind: "n", headers: ["Installs"] },
  cancels: { kind: "n", headers: ["Cancellations"] },
  cancelRate: { kind: "p", headers: ["Cancel Rate"], ...opt },
  cancelGrowth: { kind: "r", headers: ["Cancel Growth vs Aug", "Cancel Growth*", "Cancels MoM %"], ...opt },
  prePct: { kind: "p", headers: ["Pre-ODD %"], ...opt },
  onPct: { kind: "p", headers: ["On-ODD %"], ...opt },
  postPct: { kind: "p", headers: ["Post-ODD %"], ...opt },
  custPct: { kind: "p", headers: ["Customer Miss %"], ...opt },
  pendingPct: { kind: "p", headers: ["Pending Customer Contact %"], ...opt },
  onTimePct: { kind: "p", headers: ["On-Time Install %"], ...opt },
};

const oddSpec: TableSpec = {
  month: { kind: "m", headers: ["Month"] },
  preCancels: { kind: "n", headers: ["Pre-ODD Cancels"] },
  prePct: { kind: "p", headers: ["Pre-ODD %"], ...opt },
  onCancels: { kind: "n", headers: ["On-ODD Cancels"] },
  onPct: { kind: "p", headers: ["On-ODD %"], ...opt },
  postCancels: { kind: "n", headers: ["Post-ODD Cancels"] },
  postPct: { kind: "p", headers: ["Post-ODD %"], ...opt },
};

const classSpec: TableSpec = {
  month: { kind: "m", headers: ["Month"] },
  custMiss: { kind: "n", headers: ["Customer Miss"] },
  custPct: { kind: "p", headers: ["Customer Miss %"], ...opt },
  coMiss: { kind: "n", headers: ["Company Miss"] },
  coPct: { kind: "p", headers: ["Company Miss %"], ...opt },
  faux: { kind: "n", headers: ["Faux Cancels", "Faux"] },
  fauxPct: { kind: "p", headers: ["Faux %"], ...opt },
};

const reasonSpec: TableSpec = {
  month: { kind: "m", headers: ["Month"] },
  state: { kind: "s", headers: ["State"] },
  reason: { kind: "s", headers: ["Reason"] },
  count: { kind: "n", headers: ["Count"] },
  share: { kind: "p", headers: ["Share of State Customer Miss", "Share"], ...opt },
  mom: { kind: "r", headers: ["Month-over-Month Change", "MoM Change", "MoM %"], ...opt },
  flag: { kind: "s", headers: ["Flag"], ...opt },
  insight: { kind: "s", headers: ["Insight"], ...opt },
};

const watchSpec: TableSpec = {
  state: { kind: "s", headers: ["State"] },
  noActionPct: { kind: "p", headers: ["No Action Needed %"], ...opt },
  pendingPct: { kind: "p", headers: ["Pending Customer Contact %"] },
  actionPct: { kind: "p", headers: ["Action Needed Not Jeopardy %"] },
  jeopardyPct: { kind: "p", headers: ["Install in Jeopardy %"] },
  bswPct: { kind: "p", headers: ["BSW Delay Predicted %"] },
  interpretation: { kind: "s", headers: ["Primary interpretation"], ...opt },
};

const journeySpec: TableSpec = {
  step: { kind: "n", headers: ["Step"] },
  date: { kind: "d", headers: ["Date"] },
  event: { kind: "s", headers: ["Lifecycle Event", "Event"] },
  status: { kind: "s", headers: ["Watchtower / Status", "Status"], ...opt },
  risk: { kind: "s", headers: ["Risk interpretation", "Risk"], ...opt },
  action: { kind: "s", headers: ["Recommended action", "Action"], ...opt },
};

const questionSpec: TableSpec = {
  question: { kind: "s", headers: ["Executive question", "Question"] },
  answer: { kind: "s", headers: ["Answer"] },
  evidence: { kind: "s", headers: ["Evidence"], ...opt },
  nextStep: { kind: "s", headers: ["Recommended next step", "Next step"], ...opt },
  drill: { kind: "s", headers: ["Primary app drill", "Drill"], ...opt },
};

const dictSpec: TableSpec = {
  field: { kind: "s", headers: ["Field / KPI", "Field"] },
  definition: { kind: "s", headers: ["Definition"] },
  unit: { kind: "s", headers: ["Unit / Format", "Unit"], ...opt },
  source: { kind: "s", headers: ["Primary source sheet", "Source"], ...opt },
  note: { kind: "s", headers: ["Note"], ...opt },
};

const kpiSpec: TableSpec = {
  label: { kind: "s", headers: ["KPI Card", "KPI"] },
  value: { kind: "n", headers: ["*Value"] },
  prior: { kind: "n", headers: ["*Prior", "Previous"], ...opt },
  change: { kind: "r", headers: ["Change"], ...opt },
  group: { kind: "s", headers: ["Card Group", "Group"], ...opt },
  meaning: { kind: "s", headers: ["Executive meaning", "Meaning"], ...opt },
};

const hotspotSpec: TableSpec = {
  metric: { kind: "s", headers: ["Metric"] },
  august: { kind: "n", headers: ["August", "Prior", "Previous"] },
  september: { kind: "n", headers: ["September", "Current", "Latest"] },
  change: { kind: "r", headers: ["Change"], ...opt },
  meaning: { kind: "s", headers: ["Why it matters"], ...opt },
};

const channelSpec: TableSpec = {
  ...Object.fromEntries(Object.entries(stateMonthlySpec).filter(([k]) => k !== "state" && k !== "cancelsMoM").map(([k, v]) => [k, { ...v, required: k === "month" }])),
  channel: { kind: "s", headers: ["Channel"] },
  pendingPct: { kind: "p", headers: ["Pending Customer Contact %"], ...opt },
  jeopardyPct: { kind: "p", headers: ["Install in Jeopardy %"], ...opt },
  bswPct: { kind: "p", headers: ["BSW Delay Predicted %"], ...opt },
  onTimePct: { kind: "p", headers: ["On-Time Install %"], ...opt },
};

const stateChannelSpec: TableSpec = {
  state: { kind: "s", headers: ["State"] },
  channel: { kind: "s", headers: ["Channel"] },
  sales: { kind: "n", headers: ["Unique Sales"], ...opt },
  installs: { kind: "n", headers: ["Installs"], ...opt },
  cancels: { kind: "n", headers: ["Cancellations"], ...opt },
  cancelRate: { kind: "p", headers: ["Cancel Rate"], ...opt },
  cancelGrowth: { kind: "r", headers: ["Cancel Growth vs Aug", "Cancels MoM %"], ...opt },
  postPct: { kind: "p", headers: ["Post-ODD %"], ...opt },
  custPct: { kind: "p", headers: ["Customer Miss %"], ...opt },
  pendingPct: { kind: "p", headers: ["Pending Customer Contact %"], ...opt },
};

// ---------------------------------------------------------------- helpers
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" ? v : null);

function table(
  wb: XLSX.WorkBook,
  sheet: string,
  spec: TableSpec,
  issues: DataIssue[],
  o: { startRow?: number; stopAtBlank?: boolean; optional?: boolean } = {},
) {
  const ws = getSheet(wb, sheet);
  if (!ws) return { grid: null as unknown[][] | null, parsed: null };
  const grid = sheetGrid(ws);
  const parsed = parseTable(grid, spec, { sheet, ...o }, issues);
  return { grid, parsed };
}

const rowsOf = (p: { rows: Row[] } | null) => p?.rows ?? [];

// ---------------------------------------------------------------- build
export function buildModel(
  wb: XLSX.WorkBook,
  meta: { file: string; modifiedAt: string | null },
): DataModel {
  const issues: DataIssue[] = [];
  const sheets: SheetStatus[] = [];

  for (const name of REQUIRED_SHEETS) {
    const found = !!getSheet(wb, name);
    sheets.push({ name, required: true, found, rows: 0 });
    if (!found) issues.push({ level: "error", sheet: name, message: `Required sheet "${name}" is missing from the workbook.` });
  }
  const channelsSheetFound = !!getSheet(wb, SHEETS.channels);
  sheets.push({ name: SHEETS.channels, required: false, found: channelsSheetFound, rows: 0 });

  const setRows = (name: string, count: number) => {
    const st = sheets.find((x) => x.name === name);
    if (st) st.rows = count;
  };

  // --- Monthly overview
  const mo = table(wb, SHEETS.monthly, monthlySpec, issues);
  const monthlyOverview: MonthlyOverviewRow[] = rowsOf(mo.parsed)
    .filter((r) => r.month)
    .map((r) => ({
      month: r.month as string,
      sales: n(r.sales), salesMoM: n(r.salesMoM), installs: n(r.installs), installRate: n(r.installRate),
      cancels: n(r.cancels), cancelsMoM: n(r.cancelsMoM), cancelRate: n(r.cancelRate),
      prePct: n(r.prePct), onPct: n(r.onPct), postPct: n(r.postPct),
      custPct: n(r.custPct), coPct: n(r.coPct), fauxPct: n(r.fauxPct),
      pendingPct: n(r.pendingPct), actionPct: n(r.actionPct), jeopardyPct: n(r.jeopardyPct), bswPct: n(r.bswPct),
      onTimePct: n(r.onTimePct),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  setRows(SHEETS.monthly, monthlyOverview.length);

  // derive obviously-derivable blanks so a sparse workbook still renders
  monthlyOverview.forEach((r, i) => {
    const prev = monthlyOverview[i - 1];
    if (r.cancelRate === null && r.cancels !== null && r.sales) r.cancelRate = r.cancels / r.sales;
    if (r.installRate === null && r.installs !== null && r.sales) r.installRate = r.installs / r.sales;
    if (prev) {
      if (r.salesMoM === null && r.sales !== null && prev.sales) r.salesMoM = r.sales / prev.sales - 1;
      if (r.cancelsMoM === null && r.cancels !== null && prev.cancels) r.cancelsMoM = r.cancels / prev.cancels - 1;
    }
  });

  // --- State monthly
  const sm = table(wb, SHEETS.stateMonthly, stateMonthlySpec, issues);
  const stateMonthly: StateMonthlyRow[] = rowsOf(sm.parsed)
    .filter((r) => r.month && r.state)
    .map((r) => ({
      month: r.month as string, state: r.state as string,
      sales: n(r.sales), installs: n(r.installs), cancels: n(r.cancels), cancelRate: n(r.cancelRate), cancelsMoM: n(r.cancelsMoM),
      preCancels: n(r.preCancels), prePct: n(r.prePct), onCancels: n(r.onCancels), onPct: n(r.onPct),
      postCancels: n(r.postCancels), postPct: n(r.postPct),
      custMiss: n(r.custMiss), custPct: n(r.custPct), coMiss: n(r.coMiss), coPct: n(r.coPct), faux: n(r.faux), fauxPct: n(r.fauxPct),
      pendingPct: n(r.pendingPct), actionPct: n(r.actionPct), jeopardyPct: n(r.jeopardyPct), bswPct: n(r.bswPct), onTimePct: n(r.onTimePct),
    }));
  setRows(SHEETS.stateMonthly, stateMonthly.length);
  const states = [...new Set(stateMonthly.map((r) => r.state))];
  const monthsOfState = (st: string) => stateMonthly.filter((r) => r.state === st).map((r) => r.month).sort();
  states.forEach((st) => {
    const ms = monthsOfState(st);
    ms.forEach((m, i) => {
      const row = stateMonthly.find((r) => r.state === st && r.month === m)!;
      const prev = i > 0 ? stateMonthly.find((r) => r.state === st && r.month === ms[i - 1]) : undefined;
      if (row.cancelRate === null && row.cancels !== null && row.sales) row.cancelRate = row.cancels / row.sales;
      if (prev && row.cancelsMoM === null && row.cancels !== null && prev.cancels) row.cancelsMoM = row.cancels / prev.cancels - 1;
    });
  });

  // --- ODD timing / classification
  const od = table(wb, SHEETS.odd, oddSpec, issues);
  const oddTiming: OddTimingRow[] = rowsOf(od.parsed)
    .filter((r) => r.month)
    .map((r) => ({
      month: r.month as string,
      preCancels: n(r.preCancels), prePct: n(r.prePct), onCancels: n(r.onCancels), onPct: n(r.onPct),
      postCancels: n(r.postCancels), postPct: n(r.postPct),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  setRows(SHEETS.odd, oddTiming.length);
  oddTiming.forEach((r) => {
    const tot = (r.preCancels ?? 0) + (r.onCancels ?? 0) + (r.postCancels ?? 0);
    if (tot > 0) {
      r.prePct ??= (r.preCancels ?? 0) / tot;
      r.onPct ??= (r.onCancels ?? 0) / tot;
      r.postPct ??= (r.postCancels ?? 0) / tot;
    }
  });

  const cl = table(wb, SHEETS.classification, classSpec, issues);
  const classification: ClassificationRow[] = rowsOf(cl.parsed)
    .filter((r) => r.month)
    .map((r) => ({
      month: r.month as string,
      custMiss: n(r.custMiss), custPct: n(r.custPct), coMiss: n(r.coMiss), coPct: n(r.coPct), faux: n(r.faux), fauxPct: n(r.fauxPct),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  setRows(SHEETS.classification, classification.length);
  classification.forEach((r) => {
    const tot = (r.custMiss ?? 0) + (r.coMiss ?? 0) + (r.faux ?? 0);
    if (tot > 0) {
      r.custPct ??= (r.custMiss ?? 0) / tot;
      r.coPct ??= (r.coMiss ?? 0) / tot;
      r.fauxPct ??= (r.faux ?? 0) / tot;
    }
  });

  // --- reasons
  const rs = table(wb, SHEETS.reasons, reasonSpec, issues);
  const customerMissReasons: ReasonRow[] = rowsOf(rs.parsed)
    .filter((r) => r.month && r.state && r.reason)
    .map((r) => ({
      month: r.month as string, state: r.state as string, reason: r.reason as string,
      count: n(r.count), share: n(r.share), mom: n(r.mom),
      flag: (r.flag as string) ?? null, insight: (r.insight as string) ?? null,
    }));
  setRows(SHEETS.reasons, customerMissReasons.length);

  // --- state drill (single month; month inferred from sheet title, else latest month)
  const sd = table(wb, SHEETS.stateDrill, stateDrillSpec, issues);
  const stateDrill: StateDrillRow[] = rowsOf(sd.parsed)
    .filter((r) => r.state)
    .map((r) => ({
      state: r.state as string, sales: n(r.sales), installs: n(r.installs), cancels: n(r.cancels), cancelRate: n(r.cancelRate),
      cancelGrowth: n(r.cancelGrowth), prePct: n(r.prePct), onPct: n(r.onPct), postPct: n(r.postPct),
      custPct: n(r.custPct), pendingPct: n(r.pendingPct), onTimePct: n(r.onTimePct),
    }));
  setRows(SHEETS.stateDrill, stateDrill.length);
  stateDrill.forEach((r) => {
    if (r.cancelRate === null && r.cancels !== null && r.sales) r.cancelRate = r.cancels / r.sales;
  });

  // --- watchtower
  const wt = table(wb, SHEETS.watchtower, watchSpec, issues);
  const watchtower: WatchtowerRow[] = rowsOf(wt.parsed)
    .filter((r) => r.state)
    .map((r) => {
      const others = (n(r.pendingPct) ?? 0) + (n(r.actionPct) ?? 0) + (n(r.jeopardyPct) ?? 0) + (n(r.bswPct) ?? 0);
      return {
        state: r.state as string,
        isPortfolio: /portfolio|total|all states/i.test(s(r.state)),
        noActionPct: n(r.noActionPct) ?? Math.max(0, 1 - others),
        pendingPct: n(r.pendingPct), actionPct: n(r.actionPct), jeopardyPct: n(r.jeopardyPct), bswPct: n(r.bswPct),
        interpretation: (r.interpretation as string) ?? null,
      };
    });
  setRows(SHEETS.watchtower, watchtower.length);

  // --- journey / questions / dictionary
  const jr = table(wb, SHEETS.journey, journeySpec, issues);
  const journey: JourneyStep[] = rowsOf(jr.parsed)
    .filter((r) => r.event)
    .map((r, i) => ({
      step: n(r.step) ?? i + 1, date: (r.date as string) ?? null, event: s(r.event),
      status: s(r.status), risk: s(r.risk), action: s(r.action),
    }));
  setRows(SHEETS.journey, journey.length);
  const journeyTitles = sheetTitles(jr.grid ?? []);

  const eq = table(wb, SHEETS.questions, questionSpec, issues);
  const executiveQuestions: ExecQuestionRow[] = rowsOf(eq.parsed)
    .filter((r) => r.question)
    .map((r, i) => ({
      n: i + 1, question: s(r.question), answer: s(r.answer), evidence: s(r.evidence), nextStep: s(r.nextStep), drill: s(r.drill),
    }));
  setRows(SHEETS.questions, executiveQuestions.length);

  const dd = table(wb, SHEETS.dictionary, dictSpec, issues);
  const dictionary: DictionaryRow[] = rowsOf(dd.parsed)
    .filter((r) => r.field)
    .map((r) => ({ field: s(r.field), definition: s(r.definition), unit: s(r.unit), source: s(r.source), note: s(r.note) }));
  setRows(SHEETS.dictionary, dictionary.length);

  // --- Dashboard KPI (two tables: KPI cards, then hotspot block)
  let kpiCards: KpiCardRow[] = [];
  let hotspotBlock: HotspotRow[] = [];
  const workbookNotes: DataModel["workbookNotes"] = {};
  const kws = getSheet(wb, SHEETS.kpi);
  if (kws) {
    const grid = sheetGrid(kws);
    workbookNotes.dashboardKpi = sheetTitles(grid)[1];
    const k1 = parseTable(grid, kpiSpec, { sheet: SHEETS.kpi, stopAtBlank: true }, issues);
    if (k1) {
      kpiCards = k1.rows
        .filter((r) => r.label)
        .map((r) => ({ label: s(r.label), value: n(r.value), prior: n(r.prior), change: n(r.change), group: s(r.group), meaning: s(r.meaning) }));
      const k2 = parseTable(grid, hotspotSpec, { sheet: SHEETS.kpi, startRow: k1.endRow + 1, stopAtBlank: true, optional: true }, issues);
      if (k2) {
        hotspotBlock = k2.rows
          .filter((r) => r.metric)
          .map((r) => ({ metric: s(r.metric), august: n(r.august), september: n(r.september), change: n(r.change), meaning: s(r.meaning) }));
      }
    }
    setRows(SHEETS.kpi, kpiCards.length + hotspotBlock.length);
  }
  if (mo.grid) workbookNotes.monthlyOverview = sheetTitles(mo.grid)[1];
  workbookNotes.journeyTitle = journeyTitles[0];
  // The journey subtitle lists the lifecycle path as "A → B → C".
  workbookNotes.journeyPath = journeyTitles.find((x) => x.split("→").length >= 3);

  // --- channel sheets (optional)
  let channels: ChannelMonthlyRow[] | null = null;
  if (channelsSheetFound) {
    const ch = table(wb, SHEETS.channels, channelSpec, issues, { optional: true });
    channels = rowsOf(ch.parsed)
      .filter((r) => r.month && r.channel)
      .map((r) => ({
        month: r.month as string, channel: r.channel as string,
        ...(Object.fromEntries(Object.keys(channelSpec).filter((k) => k !== "month" && k !== "channel").map((k) => [k, n(r[k])])) as Omit<ChannelMonthlyRow, "month" | "channel">),
      }));
    channels.forEach((r) => {
      if (r.cancelRate === null && r.cancels !== null && r.sales) r.cancelRate = r.cancels / r.sales;
    });
    setRows(SHEETS.channels, channels.length);
    if (channels.length === 0) channels = null;
  }
  const sc = getSheet(wb, SHEETS.stateChannel) ? table(wb, SHEETS.stateChannel, stateChannelSpec, issues, { optional: true }) : null;
  const stateChannel: StateChannelRow[] = rowsOf(sc?.parsed ?? null)
    .filter((r) => r.state && r.channel)
    .map((r) => ({
      state: r.state as string, channel: r.channel as string, sales: n(r.sales), installs: n(r.installs), cancels: n(r.cancels),
      cancelRate: n(r.cancelRate), cancelGrowth: n(r.cancelGrowth), postPct: n(r.postPct), custPct: n(r.custPct), pendingPct: n(r.pendingPct),
    }));

  // --- derived context
  const months = [...new Set(monthlyOverview.map((r) => r.month))].sort();
  const latestMonth = months.length ? months[months.length - 1] : null;
  const drillMonth = monthFromText(sheetTitles(sd.grid ?? []).join(" ")) ?? latestMonth;
  const watchMonth = monthFromText(sheetTitles(wt.grid ?? []).join(" ")) ?? latestMonth;

  const model: DataModel = {
    ok: false,
    meta: { file: meta.file, loadedAt: new Date().toISOString(), modifiedAt: meta.modifiedAt, sheets },
    issues,
    months,
    latestMonth,
    states,
    drillMonth,
    watchMonth,
    hotspotState: null,
    workbookNotes,
    kpiCards,
    hotspotBlock,
    monthlyOverview,
    stateMonthly,
    stateDrill,
    oddTiming,
    classification,
    customerMissReasons,
    watchtower,
    journey,
    executiveQuestions,
    dictionary,
    channels,
    channelNames: [...new Set((channels ?? []).map((r) => r.channel))],
    stateChannel,
    story: parseStorySheets(wb, { states, drillMonth, latestMonth }, issues, (name, rows) => sheets.push({ name, required: false, found: true, rows })),
  };

  // which state does the hotspot block on "Dashboard KPI" describe? (its title row mentions it)
  if (kws) {
    for (const r of sheetGrid(kws)) {
      const t = r.find((c) => typeof c === "string" && /hotspot|focus state/i.test(c)) as string | undefined;
      const st = t && states.find((x) => t.toLowerCase().includes(x.toLowerCase()));
      if (st) { model.hotspotState = st; break; }
    }
  }

  crossValidate(model);
  model.ok = !issues.some((i) => i.level === "error") && months.length > 0;
  if (months.length === 0 && !issues.some((i) => i.level === "error")) {
    issues.push({ level: "error", sheet: SHEETS.monthly, message: "No monthly rows could be read; the dashboard has nothing to show." });
  }
  return model.ok ? attachDaily(model, wb) : model;
}

/** Consistency checks between sheets. Mismatches are surfaced as warnings, never silently ignored. */
function crossValidate(m: DataModel) {
  const push = (level: DataIssue["level"], sheet: string, message: string) => m.issues.push({ level, sheet, message });
  const close = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= Math.max(1, Math.abs(b)) * tol;

  // State rows should add up to the portfolio
  for (const mo of m.monthlyOverview) {
    const rows = m.stateMonthly.filter((r) => r.month === mo.month);
    if (!rows.length) continue;
    const sumC = rows.reduce((a, r) => a + (r.cancels ?? 0), 0);
    const sumS = rows.reduce((a, r) => a + (r.sales ?? 0), 0);
    if (mo.cancels !== null && !close(sumC, mo.cancels)) push("warn", SHEETS.stateMonthly, `${mo.month}: state cancellations sum to ${sumC} but Monthly Overview shows ${mo.cancels}.`);
    if (mo.sales !== null && !close(sumS, mo.sales)) push("warn", SHEETS.stateMonthly, `${mo.month}: state sales sum to ${sumS} but Monthly Overview shows ${mo.sales}.`);
  }
  // Timing / classification totals should match cancellations
  for (const o of m.oddTiming) {
    const mo = m.monthlyOverview.find((r) => r.month === o.month);
    const tot = (o.preCancels ?? 0) + (o.onCancels ?? 0) + (o.postCancels ?? 0);
    if (mo?.cancels != null && tot && !close(tot, mo.cancels)) push("warn", SHEETS.odd, `${o.month}: Pre+On+Post = ${tot} but cancellations = ${mo.cancels}.`);
  }
  for (const c of m.classification) {
    const mo = m.monthlyOverview.find((r) => r.month === c.month);
    const tot = (c.custMiss ?? 0) + (c.coMiss ?? 0) + (c.faux ?? 0);
    if (mo?.cancels != null && tot && !close(tot, mo.cancels)) push("warn", SHEETS.classification, `${c.month}: Customer+Company+Faux = ${tot} but cancellations = ${mo.cancels}.`);
  }
  // Drill month should match the latest state monthly rows
  if (m.drillMonth) {
    for (const d of m.stateDrill) {
      const r = m.stateMonthly.find((x) => x.month === m.drillMonth && x.state === d.state);
      if (r && d.cancels !== null && r.cancels !== null && !close(d.cancels, r.cancels)) {
        push("warn", SHEETS.stateDrill, `${d.state}: drill cancellations (${d.cancels}) differ from State Monthly (${r.cancels}) for ${m.drillMonth}.`);
      }
    }
  }
  // Dashboard KPI cards vs latest monthly overview
  const latest = m.monthlyOverview.find((r) => r.month === m.latestMonth);
  if (latest) {
    const chk: [string, number | null][] = [
      ["Unique Sales", latest.sales], ["Installs", latest.installs], ["Total Cancellations", latest.cancels],
    ];
    for (const [label, v] of chk) {
      const card = m.kpiCards.find((c) => c.label.toLowerCase() === label.toLowerCase());
      if (card?.value != null && v !== null && !close(card.value, v)) push("warn", SHEETS.kpi, `KPI card "${label}" (${card.value}) differs from Monthly Overview (${v}) for ${m.latestMonth}.`);
    }
  }
  if (m.stateDrill.length && m.states.length && m.stateDrill.length !== m.states.length) {
    push("info", SHEETS.stateDrill, `State drill lists ${m.stateDrill.length} states; State Monthly lists ${m.states.length}.`);
  }
}
