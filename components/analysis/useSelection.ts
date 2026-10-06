"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "../AppContext";
import { analysisHref, patchSelection, type Selection, type SelectionPatch } from "@/lib/story/links";
import { slugToState, stateSlug } from "@/lib/format";
import type { DataModel } from "@/lib/data/types";

/** Agencies that belong to the selected states and channels (agencies are recorded for the focus state). */
export function availableAgencies(model: DataModel, sel: Pick<Selection, "states" | "channels">) {
  const st = model.story;
  if (sel.states.length && !sel.states.includes(st.focusState ?? "")) return [];
  return st.agencies.filter((a) => !sel.channels.length || sel.channels.includes(a.channel));
}

/** Drops agencies and the representative that no longer belong to the selected states and channels. */
function cascade(model: DataModel, sel: Selection): Selection {
  const ok = new Set(availableAgencies(model, sel).map((a) => a.agency));
  const agencies = sel.agencies.filter((a) => ok.has(a));
  const rep = sel.rep ? model.story.reps.find((r) => r.id === sel.rep) : null;
  return { ...sel, agencies, rep: rep && (agencies.includes(rep.agency) || !agencies.length) ? rep.id : null };
}

/**
 * Detailed Analysis selection, kept in the URL (?state=a,b&channel=c,d&agency=e&rep=f) so every insight link
 * filters the same page. States, channels and agencies are multi-select and cascade: only agencies that belong
 * to the selected states and channels stay available. The app's state filter follows a single selected state.
 */
export function useSelection() {
  const { model, month, state: globalState, setState } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const key = sp.toString();

  const sel = useMemo<Selection>(() => {
    const p = new URLSearchParams(key);
    const many = (k: string, names: string[]) => (p.get(k) ?? "").split(",").filter(Boolean).map((x) => slugToState(x, names)).filter((x): x is string => !!x);
    const repId = p.get("rep");
    const rep = repId ? model.story.reps.find((r) => r.id.toLowerCase() === repId.toLowerCase()) ?? null : null;
    const agencies = (p.get("agency") ?? "").split(",").filter(Boolean).map((x) => model.story.agencies.find((a) => stateSlug(a.agency) === x)?.agency).filter((x): x is string => !!x);
    return cascade(model, { states: many("state", model.states), channels: many("channel", model.channelNames), agencies: rep && !agencies.length ? [rep.agency] : agencies, rep: rep?.id ?? null });
  }, [key, model]);
  const any = sel.states.length + sel.channels.length + sel.agencies.length > 0 || !!sel.rep;

  // Arriving without a selection keeps an existing global state filter; otherwise the URL wins.
  const first = useRef(true);
  const one = sel.states.length === 1 ? sel.states[0] : null;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!any && globalState && model.states.includes(globalState)) {
        router.replace(analysisHref({ state: globalState }, month), { scroll: false });
        return;
      }
    }
    if (one !== (globalState ?? null)) setState(one);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [one, any]);

  const select = useCallback(
    (next: SelectionPatch) => {
      const merged = cascade(model, patchSelection(sel, next));
      router.push(analysisHref(merged, month), { scroll: false });
    },
    [sel, model, month, router],
  );

  return { sel, select, agency: sel.agencies.length === 1 ? model.story.agencies.find((a) => a.agency === sel.agencies[0]) ?? null : null, rep: sel.rep ? model.story.reps.find((r) => r.id === sel.rep) ?? null : null };
}
