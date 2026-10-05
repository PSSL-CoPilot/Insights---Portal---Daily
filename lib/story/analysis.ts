/**
 * "What is happening?" for Detailed Analysis at every level of the selection: portfolio overview
 * (the two September problems), state, channel, state and channel, agency and representative.
 * Every figure comes from the workbook backed model; entity links filter the same page.
 */
import type { AgencySnapshotRow, DataModel, MonthKey, RepRow } from "../data/types";
import { AGENCY_GAP_THRESHOLD, chScope, getSnapshot } from "../data/metrics";
import { fmtInt, fmtPct, fmtPct0, fmtPp, monthName } from "../format";
import { storyFacts } from "./facts";
import { buildExecutiveNarrative, buildPlanNarrative, buildScopeNarrative } from "./narrative";
import { agencyLink, channelLink, hrefs, link, listJoin, repLink, stateLink, type Selection } from "./links";
import type { NarrativePoint } from "./types";

const between = (a: number, b: number) => (fmtPct0(a) === fmtPct0(b) ? `near ${fmtPct0(a)}` : `between ${fmtPct0(a)} and ${fmtPct0(b)}`);
const weighted = (rows: { w: number | null; v: number | null }[]) => {
  let n = 0, d = 0;
  for (const r of rows) if (r.w !== null && r.v !== null) { n += r.w * r.v; d += r.w; }
  return d ? n / d : null;
};

export const findAgency = (model: DataModel, name: string | null) => (name ? model.story.agencies.find((a) => a.agency === name) ?? null : null);
export const findRep = (model: DataModel, id: string | null) => (id ? model.story.reps.find((r) => r.id === id) ?? null : null);

/** Signal averages of the agencies that stayed near their own history (the internal reference group). */
export function steadySignals(model: DataModel) {
  const steady = model.story.agencies.filter((a) => (a.gap ?? 0) < AGENCY_GAP_THRESHOLD && a.lowIntent !== null);
  const avg = (k: "lowIntent" | "promo" | "competitor" | "failedConfirm") => weighted(steady.map((a) => ({ w: a.sales, v: a[k] })));
  return { lowIntent: avg("lowIntent"), promo: avg("promo"), competitor: avg("competitor"), failedConfirm: avg("failedConfirm"), names: steady.map((a) => a.agency) };
}

// ------------------------------------------------------------------ overview: the two problems
export function buildOverviewNarrative(model: DataModel, month: MonthKey): NarrativePoint[] {
  const f = storyFacts(model, month);
  // Same continuous story as the Command Center, so both pages tell it the same way.
  if (f.hasStory && f.focus && f.d.anomaly) return buildExecutiveNarrative(model, month).points;
  const plan = buildPlanNarrative(model, month);
  if (!f.hasStory || !f.focus) return plan;
  const out: NarrativePoint[] = plan.filter((p) => p.id === "geography" || p.id === "channels");
  const s = f.drivers.sales, c = f.drivers.contact;
  if (s && f.weakAgencies.length) {
    const gaps = f.weakAgencies.map((a) => a.gap ?? 0);
    const co = f.cohort;
    out.push({
      id: "problem-sales", mode: "observed", label: "Problem 1: sales and agency quality", tone: "bad",
      text:
        `**${fmtInt(s.cancels)}** ${f.focus.state} cancellations (**${fmtPct0(s.share)}**) trace to order quality. ` +
        `${listJoin(f.weakAgencies.map((a) => agencyLink(a.agency, month)))} run ${fmtPp(Math.min(...gaps))} to ${fmtPp(Math.max(...gaps))} above their own history` +
        (co ? `; at ${agencyLink(co.agency, month)}, new September representatives made ${fmtPct0(co.salesShare)} of sales but **${fmtPct0(co.cancelShare)}** of cancellations.` : "."),
      evidence: { kind: "agencies", highlight: f.weakAgencies.map((a) => a.agency), title: `${f.focus.state} agencies: ${monthName(month)} vs own history`, interpretation: "Only a few partners broke from their own baseline, and inside them the newest representatives carry most of the loss." },
    });
  }
  if (c) {
    out.push({
      id: "problem-contact", mode: "observed", label: "Problem 2: customer contact and appointment readiness", tone: "bad",
      text:
        `The larger problem: **${fmtInt(c.cancels)}** cancellations (**${fmtPct0(c.share)}**) by primary attribution, lost late in the appointment journey` +
        (f.focusSnap?.postPct != null ? ` (**${fmtPct0(f.focusSnap.postPct)}** after the Original Due Date)` : "") +
        (f.focusSnap?.pendingPct != null ? `. Separately, ${fmtPct0(f.focusSnap.pendingPct)} carried a ${link("Pending Customer Contact", hrefs.watchtower(month, f.focus.state))} signal; signal and attribution are different measures.` : "."),
      evidence: { kind: "drivers", title: `${f.focus.state} primary driver attribution`, interpretation: "Two different problems need two different owners: partner and representative quality, and the customer appointment journey." },
    });
  }
  const outlook = plan.find((p) => p.id === "outlook");
  if (outlook) out.push(outlook);
  return out;
}

// ------------------------------------------------------------------ state and channel together
export function buildStateChannelNarrative(model: DataModel, month: MonthKey, state: string, channel: string): NarrativePoint[] {
  const f = storyFacts(model, month);
  const row = month === model.drillMonth ? model.stateChannel.find((r) => r.state === state && r.channel === channel) : undefined;
  if (!row) return buildScopeNarrative(model, month, chScope(channel)).slice(0, 4);
  const elsewhere = model.stateChannel.filter((r) => r.channel === channel && r.state !== state).map((r) => r.cancelRate).filter((x): x is number => x !== null);
  const siblings = model.stateChannel.filter((r) => r.state === state && r.channel !== channel).map((r) => r.cancelRate).filter((x): x is number => x !== null);
  const out: NarrativePoint[] = [{
    id: "pair", mode: "observed", label: `${state} · ${channel}`, tone: (row.cancelRate ?? 0) > 0.25 ? "bad" : "neutral",
    text:
      `${channelLink(channel, month)} in ${stateLink(state, month)} cancelled **${fmtPct(row.cancelRate)}** of ${fmtInt(row.sales)} sales (${fmtInt(row.cancels)} cancellations).` +
      (elsewhere.length ? ` ${channel} in other states: ${fmtPct0(Math.min(...elsewhere))} to ${fmtPct0(Math.max(...elsewhere))}.` : ""),
    evidence: { kind: "scope-channels", state, highlight: [channel], title: `${state} cancel rate by channel`, interpretation: `${channel} is ${(row.cancelRate ?? 0) > Math.max(...siblings, 0) + 0.08 ? "the outlier" : "in line with the other channels"} inside ${state}.` },
  }];
  if (row.postPct !== null || row.pendingPct !== null) {
    out.push({
      id: "pair-timing", mode: "observed", label: "When", tone: (row.postPct ?? 0) > 0.6 ? "bad" : "neutral",
      text: `**${fmtPct0(row.postPct)}** cancel after the due date. Customer Miss ${fmtPct0(row.custPct)}; Pending Customer Contact ${fmtPct0(row.pendingPct)}.`,
      evidence: { kind: "timing", scope: state, title: `${state} cancellation timing`, interpretation: "The timing split is recorded at state level; the pair follows the same late stage pattern." },
    });
  }
  const ag = model.story.focusState === state ? model.story.agencies.filter((a) => a.channel === channel) : [];
  if (ag.length) {
    const weak = ag.filter((a) => (a.gap ?? 0) >= AGENCY_GAP_THRESHOLD);
    out.push({
      id: "pair-agencies", mode: "observed", label: "Sales quality analysis", tone: weak.length ? "bad" : "neutral",
      text: weak.length
        ? `${listJoin(weak.map((a) => `${agencyLink(a.agency, month)} (${fmtPct(a.baseline)} history, now **${fmtPct(a.cancelRate)}**)`))} ${weak.length > 1 ? "drive" : "drives"} it.`
        : `${listJoin(ag.map((a) => agencyLink(a.agency, month)))} stayed near ${ag.length > 1 ? "their" : "its"} own history.`,
      evidence: { kind: "agencies", highlight: ag.map((a) => a.agency), title: `${state} agencies vs own history`, interpretation: weak.length ? "Partner quality, not the channel itself, explains the movement." : "No partner broke from its own baseline." },
    });
  }
  const fc = f.hasStory && model.story.focusState === state ? model.story.forecastChannels.find((r) => !r.isTotal && r.channel === channel) : null;
  if (fc && model.story.forecastMonth) {
    out.push({
      id: "pair-outlook", mode: "preventive", label: `${monthName(model.story.forecastMonth)} risk outlook`, tone: (fc.delta ?? 0) > 0.03 ? "warn" : "good",
      text: `Without action, ${monthName(model.story.forecastMonth)} is projected at **${fmtPct(fc.rate)}** on ${fmtInt(fc.sales)} sales (internal baseline ${fmtPct(fc.baseline)}). See the ${link("recommended interventions", hrefs.actions(month))}.`,
      evidence: { kind: "forecast-scope", scope: chScope(channel), title: `${state} channel outlook`, interpretation: "The outlook shows where verification effort pays back first." },
    });
  }
  return out.slice(0, 5);
}

// ------------------------------------------------------------------ agency
export function buildAgencyNarrative(model: DataModel, month: MonthKey, a: AgencySnapshotRow): NarrativePoint[] {
  const st = model.story;
  const weak = (a.gap ?? 0) >= AGENCY_GAP_THRESHOLD;
  const P = model.months[model.months.indexOf(month) - 1];
  const out: NarrativePoint[] = [{
    id: "agency-change", mode: "observed", label: `${a.agency} · ${a.channel}`, tone: weak ? "bad" : "good",
    text: weak
      ? `Cancel rate **${fmtPct(a.cancelRate)}** in ${monthName(month)}, against its own history of ${fmtPct(a.baseline)} (**${fmtPp(a.gap)}**). Sales went from ${fmtInt(a.prevSales)}${P ? ` in ${monthName(P)}` : ""} to ${fmtInt(a.sales)}.`
      : `Performing normally: ${fmtPct(a.cancelRate)} cancel rate, close to its own history of ${fmtPct(a.baseline)} (${fmtPp(a.gap)}).`,
    evidence: { kind: "agency-trend", agency: a.agency, title: `${a.agency} cancel rate by month vs own history`, interpretation: weak ? `The rate tracked its own baseline until ${monthName(month)}, then broke away.` : "The rate stays inside its own historical range." },
  }];
  if (a.pattern || a.disposition) {
    out.push({
      id: "agency-pattern", mode: "observed", label: "Sales quality analysis", tone: weak ? "bad" : "neutral",
      text: `Rated **${a.disposition || "n/a"}**.${a.pattern ? ` Main pattern: ${a.pattern.toLowerCase()}.` : ""}`,
      evidence: a.lowIntent !== null ? { kind: "agency-signals", agency: a.agency, title: `${a.agency} order quality signals vs steady agencies`, interpretation: weak ? "Order quality signals run well above the agencies that stayed on their baseline." : "Signals are in line with the steady agencies." } : undefined,
    });
  }
  const cohorts = st.cohorts.filter((c) => c.agency === a.agency && (c.sales ?? 0) > 0);
  const hot = [...cohorts].sort((x, y) => ((y.cancelShare ?? 0) - (y.salesShare ?? 0)) - ((x.cancelShare ?? 0) - (x.salesShare ?? 0)))[0];
  if (hot && cohorts.length > 1) {
    out.push({
      id: "agency-cohort", mode: "observed", label: "Representative cohorts", tone: (hot.cancelShare ?? 0) > (hot.salesShare ?? 0) + 0.05 ? "bad" : "neutral",
      text: `${hot.cohort} (${fmtInt(hot.reps)} representatives) made ${fmtPct0(hot.salesShare)} of sales but **${fmtPct0(hot.cancelShare)}** of cancellations at a ${fmtPct(hot.rate)} cancel rate.`,
      evidence: { kind: "cohorts", agency: a.agency, title: `${a.agency}: cancellations by representative cohort`, interpretation: "Cohorts whose share of cancellations exceeds their share of sales are where coaching and verification start." },
    });
  }
  const reps = st.reps.filter((r) => r.agency === a.agency);
  if (reps.length) {
    const crit = reps.filter((r) => /critical/i.test(r.band)).sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));
    const top = [...reps].sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0))[0];
    out.push({
      id: "agency-reps", mode: "observed", label: "Representatives", tone: crit.length ? "bad" : "neutral",
      text: crit.length
        ? `**${crit.length} of ${reps.length}** representatives are in the Critical band (above 40%); the highest is ${repLink(top.id, month)} at **${fmtPct(top.rate)}** on ${fmtInt(top.sales)} sales.`
        : `None of the ${reps.length} representatives is in the Critical band; the highest is ${repLink(top.id, month)} at ${fmtPct(top.rate)}.`,
      evidence: { kind: "reps", agency: a.agency, highlight: top.id, title: `${a.agency} representatives by ${monthName(month)} cancel rate`, interpretation: "Select a representative below to see their individual signals." },
    });
  }
  const fc = st.forecastChannels.find((r) => !r.isTotal && r.channel === a.channel);
  if (fc && st.forecastMonth && weak) {
    const iv = st.interventions.find((i) => i.kind === "sales");
    out.push({
      id: "agency-outlook", mode: "preventive", label: "Recommended intervention", tone: "warn",
      text: `Without action, ${monthName(st.forecastMonth)} ${st.focusState ?? ""} ${a.channel} reaches **${fmtPct(fc.rate)}**. ${iv ? `Verifying risky orders and coaching Critical reps can avoid about **${fmtInt(iv.saves)}** cancellations across these partners.` : ""} ${link("Take action", hrefs.actions(month))}.`,
      evidence: { kind: "forecast-scope", scope: chScope(a.channel), title: `${st.focusState ?? ""} channel outlook`, interpretation: "Verifying risky orders from Critical representatives is the first lever for this partner." },
    });
  }
  return out;
}

// ------------------------------------------------------------------ representative
export function buildRepNarrative(model: DataModel, month: MonthKey, r: RepRow): NarrativePoint[] {
  const st = model.story;
  const a = st.agencies.find((x) => x.agency === r.agency);
  const cohort = st.cohorts.find((c) => c.agency === r.agency && c.cohort === r.cohort);
  const crit = /critical/i.test(r.band);
  const out: NarrativePoint[] = [{
    id: "rep", mode: "observed", label: `${r.id} · ${r.band || "n/a"} band`, tone: crit || /high/i.test(r.band) ? "bad" : "neutral",
    text: `${r.id} (${agencyLink(r.agency, month)}, ${r.channel}, ${r.cohort}${r.tenure !== null ? `, ${fmtInt(r.tenure)} month${r.tenure === 1 ? "" : "s"} tenure` : ""}) cancelled **${fmtPct(r.rate)}** of ${fmtInt(r.sales)} ${monthName(month)} sales (${fmtInt(r.cancels)} cancellations).`,
    evidence: { kind: "reps", agency: r.agency, highlight: r.id, title: `${r.agency} representatives by cancel rate`, interpretation: `${r.id} is highlighted among the agency's representatives.` },
  }];
  out.push({
    id: "rep-compare", mode: "observed", label: "Against peers", tone: (r.rate ?? 0) > (a?.cancelRate ?? 1) ? "bad" : "good",
    text: `${r.agency} runs at ${fmtPct(a?.cancelRate ?? null)}${cohort ? ` and this cohort at ${fmtPct(cohort.rate)}` : ""}; ${(r.rate ?? 0) > (a?.cancelRate ?? 1) ? "this rep is above both." : "this rep is at or below the agency."}` +
      ((r.prevSales ?? 0) > 0 ? ` Last month: ${fmtInt(r.prevCancels)} cancellations on ${fmtInt(r.prevSales)} sales.` : " New this month."),
  });
  if (r.lowIntent !== null) {
    const ref = steadySignals(model);
    out.push({
      id: "rep-signals", mode: "observed", label: "Order quality signals", tone: (r.lowIntent ?? 0) > (ref.lowIntent ?? 1) * 1.5 ? "bad" : "neutral",
      text: `Low intent **${fmtPct0(r.lowIntent)}**, promotion dependent ${fmtPct0(r.promo)}, competitor mentioned ${fmtPct0(r.competitor)} and failed independent confirmation **${fmtPct0(r.failedConfirm)}**${ref.lowIntent !== null ? `, against ${fmtPct0(ref.lowIntent)} low intent for the steady agencies` : ""}.`,
      evidence: { kind: "rep-signals", rep: r.id, title: `${r.id} order quality signals`, interpretation: "Signals compared with the agency and with the agencies that stayed on their baseline." },
    });
  }
  if (crit || /high/i.test(r.band)) {
    out.push({
      id: "rep-action", mode: "preventive", label: "Recommended intervention", tone: "warn",
      text: `Verify this rep's orders before installation and coach on expectation setting. ${r.band} reps are first in line for ${link("sales quality verification", hrefs.actions(month))}.`,
    });
  }
  return out;
}

/** Insights for the current selection, deepest level first. */
export function buildSelectionNarrative(model: DataModel, month: MonthKey, sel: Selection): NarrativePoint[] {
  const rep = findRep(model, sel.rep);
  if (rep) return buildRepNarrative(model, month, rep);
  const ag = findAgency(model, sel.agency);
  if (ag) return buildAgencyNarrative(model, month, ag);
  if (sel.state && sel.channel) return buildStateChannelNarrative(model, month, sel.state, sel.channel);
  if (sel.state) {
    const pts = buildScopeNarrative(model, month, sel.state);
    // The focus state also names the partners behind its sales quality problem.
    const f = storyFacts(model, month);
    if (f.hasStory && f.focus?.state === sel.state && f.weakAgencies.length) {
      const i = pts.findIndex((p) => p.id === "drivers");
      pts.splice(i >= 0 ? i + 1 : pts.length, 0, {
        id: "agencies", mode: "observed", label: "Sales quality analysis", tone: "bad",
        text: `${listJoin(f.weakAgencies.map((a) => agencyLink(a.agency, month)))} broke from their own history; every other source stayed within ${fmtPp(Math.max(...f.steadyAgencies.map((a) => a.gap ?? 0)))}.`,
        evidence: { kind: "agencies", highlight: f.weakAgencies.map((a) => a.agency), title: `${sel.state} agencies vs own history`, interpretation: "Select an agency to see its representatives." },
      });
    }
    return pts.slice(0, 6);
  }
  if (sel.channel) return buildScopeNarrative(model, month, chScope(sel.channel));
  return buildOverviewNarrative(model, month);
}

export const snapshotFor = (model: DataModel, month: MonthKey, scope: string | null) => getSnapshot(model, month, scope);
