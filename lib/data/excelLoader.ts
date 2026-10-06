/**
 * Server-only workbook loader.
 *
 * The workbook is re-read from disk whenever its modified-time changes, so editing the file and
 * refreshing the page (or hot-reloading in dev) always shows the latest numbers — no JSON copies.
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { DataModel } from "./types";
import { buildModel } from "./transformations";
import { emptyStory } from "./storySheets";

export const WORKBOOK_FILE = "Brightspeed_Cancellation_Data_Daily_Oct_2026.xlsx";

export function workbookPath(): string {
  return process.env.BRIGHTSPEED_DATA_FILE
    ? path.resolve(process.env.BRIGHTSPEED_DATA_FILE)
    : path.join(process.cwd(), "data", WORKBOOK_FILE);
}

let cache: { mtimeMs: number; file: string; model: DataModel } | null = null;

function emptyModel(file: string, message: string): DataModel {
  return {
    ok: false,
    meta: { file, loadedAt: new Date().toISOString(), modifiedAt: null, sheets: [] },
    issues: [{ level: "error", sheet: "(workbook)", message }],
    months: [], latestMonth: null, states: [], drillMonth: null, watchMonth: null, hotspotState: null, workbookNotes: {},
    kpiCards: [], hotspotBlock: [], monthlyOverview: [], stateMonthly: [], stateDrill: [], oddTiming: [],
    classification: [], customerMissReasons: [], watchtower: [], journey: [], executiveQuestions: [], dictionary: [],
    channels: null, channelNames: [], stateChannel: [], story: emptyStory(),
  };
}

export function loadDataModel(): DataModel {
  const file = workbookPath();
  try {
    const stat = fs.statSync(file);
    if (cache && cache.file === file && cache.mtimeMs === stat.mtimeMs) return cache.model;

    const buf = fs.readFileSync(file);
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: true });
    const model = buildModel(wb, { file: path.basename(file), modifiedAt: stat.mtime.toISOString() });
    cache = { mtimeMs: stat.mtimeMs, file, model };

    const errs = model.issues.filter((i) => i.level === "error");
    const warns = model.issues.filter((i) => i.level === "warn");
    if (errs.length) console.error(`[data] ${errs.length} error(s) loading ${path.basename(file)}:\n` + errs.map((e) => `  - [${e.sheet}] ${e.message}`).join("\n"));
    if (warns.length) console.warn(`[data] ${warns.length} warning(s):\n` + warns.map((e) => `  - [${e.sheet}] ${e.message}`).join("\n"));
    if (!errs.length) console.info(`[data] Loaded ${path.basename(file)} — ${model.months.length} months, latest ${model.latestMonth}.`);
    return model;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[data] Failed to read workbook at ${file}: ${msg}`);
    return emptyModel(path.basename(file), `Could not read workbook at ${file}: ${msg}`);
  }
}
