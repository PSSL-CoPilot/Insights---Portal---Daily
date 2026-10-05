/** Entity links used inside narrative text as `[[label|href]]` markup (rendered by RichText). */
import type { MonthKey } from "../data/types";
import { chScope, isChannel, scopeName } from "../data/metrics";
import { stateSlug } from "../format";

export const link = (label: string, href: string) => `[[${label}|${href}]]`;

/** A Detailed Analysis selection. Any combination may be empty; deeper levels imply their parents. */
export interface Selection {
  state: string | null;
  channel: string | null;
  agency: string | null;
  rep: string | null;
}

export const NO_SELECTION: Selection = { state: null, channel: null, agency: null, rep: null };

/** Detailed Analysis URL for a selection. Everything filters in place on one page. */
export function analysisHref(sel: Partial<Selection>, month: MonthKey): string {
  const p = new URLSearchParams({ month });
  if (sel.state) p.set("state", stateSlug(sel.state));
  if (sel.channel) p.set("channel", stateSlug(sel.channel));
  if (sel.agency) p.set("agency", stateSlug(sel.agency));
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
