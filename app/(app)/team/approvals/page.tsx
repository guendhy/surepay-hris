import type { Metadata } from "next";
import { can, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateRange, formatDateTime, formatDays } from "@/lib/format";
import type { DirectoryEntry, LeaveBalance } from "@/lib/types";
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge, TabLinks, Table, Td, Th } from "@/components/ui/primitives";
import { ApprovalInbox, type InboxItem } from "./approval-inbox";

export const metadata: Metadata = { title: "Approvals" };

type TaskRow = {
  id: string;
  step_order: number;
  due_at: string | null;
  is_escalation: boolean;
  escalated_at: string | null;
  delegated_from_user_id: string | null;
  created_at: string;
  approval_requests: { id: string; request_type: string; subject_id: string; summary: string | null; requester_employee_id: string } | null;
};

type LeaveRow = {
  id: string;
  request_no: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  day_portion: string;
  days: string;
  reason: string | null;
  attachment_path: string | null;
  submitted_at: string;
  leave_types: { name: string; code: string; balance_tracked: boolean } | null;
};

type CalendarRow = { employee_id: string; employee_name: string; start_date: string; end_date: string; day_portion: string; status: string };

export default async function ApprovalsPage({ searchParams }: PageProps<"/team/approvals">) {
  const session = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "decided" ? "decided" : "waiting";
  const supabase = await createClient();

  const [{ data: tasks }, { data: directory }, { count: decidedCount }] = await Promise.all([
    supabase
      .from("approval_tasks")
      .select(
        "id, step_order, due_at, is_escalation, escalated_at, delegated_from_user_id, created_at, approval_requests(id, request_type, subject_id, summary, requester_employee_id)",
      )
      .eq("approver_user_id", session.userId)
      .eq("status", "pending")
      .order("created_at"),
    supabase.rpc("get_employee_directory"),
    supabase.from("approval_tasks").select("id", { count: "exact", head: true }).eq("acted_by", session.userId).neq("status", "pending"),
  ]);
  const rows = (tasks ?? []) as unknown as TaskRow[];
  const people = new Map(((directory ?? []) as DirectoryEntry[]).map((p) => [p.id, p]));

  // Leave details (RLS lets approvers read requests they act on).
  const leaveIds = rows.filter((t) => t.approval_requests?.request_type === "leave").map((t) => t.approval_requests!.subject_id);
  const { data: leaves } = leaveIds.length
    ? await supabase
        .from("leave_requests")
        .select("id, request_no, employee_id, leave_type_id, start_date, end_date, day_portion, days, reason, attachment_path, submitted_at, leave_types(name, code, balance_tracked)")
        .in("id", leaveIds)
    : { data: [] };
  const leaveRows = (leaves ?? []) as unknown as LeaveRow[];
  const leaveById = new Map(leaveRows.map((l) => [l.id, l]));

  // Balances (visible to managers of the requester) and team overlap for the whole date span.
  const requesterIds = [...new Set(leaveRows.map((l) => l.employee_id))];
  const minStart = leaveRows.reduce((m, l) => (l.start_date < m ? l.start_date : m), "9999-12-31");
  const maxEnd = leaveRows.reduce((m, l) => (l.end_date > m ? l.end_date : m), "0000-01-01");
  const [{ data: balances }, { data: calendar }] = await Promise.all([
    requesterIds.length ? supabase.from("leave_balances").select("*").in("employee_id", requesterIds) : Promise.resolve({ data: [] }),
    leaveRows.length ? supabase.rpc("get_team_leave_calendar", { p_from: minStart, p_to: maxEnd }) : Promise.resolve({ data: [] }),
  ]);
  const balanceRows = (balances ?? []) as LeaveBalance[];
  const calendarRows = (calendar ?? []) as CalendarRow[];
  const now = new Date().toISOString();

  const items: InboxItem[] = rows.map((t) => {
    const leave = t.approval_requests ? leaveById.get(t.approval_requests.subject_id) : undefined;
    const person = t.approval_requests ? people.get(t.approval_requests.requester_employee_id) : undefined;
    const bal = leave ? balanceRows.find((b) => b.employee_id === leave.employee_id && b.leave_type_id === leave.leave_type_id) : undefined;
    // Pending already includes this request, so "available" is what remains after approval.
    const balanceAfter = leave?.leave_types?.balance_tracked && bal ? `${formatDays(bal.available)} ${leave.leave_types.code} left` : null;
    const overlap = leave
      ? calendarRows
          .filter((c) => c.employee_id !== leave.employee_id && c.start_date <= leave.end_date && c.end_date >= leave.start_date)
          .map((c) => `${c.employee_name} · ${formatDateRange(c.start_date, c.end_date)}${c.day_portion !== "full" ? ` (${c.day_portion.toUpperCase()})` : ""}${c.status === "pending" ? " · pending" : ""}`)
      : [];
    return {
      taskId: t.id,
      requester: person?.full_name ?? t.approval_requests?.summary?.split(" — ")[0] ?? "Employee",
      role: person ? [person.position_title, person.department_name].filter(Boolean).join(" · ") : "",
      summary: t.approval_requests?.summary ?? "Request",
      type: leave?.leave_types?.name ?? t.approval_requests?.request_type ?? "",
      requestNo: leave?.request_no ?? "",
      dates: leave ? formatDateRange(leave.start_date, leave.end_date) + (leave.day_portion !== "full" ? ` (${leave.day_portion.toUpperCase()})` : "") : "",
      days: leave ? formatDays(leave.days) : "",
      reason: leave?.reason ?? null,
      attachmentUrl: leave?.attachment_path ? `/api/files?path=${encodeURIComponent(leave.attachment_path)}` : null,
      overdue: Boolean(t.due_at && t.due_at < now),
      escalated: t.is_escalation || Boolean(t.escalated_at),
      delegated: Boolean(t.delegated_from_user_id),
      receivedAt: formatDate(t.created_at),
      due: t.due_at ? formatDate(t.due_at) : null,
      filed: leave ? formatDate(leave.submitted_at) : "",
      balanceAfter,
      overlap,
      stepLabel: t.step_order >= 99 ? "HR (no other approver)" : `Step ${t.step_order}`,
    };
  });

  const { data: history } =
    view === "decided"
      ? await supabase
          .from("approval_tasks")
          .select("id, status, acted_at, comment, approval_requests(summary)")
          .eq("acted_by", session.userId)
          .neq("status", "pending")
          .order("acted_at", { ascending: false })
          .limit(50)
      : { data: [] };

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          can(session, "approvals.override")
            ? "Requests waiting for you. As HR you can also act on escalated requests."
            : "Requests from your team waiting for your decision."
        }
        actions={
          session.isManager ? (
            <LinkButton href="/me/delegation" variant="secondary">
              Set a delegate
            </LinkButton>
          ) : undefined
        }
      />
      <TabLinks
        active={view}
        tabs={[
          { key: "waiting", label: "Waiting for me", href: "/team/approvals", count: items.length },
          { key: "decided", label: "Decided by me", href: "/team/approvals?view=decided", count: decidedCount ?? 0 },
        ]}
      />

      {view === "waiting" ? (
        <ApprovalInbox items={items} />
      ) : (
        <Card>
          {(history ?? []).length === 0 ? (
            <EmptyState title="Nothing decided yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Decision</Th>
                  <Th>Comment</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((h) => (
                  <tr key={h.id}>
                    <Td>{(h.approval_requests as unknown as { summary: string } | null)?.summary ?? "—"}</Td>
                    <Td>
                      <StatusBadge status={h.status} />
                    </Td>
                    <Td className="text-muted">{h.comment ?? ""}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(h.acted_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
