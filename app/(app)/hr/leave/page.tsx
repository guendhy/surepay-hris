import type { Metadata } from "next";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgOptions } from "@/lib/data/options";
import { formatDateRange, formatDateTime, formatDays, todayManila } from "@/lib/format";
import type { LeaveType } from "@/lib/types";
import { CancelLeaveButton } from "@/components/leave/cancel-leave-button";
import { Button, Card, EmptyState, Input, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { hrCancelLeave } from "./actions";

export const metadata: Metadata = { title: "Leave requests" };

export default async function HrLeavePage({ searchParams }: PageProps<"/hr/leave">) {
  const session = await requirePermission("leave.view_all");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "pending";
  const type = typeof sp.type === "string" ? sp.type : "";
  const dept = typeof sp.dept === "string" ? sp.dept : "";
  const from = typeof sp.from === "string" && sp.from ? sp.from : `${todayManila().slice(0, 4)}-01-01`;
  const to = typeof sp.to === "string" && sp.to ? sp.to : `${todayManila().slice(0, 4)}-12-31`;

  const supabase = await createClient();
  const [options, { data: types }] = await Promise.all([
    getOrgOptions(),
    supabase.from("leave_types").select("id, name").order("sort_order"),
  ]);

  let query = supabase
    .from("leave_requests")
    .select("id, request_no, start_date, end_date, day_portion, days, status, submitted_at, reason, attachment_path, leave_types(name, color), employees!inner(id, first_name, last_name, employee_no, department_id)")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date", { ascending: false })
    .limit(300);
  if (status !== "all") query = query.eq("status", status);
  if (type) query = query.eq("leave_type_id", type);
  if (dept) query = query.eq("employees.department_id", dept);

  const { data } = await query;
  type Row = {
    id: string;
    request_no: string;
    start_date: string;
    end_date: string;
    day_portion: string;
    days: string;
    status: string;
    submitted_at: string;
    reason: string | null;
    attachment_path: string | null;
    leave_types: Pick<LeaveType, "name" | "color"> | null;
    employees: { id: string; first_name: string; last_name: string; employee_no: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const canCancel = can(session, "leave.manage");
  const totalDays = rows.reduce((sum, r) => sum + Number(r.days), 0);

  return (
    <>
      <PageHeader title="Leave requests" description={`${rows.length} request(s) · ${formatDays(totalDays)} day(s) in the selected period`} />
      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <Select name="status" defaultValue={status} className="w-36" aria-label="Status">
            {["pending", "approved", "rejected", "returned", "cancelled", "all"].map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
          <Select name="type" defaultValue={type} className="w-48" aria-label="Leave type">
            <option value="">All leave types</option>
            {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select name="dept" defaultValue={dept} className="w-48" aria-label="Department">
            <option value="">All departments</option>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input type="date" name="from" defaultValue={from} className="w-40" aria-label="From" />
          <Input type="date" name="to" defaultValue={to} className="w-40" aria-label="To" />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No requests match these filters" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/hr/employees/${r.employees?.id}?tab=leave`} className="font-medium text-brand hover:underline">
                      {r.employees?.last_name}, {r.employees?.first_name}
                    </Link>
                    <p className="font-mono text-xs text-muted">{r.request_no}</p>
                  </Td>
                  <Td>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.leave_types?.color }} />
                    {r.leave_types?.name}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDateRange(r.start_date, r.end_date)}
                    {r.day_portion !== "full" && ` (${r.day_portion.toUpperCase()})`}
                    {r.attachment_path && (
                      <a href={`/api/files?path=${encodeURIComponent(r.attachment_path)}`} target="_blank" rel="noreferrer" className="ml-2 text-xs text-brand hover:underline">
                        attachment
                      </a>
                    )}
                    {r.reason && <p className="max-w-64 truncate text-xs text-muted" title={r.reason}>{r.reason}</p>}
                  </Td>
                  <Td className="text-right">{formatDays(r.days)}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.submitted_at)}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="text-right">
                    {canCancel && ["pending", "approved", "returned"].includes(r.status) && (
                      <CancelLeaveButton id={r.id} action={hrCancelLeave} askReason />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
