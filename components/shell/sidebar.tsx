"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavItem, NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./icons";

type Counts = { approvals: number; notifications: number };

function useActiveHref(hrefs: string[]) {
  const pathname = usePathname();
  // Longest matching href wins, so /hr/leave/balances doesn't also light up /hr/leave.
  return hrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 no-underline" aria-label="SurePay HRIS home">
      <Image src="/surepay-logo.png" alt="" width={34} height={30} className="h-[30px] w-auto" priority />
      {!compact && <span className="font-[family-name:var(--font-display)] text-[15px] font-bold text-foreground">HRIS</span>}
    </Link>
  );
}

/**
 * Desktop (≥1280): 248 px sidebar with labels.
 * Tablet (768–1279): 72 px icon rail (labels become aria-labels/tooltips).
 * Phone (<768): hidden — the bottom tab bar and "More" drawer take over.
 */
export function Sidebar({ sections, counts, roleLabel, mfa }: { sections: NavSection[]; counts: Counts; roleLabel: string; mfa: boolean }) {
  const activeHref = useActiveHref(sections.flatMap((s) => s.items.map((i) => i.href)));

  return (
    <aside
      className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col border-r border-border bg-surface md:flex xl:w-[248px]"
      aria-label="Main navigation"
    >
      <div className="flex h-[60px] items-center justify-center border-b border-border xl:justify-start xl:px-5">
        <span className="xl:hidden">
          <Brand compact />
        </span>
        <span className="hidden xl:block">
          <Brand />
        </span>
      </div>
      <nav className="flex flex-col gap-[18px] overflow-y-auto px-3 pb-6 pt-3">
        {sections.map((section) => (
          <div key={section.title || "home"} className="flex flex-col gap-0.5">
            {section.title && (
              <p className="hidden px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle xl:block">{section.title}</p>
            )}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} active={item.href === activeHref} count={item.count ? counts[item.count] : 0} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto hidden border-t border-border px-5 py-3 xl:block">
        <span className="inline-flex h-6 items-center rounded-full bg-yellow-soft px-2.5 text-xs font-semibold text-foreground">
          {roleLabel}
          {mfa ? " · MFA ✓" : ""}
        </span>
      </div>
    </aside>
  );
}

function NavLink({ item, active, count, onClick }: { item: NavItem; active: boolean; count: number; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={item.label}
      aria-label={count > 0 ? `${item.label}, ${count}` : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 items-center justify-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium no-underline xl:justify-start",
        active
          ? "bg-brand-soft font-semibold text-brand-strong shadow-[inset_3px_0_0_var(--brand)]"
          : "text-foreground/80 hover:bg-background hover:text-foreground",
      )}
    >
      <NavIcon name={item.icon} />
      <span className="hidden flex-1 xl:inline">{item.label}</span>
      {count > 0 && (
        <span className="absolute right-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground xl:static">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

/** Phone navigation: bottom tab bar + "More" drawer with every section. */
export function MobileNav({ tabs, sections, counts }: { tabs: NavItem[]; sections: NavSection[]; counts: Counts }) {
  const [open, setOpen] = useState(false);
  const activeHref = useActiveHref([...tabs, ...sections.flatMap((s) => s.items)].map((i) => i.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface px-1 pb-[max(12px,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
        aria-label="Main"
      >
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          const count = tab.count ? counts[tab.count] : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold no-underline",
                active ? "text-brand-strong before:absolute before:-top-1.5 before:h-[3px] before:w-8 before:rounded-b before:bg-brand" : "text-muted",
              )}
            >
              <NavIcon name={tab.icon} className="size-[22px]" />
              {tab.label}
              {count > 0 && (
                <span className="absolute right-[calc(50%-22px)] top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted"
          aria-haspopup="dialog"
        >
          <NavIcon name="menu" className="size-[22px]" />
          More
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="All pages">
          <div className="absolute inset-0 bg-[rgba(23,33,27,0.45)]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[20px] bg-surface px-4 pb-8 pt-2 shadow-[var(--shadow-dialog)]">
            <div className="mx-auto mb-2 h-1 w-10 rounded bg-border" aria-hidden />
            <div className="mb-2 flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] hover:bg-surface-muted" aria-label="Close menu">
                <NavIcon name="close" className="size-5" />
              </button>
            </div>
            {sections.map((section) => (
              <div key={section.title || "home"} className="mb-3">
                {section.title && <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">{section.title}</p>}
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={item.href === activeHref ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] no-underline",
                      item.href === activeHref ? "bg-brand-soft font-semibold text-brand-strong" : "text-foreground",
                    )}
                  >
                    <NavIcon name={item.icon} className="size-5" />
                    <span className="flex-1">{item.label}</span>
                    {item.count && counts[item.count] > 0 && (
                      <span className="rounded-full bg-brand px-2 text-xs font-semibold text-brand-foreground">{counts[item.count]}</span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
