import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Button, Card, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit-log">) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const table = typeof sp.table === "string" ? sp.table : "";
  const action = typeof sp.action === "string" ? sp.action : "";
  const record = typeof sp.record === "string" ? sp.record.trim() : "";
  const before = typeof sp.before === "string" ? sp.before : "";

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, occurred_at, actor_user_id, action, table_name, record_id, old_data, new_data, context")
    .order("id", { ascending: false })
    .limit(PAGE);
  if (table) query = query.eq("table_name", table);
  if (action) query = query.ilike("action", `${action}%`);
  if (record) query = query.eq("record_id", record);
  if (before && /^\d+$/.test(before)) query = query.lt("id", Number(before));

  const [{ data }, { data: profiles }] = await Promise.all([query, supabase.from("profiles").select("id, email")]);
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const rows = data ?? [];
  const last = rows.at(-1)?.id;

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of data changes and security events. Nobody — including administrators — can edit or delete entries." />
      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <Select name="table" defaultValue={table} className="w-56" aria-label="Table">
            <option value="">All tables / events</option>
            {["employees", "employee_government_ids", "employee_compensation", "salary_histories", "leave_requests", "leave_ledger_entries", "leave_types", "approval_tasks", "user_roles", "profiles", "holidays", "app_settings"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select name="action" defaultValue={action} className="w-44" aria-label="Action">
            <option value="">Any action</option>
            <option value="insert">insert</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
            <option value="auth.">auth.* (sign-in)</option>
            <option value="mfa.">mfa.*</option>
            <option value="view.">view.* (sensitive)</option>
            <option value="export.">export.*</option>
            <option value="file.">file.*</option>
            <option value="admin.">admin.*</option>
          </Select>
          <Input name="record" defaultValue={record} placeholder="Record ID" className="w-72" aria-label="Record ID" />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No entries" /> : (
          <Table>
            <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th><Th>Change</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(r.occurred_at)}</Td>
                  <Td className="text-xs">{r.actor_user_id ? emailById.get(r.actor_user_id) ?? r.actor_user_id.slice(0, 8) : "system"}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td className="font-mono text-xs">{r.table_name ? `${r.table_name}` : ""}<br /><span className="text-muted">{r.record_id?.slice(0, 8)}</span></Td>
                  <Td>
                    <details className="max-w-xl text-xs">
                      <summary className="cursor-pointer text-brand">{summarise(r.old_data, r.new_data, r.context)}</summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-muted p-2 font-mono text-[11px] text-foreground">
                        {JSON.stringify({ before: r.old_data, after: r.new_data, context: r.context }, null, 2)}
                      </pre>
                    </details>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {rows.length === PAGE && last && (
        <div className="mt-4 flex justify-end">
          <LinkButton variant="secondary" size="sm" href={`?${new URLSearchParams({ table, action, record, before: String(last) })}`}>Older entries</LinkButton>
        </div>
      )}
    </>
  );
}

function summarise(oldData: unknown, newData: unknown, context: unknown): string {
  const keys = Object.keys((newData as Record<string, unknown>) ?? (oldData as Record<string, unknown>) ?? {});
  if (keys.length) return keys.filter((k) => !k.endsWith("_at")).slice(0, 4).join(", ") + (keys.length > 4 ? "…" : "");
  if (context && Object.keys(context as object).length) return "details";
  return "—";
}
