import Image from "next/image";
import Link from "next/link";
import { can, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { mobileTabsForSession, navForSession, primaryRoleLabel } from "@/lib/nav";
import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { NavIcon } from "@/components/shell/icons";
import { Avatar } from "@/components/ui/primitives";
import { IdleSignOut, NotificationBell, SignOutButton, ThemeToggle } from "@/components/shell/header-controls";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const supabase = await createClient();

  const [unread, approvals, idle] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase
      .from("approval_tasks")
      .select("id", { count: "exact", head: true })
      .eq("approver_user_id", session.userId)
      .eq("status", "pending"),
    supabase.from("app_settings").select("value").eq("key", "session_idle_minutes").maybeSingle(),
  ]);

  const name = session.employee ? `${session.employee.first_name} ${session.employee.last_name}` : session.email;
  const idleMinutes = Number(idle.data?.value ?? 15) || 15;
  const counts = { approvals: approvals.count ?? 0, notifications: unread.count ?? 0 };
  const sections = navForSession(session);
  const canSearchPeople = can(session, "employee.view");

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar sections={sections} counts={counts} roleLabel={primaryRoleLabel(session)} mfa={session.aal === "aal2"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur md:h-[60px] md:px-6 xl:px-8">
          <Link href="/dashboard" className="md:hidden" aria-label="SurePay HRIS home">
            <Image src="/surepay-logo.png" alt="" width={32} height={28} className="h-7 w-auto" />
          </Link>
          {canSearchPeople ? (
            <form action="/hr/employees" role="search" className="relative hidden max-w-[420px] flex-1 md:block">
              <NavIcon name="search" className="pointer-events-none absolute left-3 top-2.5 size-[18px] text-subtle" />
              <label htmlFor="global-search" className="sr-only">
                Search employees
              </label>
              <input
                id="global-search"
                name="q"
                placeholder="Search employees by name, no. or email"
                className="h-[38px] w-full rounded-[var(--radius-control)] border border-border bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/20"
              />
            </form>
          ) : (
            <span className="hidden text-sm text-muted md:inline">
              {session.employee?.position_title ?? ""}
              {session.employee?.department_name ? ` · ${session.employee.department_name}` : ""}
            </span>
          )}
          <span className="flex-1" />
          <NotificationBell userId={session.userId} initialUnread={counts.notifications} />
          <ThemeToggle />
          <Link href="/me/profile" className="ml-1 flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 text-foreground no-underline hover:bg-surface-muted">
            <Avatar name={name} />
            <span className="hidden leading-tight sm:block">
              <span className="block text-[13px] font-semibold">{name}</span>
              <span className="block text-xs text-muted">{session.employee?.position_title ?? primaryRoleLabel(session)}</span>
            </span>
          </Link>
          <SignOutButton />
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-12 md:pt-6 xl:px-8 xl:pt-7">{children}</main>
      </div>
      <MobileNav tabs={mobileTabsForSession(session)} sections={sections} counts={counts} />
      <IdleSignOut minutes={idleMinutes} />
    </div>
  );
}
