/**
 * "What is happening?" for Detailed Analysis at every level of the selection: portfolio overview
 * (the two problems), state, channel, state and channel, any combination of them, agency and representative.
 * Every figure comes from the workbook backed model; entity links filter the same page.
 */
import type { AgencySnapshotRow, DataModel, MonthKey, RepRow } from "../data/types";
import { AGENCY_GAP_THRESHOLD, chScope, getSnapshot, prevMonth } from "../data/metrics";
import { forecast, hz, parseSel, selScope } from "../data/daily";
import { fmtInt, fmtPct, fmtPct0, fmtPp, fmtSignedPct, monthName } from "../format";
import { storyFacts } from "./facts";
import { agencyCoaching, buildExecutiveNarrative, buildPlanNarrative, buildScopeNarrative } from "./narrative";
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
        (co ? `; at ${agencyLink(co.agency, month)}, newer and replacement representatives made ${fmtPct0(co.salesShare)} of sales but **${fmtPct0(co.cancelShare)}** of cancellations.` : "."),
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
      text: `Over the next ${hz(model)} days, without action, this is projected at **${fmtPct(fc.rate)}** on ${fmtInt(fc.sales)} sales (internal baseline ${fmtPct(fc.baseline)}). See the ${link("recommended interventions", hrefs.actions(month))}.`,
      evidence: { kind: "forecast-scope", scope: chScope(channel), title: `${state} channel outlook`, interpretation: "The outlook shows where verification effort pays back first." },
    });
  }
  return out.slice(0, 5);
}

// ------------------------------------------------------------------ agency
export function buildAgencyNarrative(model: DataModel, month: MonthKey, a: AgencySnapshotRow): NarrativePoint[] {
  const st = model.story;
  const weak = (a.gap ?? 0) >= AGENCY_GAP_THRESHOLD;
  const P = prevMonth(model, month);
  const out: NarrativePoint[] = [{
    id: "agency-change", mode: "observed", label: `${a.agency} · ${a.channel}`, tone: weak ? "bad" : "good",
    text: weak
      ? `Cancel rate **${fmtPct(a.cancelRate)}** in ${monthName(month)}, against its own history of ${fmtPct(a.baseline)} (**${fmtPp(a.gap)}**). Sales went from ${fmtInt(a.prevSales)}${P ? ` in ${monthName(P)}` : ""} to ${fmtInt(a.sales)}.`
      : `Performing normally: ${fmtPct(a.cancelRate)} cancel rate, close to its own history of ${fmtPct(a.baseline)} (${fmtPp(a.gap)}).`,
    evidence: { kind: "agency-trend", agency: a.agency, title: `${a.agency} 7 day cancel rate vs own history`, interpretation: weak ? "The rate tracked its own baseline, then broke away and has stayed above it." : "The rate stays inside its own historical range." },
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
  const reps = st.reps.filter((r) => r.agency === a.agency && (r.sales ?? 0) > 0);
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
      text: `Over the next ${hz(model)} days, without action, ${st.focusState ?? ""} ${a.channel} reaches **${fmtPct(fc.rate)}**. ${iv ? `Verifying risky orders and coaching Critical reps can avoid about **${fmtInt(iv.saves)}** cancellations across these partners.` : ""} ${link("Take action", hrefs.actions(month))}.`,
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
      ((r.prevSales ?? 0) > 0 ? ` Previous period: ${fmtInt(r.prevCancels)} cancellations on ${fmtInt(r.prevSales)} sales.` : " New this period."),
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

// ------------------------------------------------------------------ any combination
/** "North Carolina · D2D · Digital Partner · Agency Alpha": the selection with the parents an agency implies. */
export function selectionLabel(model: DataModel, sel: Selection): string {
  const focus = model.story.focusState;
  const ag = sel.agencies.map((n) => findAgency(model, n)).filter((a): a is AgencySnapshotRow => !!a);
  const states = sel.states.length ? sel.states : ag.length && focus ? [focus] : [];
  const channels = sel.channels.length ? sel.channels : [...new Set(ag.map((a) => a.channel))];
  return [...states, ...channels, ...sel.agencies, ...(sel.rep ? [sel.rep] : [])].join(" · ");
}

/** Snapshot scope of a selection: a state or channel name when that is all there is, otherwise a combination scope. */
export function selectionScope(model: DataModel, sel: Selection): string | null {
  const { states: S, channels: C, agencies: A } = sel;
  if (!S.length && !C.length && !A.length) return null;
  if (S.length === 1 && !C.length && !A.length) return S[0];
  if (!S.length && C.length === 1 && !A.length) return chScope(C[0]);
  return selScope({ states: A.length && !S.length && model.story.focusState ? [model.story.focusState] : S, channels: C, agencies: A });
}

/** An agency inside its parent cell: its share of the cell's sales and cancellations. */
function agencyContextPoint(model: DataModel, month: MonthKey, a: AgencySnapshotRow, sel: Selection): NarrativePoint | null {
  const focus = model.story.focusState;
  if (!focus) return null;
  // Parent: the selected channels (or the agency's own); when the agency is the whole channel, the whole state.
  let channels = sel.channels.length ? sel.channels : [a.channel];
  let cell = getSnapshot(model, month, selScope({ states: [focus], channels }));
  if ((cell.sales ?? 0) - (a.sales ?? 0) < 1) { channels = []; cell = getSnapshot(model, month, focus); }
  const parentName = `${focus}${channels.length ? ` ${listJoin(channels)}` : ""}`;
  if (!cell.sales || !cell.cancels || a.sales === null || a.cancels === null) return null;
  const rest = { s: cell.sales - a.sales, c: cell.cancels - a.cancels };
  const over = (a.cancels / cell.cancels) > (a.sales / cell.sales) + 0.05;
  return {
    id: "agency-context", mode: "observed", label: `${parentName} · ${a.agency}`, tone: over ? "bad" : "neutral",
    text: over
      ? `${a.agency} makes **${fmtPct0(a.sales / cell.sales)}** of ${parentName} sales but **${fmtPct0(a.cancels / cell.cancels)}** of its cancellations: a ${fmtPct(a.cancelRate)} cancel rate${rest.s > 0 ? `, against ${fmtPct(rest.c / rest.s)} for the rest of ${parentName}` : ""}.`
      : `${a.agency} makes **${fmtPct0(a.sales / cell.sales)}** of ${parentName} sales and a similar **${fmtPct0(a.cancels / cell.cancels)}** of its cancellations: its ${fmtPct(a.cancelRate)} cancel rate${rest.s > 0 ? ` is close to the rest of ${parentName} (${fmtPct(rest.c / rest.s)})` : ""}, and ${(a.gap ?? 0) >= 0.05 ? `${fmtPp(a.gap)} above its own history` : "close to its own history"}.`,
    evidence: { kind: "reps", agency: a.agency, title: `${a.agency} representatives by cancel rate`, interpretation: "The representatives behind the agency's result; select one for their signals." },
  };
}

/** A synthesized story for any combination of states, channels and agencies (not a list of the parts). */
function buildComboNarrative(model: DataModel, month: MonthKey, sel: Selection): NarrativePoint[] {
  const f = storyFacts(model, month);
  const scope = selectionScope(model, sel)!;
  const label = selectionLabel(model, sel);
  const pm = prevMonth(model, month);
  const cur = getSnapshot(model, month, scope), prev = pm ? getSnapshot(model, pm, scope) : null;
  const normal = f.baselineRate ?? 0.155;
  const { states: S, channels: C, agencies: A } = sel;
  const focus = model.story.focusState;
  const out: NarrativePoint[] = [];
  const change = prev?.cancels ? (cur.cancels ?? 0) / prev.cancels - 1 : null;

  // 1. what is happening, and where inside the selection it sits
  const cells = A.length ? [] : model.stateChannel.filter((r) => (!S.length || S.includes(r.state)) && (!C.length || C.includes(r.channel)) && (r.sales ?? 0) > 0);
  const hot = cells.filter((r) => (r.cancelRate ?? 0) - normal >= 0.08), calm = cells.filter((r) => !hot.includes(r));
  const excess = (r: { sales: number | null; cancels: number | null }) => Math.max(0, (r.cancels ?? 0) - (r.sales ?? 0) * normal);
  const hotShare = hot.length && cells.length ? hot.reduce((x, r) => x + excess(r), 0) / (cells.reduce((x, r) => x + excess(r), 0) || 1) : null;
  const rates = (rs: typeof cells) => rs.map((r) => r.cancelRate ?? 0);
  const span = (xs: number[]) => (fmtPct0(Math.min(...xs)) === fmtPct0(Math.max(...xs)) ? `about ${fmtPct0(xs[0])}` : `${fmtPct0(Math.min(...xs))} to ${fmtPct0(Math.max(...xs))}`);
  const where = !cells.length ? ""
    : hot.length && calm.length ? ` It is concentrated in ${listJoin(hot.map((r) => `${r.state} ${r.channel}`))} (${span(rates(hot))} cancelled), which hold **${fmtPct0(hotShare)}** of the cancellations above normal; the other ${calm.length} ${calm.length === 1 ? "cell stays" : "cells stay"} near ${span(rates(calm))}.`
    : hot.length ? ` Every cell in it runs well above normal (${span(rates(hot))}).`
    : ` Every cell in it stays close to normal (${span(rates(calm))}).`;
  const level = (cur.cancelRate ?? 0) - normal;
  out.push({
    id: "combo", mode: "observed", label, tone: level >= 0.05 ? "bad" : level >= 0.015 ? "warn" : "good",
    text: `**${fmtInt(cur.cancels)}** cancellations on ${fmtInt(cur.sales)} sales: a **${fmtPct(cur.cancelRate)}** cancel rate against a ${fmtPct(normal)} norm${change !== null ? ` (cancellations ${fmtSignedPct(change)} vs ${pm ? monthName(pm) : "the previous period"})` : ""}.` + where,
    evidence: { kind: "trend", scope, title: `${label}: daily cancel rate`, interpretation: level >= 0.05 ? "The rate for this selection runs well above the normal range." : "The rate for this selection stays close to the normal range." },
  });

  // 2. who: the partners inside the selection (agencies are recorded for the focus state)
  const inFocus = (!S.length && !A.length ? false : !S.length || S.includes(focus ?? "")) || A.length > 0;
  const ags = inFocus ? model.story.agencies.filter((a) => (A.length ? A.includes(a.agency) : !C.length || C.includes(a.channel))) : [];
  if (ags.length) {
    const weak = ags.filter((a) => f.weakAgencies.some((w) => w.agency === a.agency)), steady = ags.filter((a) => !weak.includes(a));
    const parent = getSnapshot(model, month, selScope({ states: focus ? [focus] : [], channels: [...new Set(ags.map((a) => a.channel))] }));
    const gaps = weak.map((a) => a.gap ?? 0);
    out.push({
      id: "combo-agencies", mode: "observed", label: "Who", tone: weak.length ? "bad" : "good",
      text: weak.length
        ? `${listJoin(weak.map((a) => agencyLink(a.agency, month)))} ${weak.length > 1 ? "cancel" : "cancels"} ${gaps.length > 1 ? `${fmtPp(Math.min(...gaps))} to ${fmtPp(Math.max(...gaps))}` : fmtPp(gaps[0])} above ${weak.length > 1 ? "their" : "its"} own history and ${weak.length > 1 ? "make" : "makes"} **${fmtPct0(weak.reduce((x, a) => x + (a.cancels ?? 0), 0) / (parent.cancels || 1))}** of ${focus} ${listJoin([...new Set(ags.map((a) => a.channel))])} cancellations${steady.length ? `; ${listJoin(steady.map((a) => a.agency))} ${steady.length > 1 ? "stay" : "stays"} close to ${steady.length > 1 ? "their" : "its"} own history` : ""}.`
        : `${listJoin(ags.map((a) => agencyLink(a.agency, month)))} ${ags.length > 1 ? "stay" : "stays"} close to ${ags.length > 1 ? "their" : "its"} own history: partner quality is not the issue here.`,
      evidence: A.length
        ? { kind: "reps", agency: A[0], agencies: A, title: `Representatives in ${listJoin(A)}`, interpretation: "Representative level detail for the selected agencies, by cancel rate for the selected dates." }
        : { kind: "agencies", highlight: weak.map((a) => a.agency), title: "Agencies in this selection vs own history", interpretation: weak.length ? "The deterioration follows specific partners, not the channel as a whole." : "No partner here broke from its own baseline." },
    });
    const reps = model.story.reps.filter((r) => ags.some((a) => a.agency === r.agency) && (r.sales ?? 0) > 0);
    const crit = reps.filter((r) => /critical/i.test(r.band));
    if (weak.length && reps.length) {
      out.push({
        id: "combo-reps", mode: "observed", label: "Representatives", tone: crit.length ? "bad" : "neutral",
        text: `**${crit.length} of ${reps.length}** active representatives here are in the Critical band (above 40%). Coaching: ${listJoin(weak.map((a) => `${a.agency.replace(/^Agency /, "")} on ${agencyCoaching(a).focus}`))}.`,
        evidence: { kind: "reps", agency: weak[0].agency, agencies: weak.map((a) => a.agency), title: "Representatives to coach, by cancel rate", interpretation: "Newer and replacement reps lead the list; they are where coaching and order verification start." },
      });
    }
  }

  // 3. when and why: timing and the customer contact signal for exactly this selection
  if (cur.postPct !== null) {
    const port = f.port;
    out.push({
      id: "combo-timing", mode: "observed", label: "When and why", tone: (cur.postPct ?? 0) > (port.postPct ?? 0) + 0.03 ? "bad" : "neutral",
      text: `**${fmtPct0(cur.postPct)}** of these cancellations happen after the due date (portfolio ${fmtPct0(port.postPct)}) and **${fmtPct0(cur.pendingPct)}** carried a Pending Customer Contact signal (portfolio ${fmtPct0(port.pendingPct)}).` +
        ((cur.pendingPct ?? 0) > (port.pendingPct ?? 0) + 0.05 ? " Unreached customers are a large part of the loss here." : ""),
      evidence: { kind: "watch", scope, title: `${label}: Watchtower state before cancellation`, interpretation: "Signals are recorded by state and applied in proportion to this selection's cancellations." },
    });
  }

  // 4. next 30 days for exactly this selection
  if (model.daily) {
    const fc = forecast(model, hz(model), parseSel(scope));
    out.push({
      id: "combo-outlook", mode: "preventive", label: `Next ${hz(model)} days`, tone: (fc.rateNo ?? 0) > normal + 0.02 ? "warn" : "good",
      text: `Without action this selection holds near **${fmtPct(fc.rateNo)}** over the next ${hz(model)} days; with the three actions it trends to **${fmtPct(fc.rateWith)}** (about ${fmtInt(fc.avoided)} cancellations avoided). ${link("Take action", hrefs.actions(month))}.`,
    });
  }
  return out;
}

/** Insights for the current selection: a representative, an agency in its cell, a single state, channel or pair, or any combination. */
export function buildSelectionNarrative(model: DataModel, month: MonthKey, sel: Selection): NarrativePoint[] {
  const rep = findRep(model, sel.rep);
  if (rep) return buildRepNarrative(model, month, rep);
  const { states: S, channels: C, agencies: A } = sel;
  const ag = A.length === 1 ? findAgency(model, A[0]) : null;
  if (ag) return [agencyContextPoint(model, month, ag, sel), ...buildAgencyNarrative(model, month, ag)].filter((p): p is NarrativePoint => !!p);
  if (!S.length && !C.length && !A.length) return buildOverviewNarrative(model, month);
  if (S.length === 1 && C.length === 1 && !A.length) return buildStateChannelNarrative(model, month, S[0], C[0]);
  if (S.length === 1 && !C.length && !A.length) {
    const state = S[0];
    const pts = buildScopeNarrative(model, month, state);
    // The focus state also names the partners behind its sales quality problem.
    const f = storyFacts(model, month);
    if (f.hasStory && f.focus?.state === state && f.weakAgencies.length) {
      const i = pts.findIndex((p) => p.id === "drivers");
      pts.splice(i >= 0 ? i + 1 : pts.length, 0, {
        id: "agencies", mode: "observed", label: "Sales quality analysis", tone: "bad",
        text: `${listJoin(f.weakAgencies.map((a) => agencyLink(a.agency, month)))} broke from their own history; every other source stayed within ${fmtPp(Math.max(...f.steadyAgencies.map((a) => a.gap ?? 0)))}.`,
        evidence: { kind: "agencies", highlight: f.weakAgencies.map((a) => a.agency), title: `${state} agencies vs own history`, interpretation: "Select an agency to see its representatives." },
      });
    }
    return pts.slice(0, 6);
  }
  if (!S.length && C.length === 1 && !A.length) return buildScopeNarrative(model, month, chScope(C[0]));
  return buildComboNarrative(model, month, sel);
}

export const snapshotFor = (model: DataModel, month: MonthKey, scope: string | null) => getSnapshot(model, month, scope);
