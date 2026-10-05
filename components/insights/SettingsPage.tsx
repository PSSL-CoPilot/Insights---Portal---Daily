"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, XCircle } from "lucide-react";
import { useApp } from "../AppContext";
import { Badge, Card, cn, SectionTitle } from "../ui/primitives";
import { monthLabel } from "@/lib/format";

export function SettingsPage() {
  const { model } = useApp();
  const m = model.meta;
  const issues = [...model.issues].sort((a, b) => ({ error: 0, warn: 1, info: 2 })[a.level] - ({ error: 0, warn: 1, info: 2 })[b.level]);
  const fmtDT = (s: string | null) => (s ? new Date(s).toLocaleString() : "n/a");

  return (
    <div className="space-y-8">
      <SectionTitle eyebrow="Settings" title="Data source" sub="Every number in this application is read from the Excel workbook at build time. Replace the file in the data folder and push to main; the site rebuilds and redeploys automatically." />

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-good-soft text-good"><FileSpreadsheet className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-semibold">{m.file}</div>
            <div className="text-[13px] text-mute">Located in <code className="rounded bg-line-2 px-1.5 py-0.5">/data</code> · last modified {fmtDT(m.modifiedAt)} · read {fmtDT(m.loadedAt)}</div>
          </div>
          <Badge tone={model.ok ? "good" : "bad"}>{model.ok ? "LOADED" : "PROBLEMS FOUND"}</Badge>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <Info2 label="Months" value={`${model.months.length}`} sub={model.months.length ? `${monthLabel(model.months[0])} → ${monthLabel(model.months[model.months.length - 1])}` : ""} />
          <Info2 label="Latest month (default)" value={model.latestMonth ? monthLabel(model.latestMonth) : "n/a"} />
          <Info2 label="States" value={`${model.states.length}`} sub={model.states.join(", ")} />
          <Info2 label="Channel data" value={model.channels ? "Present" : "Not provided"} sub={model.channels ? "Channels tab is live" : "Add a “Channel Monthly” sheet"} />
        </dl>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-line-2 px-6 py-4 text-[15px] font-semibold">Sheets</div>
          <table className="w-full text-[13px]">
            <tbody>
              {m.sheets.map((s) => (
                <tr key={s.name} className="border-t border-line-2 first:border-0">
                  <td className="px-6 py-2.5">{s.found ? <CheckCircle2 className="size-4 text-good" /> : s.required ? <XCircle className="size-4 text-bad" /> : <Info className="size-4 text-soft" />}</td>
                  <td className="py-2.5 font-medium">{s.name}{!s.required && <span className="ml-2 text-xs text-soft">optional</span>}</td>
                  <td className="num px-6 py-2.5 text-right text-mute">{s.found ? `${s.rows} rows` : s.required ? "missing" : "not present"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-line-2 px-6 py-4 text-[15px] font-semibold">Validation ({issues.length})</div>
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-6 text-sm text-good"><CheckCircle2 className="size-4" /> All required sheets and columns were found and the cross-sheet totals reconcile.</div>
          ) : (
            <ul className="divide-y divide-line-2">
              {issues.map((i, k) => (
                <li key={k} className="flex gap-3 px-6 py-3 text-[13px]">
                  {i.level === "error" ? <XCircle className="mt-0.5 size-4 shrink-0 text-bad" /> : i.level === "warn" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> : <Info className="mt-0.5 size-4 shrink-0 text-soft" />}
                  <span><strong>[{i.sheet}]</strong> <span className={cn(i.level === "info" && "text-mute")}>{i.message}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {model.dictionary.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line-2 px-6 py-4 text-[15px] font-semibold">Data dictionary</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th className="px-6 py-2.5 font-semibold">Field / KPI</th><th className="font-semibold">Definition</th><th className="font-semibold">Unit</th><th className="font-semibold">Source sheet</th><th className="px-6 font-semibold">Note</th></tr></thead>
              <tbody>
                {model.dictionary.map((d) => (
                  <tr key={d.field} className="border-t border-line-2 align-top">
                    <td className="px-6 py-2.5 font-semibold">{d.field}</td><td className="py-2.5 pr-4 text-ink-2">{d.definition}</td><td className="py-2.5 pr-4 text-mute">{d.unit}</td><td className="py-2.5 pr-4 text-mute">{d.source}</td><td className="px-6 py-2.5 text-mute">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Info2({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-subtle p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-[17px] font-semibold">{value}</dd>
      {sub && <dd className="mt-0.5 line-clamp-2 text-xs text-mute">{sub}</dd>}
    </div>
  );
}
