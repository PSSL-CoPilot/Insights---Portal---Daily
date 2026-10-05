"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useApp } from "../AppContext";
import { usePathname } from "next/navigation";
import { MORE, NAV, Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { GenieDock } from "../ai/GenieDock";
import { KPIDetailModal } from "../kpi/KPIDetailModal";
import { cn } from "../ui/primitives";

function DataBanner() {
  const { model } = useApp();
  const [hidden, setHidden] = useState(false);
  const bad = model.issues.filter((i) => i.level === "error" || i.level === "warn");
  if (hidden || bad.length === 0) return null;
  return (
    <div className="flex items-start gap-3 border-b border-warn/30 bg-warn-soft px-5 py-2.5 text-[13px] text-warn sm:px-8">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <strong>Data warning:</strong> {bad.length} issue{bad.length > 1 ? "s" : ""} found while reading the workbook, for example <em>[{bad[0].sheet}] {bad[0].message}</em>{" "}
        <Link href="/settings" className="font-semibold underline">View details</Link>
      </div>
      <button onClick={() => setHidden(true)} aria-label="Dismiss"><X className="size-4" /></button>
    </div>
  );
}

function MobileNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1.5 overflow-x-auto px-4 py-2 lg:hidden" aria-label="Primary">
      {[...NAV, ...MORE].map((n) => {
        const on = n.href === "/" ? path === "/" : path.startsWith(n.href) || (!!n.also && path.startsWith(n.also));
        return (
          <Link key={n.href} href={n.href} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold", on ? "bs-gradient text-white" : "bg-card text-mute")}>
            <n.icon className="size-3.5" /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { sidebarCollapsed } = useApp();
  const path = usePathname();
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className={cn("min-h-screen transition-[padding] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]", sidebarCollapsed ? "lg:pl-[96px]" : "lg:pl-[280px]")}>
        <TopBar />
        <MobileNav />
        <DataBanner />
        <main key={path} className="page-enter w-full px-4 pb-28 pt-6 sm:px-6 2xl:px-8">{children}</main>
      </div>
      <KPIDetailModal />
      <GenieDock />
    </div>
  );
}
