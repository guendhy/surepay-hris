import type { Metadata } from "next";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth/session";
import { getOrgOptions } from "@/lib/data/options";
import { getBalanceReport } from "@/lib/data/leave-report";
import { formatDays } from "@/lib/format";
import { ActionForm } from "@/components/ui/action-form";
import { Button, Card, EmptyState, PageHeader, Select, Table, Td, Th, buttonClass } from "@/components/ui/primitives";
import { runAccrualsNow } from "../actions";

export const metadata: Metadata = { title: "Leave balances" };

export default async function BalancesPage({ searchParams }: PageProps<"/hr/leave/balances">) {
  const session = await requirePermission("leave.view_all");
  const sp = await searchParams;
  const dept = typeof sp.dept === "string" ? sp.dept : "";
  const [options, report] = await Promise.all([getOrgOptions(), getBalanceReport(dept || undefined)]);

  return (
    <>
      <PageHeader
        title="Leave balances"
        description="Available days (balance minus pending requests) per employee. Accruals run automatically every night."
        actions={
          <>
            {can(session, "reports.export") && (
              <a className={buttonClass("secondary")} href={`/api/reports/leave-balances${dept ? `?dept=${dept}` : ""}`}>
                Export to Excel
              </a>
            )}
            {can(session, "leave.configure") && (
              <ActionForm action={runAccrualsNow} submitLabel="Run accruals now" submitVariant="secondary" className="gap-2">
                {null}
              </ActionForm>
            )}
          </>
        }
      />
      <Card className="mb-4 px-4 py-3">
        <form className="flex items-end gap-3">
          <Select name="dept" defaultValue={dept} className="w-56" aria-label="Department">
            <option value="">All departments</option>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>
      <Card>
        {report.rows.length === 0 ? (
          <EmptyState title="No employees" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Department</Th>
                {report.types.map((t) => <Th key={t.id} className="text-right">{t.code}</Th>)}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.employeeId}>
                  <Td>
                    <Link href={`/hr/employees/${r.employeeId}?tab=leave`} className="text-brand hover:underline">{r.name}</Link>
                    <p className="text-xs text-muted">{r.employeeNo}</p>
                  </Td>
                  <Td className="text-muted">{r.department}</Td>
                  {report.types.map((t) => {
                    const b = r.balances[t.id];
                    return (
                      <Td key={t.id} className={`text-right ${b && b.available < 0 ? "text-danger" : ""}`} title={b ? `Balance ${formatDays(b.balance)}, pending ${formatDays(b.pending)}` : undefined}>
                        {formatDays(b?.available ?? 0)}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Codes: {report.types.map((t) => `${t.code} = ${t.name}`).join(" · ")}</p>
    </>
  );
}
