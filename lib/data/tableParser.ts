/**
 * Low-level, workbook-agnostic table parsing helpers (no filesystem access).
 * Handles: title blocks above headers, blank rows, Excel date serials,
 * numbers stored as strings, "12%" strings, and whole-number percentages.
 */
import * as XLSX from "xlsx";
import type { DataIssue, MonthKey } from "./types";

export type FieldKind = "s" | "n" | "p" | "r" | "m" | "d";
/** s=string, n=number, p=share/percentage (fraction), r=ratio/change (fraction, no scaling heuristic), m=month key, d=ISO date */
export interface FieldSpec {
  kind: FieldKind;
  /** Header aliases (matched after normalisation: lowercase, alphanumerics only). */
  headers: string[];
  required?: boolean;
}
export type TableSpec = Record<string, FieldSpec>;
export type Row = Record<string, string | number | null>;

export const norm = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .replace(/%/g, "pct")
    .replace(/[^a-z0-9*]/g, "");

/** Header alias match; "*" in an alias is a wildcard (e.g. "*value" matches "September Value"). */
function headerMatches(alias: string, cell: string): boolean {
  if (!alias.includes("*")) return alias === cell;
  const escape = (p: string) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + alias.split("*").map(escape).join(".*") + "$");
  return re.test(cell);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");

export function serialToDate(serial: number): Date {
  // Excel 1900 date system; 25569 = days between 1899-12-30 and 1970-01-01.
  return new Date(Math.round((serial - 25569) * 86400) * 1000);
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  if (!s || /^(-|—|–|n\/?a|null|none|nan)$/i.test(s)) return null;
  const isPct = s.endsWith("%");
  const cleaned = s.replace(/[%,$\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isPct ? n / 100 : n;
}

export function toMonth(v: unknown): MonthKey | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(+v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = serialToDate(v);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  }
  const s = String(v).trim();
  if (/^\d{5}$/.test(s)) return toMonth(Number(s));
  let m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = s.match(/^([A-Za-z]{3,9})[\s\-.,']*(\d{2,4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
      return `${y}-${pad(mi + 1)}`;
    }
  }
  return null;
}

export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && v > 20000 && v < 80000) d = serialToDate(v);
  else {
    const t = Date.parse(String(v));
    if (!isNaN(t)) d = new Date(t);
  }
  if (!d || isNaN(+d)) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Find a "Month Year" mention inside free text such as a sheet title ("September 2026 State Comparison"). */
export function monthFromText(text: string | null | undefined): MonthKey | null {
  if (!text) return null;
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i);
  if (!m) return null;
  return `${m[2]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}`;
}

export function getSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const target = name.trim().toLowerCase();
  const actual = wb.SheetNames.find((n) => n.trim().toLowerCase() === target);
  return actual ? wb.Sheets[actual] : null;
}

export function sheetGrid(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

const isBlankRow = (r: unknown[]) => r.every((c) => c === null || c === undefined || String(c).trim() === "");

/** First non-empty text cell(s) of the sheet — used for title/subtitle/scope detection. */
export function sheetTitles(grid: unknown[][]): string[] {
  const out: string[] = [];
  for (const r of grid.slice(0, 5)) {
    const first = r.find((c) => c !== null && String(c).trim() !== "");
    if (first !== undefined) out.push(String(first));
  }
  // merged titles can repeat across cells
  return [...new Set(out)];
}

export interface ParseOptions {
  sheet: string;
  /** Row index (0-based) to start searching for the header row. */
  startRow?: number;
  /** Stop at the first blank row after the header (for sheets with multiple tables). */
  stopAtBlank?: boolean;
  /** Don't report missing-header errors as errors (optional sheets). */
  optional?: boolean;
}

export interface ParsedTable {
  rows: Row[];
  headerRow: number;
  endRow: number;
  missing: string[];
}

/**
 * Parse one table out of a sheet's grid: locate the header row (the first row after `startRow`
 * that contains every *required* header), map columns by alias, coerce cell values.
 */
export function parseTable(grid: unknown[][], spec: TableSpec, opts: ParseOptions, issues: DataIssue[]): ParsedTable | null {
  const required = Object.entries(spec).filter(([, f]) => f.required !== false);
  const start = opts.startRow ?? 0;

  let headerRow = -1;
  let colMap: Record<string, number> = {};
  let bestMissing: string[] = required.map(([k]) => k);

  for (let i = start; i < grid.length; i++) {
    const cells = grid[i].map(norm);
    if (cells.every((c) => !c)) continue;
    const map: Record<string, number> = {};
    for (const [key, f] of Object.entries(spec)) {
      const idx = cells.findIndex((c) => c && f.headers.some((h) => headerMatches(norm(h), c)));
      if (idx >= 0) map[key] = idx;
    }
    const missing = required.filter(([k]) => !(k in map)).map(([k]) => k);
    if (missing.length === 0) {
      headerRow = i;
      colMap = map;
      break;
    }
    if (missing.length < bestMissing.length && Object.keys(map).length >= 2) bestMissing = missing;
  }

  if (headerRow < 0) {
    if (!opts.optional) {
      issues.push({
        level: "error",
        sheet: opts.sheet,
        message: `Could not find a header row containing: ${bestMissing.map((k) => spec[k].headers[0]).join(", ")}.`,
      });
    }
    return null;
  }

  // Warn about optional columns that are absent
  for (const [k, f] of Object.entries(spec)) {
    if (!(k in colMap) && f.required === false) {
      issues.push({ level: "info", sheet: opts.sheet, message: `Optional column "${f.headers[0]}" not found; related values will show as unavailable.` });
    }
  }

  const rows: Row[] = [];
  let endRow = headerRow;
  let pctScaled = 0;
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i];
    if (isBlankRow(r)) {
      if (opts.stopAtBlank && rows.length > 0) break;
      continue;
    }
    // a repeated header row or a new section title (only first cell filled) ends/skips
    const rowNorm = r.map(norm);
    if (rowNorm.some((c, idx) => idx === colMap[Object.keys(colMap)[0]] && c === norm(grid[headerRow][idx]))) continue;
    const out: Row = {};
    for (const [k, f] of Object.entries(spec)) {
      const raw = k in colMap ? r[colMap[k]] : null;
      switch (f.kind) {
        case "s":
          out[k] = raw === null || raw === undefined || String(raw).trim() === "" ? null : String(raw).trim();
          break;
        case "m":
          out[k] = toMonth(raw);
          break;
        case "d":
          out[k] = toIsoDate(raw);
          break;
        case "p": {
          let n = toNum(raw);
          if (n !== null && Math.abs(n) > 1.5) {
            n = n / 100;
            pctScaled++;
          }
          out[k] = n;
          break;
        }
        default:
          out[k] = toNum(raw);
      }
    }
    // Skip rows that carry no identifying content at all
    if (Object.values(out).every((v) => v === null)) continue;
    rows.push(out);
    endRow = i;
  }
  if (pctScaled > 0) {
    issues.push({
      level: "info",
      sheet: opts.sheet,
      message: `${pctScaled} percentage cell(s) were stored as whole numbers (e.g. 34) and were scaled to fractions (0.34).`,
    });
  }
  return { rows, headerRow, endRow, missing: [] };
}
