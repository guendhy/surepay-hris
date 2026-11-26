import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { humanize } from "@/lib/format";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { createFlow, toggleFlow } from "./actions";

export const metadata: Metadata = { title: "Approval flows" };

export default async function ApprovalFlowsPage() {
  await requirePermission("approvals.configure");
  const supabase = await createClient();
  const [{ data: flows }, { data: types }, { data: depts }, { data: roles }] = await Promise.all([
    supabase.from("approval_flows").select("id, name, request_type, leave_type_id, department_id, is_active, approval_flow_steps(step_order, approver_kind, role_code, escalate_after_days)").order("created_at"),
    supabase.from("leave_types").select("id, name").order("sort_order"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("roles").select("code, name").order("name"),
  ]);
  type Flow = {
    id: string;
    name: string;
    leave_type_id: string | null;
    department_id: string | null;
    is_active: boolean;
    approval_flow_steps: { step_order: number; approver_kind: string; role_code: string | null; escalate_after_days: number }[];
  };
  const typeName = (id: string | null) => (id ? types?.find((t) => t.id === id)?.name : null);
  const deptName = (id: string | null) => (id ? depts?.find((d) => d.id === id)?.name : null);

  return (
    <>
      <PageHeader
        title="Approval flows"
        description="The most specific active flow wins: leave type + department, then leave type, then department, then the default. Steps with nobody to resolve are skipped; if no one resolves, HR managers receive the request."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {((flows ?? []) as Flow[]).map((f) => (
            <Card key={f.id}>
              <CardHeader
                title={f.name}
                description={[typeName(f.leave_type_id) ?? "All leave types", deptName(f.department_id) ?? "all departments"].join(" · ")}
                action={
                  <div className="flex items-center gap-2">
                    {f.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                    <form action={toggleFlow}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="is_active" value={String(!f.is_active)} />
                      <Button size="sm" variant="ghost" type="submit">{f.is_active ? "Deactivate" : "Activate"}</Button>
                    </form>
                  </div>
                }
              />
              <CardBody>
                <ol className="flex flex-wrap items-center gap-2 text-sm">
                  {f.approval_flow_steps.sort((a, b) => a.step_order - b.step_order).map((s, i) => (
                    <li key={s.step_order} className="flex items-center gap-2">
                      {i > 0 && <span className="text-muted">→</span>}
                      <span className="rounded-md border border-border px-2.5 py-1">
                        {s.step_order}. {s.approver_kind === "role" ? roles?.find((r) => r.code === s.role_code)?.name : humanize(s.approver_kind)}
                        <span className="ml-1 text-xs text-muted">({s.escalate_after_days ? `escalates after ${s.escalate_after_days}d` : "no escalation"})</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          ))}
        </div>
        <Card className="self-start">
          <CardHeader title="New flow" />
          <CardBody>
            <ActionForm action={createFlow} submitLabel="Create flow" resetOnSuccess>
              <Field label="Name" htmlFor="name" name="name" required><Input id="name" name="name" placeholder="e.g. Maternity leave — HR review" required /></Field>
              <Field label="Leave type" htmlFor="leave_type_id" name="leave_type_id">
                <Select id="leave_type_id" name="leave_type_id" defaultValue="">
                  <option value="">All leave types</option>
                  {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Department" htmlFor="department_id" name="department_id">
                <Select id="department_id" name="department_id" defaultValue="">
                  <option value="">All departments</option>
                  {(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              {[1, 2, 3].map((i) => (
                <fieldset key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
                  <legend className="px-1 text-xs font-medium text-muted">Step {i}{i > 1 ? " (optional)" : ""}</legend>
                  <Select name={`step${i}_kind`} defaultValue={i === 1 ? "supervisor" : ""} aria-label={`Step ${i} approver`}>
                    <option value="">—</option>
                    <option value="supervisor">Immediate supervisor</option>
                    <option value="department_head">Department head</option>
                    <option value="role">Everyone with a role</option>
                  </Select>
                  <Select name={`step${i}_role`} defaultValue="" aria-label={`Step ${i} role`}>
                    <option value="">(role)</option>
                    {(roles ?? []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </Select>
                  <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
                    Escalate to HR after
                    <Input name={`step${i}_escalate`} type="number" min={0} max={30} defaultValue={2} className="h-8 w-16" />
                    working days (0 = never)
                  </label>
                </fieldset>
              ))}
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
