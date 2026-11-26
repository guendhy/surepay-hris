import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateRange, formatDays, todayManila } from "@/lib/format";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/types";
import { BalanceCards } from "@/components/leave/balance-cards";
import { CancelLeaveButton } from "@/components/leave/cancel-leave-button";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { cancelLeave } from "./actions";

export const metadata: Metadata = { title: "My leave" };

export default async function MyLeavePage({ searchParams }: PageProps<"/me/leave">) {
  const session = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();
  const employeeId = session.employee?.id;

  if (!employeeId) {
    return (
      <>
        <PageHeader title="My leave" />
        <Alert tone="warning">Your login is not linked to an employee record yet. Please contact HR.</Alert>
      </>
    );
  }

  const [types, balances, requests, ledger] = await Promise.all([
    supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("leave_balances").select("*").eq("employee_id", employeeId),
    supabase.from("leave_requests").select("*").eq("employee_id", employeeId).order("start_date", { ascending: false }).limit(100),
    supabase
      .from("leave_ledger_entries")
      .select("id, leave_type_id, entry_type, days, effective_date, reason")
      .eq("employee_id", employeeId)
      .order("effective_date", { ascending: false })
      .limit(50),
  ]);

  const leaveTypes = (types.data ?? []) as LeaveType[];
  const typeById = new Map(leaveTypes.map((t) => [t.id, t]));
  const today = todayManila();
  const rows = (requests.data ?? []) as LeaveRequest[];

  return (
    <>
      <PageHeader
        title="My leave"
        description="Balances, requests and the full history of every credit and deduction."
        actions={<LinkButton href="/me/leave/new">File leave</LinkButton>}
      />

      {params.submitted && (
        <Alert tone="success" className="mb-6">
          Your request was submitted. You&apos;ll be notified when it is approved.
        </Alert>
      )}

      <section className="mb-8">
        <BalanceCards types={leaveTypes} balances={(balances.data ?? []) as LeaveBalance[]} />
      </section>

      <Card className="mb-8">
        <CardHeader title="Requests" />
        {rows.length === 0 ? (
          <EmptyState title="No requests yet">File your first leave request with the button above.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Request</Th>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canCancel =
                  r.status === "pending" || r.status === "returned" || (r.status === "approved" && r.start_date > today);
                return (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.request_no}</Td>
                    <Td>{typeById.get(r.leave_type_id)?.name ?? "—"}</Td>
                    <Td>
                      {formatDateRange(r.start_date, r.end_date)}
                      {r.day_portion !== "full" && <span className="text-muted"> ({r.day_portion.toUpperCase()})</span>}
                      {r.attachment_path && (
                        <a
                          href={`/api/files?path=${encodeURIComponent(r.attachment_path)}`}
                          className="ml-2 text-xs text-brand hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          attachment
                        </a>
                      )}
                    </Td>
                    <Td className="text-right">{formatDays(r.days)}</Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="text-right">
                      {canCancel && <CancelLeaveButton id={r.id} action={cancelLeave} askReason={r.status === "approved"} />}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Balance history" description="Every grant, accrual, deduction and adjustment (latest 50)." />
        {(ledger.data ?? []).length === 0 ? (
          <EmptyState title="No entries yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Entry</Th>
                <Th className="text-right">Days</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {(ledger.data ?? []).map((l) => (
                <tr key={l.id}>
                  <Td>{formatDate(l.effective_date)}</Td>
                  <Td>{typeById.get(l.leave_type_id)?.name ?? "—"}</Td>
                  <Td className="capitalize">{String(l.entry_type).replace(/_/g, " ")}</Td>
                  <Td className={`text-right ${Number(l.days) < 0 ? "text-danger" : "text-success"}`}>
                    {Number(l.days) > 0 ? "+" : ""}
                    {formatDays(l.days)}
                  </Td>
                  <Td className="text-muted">{l.reason ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
