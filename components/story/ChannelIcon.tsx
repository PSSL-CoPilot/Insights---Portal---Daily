"use client";

import { DoorOpen, Globe, Handshake, PhoneIncoming, PhoneOutgoing, Shapes, Store, type LucideIcon } from "lucide-react";

/** Generic Lucide pictograms for sales channels (no partner or brand logos). */
const ICONS: [RegExp, LucideIcon][] = [
  [/d2d|door/i, DoorOpen],
  [/partner/i, Handshake],
  [/digital|online|web/i, Globe],
  [/inbound/i, PhoneIncoming],
  [/obtm|outbound|telemarket/i, PhoneOutgoing],
  [/indirect|retail|store/i, Store],
];

export function channelIcon(channel: string): LucideIcon {
  return ICONS.find(([re]) => re.test(channel))?.[1] ?? Shapes;
}

export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const Icon = channelIcon(channel);
  return <Icon className={className ?? "size-4"} aria-hidden />;
}
