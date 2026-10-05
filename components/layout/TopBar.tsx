"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Moon, PanelLeft, Sun } from "lucide-react";
import { useApp } from "../AppContext";
import { AskAnything } from "../ai/AskAnything";
import { ProfileMenu } from "./ProfileMenu";
import { DateRangePicker } from "./DateRangePicker";
import { MORE, NAV, BrandMark } from "./Sidebar";
import { monthLabel } from "@/lib/format";
import { analysisHref } from "@/lib/story/links";
import { cn } from "../ui/primitives";

function Select({ value, onChange, children, label, className }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label: string; className?: string }) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full cursor-pointer appearance-none rounded-full border border-line/80 bg-card pl-5 pr-10 text-[13px] font-semibold text-ink shadow-card outline-none transition hover:shadow-pop focus:ring-4 focus:ring-brand/30 dark:border-white/[0.06]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
    </label>
  );
}

/** Light / dark switch. The choice is kept in this browser; the initial class is set by a script in the document head. */
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("bs.theme", next ? "dark" : "light");
    } catch {}
  };
  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}
      className="grid size-11 place-items-center rounded-full border border-line/80 bg-card text-mute shadow-card transition hover:text-ink hover:shadow-pop dark:border-white/[0.06]">
      {dark ? <Sun className="size-[17px] text-brand" /> : <Moon className="size-[17px]" />}
    </button>
  );
}

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const { model, month, setMonth, state, setState, toggleSidebar } = useApp();
  const nav = [...NAV, ...MORE].find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href) || (!!n.also && path.startsWith(n.also))));
  const title = path.startsWith("/settings") ? "Settings and Data Source" : nav?.title ?? "Command Center";

  // On Detailed Analysis, the state filter and the page selection are the same thing.
  const onState = (v: string) => {
    setState(v || null);
    if (path.startsWith("/states") || path.startsWith("/channels")) router.push(analysisHref({ state: v || null }, month), { scroll: false });
  };

  return (
    <header className="sticky top-0 z-30 bg-gradient-to-b from-canvas via-canvas/95 to-canvas/0 pb-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8 lg:h-[84px] lg:flex-nowrap lg:py-0">
        <div className="flex items-center gap-3 lg:min-w-[190px]">
          <span className="lg:hidden"><BrandMark size={30} /></span>
          <button onClick={toggleSidebar} aria-label="Toggle navigation" title="Collapse or expand the navigation"
            className="hidden size-10 place-items-center rounded-full text-mute transition-colors hover:bg-card hover:text-ink lg:grid">
            <PanelLeft className="size-[18px]" />
          </button>
          <div className="leading-tight">
            <h1 className="whitespace-nowrap text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
            <div className="mt-0.5 hidden text-[12px] text-mute sm:block">Cancellation intelligence · {monthLabel(month)}</div>
          </div>
        </div>

        <div className="order-3 flex w-full justify-center lg:order-none lg:flex-1">
          <AskAnything />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {model.daily ? (
            <DateRangePicker dates={model.daily.dates} value={month} onChange={setMonth} />
          ) : (
            <Select label="Period" value={month} onChange={setMonth} className="w-[196px]">
              {[...model.months].reverse().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          )}
          <Select label="State" value={state && !state.startsWith("ch:") ? state : ""} onChange={onState} className="hidden w-[176px] sm:block">
            <option value="">All states</option>
            {model.states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <ThemeToggle />
          <button aria-label="Notifications" className="relative hidden size-11 place-items-center rounded-full border border-line/80 bg-card text-mute shadow-card transition hover:text-ink hover:shadow-pop dark:border-white/[0.06] sm:grid">
            <Bell className="size-[17px]" />
            <span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-card bg-bad" />
          </button>
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
