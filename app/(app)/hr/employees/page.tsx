import type { Metadata } from "next";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgOptions } from "@/lib/data/options";
import { formatDate, humanize } from "@/lib/format";
import { NavIcon } from "@/components/shell/icons";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Pager,
  Select,
  StatusBadge,
  TabLinks,
  Table,
  Td,
  Th,
  Toolbar,
  buttonClass,
} from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Employees" };

const PAGE_SIZE = 25;
const STATUS_TABS = [
  { key: "current", label: "Current" },
  { key: "probationary", label: "Probationary" },
  { key: "nologin", label: "No login" },
  { key: "separated", label: "Separated" },
  { key: "all", label: "All" },
] as const;

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
  supervisor_id: string | null;
  departments: { name: string } | null;
  positions: { title: string } | null;
};

export default async function EmployeesPage({ searchParams }: PageProps<"/hr/employees">) {
  const session = await requirePermission("employee.view");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const dept = typeof params.dept === "string" ? params.dept : "";
  const status = typeof params.status === "string" ? params.status : "current";
  const sort = params.sort === "newest" ? "newest" : "name";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const supabase = await createClient();
  const options = await getOrgOptions();
  const supervisorName = new Map(options.people.map((p) => [p.id, p.full_name]));

  // Applies search + department to any query; status is applied separately per tab.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (query: any) => {
    let next = query.is("archived_at", null);
    if (q) {
      const term = q.replace(/[%,()*]/g, " ");
      next = next.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,employee_no.ilike.%${term}%,work_email.ilike.%${term}%`);
    }
    if (dept) next = next.eq("department_id", dept);
    return next;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withStatus = (query: any, key: string) => {
    if (key === "current") return query.neq("employment_status", "separated");
    if (key === "probationary") return query.eq("employment_type", "probationary").neq("employment_status", "separated");
    if (key === "nologin") return query.is("user_id", null).neq("employment_status", "separated");
    if (key === "separated") return query.eq("employment_status", "separated");
    if (key === "all") return query;
    return query.eq("employment_status", key); // legacy: active, on_leave, suspended
  };
  const countFor = (key: string) => withStatus(scoped(supabase.from("employees").select("id", { count: "exact", head: true })), key);

  let listQuery = withStatus(
    scoped(
      supabase
        .from("employees")
        .select("id, employee_no, first_name, last_name, work_email, employment_type, employment_status, date_hired, user_id, supervisor_id, departments(name), positions(title)", {
          count: "exact",
        }),
    ),
    status,
  );
  listQuery = sort === "newest" ? listQuery.order("date_hired", { ascending: false }) : listQuery.order("last_name").order("first_name");
  listQuery = listQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [list, ...tabCounts] = await Promise.all([listQuery, ...STATUS_TABS.map((t) => countFor(t.key))]);
  const rows = (list.data ?? []) as unknown as Row[];
  const total = list.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentTotal = tabCounts[0].count ?? 0;
  const separatedTotal = tabCounts[3].count ?? 0;

  const href = (overrides: Record<string, string>) => {
    const next = { q, dept, status, sort, ...overrides };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "status" && v === "current") && !(k === "sort" && v === "name")) usp.set(k, v);
    const s = usp.toString();
    return `/hr/employees${s ? `?${s}` : ""}`;
  };
  const deptName = options.departments.find((d) => d.id === dept)?.name;
  const statusBadge = (r: Row) =>
    r.employment_status === "separated" ? (
      <StatusBadge status="separated" />
    ) : r.employment_type === "probationary" ? (
      <Badge tone="warning">Probation</Badge>
    ) : r.employment_status === "active" ? (
      <StatusBadge status="active" />
    ) : (
      <StatusBadge status={r.employment_status} />
    );

  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, pages) }, (_, i) => windowStart + i);

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${currentTotal} current employee${currentTotal === 1 ? "" : "s"} · ${separatedTotal} separated`}
        actions={
          can(session, "employee.manage") ? (
            <LinkButton href="/hr/employees/new">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add employee
            </LinkButton>
          ) : undefined
        }
      />

      <Card>
        <TabLinks
          className="mb-0 px-4"
          active={STATUS_TABS.some((t) => t.key === status) ? status : "all"}
          tabs={STATUS_TABS.map((t, i) => ({ key: t.key, label: t.label, href: href({ status: t.key, page: "" }), count: t.key === "all" ? undefined : (tabCounts[i].count ?? 0) }))}
        />
        <form>
          <input type="hidden" name="status" value={status} />
          <Toolbar>
            <div className="relative min-w-0 flex-[1_1_260px] sm:max-w-[360px]">
              <NavIcon name="search" className="pointer-events-none absolute left-3 top-[9px] size-[18px] text-subtle" />
              <label htmlFor="q" className="sr-only">
                Search employees
              </label>
              <Input id="q" name="q" defaultValue={q} placeholder="Search name, employee no. or email" className="h-9 pl-9" />
            </div>
            <Select name="dept" defaultValue={dept} className="h-9 w-auto min-w-40" aria-label="Department">
              <option value="">All departments</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select name="sort" defaultValue={sort} className="h-9 w-auto" aria-label="Sort by">
              <option value="name">Last name A–Z</option>
              <option value="newest">Newest hire</option>
            </Select>
            <Button type="submit" variant="secondary" size="sm" className="h-9">
              Apply
            </Button>
          </Toolbar>
        </form>
        {(q || dept) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-subtle px-4 py-2">
            {dept && (
              <Link href={href({ dept: "", page: "" })} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#cdd3cb] bg-surface pl-2.5 pr-1.5 text-xs font-medium text-foreground no-underline dark:border-border">
                Department: {deptName}
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-muted" aria-label="Remove department filter">
                  ×
                </span>
              </Link>
            )}
            {q && (
              <Link href={href({ q: "", page: "" })} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#cdd3cb] bg-surface pl-2.5 pr-1.5 text-xs font-medium text-foreground no-underline dark:border-border">
                Search: “{q}”
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-muted" aria-label="Clear search">
                  ×
                </span>
              </Link>
            )}
            <Link href={href({ q: "", dept: "", page: "" })} className={buttonClass("ghost", "sm")}>
              Clear all
            </Link>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState title="No employees found" icon={<NavIcon name="users" />}>
            {q || dept ? "Try a different search or clear the filters." : can(session, "employee.manage") ? "Add your first employee to get started." : null}
          </EmptyState>
        ) : (
          <>
            {/* Phone: cards */}
            <ul className="flex flex-col gap-2 p-3 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/hr/employees/${r.id}`} className="flex min-h-16 items-center gap-3 rounded-[10px] border border-border px-3 py-3 text-foreground no-underline">
                    <Avatar name={`${r.first_name} ${r.last_name}`} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">
                        {r.first_name} {r.last_name}
                      </b>
                      <span className="block truncate text-xs text-muted">
                        {r.positions?.title ?? "No position"} · {r.departments?.name ?? "—"}
                      </span>
                    </span>
                    {statusBadge(r)}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Tablet & desktop: table */}
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th aria-sort={sort === "name" ? "ascending" : undefined}>
                      <Link href={href({ sort: "name", page: "" })} className="text-muted no-underline hover:text-foreground">
                        Employee {sort === "name" && "↓"}
                      </Link>
                    </Th>
                    <Th>Position</Th>
                    <Th className="hidden xl:table-cell">Supervisor</Th>
                    <Th className="hidden xl:table-cell">Type</Th>
                    <Th className="hidden lg:table-cell" aria-sort={sort === "newest" ? "descending" : undefined}>
                      <Link href={href({ sort: "newest", page: "" })} className="text-muted no-underline hover:text-foreground">
                        Hired {sort === "newest" && "↓"}
                      </Link>
                    </Th>
                    <Th>Status</Th>
                    <Th className="w-14">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const name = `${r.last_name}, ${r.first_name}`;
                    return (
                      <tr key={r.id} className="hover:[&>td]:bg-surface-subtle">
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={`${r.first_name} ${r.last_name}`} />
                            <div className="min-w-0">
                              <Link href={`/hr/employees/${r.id}`} className="font-semibold text-foreground no-underline hover:text-brand-strong hover:underline">
                                {name}
                              </Link>
                              <p className="truncate text-xs text-muted">
                                {r.employee_no} · {r.work_email}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          {r.positions?.title ?? "—"}
                          <p className="text-xs text-muted">{r.departments?.name ?? ""}</p>
                        </Td>
                        <Td className="hidden xl:table-cell">{r.supervisor_id ? supervisorName.get(r.supervisor_id) ?? "—" : "—"}</Td>
                        <Td className="hidden xl:table-cell">{humanize(r.employment_type)}</Td>
                        <Td className="hidden whitespace-nowrap lg:table-cell">{formatDate(r.date_hired)}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {statusBadge(r)}
                            {!r.user_id && r.employment_status !== "separated" && <Badge tone="neutral">No login</Badge>}
                          </div>
                        </Td>
                        <Td className="text-right">
                          <details className="relative inline-block text-left">
                            <summary
                              className="inline-flex size-10 cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] hover:bg-surface-muted [&::-webkit-details-marker]:hidden"
                              aria-label={`Actions for ${name}`}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5">
                                <circle cx="12" cy="5" r="1" />
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="12" cy="19" r="1" />
                              </svg>
                            </summary>
                            <div className="absolute right-0 z-20 mt-1 flex w-52 flex-col rounded-[10px] border border-border bg-surface p-1.5 shadow-[var(--shadow-menu)]" role="menu">
                              <Link role="menuitem" href={`/hr/employees/${r.id}`} className="flex min-h-9 items-center rounded-md px-3 text-sm text-foreground no-underline hover:bg-background">
                                Open 201 record
                              </Link>
                              <Link role="menuitem" href={`/hr/employees/${r.id}?tab=documents`} className="flex min-h-9 items-center rounded-md px-3 text-sm text-foreground no-underline hover:bg-background">
                                Documents
                              </Link>
                              {can(session, "leave.view_all") && (
                                <Link role="menuitem" href={`/hr/employees/${r.id}?tab=leave`} className="flex min-h-9 items-center rounded-md px-3 text-sm text-foreground no-underline hover:bg-background">
                                  Leave
                                </Link>
                              )}
                              {!r.user_id && can(session, "employee.invite") && (
                                <Link role="menuitem" href={`/hr/employees/${r.id}`} className="flex min-h-9 items-center rounded-md px-3 text-sm text-foreground no-underline hover:bg-background">
                                  Invite to sign in
                                </Link>
                              )}
                            </div>
                          </details>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}

        <Pager summary={total === 0 ? "No results" : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}>
          {pages > 1 && (
            <nav className="flex gap-1" aria-label="Pagination">
              <Link
                href={href({ page: String(Math.max(1, page - 1)) })}
                aria-disabled={page === 1}
                className={cn(buttonClass("secondary", "sm"), "min-w-8 px-2", page === 1 && "pointer-events-none opacity-50")}
                aria-label="Previous page"
              >
                ‹
              </Link>
              {pageNumbers.map((n) => (
                <Link
                  key={n}
                  href={href({ page: String(n) })}
                  aria-current={n === page ? "page" : undefined}
                  className={cn(buttonClass(n === page ? "primary" : "secondary", "sm"), "min-w-8 px-2")}
                >
                  {n}
                </Link>
              ))}
              <Link
                href={href({ page: String(Math.min(pages, page + 1)) })}
                aria-disabled={page === pages}
                className={cn(buttonClass("secondary", "sm"), "min-w-8 px-2", page === pages && "pointer-events-none opacity-50")}
                aria-label="Next page"
              >
                ›
              </Link>
            </nav>
          )}
        </Pager>
      </Card>
    </>
  );
}
