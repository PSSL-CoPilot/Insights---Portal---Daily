/**
 * Normalized data model. Everything the UI renders is derived from this shape,
 * which is produced from the Excel workbook by `excelLoader.ts` + `transformations.ts`.
 *
 * Conventions
 *  - Percentages are stored as fractions (0.187 = 18.7%).
 *  - Months are `YYYY-MM` keys ("2026-09").
 *  - `null` means "not present in the workbook" — never a silent zero.
 */

export type MonthKey = string;

export interface MonthlyOverviewRow {
  month: MonthKey;
  sales: number | null;
  salesMoM: number | null;
  installs: number | null;
  installRate: number | null;
  cancels: number | null;
  cancelsMoM: number | null;
  cancelRate: number | null;
  prePct: number | null;
  onPct: number | null;
  postPct: number | null;
  custPct: number | null;
  coPct: number | null;
  fauxPct: number | null;
  pendingPct: number | null;
  actionPct: number | null;
  jeopardyPct: number | null;
  bswPct: number | null;
  onTimePct: number | null;
}

export interface StateMonthlyRow {
  month: MonthKey;
  state: string;
  sales: number | null;
  installs: number | null;
  cancels: number | null;
  cancelRate: number | null;
  cancelsMoM: number | null;
  preCancels: number | null;
  prePct: number | null;
  onCancels: number | null;
  onPct: number | null;
  postCancels: number | null;
  postPct: number | null;
  custMiss: number | null;
  custPct: number | null;
  coMiss: number | null;
  coPct: number | null;
  faux: number | null;
  fauxPct: number | null;
  pendingPct: number | null;
  actionPct: number | null;
  jeopardyPct: number | null;
  bswPct: number | null;
  onTimePct: number | null;
}

/** "September State Drill" — one row per state for the drill month. */
export interface StateDrillRow {
  state: string;
  sales: number | null;
  installs: number | null;
  cancels: number | null;
  cancelRate: number | null;
  cancelGrowth: number | null;
  prePct: number | null;
  onPct: number | null;
  postPct: number | null;
  custPct: number | null;
  pendingPct: number | null;
  onTimePct: number | null;
}

export interface OddTimingRow {
  month: MonthKey;
  preCancels: number | null;
  prePct: number | null;
  onCancels: number | null;
  onPct: number | null;
  postCancels: number | null;
  postPct: number | null;
}

export interface ClassificationRow {
  month: MonthKey;
  custMiss: number | null;
  custPct: number | null;
  coMiss: number | null;
  coPct: number | null;
  faux: number | null;
  fauxPct: number | null;
}

export interface ReasonRow {
  month: MonthKey;
  state: string;
  reason: string;
  count: number | null;
  share: number | null;
  mom: number | null;
  flag: string | null;
  insight: string | null;
}

export interface WatchtowerRow {
  /** State name, or "Portfolio" for the roll-up row. */
  state: string;
  isPortfolio: boolean;
  noActionPct: number | null;
  pendingPct: number | null;
  actionPct: number | null;
  jeopardyPct: number | null;
  bswPct: number | null;
  interpretation: string | null;
}

export interface JourneyStep {
  step: number;
  /** ISO date (yyyy-mm-dd) or null when the cell wasn't a parseable date. */
  date: string | null;
  event: string;
  status: string;
  risk: string;
  action: string;
}

export interface KpiCardRow {
  label: string;
  value: number | null;
  prior: number | null;
  change: number | null;
  group: string;
  meaning: string;
}

export interface HotspotRow {
  metric: string;
  august: number | null;
  september: number | null;
  change: number | null;
  meaning: string;
}

export interface ExecQuestionRow {
  n: number;
  question: string;
  answer: string;
  evidence: string;
  nextStep: string;
  drill: string;
}

export interface DictionaryRow {
  field: string;
  definition: string;
  unit: string;
  source: string;
  note: string;
}

/** "Channel Monthly": one row per channel and month. */
export interface ChannelMonthlyRow {
  month: MonthKey;
  channel: string;
  sales: number | null;
  installs: number | null;
  cancels: number | null;
  cancelRate: number | null;
  preCancels: number | null;
  prePct: number | null;
  onCancels: number | null;
  onPct: number | null;
  postCancels: number | null;
  postPct: number | null;
  custMiss: number | null;
  custPct: number | null;
  coMiss: number | null;
  coPct: number | null;
  faux: number | null;
  fauxPct: number | null;
  pendingPct: number | null;
  actionPct: number | null;
  jeopardyPct: number | null;
  bswPct: number | null;
  onTimePct: number | null;
}

/** "September State x Channel": one row per state and channel for the drill month. */
export interface StateChannelRow {
  state: string;
  channel: string;
  sales: number | null;
  installs: number | null;
  cancels: number | null;
  cancelRate: number | null;
  cancelGrowth: number | null;
  postPct: number | null;
  custPct: number | null;
  pendingPct: number | null;
}

// ------------------------------------------------------------------ story layer (optional sheets)
/** "<State> Agency Monthly": each agency against its own Jan to Aug baseline. */
export interface AgencyMonthRow {
  month: MonthKey;
  agency: string;
  channel: string;
  sales: number | null;
  cancels: number | null;
  cancelRate: number | null;
  completionRate: number | null;
  disposition: string;
  baseline: number | null;
  gap: number | null;
}

/** "<State> Agency September": drill month vs each agency's own history, with sales quality signals. */
export interface AgencySnapshotRow {
  agency: string;
  channel: string;
  baseline: number | null;
  prevSales: number | null;
  prevCancels: number | null;
  sales: number | null;
  cancels: number | null;
  cancelRate: number | null;
  gap: number | null;
  disposition: string;
  pattern: string;
  lowIntent: number | null;
  promo: number | null;
  competitor: number | null;
  failedConfirm: number | null;
}

export interface RepCohortRow {
  agency: string;
  cohort: string;
  reps: number | null;
  prevSales: number | null;
  prevCancels: number | null;
  prevRate: number | null;
  sales: number | null;
  cancels: number | null;
  rate: number | null;
  salesShare: number | null;
  cancelShare: number | null;
  band: string;
}

export interface RepRow {
  id: string;
  agency: string;
  channel: string;
  cohort: string;
  tenure: number | null;
  prevSales: number | null;
  prevCancels: number | null;
  sales: number | null;
  cancels: number | null;
  rate: number | null;
  band: string;
  lowIntent: number | null;
  promo: number | null;
  competitor: number | null;
  failedConfirm: number | null;
}

export type DriverKind = "sales" | "contact" | "company" | "faux" | "total" | "other";

/** One primary cause per order; rows reconcile to the focus state's cancellations. */
export interface DriverRow {
  kind: DriverKind;
  driver: string;
  cancels: number | null;
  share: number | null;
  interpretation: string;
}

export interface ReclassRow {
  classification: string;
  isTotal: boolean;
  recorded: number | null;
  recordedShare: number | null;
  adjusted: number | null;
  adjustedShare: number | null;
  meaning: string;
}

export type ForecastViewKind = "baseline" | "actual" | "noAction" | "intervention" | "other";

export interface ForecastViewRow {
  kind: ForecastViewKind;
  view: string;
  /** Month the view describes, when its label names one ("August actual"). */
  month: MonthKey | null;
  rate: number | null;
  interpretation: string;
}

export interface ForecastStateRow {
  state: string;
  isTotal: boolean;
  sales: number | null;
  cancels: number | null;
  rate: number | null;
  prevRate: number | null;
}

export interface ForecastChannelRow {
  channel: string;
  /** True for the state roll-up row at the bottom of the table. */
  isTotal: boolean;
  prevRate: number | null;
  sales: number | null;
  cancels: number | null;
  rate: number | null;
  delta: number | null;
  baseline: number | null;
  risk: string;
}

export type InterventionKind = "sales" | "install" | "contact" | "total" | "other";

export interface InterventionRow {
  kind: InterventionKind;
  name: string;
  saves: number | null;
  share: number | null;
  action: string;
  population: string;
}

export interface OutcomeRow {
  kind: "noAction" | "intervention" | "prevented" | "other";
  label: string;
  cancels: number | null;
  rate: number | null;
}

export interface SegmentRow {
  segment: string;
  isTotal: boolean;
  orders: number | null;
  signal: string;
  action: string;
  objective: string;
}

export interface MeasureRow {
  measure: string;
  actual: string;
  noAction: string;
  target: string;
  role: string;
  meaning: string;
}

export interface CountRow {
  label: string;
  value: number | null;
}

export interface PairRow {
  label: string;
  value: string;
}

export interface StoryData {
  /** State the agency, representative and attribution sheets describe (read from their titles). */
  focusState: string | null;
  /** Month the single month story sheets describe (the drill month). */
  month: MonthKey | null;
  agencyMonthly: AgencyMonthRow[];
  agencies: AgencySnapshotRow[];
  cohorts: RepCohortRow[];
  reps: RepRow[];
  drivers: DriverRow[];
  reclass: ReclassRow[];
  forecastMonth: MonthKey | null;
  forecastViews: ForecastViewRow[];
  forecastStates: ForecastStateRow[];
  forecastChannels: ForecastChannelRow[];
  interventions: InterventionRow[];
  outcomes: OutcomeRow[];
  segments: SegmentRow[];
  measures: MeasureRow[];
  /** Contact risk population: orders at risk, projected cancels, potentially protected (in sheet order). */
  contactRisk: CountRow[];
  contactRules: PairRow[];
  exampleOrder: PairRow[];
  exampleInstall: PairRow[];
}

export type IssueLevel = "error" | "warn" | "info";

export interface DataIssue {
  level: IssueLevel;
  sheet: string;
  message: string;
}

export interface SheetStatus {
  name: string;
  required: boolean;
  found: boolean;
  rows: number;
}

export interface DataModel {
  ok: boolean;
  meta: {
    file: string;
    loadedAt: string;
    modifiedAt: string | null;
    sheets: SheetStatus[];
  };
  issues: DataIssue[];
  months: MonthKey[];
  latestMonth: MonthKey | null;
  states: string[];
  /** Month the single-month sheets (State Drill / Watchtower / Journey) describe. */
  drillMonth: MonthKey | null;
  watchMonth: MonthKey | null;
  /** State the "hotspot" block on Dashboard KPI describes (parsed from its title row). */
  hotspotState: string | null;
  workbookNotes: { dashboardKpi?: string; monthlyOverview?: string; journeyPath?: string; journeyTitle?: string };
  kpiCards: KpiCardRow[];
  hotspotBlock: HotspotRow[];
  monthlyOverview: MonthlyOverviewRow[];
  stateMonthly: StateMonthlyRow[];
  stateDrill: StateDrillRow[];
  oddTiming: OddTimingRow[];
  classification: ClassificationRow[];
  customerMissReasons: ReasonRow[];
  watchtower: WatchtowerRow[];
  journey: JourneyStep[];
  executiveQuestions: ExecQuestionRow[];
  dictionary: DictionaryRow[];
  /** null = optional "Channel Monthly" sheet not present in the workbook. */
  channels: ChannelMonthlyRow[] | null;
  channelNames: string[];
  stateChannel: StateChannelRow[];
  /** Agency, attribution, forecast and prevention tables. Empty arrays when the sheets are absent. */
  story: StoryData;
  /** Day-wise build: every window is compared with this month's average week (August). */
  baselineMonth?: MonthKey | null;
  /** Day-wise build: August at one day, the comparison for each single day of the daily trend. */
  dayBaseline?: MonthKey | null;
  daily?: import("./daily").DailyExtras;
}
