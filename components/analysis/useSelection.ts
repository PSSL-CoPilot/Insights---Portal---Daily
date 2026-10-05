"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "../AppContext";
import { analysisHref, type Selection } from "@/lib/story/links";
import { slugToState, stateSlug } from "@/lib/format";

/**
 * Detailed Analysis selection, kept in the URL (?state=&channel=&agency=&rep=) so every insight link
 * filters the same page. On this page the URL is the source of truth and the app's global state
 * filter follows it. Deeper levels imply their parents: a representative implies its agency, an
 * agency implies its state and channel.
 */
export function useSelection() {
  const { model, month, state: globalState, setState } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const key = sp.toString();

  const raw = useMemo(() => {
    const p = new URLSearchParams(key);
    const repId = p.get("rep");
    const rep = repId ? model.story.reps.find((r) => r.id.toLowerCase() === repId.toLowerCase()) ?? null : null;
    const agSlug = p.get("agency");
    const agency = rep ? model.story.agencies.find((a) => a.agency === rep.agency) ?? null : agSlug ? model.story.agencies.find((a) => stateSlug(a.agency) === agSlug) ?? null : null;
    const channel = agency ? agency.channel : slugToState(p.get("channel") ?? "", model.channelNames);
    const state = agency ? model.story.focusState : slugToState(p.get("state") ?? "", model.states);
    const any = ["state", "channel", "agency", "rep"].some((k) => p.has(k));
    return { rep, agency, channel, state, any };
  }, [key, model]);

  const sel: Selection = { state: raw.state, channel: raw.channel, agency: raw.agency?.agency ?? null, rep: raw.rep?.id ?? null };

  // Arriving without a selection keeps an existing global state filter; otherwise the URL wins.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!raw.any && globalState && model.states.includes(globalState)) {
        router.replace(analysisHref({ state: globalState }, month), { scroll: false });
        return;
      }
    }
    if ((raw.state ?? null) !== (globalState ?? null)) setState(raw.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw.state, raw.any]);

  const select = useCallback(
    (next: Partial<Selection>) => {
      const merged: Selection = { ...sel, ...next };
      // An agency belongs to one state and channel; moving either elsewhere releases it.
      if (merged.agency && (next.state !== undefined || next.channel !== undefined)) {
        const ag = model.story.agencies.find((a) => a.agency === merged.agency);
        if (!ag || merged.state !== model.story.focusState || merged.channel !== ag.channel) {
          merged.agency = null;
          merged.rep = null;
        }
      }
      if (next.agency !== undefined && next.agency !== sel.agency) merged.rep = null;
      setState(merged.agency ? model.story.focusState : merged.state);
      // Implied parents are not written to the URL; they are derived again from the agency or representative.
      const url = analysisHref({ state: merged.agency ? null : merged.state, channel: merged.agency ? null : merged.channel, agency: merged.rep ? null : merged.agency, rep: merged.rep }, month);
      router.push(url, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel.state, sel.channel, sel.agency, sel.rep, model, month, router, setState],
  );

  return { sel, select, agency: raw.agency, rep: raw.rep };
}
