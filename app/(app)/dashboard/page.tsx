import type { Metadata } from "next";
import Link from "next/link";
import { can, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateRange, formatDays, humanize, todayManila } from "@/lib/format";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/types";
import { BalanceCards } from "@/components/leave/balance-cards";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  Stat,
  StatusBadge,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Dashboard" };

type HrStats = {
  headcount: number;
  by_department: { name: string; count: number }[];
  by_employment_type: { name: string; count: number }[];
  new_hires_this_month: number;
  separations_this_month: number;
  on_leave_today: { name: string; type: string }[];
  pending_approvals: number;
  regularizations_due: { id: string; name: string; due: string }[];
  birthdays_this_month: { name: string; day: number }[];
  unverified_holidays: number;
};

export default async function DashboardPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const employeeId = session.employee?.id;
  const today = todayManila();

  const [types, balances, requests, tasks, holidays, announcements, stats] = await Promise.all([
    supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order"),
    employeeId
      ? supabase.from("leave_balances").select("*").eq("employee_id", employeeId)
      : Promise.resolve({ data: [] }),
    employeeId
      ? supabase
          .from("leave_requests")
          .select("id, request_no, leave_type_id, start_date, end_date, days, status")
          .eq("employee_id", employeeId)
          .order("submitted_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase
      .from("approval_tasks")
      .select("id", { count: "exact", head: true })
      .eq("approver_user_id", session.userId)
      .eq("status", "pending"),
    supabase.from("holidays").select("holiday_date, name, holiday_type").gte("holiday_date", today).order("holiday_date").limit(4),
    supabase.from("announcements").select("id, title, body, published_at").order("published_at", { ascending: false }).limit(3),
    can(session, "reports.view") ? supabase.rpc("hr_dashboard_stats") : Promise.resolve({ data: null }),
  ]);

  const leaveTypes = (types.data ?? []) as LeaveType[];
  const typeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name ?? "Leave";
  const hr = stats.data as HrStats | null;
  const pendingTasks = tasks.count ?? 0;

  return (
    <>
      <PageHeader
        title={`Good day${session.employee ? `, ${session.employee.first_name}` : ""}`}
        description={formatDate(today)}
        actions={employeeId ? <LinkButton href="/me/leave/new">File leave</LinkButton> : undefined}
      />

      {!employeeId && (
        <Alert tone="warning" className="mb-6">
          Your login is not linked to an employee record yet. HR links it by using the same work email on your 201 file.
        </Alert>
      )}

      {pendingTasks > 0 && (
        <Alert tone="brand" className="mb-6">
          You have {pendingTasks} request{pendingTasks === 1 ? "" : "s"} waiting for your approval.{" "}
          <Link href="/team/approvals" className="font-medium underline">
            Review now
          </Link>
        </Alert>
      )}

      {employeeId && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Leave balances</h2>
          <BalanceCards types={leaveTypes} balances={(balances.data ?? []) as LeaveBalance[]} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="My recent requests" action={<Link href="/me/leave" className="text-sm text-brand">View all</Link>} />
          {(requests.data ?? []).length === 0 ? (
            <EmptyState title="No leave requests yet" />
          ) : (
            <ul className="divide-y divide-border">
              {((requests.data ?? []) as LeaveRequest[]).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{typeName(r.leave_type_id)}</p>
                    <p className="text-muted">
                      {formatDateRange(r.start_date, r.end_date)} · {formatDays(r.days)} day(s)
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Upcoming holidays" />
            <CardBody>
              {(holidays.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">No holidays on the calendar yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {(holidays.data ?? []).map((h) => (
                    <li key={`${h.holiday_date}-${h.name}`} className="flex justify-between gap-3">
                      <span className="text-foreground">{h.name}</span>
                      <span className="text-muted">{formatDate(h.holiday_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Announcements" />
            <CardBody>
              {(announcements.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">Nothing new.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {(announcements.data ?? []).map((a) => (
                    <li key={a.id}>
                      <p className="text-sm font-medium text-foreground">{a.title}</p>
                      <p className="line-clamp-3 text-sm text-muted">{a.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {hr && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-foreground">HR overview</h2>
          {hr.unverified_holidays > 0 && can(session, "settings.manage") && (
            <Alert tone="warning" className="mb-4">
              {hr.unverified_holidays} upcoming holiday(s) are not yet verified against the official Proclamation.{" "}
              <Link href="/hr/settings/holidays" className="font-medium underline">Review holidays</Link>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Headcount" value={hr.headcount} />
            <Stat label="New hires this month" value={hr.new_hires_this_month} />
            <Stat label="Separations this month" value={hr.separations_this_month} />
            <Stat label="Pending approvals" value={hr.pending_approvals} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Headcount by department" />
              <CardBody>
                <BarList items={hr.by_department} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={`On leave today (${hr.on_leave_today.length})`} />
              <CardBody>
                {hr.on_leave_today.length === 0 ? (
                  <p className="text-sm text-muted">Everyone is in.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {hr.on_leave_today.map((p) => (
                      <li key={p.name} className="flex justify-between gap-2">
                        <span className="text-foreground">{p.name}</span>
                        <Badge>{p.type}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Regularisations due" description="Probationary employees, next 45 days" />
              <CardBody>
                {hr.regularizations_due.length === 0 ? (
                  <p className="text-sm text-muted">None due.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {hr.regularizations_due.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <Link href={`/hr/employees/${p.id}`} className="text-brand hover:underline">{p.name}</Link>
                        <span className={p.due < today ? "text-danger" : "text-muted"}>{formatDate(p.due)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="By employment type" />
              <CardBody>
                <BarList items={hr.by_employment_type.map((x) => ({ ...x, name: humanize(x.name) }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Birthdays this month" />
              <CardBody>
                {hr.birthdays_this_month.length === 0 ? (
                  <p className="text-sm text-muted">None this month.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {hr.birthdays_this_month.map((p) => (
                      <li key={p.name} className="flex justify-between gap-2">
                        <span className="text-foreground">{p.name}</span>
                        <span className="text-muted">{p.day}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </section>
      )}
    </>
  );
}

/** Simple horizontal bars — one hue, labelled values (no legend needed). */
function BarList({ items }: { items: { name: string; count: number }[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No data.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.name} className="text-sm">
          <div className="mb-1 flex justify-between gap-2">
            <span className="text-foreground">{i.name}</span>
            <span className="font-medium text-foreground">{i.count}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
