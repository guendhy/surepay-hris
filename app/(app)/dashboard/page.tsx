import type { Metadata } from "next";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { can, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateRange, formatDays, humanize, todayManila } from "@/lib/format";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/types";
import { BalanceCards } from "@/components/leave/balance-cards";
import { NavIcon } from "@/components/shell/icons";
import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  Tag,
  Td,
  Th,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Dashboard" };

type HrStats = {
  headcount: number;
  by_department: { name: string; count: number }[];
  by_employment_type: { name: string; count: number }[];
  new_hires_this_month: number;
  separations_this_month: number;
  on_leave_today: { name: string; type: string; code?: string; department?: string | null }[];
  pending_approvals: number;
  escalated_approvals?: number;
  regularizations_due: { id: string; name: string; due: string }[];
  birthdays_this_month: { name: string; day: number }[];
  unverified_holidays: number;
  expiring_documents?: number;
  no_login?: number;
};

type CalendarRow = {
  leave_request_id: string;
  employee_id: string;
  employee_name: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  day_portion: string;
  status: string;
};

function greeting(): string {
  const hour = Number(format(new Date(Date.now() + 8 * 3600_000), "H")); // Manila
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const employeeId = session.employee?.id;
  const today = todayManila();
  const in14 = format(addDays(parseISO(today), 14), "yyyy-MM-dd");
  const in30 = format(addDays(parseISO(today), 30), "yyyy-MM-dd");
  const nowIso = new Date().toISOString();

  const [types, balances, requests, tasks, overdue, holidays, announcements, team, delegations, stats] = await Promise.all([
    supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order"),
    employeeId ? supabase.from("leave_balances").select("*").eq("employee_id", employeeId) : Promise.resolve({ data: [] }),
    employeeId
      ? supabase
          .from("leave_requests")
          .select("id, request_no, leave_type_id, start_date, end_date, day_portion, days, status, submitted_at")
          .eq("employee_id", employeeId)
          .order("submitted_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase.from("approval_tasks").select("id", { count: "exact", head: true }).eq("approver_user_id", session.userId).eq("status", "pending"),
    supabase
      .from("approval_tasks")
      .select("id", { count: "exact", head: true })
      .eq("approver_user_id", session.userId)
      .eq("status", "pending")
      .lt("due_at", nowIso),
    supabase.from("holidays").select("holiday_date, name").gte("holiday_date", today).order("holiday_date").limit(4),
    supabase.from("announcements").select("id, title, body, published_at").order("published_at", { ascending: false }).limit(3),
    employeeId ? supabase.rpc("get_team_leave_calendar", { p_from: today, p_to: in14 }) : Promise.resolve({ data: [] }),
    session.isManager
      ? supabase.from("approval_delegations").select("id").eq("delegator_user_id", session.userId).eq("is_active", true).gte("ends_on", today).limit(1)
      : Promise.resolve({ data: [] }),
    can(session, "reports.view") ? supabase.rpc("hr_dashboard_stats") : Promise.resolve({ data: null }),
  ]);

  const leaveTypes = (types.data ?? []) as LeaveType[];
  const typeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name ?? "Leave";
  const myRequests = (requests.data ?? []) as LeaveRequest[];
  const pendingTasks = tasks.count ?? 0;
  const overdueTasks = overdue.count ?? 0;
  const myPending = myRequests.find((r) => r.status === "pending");
  const myUpcoming = myRequests.find((r) => (r.status === "approved" || r.status === "pending") && r.start_date >= today && r.start_date <= in30);
  const suggestDelegate = session.isManager && myUpcoming && (delegations.data ?? []).length === 0;
  const outSoon = ((team.data ?? []) as CalendarRow[]).filter((r) => r.employee_id !== employeeId).slice(0, 5);
  const hr = stats.data as HrStats | null;

  const attention: { key: string; icon: string; tone: string; title: string; detail: string; badge?: { tone: "danger" | "warning"; label: string }; href: string; cta: string; primary?: boolean }[] = [];
  if (pendingTasks > 0) {
    attention.push({
      key: "approvals",
      icon: "check",
      tone: "bg-brand-soft text-brand-strong",
      title: `${pendingTasks} request${pendingTasks === 1 ? " is" : "s are"} waiting for your approval`,
      detail: overdueTasks > 0 ? `${overdueTasks} past the due date and escalated to HR.` : "Oldest first in your approvals inbox.",
      badge: overdueTasks > 0 ? { tone: "danger", label: `${overdueTasks} overdue` } : undefined,
      href: "/team/approvals",
      cta: "Review",
      primary: true,
    });
  }
  if (myPending) {
    attention.push({
      key: "mine",
      icon: "calendar",
      tone: "bg-warning-soft text-warning",
      title: `Your ${typeName(myPending.leave_type_id)}, ${formatDateRange(myPending.start_date, myPending.end_date)}, is pending`,
      detail: `${myPending.request_no} · submitted ${formatDate(myPending.submitted_at)}`,
      badge: { tone: "warning", label: "Pending" },
      href: "/me/leave",
      cta: "View",
    });
  }
  if (suggestDelegate && myUpcoming) {
    attention.push({
      key: "delegate",
      icon: "user-check",
      tone: "bg-info-soft text-info",
      title: `Away ${formatDateRange(myUpcoming.start_date, myUpcoming.end_date)}? Set a delegate`,
      detail: "New approvals for your team will go to them while you’re out.",
      href: "/me/delegation",
      cta: "Set delegate",
    });
  }

  return (
    <>
      <PageHeader
        title={`${greeting()}${session.employee ? `, ${session.employee.first_name}` : ""}`}
        description={format(parseISO(today), "EEEE, d MMM yyyy")}
        actions={
          employeeId ? (
            <>
              <LinkButton href="/team/calendar" variant="secondary">
                Team calendar
              </LinkButton>
              <LinkButton href="/me/leave/new">
                <NavIcon name="calendar" />
                File leave
              </LinkButton>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        {!employeeId && (
          <Alert tone="warning" title="Your login is not linked to an employee record yet">
            HR links it by using the same work email on your 201 file.
          </Alert>
        )}

        {attention.length > 0 && (
          <Card aria-labelledby="attn">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 id="attn" className="text-[17px] font-bold">
                Needs your attention
              </h2>
              <span className="text-[13px] text-muted">
                {attention.length} item{attention.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul>
              {attention.map((a) => (
                <li key={a.key} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0 sm:flex-nowrap">
                  <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${a.tone}`} aria-hidden="true">
                    <NavIcon name={a.icon} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <p className="text-[13px] text-muted">{a.detail}</p>
                  </div>
                  {a.badge && <Badge tone={a.badge.tone}>{a.badge.label}</Badge>}
                  <LinkButton href={a.href} size="sm" variant={a.primary ? "primary" : "secondary"}>
                    {a.cta}
                  </LinkButton>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {employeeId && (
          <section aria-labelledby="bal">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="bal" className="text-[17px] font-bold">
                Leave balances
              </h2>
              <Link href="/me/leave" className="text-[13px]">
                History
              </Link>
            </div>
            <BalanceCards types={leaveTypes} balances={(balances.data ?? []) as LeaveBalance[]} />
          </section>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card aria-labelledby="rec">
            <CardHeader title="My recent requests" action={<Link href="/me/leave" className="text-[13px]">View all</Link>} />
            {myRequests.length === 0 ? (
              <EmptyState title="No leave requests yet">File your first request with the File leave button.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Request</Th>
                    <Th>Dates</Th>
                    <Th className="text-right">Days</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <p className="font-semibold">{typeName(r.leave_type_id)}</p>
                        <p className="font-mono text-xs text-muted">{r.request_no}</p>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {formatDateRange(r.start_date, r.end_date)}
                        {r.day_portion !== "full" && ` (${r.day_portion.toUpperCase()})`}
                      </Td>
                      <Td className="text-right">{formatDays(r.days)}</Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Out soon" description="Next 14 days" action={<Link href="/team/calendar" className="text-[13px]">Calendar</Link>} />
              {outSoon.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">Nobody on your team is out.</p>
              ) : (
                <ul>
                  {outSoon.map((r) => (
                    <li key={r.leave_request_id} className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
                      <Avatar name={r.employee_name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold">{r.employee_name}</p>
                        <p className="text-xs text-muted">
                          {r.leave_type_name} · {formatDateRange(r.start_date, r.end_date)}
                          {r.day_portion !== "full" && ` (${r.day_portion.toUpperCase()})`}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Upcoming holidays" />
              {(holidays.data ?? []).length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No holidays on the calendar yet.</p>
              ) : (
                <ul>
                  {(holidays.data ?? []).map((h) => (
                    <li key={`${h.holiday_date}-${h.name}`} className="flex justify-between gap-3 border-b border-border px-5 py-2.5 text-[13px] last:border-b-0">
                      <span>{h.name}</span>
                      <span className="whitespace-nowrap text-muted">{format(parseISO(h.holiday_date), "EEE d MMM")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Announcements" />
              <CardBody className="flex flex-col gap-4">
                {(announcements.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted">Nothing new.</p>
                ) : (
                  (announcements.data ?? []).map((a) => (
                    <div key={a.id}>
                      <p className="text-[13px] font-semibold">{a.title}</p>
                      <p className="line-clamp-3 text-[13px] text-muted">{a.body}</p>
                      <p className="mt-1 text-xs text-subtle">{formatDate(a.published_at)}</p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        {hr && <HrOverview hr={hr} canSettings={can(session, "settings.manage")} today={today} />}
      </div>
    </>
  );
}

function HrOverview({ hr, canSettings, today }: { hr: HrStats; canSettings: boolean; today: string }) {
  type QueueItem = { title: string; detail: string; tone: "danger" | "warning" | "info" | "neutral"; urgency: string; href: string; cta: string; show: boolean };
  const items: QueueItem[] = [
    {
      title: "Escalated approvals",
      detail: `${hr.escalated_approvals ?? 0} request(s) passed their due date; HR can act on them.`,
      tone: "danger",
      urgency: "Overdue",
      href: "/team/approvals",
      cta: "Review",
      show: (hr.escalated_approvals ?? 0) > 0,
    },
    {
      title: "Regularisations due",
      detail: hr.regularizations_due.map((r) => `${r.name} (${formatDate(r.due)})`).join(", "),
      tone: hr.regularizations_due.some((r) => r.due < today) ? "danger" : "warning",
      urgency: hr.regularizations_due.some((r) => r.due < today) ? "Overdue" : "Due soon",
      href: "/hr/employees?status=active",
      cta: "Open",
      show: hr.regularizations_due.length > 0,
    },
    {
      title: "Unverified holidays",
      detail: `${hr.unverified_holidays} upcoming holiday(s) not yet checked against the Proclamation.`,
      tone: "warning",
      urgency: "Before payroll",
      href: "/hr/settings/holidays",
      cta: "Verify",
      show: canSettings && hr.unverified_holidays > 0,
    },
    {
      title: "Expiring documents",
      detail: `${hr.expiring_documents ?? 0} document(s) expired or expiring within 30 days.`,
      tone: "info",
      urgency: "This month",
      href: "/hr/employees",
      cta: "View",
      show: (hr.expiring_documents ?? 0) > 0,
    },
    {
      title: "No login yet",
      detail: `${hr.no_login ?? 0} employee(s) can’t sign in. Create invite links or send invitations.`,
      tone: "neutral",
      urgency: "Anytime",
      href: "/hr/employees?status=nologin",
      cta: "Invite",
      show: (hr.no_login ?? 0) > 0,
    },
  ];
  const queue = items.filter((q) => q.show);

  const maxDept = Math.max(...hr.by_department.map((d) => d.count), 1);
  const totalTypes = hr.by_employment_type.reduce((s, t) => s + t.count, 0) || 1;
  const typeColors = ["#0b7a1a", "#fabc05", "#7e8982", "#3b4640", "#1d5bb5", "#8f3a00"];

  return (
    <section className="mt-4 flex flex-col gap-5" aria-labelledby="hr-overview">
      <h2 id="hr-overview" className="text-lg font-bold">
        HR overview
      </h2>

      <Card>
        <CardHeader title="HR work queue" description="Sorted by urgency" action={<Tag>{queue.length} items</Tag>} />
        {queue.length === 0 ? (
          <EmptyState title="Nothing waiting on HR" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Detail</Th>
                <Th>Urgency</Th>
                <Th>
                  <span className="sr-only">Action</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((q, i) => (
                <tr key={q.title}>
                  <Td className="whitespace-nowrap font-semibold">{q.title}</Td>
                  <Td className="text-[13px] text-muted">{q.detail}</Td>
                  <Td>
                    <Badge tone={q.tone}>{q.urgency}</Badge>
                  </Td>
                  <Td className="text-right">
                    <LinkButton href={q.href} size="sm" variant={i === 0 ? "primary" : "secondary"}>
                      {q.cta}
                    </LinkButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Headcount" value={hr.headcount} />
        <Stat label="On leave today" value={hr.on_leave_today.length} />
        <Stat label="New hires this month" value={hr.new_hires_this_month} />
        <Stat label="Separations this month" value={hr.separations_this_month} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Headcount by department" />
          <CardBody className="flex flex-col gap-3">
            {hr.by_department.length === 0 && <p className="text-sm text-muted">No data.</p>}
            {hr.by_department.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-[13px]">
                  <span>{d.name}</span>
                  <b>{d.count}</b>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="On leave today" action={<Link href="/team/calendar" className="text-[13px]">Calendar</Link>} />
          {hr.on_leave_today.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Everyone is in.</p>
          ) : (
            <ul>
              {hr.on_leave_today.map((p) => (
                <li key={p.name} className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-b-0">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{p.name}</p>
                    {p.department && <p className="text-xs text-muted">{p.department}</p>}
                  </div>
                  <Tag>{p.code ?? p.type}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="By employment type" />
          <CardBody className="flex flex-col gap-3.5">
            <div
              className="flex h-3 overflow-hidden rounded-full"
              role="img"
              aria-label={hr.by_employment_type.map((t) => `${humanize(t.name)} ${t.count}`).join(", ")}
            >
              {hr.by_employment_type.map((t, i) => (
                <span key={t.name} style={{ width: `${(t.count / totalTypes) * 100}%`, background: typeColors[i % typeColors.length] }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              {hr.by_employment_type.map((t, i) => (
                <span key={t.name} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: typeColors[i % typeColors.length] }} aria-hidden />
                  {humanize(t.name)} <b>{t.count}</b>
                </span>
              ))}
            </div>
            <div className="h-px bg-border" />
            <p className="text-[13px]">
              <b>Birthdays this month:</b>{" "}
              <span className="text-muted">
                {hr.birthdays_this_month.length === 0 ? "None" : hr.birthdays_this_month.map((b) => `${b.name} (${b.day})`).join(", ")}
              </span>
            </p>
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
