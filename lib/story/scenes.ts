/**
 * Guided "What happened" briefing. It retells the Command Center executive story scene by scene,
 * in the same plain words (each scene's narration is the matching executive point), with one visual
 * per step. Scenes are emitted only when their facts exist, so a month without an exception, or a
 * workbook without the agency and prevention sheets, produces a shorter, still truthful story.
 */
import type { DataModel, MonthKey } from "../data/types";
import { getSnapshot, stateRows } from "../data/metrics";
import { fmtInt, fmtSignedPct, monthName, monthShort } from "../format";
import { storyFacts } from "./facts";
import { buildExecutiveNarrative, buildRecommendations } from "./narrative";
import type { NarrativePoint, SceneLayout, SceneVisual, StoryModel, StoryScene } from "./types";

/** Sales quality risk factors used to score orders (price or offer mismatch is caught by independent confirmation). */
const SIGNAL_LABELS = [
  ["lowIntent", "Low intent in sales transcript"],
  ["promo", "Promotion sensitivity"],
  ["competitor", "Competitor mentioned"],
  ["failedConfirm", "Price or offer mismatch (fails confirmation)"],
] as const;

/** Narration placement per scene: a deliberate mix so text moves around the visual. */
const LAYOUT: Record<string, SceneLayout> = {
  portfolio: "top", geography: "right", channels: "bottom", "sales-quality": "right", "sales-prevention": "top", contact: "bottom",
  timing: "left", journey: "top", "high-value": "right", "contact-prevention": "bottom", outlook: "left", recommendations: "top",
};

/** Narration from an executive point: entity links become plain names (the player is not a navigation surface). */
const plain = (p: NarrativePoint | undefined) => (p ? p.text.replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, "$1") : "");

export function buildStoryScenes(model: DataModel, month: MonthKey): StoryScene[] {
  const f = storyFacts(model, month);
  const M = monthName(month);
  const ex = buildExecutiveNarrative(model, month);
  const pt = new Map(ex.points.map((p) => [p.id, p]));
  const scenes: StoryScene[] = [];
  const add = (s: Omit<StoryScene, "layout">) => scenes.push({ ...s, layout: LAYOUT[s.id] ?? "top" });
  const rows = stateRows(model, month);
  const h = f.focus;
  const FM = f.forecast.month ? monthName(f.forecast.month) : "Next month";

  // The footprint first appears neutral; the focus state turns red when the story reaches it.
  const mapStates = (reveal: boolean): Extract<SceneVisual, { kind: "map" }>["states"] =>
    rows.map((r) => ({
      name: r.state, value: r.cancelsMoM, label: fmtSignedPct(r.cancelsMoM),
      severity: reveal && h?.state === r.state ? "critical" : reveal && (r.cancelsMoM ?? 0) > 0.1 ? "warning" : "normal",
    }));

  // 1. Portfolio: the quantified headline, then the plain explanation.
  add({
    id: "portfolio", mode: "observed", kicker: "Portfolio", duration: 10000,
    title: ex.headline,
    body: [plain(pt.get("portfolio")), ex.subhead].filter(Boolean).join(" "),
    visual: { kind: "map", zoom: null, states: mapStates(!h) },
  });
  if (!h) return scenes;

  // Day-wise: when the signals first appeared.
  if (pt.get("detection")) add({ id: "detection", mode: "observed", kicker: "When it started", duration: 10000, title: "Daily tracking caught it early", body: plain(pt.get("detection")), visual: { kind: "map", zoom: null, states: mapStates(true) } });

  // 2. Where
  add({ id: "geography", mode: "observed", kicker: "Where", duration: 10000, title: "One state explains the increase", body: plain(pt.get("geography")), visual: { kind: "map", zoom: h.state, states: mapStates(true) } });

  // 3. Which channels
  if (f.outlierChannels.length) {
    const names = f.outlierChannels.map((c) => c.channel);
    add({
      id: "channels", mode: "observed", kicker: "Which channels", duration: 10000,
      title: `${names.length > 1 ? "Two channels carry" : "One channel carries"} the problem`,
      body: plain(pt.get("channel")),
      visual: { kind: "channels", state: h.state, rows: f.focusChannels.map((c) => ({ channel: c.channel, rate: c.rate, sales: c.sales, outlier: names.includes(c.channel) })), normal: f.normalChannelRate },
    });
  }

  // 4. Problem 1: sales quality
  if (pt.has("sales-quality")) {
    const c = f.cohort;
    add({
      id: "sales-quality", mode: "observed", kicker: "Problem 1: sales quality", duration: 12000,
      title: "A few agencies, and mostly their new reps",
      body: plain(pt.get("sales-quality")),
      visual: {
        kind: "agencies",
        rows: model.story.agencies.map((a) => ({ agency: a.agency, channel: a.channel, baseline: a.baseline, rate: a.cancelRate, gap: a.gap, weak: f.weakAgencies.includes(a) })),
        cohort: c ? { agency: c.agency, cohort: c.cohort, salesShare: c.salesShare, cancelShare: c.cancelShare, rate: c.rate } : null,
      },
    });
  }

  // 5. Prevention for problem 1, straight after it.
  if (pt.has("sales-prevention")) {
    const sig = [...SIGNAL_LABELS.map(([k, label]) => ({ label, value: f.signals[k] })), { label: "Rep risk (sales from Critical reps)", value: f.criticalRepShare }];
    add({
      id: "sales-prevention", mode: "preventive", kicker: pt.get("sales-prevention")!.label, duration: 13000,
      title: "Score risky orders before they cancel",
      body: plain(pt.get("sales-prevention")),
      visual: {
        kind: "sales-signals", signals: sig,
        example: model.story.exampleOrder.filter((x) => !/recommended action/i.test(x.label)),
        action: model.story.exampleOrder.find((x) => /recommended action/i.test(x.label))?.value ?? f.interventions.sales?.action ?? "",
        stats: { orders: f.riskyOrders.orders, projected: f.riskyOrders.projected, saves: f.interventions.sales?.saves ?? null, month: FM },
      },
    });
  }

  // 6. Problem 2: customer contact
  const dr = f.drivers;
  if (pt.has("contact") && dr.sales && dr.contact) {
    add({
      id: "contact", mode: "observed", kicker: "Problem 2: customer contact", duration: 12000,
      title: "The bigger problem: customers we could not confirm",
      body: plain(pt.get("contact")),
      visual: {
        kind: "split", total: dr.total?.cancels ?? null, signal: f.focusSnap?.pendingPct ?? null,
        parts: (["sales", "contact", "company", "faux"] as const).filter((k) => dr[k]).map((k) => ({
          kind: k, label: k === "sales" ? "Sales quality" : k === "contact" ? "Customer contact" : k === "company" ? "Company and operational" : "Faux and other",
          cancels: dr[k]!.cancels, share: dr[k]!.share, emphasis: k === "sales" || k === "contact",
        })),
      },
    });
  }

  // 7. When: the lifecycle split before, on and after the Original Due Date.
  if (pt.has("timing") && f.port.postPct !== null) {
    const split = (label: string, s: ReturnType<typeof getSnapshot> | null, emphasis = false) => ({ label, pre: s?.prePct ?? null, on: s?.onPct ?? null, post: s?.postPct ?? null, emphasis });
    add({
      id: "timing", mode: "observed", kicker: "When", duration: 11000,
      title: "Customers are lost late",
      body: plain(pt.get("timing")),
      visual: {
        kind: "timing",
        rows: [
          ...(f.portPrev && f.prev ? [split(`Portfolio, ${monthShort(f.prev)}`, f.portPrev)] : []),
          split(`Portfolio, ${monthShort(month)}`, f.port),
          ...(f.focusSnap ? [split(`${h.state}, ${monthShort(month)}`, f.focusSnap, true)] : []),
        ],
        drivers: f.lateDrivers.slice(0, 3).map((r) => ({ label: r.label, count: r.count, mom: r.mom })),
      },
    });
  }

  // 8. How it happens: the customer journey behind problem 2.
  const path = model.workbookNotes.journeyPath?.replace(/\.$/, "").split("→").map((x) => x.trim()).filter(Boolean) ?? [];
  if (path.length >= 4) {
    const pending = f.focusSnap?.pendingPct ?? null;
    const n = path.length;
    add({
      id: "journey", mode: "observed", kicker: "How it happens", duration: 13000,
      title: "An unconfirmed appointment becomes a cancellation",
      body: `The customer does not confirm, reschedules, then goes quiet until the technician finds no one home.${pending !== null ? ` **${Math.round(pending * 100)}%** of ${h.state} cancellations showed Pending Customer Contact first: a warning we can act on.` : ""}`,
      visual: {
        kind: "journey",
        nodes: path.map((label, i) => ({
          label: label.charAt(0).toUpperCase() + label.slice(1),
          severity: i < Math.ceil(n * 0.25) ? "neutral" : i < n - 2 ? "warning" : "critical",
          badge: /pending/i.test(label) && pending !== null ? `${Math.round(pending * 100)}%` : undefined,
        })),
      },
    });
  }

  // 9. Prevention: high-value customer protection.
  if (pt.has("high-value")) {
    const segs = model.story.segments.filter((s) => !s.isTotal);
    add({
      id: "high-value", mode: "preventive", kicker: pt.get("high-value")!.label, duration: 13000,
      title: "Protect high-value customers before the date slips",
      body: plain(pt.get("high-value")),
      visual: {
        kind: "install", total: f.highValue.total, saves: f.interventions.install?.saves ?? null,
        segments: segs.map((s) => ({ label: s.segment, orders: s.orders, action: s.action, signal: s.signal })),
        example: model.story.exampleInstall,
      },
    });
  }

  // 10. Prevention: customer-contact rescue (problem 2).
  const cr = f.contactRisk;
  if (f.hasStory && cr.orders !== null) {
    add({
      id: "contact-prevention", mode: "preventive", kicker: `${FM} prevention: customer contact`, duration: 11000,
      title: "Rescue the customer-contact journey",
      body: `**${fmtInt(cr.orders)}** ${h.state} orders carry contact risk; about **${fmtInt(cr.projected)}** would cancel without help. Confirm, rebook, call and route by cause: about **${fmtInt(cr.protectable)}** cancellations avoided.`,
      visual: { kind: "contact", funnel: model.story.contactRisk.map((r) => ({ label: r.label, value: r.value })), rules: model.story.contactRules },
    });
  }

  // 11. Outlook
  const fc = f.forecast;
  if (pt.has("outlook") && fc.noAction !== null) {
    add({
      id: "outlook", mode: "preventive", kicker: `${FM} outlook`, duration: 11000,
      title: `${FM}: act now or it gets worse`,
      body: plain(pt.get("outlook")),
      visual: {
        kind: "outlook", saves: f.interventions.total?.saves ?? null,
        steps: [
          { label: "Internal baseline", rate: fc.baseline, mode: "observed" },
          { label: `${M} actual`, rate: fc.actual, mode: "observed" },
          { label: `${FM}: no action`, rate: fc.noAction, mode: "preventive" },
          { label: `${FM}: with action`, rate: fc.intervention, mode: "preventive" },
        ],
      },
    });
  }

  // 12. What to do now
  const rec = buildRecommendations(model, month);
  if (rec.items.length) {
    add({
      id: "recommendations", mode: "preventive", kicker: "What to do now", duration: 12000,
      title: `${rec.items.length === 3 ? "Three" : rec.items.length} actions, one prevention target`,
      body: `${plain(pt.get("action")).replace(/\s*Take action\.$/, "")}${rec.dedup !== null ? ` Together about **${fmtInt(rec.dedup)}** cancellations avoided, each order counted once.` : ""}`,
      visual: { kind: "recommendations", items: rec.items, total: rec.dedup },
    });
  }
  return scenes;
}

export function buildStoryModel(model: DataModel, month: MonthKey): StoryModel {
  const rec = buildRecommendations(model, month);
  return { month, executive: buildExecutiveNarrative(model, month), scenes: buildStoryScenes(model, month), recommendations: rec.items, dedupSaves: rec.dedup };
}
