"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "../AppContext";
import { EmptyState } from "../ui/primitives";
import { slugToState } from "@/lib/format";
import { analysisHref } from "@/lib/story/links";

/** Older state and channel URLs open the same selection in Detailed Analysis. */
export function PlanRoute({ kind, slug }: { kind: "state" | "channel"; slug: string }) {
  const { model, month } = useApp();
  const router = useRouter();
  const name = slugToState(slug, kind === "state" ? model.states : model.channelNames);
  useEffect(() => {
    if (name) router.replace(analysisHref(kind === "state" ? { state: name } : { channel: name }, month));
  }, [kind, name, month, router]);
  if (!name) {
    return (
      <EmptyState title={`${kind === "state" ? "State" : "Channel"} not found`}>
        “{slug}” is not in the workbook. <Link href="/states" className="font-semibold underline">Open Detailed Analysis</Link>
      </EmptyState>
    );
  }
  return null;
}
