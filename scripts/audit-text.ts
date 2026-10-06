/* Text audit: renders every narrative, scene, action, email, page story, selection story and Genie answer for many
   periods, horizons, scopes and selections, flags broken values and stale wording, and checks that totals reconcile.
   Run with `npm run test:text`; exits 1 when anything is flagged. */
import { loadDataModel } from "../lib/data/excelLoader";
import { presets, rangeKey, rangeModel, selScope } from "../lib/data/daily";
import { buildExecutiveNarrative, buildRecommendations, buildScopeNarrative, buildPlanNarrative } from "../lib/story/narrative";
import { buildStoryScenes } from "../lib/story/scenes";
import { buildActionsNarrative, buildCancellationsNarrative, buildInsightsNarrative, buildJourneyNarrative, buildWatchtowerNarrative } from "../lib/story/pages";
import { buildSelectionNarrative } from "../lib/story/analysis";
import { actionEmail, buildActions, buildInsights, focusInsight, stateStory } from "../lib/data/narratives";
import { ruleBasedProvider, suggestedQuestions } from "../lib/ai/queryEngine";
import { getSnapshot, chScope } from "../lib/data/metrics";
import { storyFacts } from "../lib/story/facts";
import { NO_SELECTION } from "../lib/story/links";

const base = loadDataModel();
const D = base.daily!.dates, today = D[D.length - 1];
const issues = new Map<string, string[]>();
const flag = (kind: string, where: string) => { const a = issues.get(kind) ?? []; if (a.length < 6) a.push(where); issues.set(kind, a); };
const BAD = [
  [/\bNaN\b|undefined|\bnull\b|Infinity|\[object/, "broken value"],
  [/\bn\/a\b/, "n/a shown"],
  [/\bAugust\b|\bAug pace\b|\bMoM\b|month over month|this month|last month|prior month|\bnext month\b/i, "stale month wording"],
  [/September|October/, "hardcoded month name"],
  [/ - | – | — /, "dash in text"],
  [/\bhot(spot)?\b|scenario/i, "banned word"],
  [/\b(\w+) \1\b/i, "doubled word"],
  [/\*\*\*\*|\*\* \*\*|\(\)|,\s*\./, "empty markup"],
] as const;
const J = (o: unknown) => JSON.stringify(o, (k, v) => (k === "id" || k === "kind" || k === "severity" || k === "href" || k === "actionId" || v === null ? undefined : v));
const scan = (where: string, raw: string | undefined | null) => {
  if (!raw) return;
  const text = raw.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, "$1");
  for (const [re, kind] of BAD) if (re.test(text)) flag(kind, `${where}: …${text.slice(Math.max(0, text.search(re) - 60), text.search(re) + 60).replace(/\s+/g, " ")}…`);
};

const keys: [string, string][] = [
  ...presets(base).map((p) => [p.label, p.key] as [string, string]),
  ["2 days", rangeKey(D[D.length - 2], today)], ["3 days", rangeKey(D[D.length - 3], today)],
  ["Sep 3", "2026-09-03"], ["Sep 12", "2026-09-12"], ["Aug 1", "2026-08-01"], ["Aug range", rangeKey("2026-08-05", "2026-08-20")],
  ["Sep 1 to 30", rangeKey("2026-09-01", "2026-09-30")], ["all", rangeKey(D[0], today)], ["Sep 10 to 20", rangeKey("2026-09-10", "2026-09-20")],
];
const sels = [
  { states: ["North Carolina"] }, { channels: ["D2D"] }, { states: ["North Carolina"], channels: ["D2D"] }, { states: ["Ohio"], channels: ["Inbound"] },
  { states: ["North Carolina"], channels: ["D2D", "Digital Partner"] }, { states: ["North Carolina", "Ohio"] }, { agencies: ["Agency Alpha"] },
  { agencies: ["Agency Alpha", "Agency Beta", "Agency Gamma"] }, { agencies: ["Agency Delta"] }, { states: ["North Carolina"], channels: ["Digital", "Inbound"] },
  { rep: "ALP-021" }, { rep: "GAM-001" }, { states: ["Michigan", "Missouri"], channels: ["D2D", "Indirect"] },
];

(async () => {
  for (const h of [30, 5] as const) for (const [label, key] of keys) {
    const m = rangeModel(base, key, h), at = `${label}/${h}d`;
    const f = storyFacts(m, key);
    const ex = buildExecutiveNarrative(m, key);
    scan(`${at} headline`, ex.headline); scan(`${at} subhead`, ex.subhead);
    ex.points.forEach((p) => { scan(`${at} exec ${p.id}`, p.text); scan(`${at} exec ${p.id} ev`, p.evidence?.interpretation); scan(`${at} exec ${p.id} title`, p.evidence?.title); });
    // player
    const scenes = buildStoryScenes(m, key);
    scenes.forEach((s) => { scan(`${at} scene ${s.id}`, `${s.title} ${s.body}`); });
    if (f.d.anomaly && f.hasStory && scenes.length < 12) flag("player short", `${at}: ${scenes.length} scenes`);
    // actions
    const acts = buildActions(m, key);
    acts.forEach((a) => {
      scan(`${at} action ${a.id}`, `${a.title} | ${a.market} | ${a.populationLabel} | ${a.impact} | ${a.why} | ${a.evidence?.join(" | ")}`);
      if (a.population !== null && (a.population < 0 || !Number.isFinite(a.population))) flag("action population", `${at} ${a.id}: ${a.population}`);
      const e = actionEmail(a, key); scan(`${at} email ${a.id}`, `${e.subject} ${e.body}`);
    });
    const rec = buildRecommendations(m, key);
    const recSum = rec.items.reduce((s, r) => s + (r.saves ?? 0), 0);
    if (f.interventions.total && recSum !== f.interventions.total.saves) flag("recommendation total", `${at}: ${recSum} vs ${f.interventions.total.saves}`);
    if (f.interventions.total && f.interventions.total.saves !== m.daily!.outlook![h].avoided) flag("saves vs outlook", `${at}`);
    rec.items.forEach((r) => scan(`${at} rec ${r.id}`, J(r)));
    // pages
    for (const scope of [null, "North Carolina", "Ohio", chScope("D2D")]) {
      buildCancellationsNarrative(m, key, scope).forEach((p) => scan(`${at} canc ${scope} ${p.id}`, p.text));
      buildWatchtowerNarrative(m, key, scope).forEach((p) => scan(`${at} watch ${scope} ${p.id}`, p.text));
      if (scope) buildScopeNarrative(m, key, scope).forEach((p) => scan(`${at} scope ${scope} ${p.id}`, p.text));
      if (scope && !scope.startsWith("ch:")) { const s = stateStory(m, key, scope); scan(`${at} stateStory ${scope}`, J(s)); }
    }
    buildActionsNarrative(m, key).forEach((p) => scan(`${at} actionsPage ${p.id}`, p.text));
    buildJourneyNarrative(m, key).forEach((p) => scan(`${at} journey ${p.id}`, p.text));
    buildInsightsNarrative(m, key).forEach((p) => scan(`${at} insightsPage ${p.id}`, p.text));
    buildPlanNarrative(m, key).forEach((p) => scan(`${at} plan ${p.id}`, p.text));
    buildInsights(m, key).forEach((i) => scan(`${at} insight ${i.id}`, J(i)));
    for (const k of ["timing", "miss", "class"] as const) scan(`${at} focus ${k}`, J(focusInsight(m, key, k)));
    for (const s of sels) buildSelectionNarrative(m, key, { ...NO_SELECTION, ...s }).forEach((p) => { scan(`${at} sel ${J(s)} ${p.id}`, p.text); scan(`${at} sel ev`, p.evidence?.title); });
    // reconciliation
    const port = getSnapshot(m, key, null);
    const sumStates = m.states.reduce((a, st) => a + (getSnapshot(m, key, st).cancels ?? 0), 0);
    const sumCh = m.channelNames.reduce((a, c) => a + (getSnapshot(m, key, chScope(c)).cancels ?? 0), 0);
    const all = getSnapshot(m, key, selScope({ states: m.states }));
    if (sumStates !== port.cancels || sumCh !== port.cancels || all.cancels !== port.cancels) flag("reconcile", `${at}: port ${port.cancels} states ${sumStates} channels ${sumCh} combo ${all.cancels}`);
    const parts = (port.preCancels ?? 0) + (port.onCancels ?? 0) + (port.postCancels ?? 0);
    if (Math.abs(parts - (port.cancels ?? 0)) > 0) flag("timing parts", `${at}: ${parts} vs ${port.cancels}`);
    const ag = m.story.agencies.reduce((a, x) => a + (x.cancels ?? 0), 0), nc = getSnapshot(m, key, "North Carolina").cancels;
    if (ag !== nc) flag("agencies vs NC", `${at}: ${ag} vs ${nc}`);
    const reps = m.story.reps.filter((r) => r.agency === "Agency Alpha").reduce((a, r) => a + (r.cancels ?? 0), 0);
    if (reps !== m.story.agencies.find((a) => a.agency === "Agency Alpha")!.cancels) flag("reps vs agency", `${at}`);
    // genie
    if (label === "Last 30 days" || label === "Latest day") for (const q of [...suggestedQuestions(m, key), "cancels in North Carolina", "which agency is worst", "post odd trend", "compare d2d vs digital partner"]) {
      const a = await ruleBasedProvider.answer(q, { model: m, month: key, state: null });
      scan(`${at} genie "${q}"`, a.text);
    }
  }
  for (const [k, v] of issues) console.log(`\n### ${k} (${v.length}${v.length >= 6 ? "+" : ""})\n${v.join("\n")}`);
  console.log(`\naudit done: ${issues.size} issue kinds`);
  if (issues.size) process.exit(1);
})();
