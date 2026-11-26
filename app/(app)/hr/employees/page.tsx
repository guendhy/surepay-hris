import type { Metadata } from "next";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgOptions } from "@/lib/data/options";
import { formatDate, humanize } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Employees" };

const PAGE_SIZE = 50;

export default async function EmployeesPage({ searchParams }: PageProps<"/hr/employees">) {
  const session = await requirePermission("employee.view");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const dept = typeof params.dept === "string" ? params.dept : "";
  const status = typeof params.status === "string" ? params.status : "current";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const supabase = await createClient();
  const options = await getOrgOptions();

  let query = supabase
    .from("employees")
    .select("id, employee_no, first_name, last_name, work_email, employment_type, employment_status, date_hired, user_id, departments(name), positions(title)", { count: "exact" })
    .is("archived_at", null)
    .order("last_name")
    .order("first_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    // Escape PostgREST "or" syntax characters in the search term.
    const term = q.replace(/[%,()*]/g, " ");
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,employee_no.ilike.%${term}%,work_email.ilike.%${term}%`);
  }
  if (dept) query = query.eq("department_id", dept);
  if (status === "current") query = query.neq("employment_status", "separated");
  else if (status !== "all") query = query.eq("employment_status", status);

  const { data, count } = await query;
  type Row = {
    id: string;
    employee_no: string;
    first_name: string;
    last_name: string;
    work_email: string;
    employment_type: string;
    employment_status: string;
    date_hired: string;
    user_id: string | null;
    departments: { name: string } | null;
    positions: { title: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => `?${new URLSearchParams({ q, dept, status, page: String(p) }).toString()}`;

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${total} employee record${total === 1 ? "" : "s"}`}
        actions={can(session, "employee.manage") ? <LinkButton href="/hr/employees/new">Add employee</LinkButton> : undefined}
      />

      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3" role="search">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="sr-only">Search</label>
            <Input id="q" name="q" defaultValue={q} placeholder="Search name, employee no. or email" />
          </div>
          <Select name="dept" defaultValue={dept} className="w-48" aria-label="Department">
            <option value="">All departments</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={status} className="w-40" aria-label="Status">
            <option value="current">Current</option>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="suspended">Suspended</option>
            <option value="separated">Separated</option>
            <option value="all">All</option>
          </Select>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No employees found">
            {can(session, "employee.manage") ? "Add your first employee to get started." : "Try a different search."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Position</Th>
                <Th>Department</Th>
                <Th>Type</Th>
                <Th>Hired</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/50">
                  <Td>
                    <Link href={`/hr/employees/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.last_name}, {r.first_name}
                    </Link>
                    <p className="text-xs text-muted">
                      {r.employee_no} · {r.work_email}
                      {!r.user_id && <Badge className="ml-2">No login</Badge>}
                    </p>
                  </Td>
                  <Td>{r.positions?.title ?? "—"}</Td>
                  <Td>{r.departments?.name ?? "—"}</Td>
                  <Td>{humanize(r.employment_type)}</Td>
                  <Td className="whitespace-nowrap">{formatDate(r.date_hired)}</Td>
                  <Td>
                    <StatusBadge status={r.employment_status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
          {page > 1 && <LinkButton variant="secondary" size="sm" href={qs(page - 1)}>Previous</LinkButton>}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && <LinkButton variant="secondary" size="sm" href={qs(page + 1)}>Next</LinkButton>}
        </nav>
      )}
    </>
  );
}
