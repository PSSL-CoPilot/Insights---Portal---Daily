/** Entity links used inside narrative text as `[[label|href]]` markup (rendered by RichText). */
import type { MonthKey } from "../data/types";
import { chScope, isChannel, scopeName } from "../data/metrics";
import { stateSlug } from "../format";

export const link = (label: string, href: string) => `[[${label}|${href}]]`;

/** A Detailed Analysis selection: any number of states, channels and agencies, and optionally one representative. */
export interface Selection {
  states: string[];
  channels: string[];
  agencies: string[];
  rep: string | null;
}
/** A change to the selection; the single forms (state, channel, agency) replace that level with one value. */
export type SelectionPatch = Partial<Selection> & { state?: string | null; channel?: string | null; agency?: string | null };

export const NO_SELECTION: Selection = { states: [], channels: [], agencies: [], rep: null };
const list = (many?: string[], one?: string | null) => (many ? many : one ? [one] : []);
/** Applies a patch: single forms replace their level. */
export const patchSelection = (sel: Selection, p: SelectionPatch): Selection => ({
  states: p.states ?? (p.state !== undefined ? list(undefined, p.state) : sel.states),
  channels: p.channels ?? (p.channel !== undefined ? list(undefined, p.channel) : sel.channels),
  agencies: p.agencies ?? (p.agency !== undefined ? list(undefined, p.agency) : sel.agencies),
  rep: p.rep !== undefined ? p.rep : sel.rep,
});

/** Detailed Analysis URL for a selection (lists are comma separated). Everything filters in place on one page. */
export function analysisHref(sel: SelectionPatch, month: MonthKey): string {
  const p = new URLSearchParams({ month });
  const st = list(sel.states, sel.state), ch = list(sel.channels, sel.channel), ag = list(sel.agencies, sel.agency);
  if (st.length) p.set("state", st.map(stateSlug).join(","));
  if (ch.length) p.set("channel", ch.map(stateSlug).join(","));
  if (ag.length) p.set("agency", ag.map(stateSlug).join(","));
  if (sel.rep) p.set("rep", sel.rep.toLowerCase());
  return `/states?${p.toString()}`;
}

export const hrefs = {
  state: (state: string, month: MonthKey) => analysisHref({ state }, month),
  channel: (channel: string, month: MonthKey) => analysisHref({ channel }, month),
  agency: (agency: string, month: MonthKey) => analysisHref({ agency }, month),
  rep: (rep: string, month: MonthKey) => analysisHref({ rep }, month),
  scope: (scope: string, month: MonthKey) => (isChannel(scope) ? hrefs.channel(scopeName(scope), month) : hrefs.state(scope, month)),
  postOdd: (month: MonthKey, state?: string | null) => `/cancellations?tab=timing&bucket=post&month=${month}${state ? `&state=${stateSlug(state)}` : ""}`,
  watchtower: (month: MonthKey, state?: string | null) => `/watchtower?month=${month}${state ? `&state=${stateSlug(state)}` : ""}`,
  actions: (month: MonthKey) => `/actions?month=${month}`,
};

export const stateLink = (state: string, month: MonthKey) => link(state, hrefs.state(state, month));
export const channelLink = (channel: string, month: MonthKey) => link(channel, hrefs.channel(channel, month));
export const agencyLink = (agency: string, month: MonthKey) => link(agency, hrefs.agency(agency, month));
export const repLink = (rep: string, month: MonthKey) => link(rep, hrefs.rep(rep, month));
export const scopeLink = (scope: string, month: MonthKey) => link(scopeName(scope), hrefs.scope(scope, month));
export { chScope };

/** "A", "A and B", "A, B and C". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
