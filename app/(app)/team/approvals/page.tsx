import type { Metadata } from "next";
import { can, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateRange, formatDateTime, formatDays } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { ApprovalInbox, type InboxItem } from "./approval-inbox";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const session = await requireUser();
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from("approval_tasks")
    .select("id, step_order, due_at, is_escalation, delegated_from_user_id, approval_request_id, created_at, approval_requests(id, request_type, subject_id, summary, requester_employee_id)")
    .eq("approver_user_id", session.userId)
    .eq("status", "pending")
    .order("created_at");

  type TaskRow = {
    id: string;
    step_order: number;
    due_at: string | null;
    is_escalation: boolean;
    delegated_from_user_id: string | null;
    created_at: string;
    approval_requests: { id: string; request_type: string; subject_id: string; summary: string | null } | null;
  };
  const rows = (tasks ?? []) as unknown as TaskRow[];

  // Leave details for each task (RLS lets approvers read requests they act on).
  const leaveIds = rows.filter((t) => t.approval_requests?.request_type === "leave").map((t) => t.approval_requests!.subject_id);
  const { data: leaves } = leaveIds.length
    ? await supabase
        .from("leave_requests")
        .select("id, request_no, start_date, end_date, day_portion, days, reason, attachment_path, leave_types(name, color)")
        .in("id", leaveIds)
    : { data: [] };
  type LeaveRow = {
    id: string;
    request_no: string;
    start_date: string;
    end_date: string;
    day_portion: string;
    days: string;
    reason: string | null;
    attachment_path: string | null;
    leave_types: { name: string; color: string } | null;
  };
  const leaveById = new Map(((leaves ?? []) as unknown as LeaveRow[]).map((l) => [l.id, l]));
  const now = new Date().toISOString();

  const items: InboxItem[] = rows.map((t) => {
    const leave = t.approval_requests ? leaveById.get(t.approval_requests.subject_id) : undefined;
    return {
      taskId: t.id,
      summary: t.approval_requests?.summary ?? "Request",
      type: leave?.leave_types?.name ?? t.approval_requests?.request_type ?? "",
      color: leave?.leave_types?.color ?? "#64748b",
      requestNo: leave?.request_no ?? "",
      dates: leave ? formatDateRange(leave.start_date, leave.end_date) + (leave.day_portion !== "full" ? ` (${leave.day_portion.toUpperCase()})` : "") : "",
      days: leave ? formatDays(leave.days) : "",
      reason: leave?.reason ?? null,
      attachmentUrl: leave?.attachment_path ? `/api/files?path=${encodeURIComponent(leave.attachment_path)}` : null,
      overdue: Boolean(t.due_at && t.due_at < now),
      escalated: t.is_escalation,
      delegated: Boolean(t.delegated_from_user_id),
      receivedAt: formatDateTime(t.created_at),
    };
  });

  // Recently decided by me.
  const { data: history } = await supabase
    .from("approval_tasks")
    .select("id, status, acted_at, comment, approval_requests(summary)")
    .eq("acted_by", session.userId)
    .neq("status", "pending")
    .order("acted_at", { ascending: false })
    .limit(15);

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          can(session, "approvals.override")
            ? "Requests waiting for you. As HR you can also act on escalated requests."
            : "Requests from your team waiting for your decision."
        }
      />
      <ApprovalInbox items={items} />

      <Card className="mt-8">
        <CardHeader title="Recently decided" />
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
    </>
  );
}
