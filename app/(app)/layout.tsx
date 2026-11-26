import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { navForSession } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";
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

  const name = session.employee
    ? `${session.employee.first_name} ${session.employee.last_name}`
    : session.email;
  const idleMinutes = Number(idle.data?.value ?? 15) || 15;

  return (
    <div className="flex min-h-screen">
      <Sidebar sections={navForSession(session)} pendingApprovals={approvals.count ?? 0} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-1 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <div className="mr-auto hidden pl-1 text-sm text-muted sm:block lg:pl-0">
            {session.employee?.position_title ?? ""}
            {session.employee?.department_name ? ` · ${session.employee.department_name}` : ""}
          </div>
          <span className="mr-2 hidden text-sm font-medium text-foreground sm:inline">{name}</span>
          <NotificationBell userId={session.userId} initialUnread={unread.count ?? 0} />
          <ThemeToggle />
          <SignOutButton />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <IdleSignOut minutes={idleMinutes} />
    </div>
  );
}
