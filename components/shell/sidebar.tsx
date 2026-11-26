"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle,
  ClipboardList,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Menu,
  Scale,
  ScrollText,
  Shield,
  Sun,
  User,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "calendar-days": CalendarDays,
  user: User,
  bell: Bell,
  "check-circle": CheckCircle,
  "calendar-range": CalendarRange,
  "user-check": UserCheck,
  users: Users,
  "clipboard-list": ClipboardList,
  scale: Scale,
  megaphone: Megaphone,
  "building-2": Building2,
  "list-checks": ListChecks,
  sun: Sun,
  "git-branch": GitBranch,
  shield: Shield,
  "scroll-text": ScrollText,
};

export function Sidebar({ sections, pendingApprovals }: { sections: NavSection[]; pendingApprovals: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Longest matching href wins, so /hr/leave/balances doesn't also light up /hr/leave.
  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];

  const nav = (
    <nav className="flex flex-col gap-6 px-3 py-4" aria-label="Main">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{section.title}</p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                      active ? "bg-brand-soft font-medium text-brand" : "text-foreground hover:bg-surface-muted",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/team/approvals" && pendingApprovals > 0 && (
                      <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-40 rounded-md border border-border bg-surface p-2 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-border bg-surface">
            <div className="flex items-center justify-between px-6 py-4">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-border bg-surface lg:block">
        <div className="px-6 py-5">
          <Brand />
        </div>
        {nav}
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={28} height={28} />
      <span className="text-sm font-semibold text-foreground">Surepay HRIS</span>
    </Link>
  );
}
