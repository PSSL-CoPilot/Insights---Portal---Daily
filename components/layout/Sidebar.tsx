"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronDown, ChevronsLeft, ChevronsRight, CircleSlash, Database, Ellipsis, Layers, LayoutDashboard, ListChecks, Route } from "lucide-react";
import type { ComponentType } from "react";
import { InsightsGlyph } from "../ui/Marks";
import { useApp } from "../AppContext";
import { cn } from "../ui/primitives";

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; title: string; also?: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Command Center", icon: LayoutDashboard, title: "Command Center" },
  { href: "/cancellations", label: "Cancellations", icon: CircleSlash, title: "Cancellations" },
  { href: "/states", label: "Detailed Analysis", icon: Layers, title: "Detailed Analysis", also: "/channels" },
  { href: "/insights", label: "Insights", icon: InsightsGlyph, title: "Insights" },
  { href: "/watchtower", label: "Watchtower", icon: Activity, title: "Watchtower" },
  { href: "/actions", label: "Actions", icon: ListChecks, title: "Actions" },
];

/** Secondary pages, shown under "More". */
export const MORE: NavItem[] = [{ href: "/journey", label: "Sales to Install Journey", icon: Route, title: "Sales to Install Journey" }];

/** Brightspeed mark: a diamond of yellow and orange bands with red stems at each point and yellow corners. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <g fill="#FFC72C">
        <path d="M0 2a2 2 0 0 1 2-2h6L0 8z" /><path d="M32 2a2 2 0 0 0-2-2h-6l8 8z" />
        <path d="M0 30a2 2 0 0 0 2 2h6l-8-8z" /><path d="M32 30a2 2 0 0 1-2 2h-6l8-8z" />
      </g>
      <g strokeWidth="5" fill="none">
        <path d="M16 7 7 16" stroke="#F58A1F" /><path d="M16 7l9 9" stroke="#FFC72C" />
        <path d="M7 16l9 9" stroke="#FFC72C" /><path d="M25 16l-9 9" stroke="#F58A1F" />
      </g>
      <g fill="#E4432B">
        <rect x="13" y="0" width="6" height="8" rx="1" /><rect x="13" y="24" width="6" height="8" rx="1" />
        <rect x="0" y="13" width="8" height="6" rx="1" /><rect x="24" y="13" width="8" height="6" rx="1" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("text-[19px] font-extrabold lowercase leading-none tracking-[-0.03em] text-ink", className)}>brightspeed</span>;
}

function NavLink({ n, on, c }: { n: NavItem; on: boolean; c: boolean }) {
  return (
    <Link
      href={n.href}
      title={c ? n.label : undefined}
      aria-current={on ? "page" : undefined}
      className={cn(
        "group relative flex h-12 items-center gap-3 rounded-full pl-1.5 pr-3 text-[13.5px] transition-colors duration-200",
        on ? "bg-subtle font-semibold text-ink" : "font-medium text-mute hover:bg-subtle/70 hover:text-ink",
        c && "justify-center px-0",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-all duration-300",
          on ? "bs-gradient text-white shadow-[0_6px_16px_-6px_rgba(242,106,54,0.7)]" : "bg-card text-mute shadow-[0_1px_2px_rgba(0,0,0,0.06)] group-hover:text-ink",
        )}
      >
        <n.icon className="size-[17px] transition-transform duration-200 group-hover:scale-110" strokeWidth={2} />
      </span>
      {!c && <span className="truncate">{n.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { sidebarCollapsed: c, toggleSidebar } = useApp();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const moreActive = MORE.some((m) => active(m.href));
  const [more, setMore] = useState(moreActive);
  useEffect(() => {
    if (moreActive) setMore(true);
  }, [moreActive]);
  return (
    <aside
      className={cn(
        "glass fixed bottom-3 left-3 top-3 z-30 hidden flex-col rounded-[30px] transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:flex",
        c ? "w-[72px]" : "w-[256px]",
      )}
    >
      <div className={cn("flex h-[78px] items-center gap-2.5 px-5", c && "justify-center px-0")}>
        <BrandMark size={30} />
        {!c && (
          <div className="leading-tight">
            <Wordmark />
            <div className="mt-1 text-[10.5px] font-medium tracking-wide text-mute">Cancellation Intelligence</div>
          </div>
        )}
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {NAV.map((n) => <NavLink key={n.href} n={n} on={active(n.href) || (!!n.also && active(n.also))} c={c} />)}
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          title={c ? "More" : undefined}
          className={cn("group flex h-12 items-center gap-3 rounded-full pl-1.5 pr-3 text-[13.5px] font-medium text-mute transition-colors hover:bg-subtle/70 hover:text-ink", c && "justify-center px-0")}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]"><Ellipsis className="size-[17px]" /></span>
          {!c && <>More<ChevronDown className={cn("ml-auto size-4 transition-transform duration-300", more && "rotate-180")} /></>}
        </button>
        <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", more ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="flex flex-col gap-1 overflow-hidden">
            {MORE.map((n) => <NavLink key={n.href} n={n} on={active(n.href)} c={c} />)}
          </div>
        </div>
      </nav>

      <div className="space-y-1 border-t border-line/70 p-3">
        <NavLink n={{ href: "/settings", label: "Settings and Data Source", icon: Database, title: "Settings" }} on={path.startsWith("/settings")} c={c} />
        <button
          onClick={toggleSidebar}
          className={cn("flex h-10 w-full items-center gap-3 rounded-full px-4 text-xs font-medium text-soft transition-colors hover:bg-subtle hover:text-ink", c && "justify-center px-0")}
          aria-label={c ? "Expand sidebar" : "Collapse sidebar"}
        >
          {c ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
