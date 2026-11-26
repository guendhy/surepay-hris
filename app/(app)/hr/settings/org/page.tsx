import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getOrgOptions } from "@/lib/data/options";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, TabLinks, Table, Td, Th } from "@/components/ui/primitives";
import { saveOrgItem, toggleOrgItem } from "./actions";

export const metadata: Metadata = { title: "Organisation" };

function ToggleActive({ table, id, active }: { table: string; id: string; active: boolean }) {
  return (
    <form action={toggleOrgItem}>
      <input type="hidden" name="_table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="is_active" value={String(!active)} />
      <Button size="sm" variant="ghost" type="submit">{active ? "Deactivate" : "Activate"}</Button>
    </form>
  );
}

export default async function OrgSettingsPage({ searchParams }: PageProps<"/hr/settings/org">) {
  await requirePermission("org.manage");
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "departments";
  const o = await getOrgOptions();
  const deptName = (id: string | null) => o.departments.find((d) => d.id === id)?.name ?? "—";
  const personName = (id: string | null) => o.people.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <>
      <PageHeader title="Organisation" description="Departments drive second-level approvals (department head). Positions and job levels appear on 201 records." />
      <TabLinks
        active={tab}
        tabs={[
          { key: "departments", label: "Departments", href: "?tab=departments" },
          { key: "positions", label: "Positions", href: "?tab=positions" },
          { key: "levels", label: "Job levels", href: "?tab=levels" },
          { key: "locations", label: "Locations", href: "?tab=locations" },
        ]}
      />

      {tab === "departments" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {o.departments.length === 0 ? <EmptyState title="No departments yet" /> : (
              <Table>
                <thead><tr><Th>Code</Th><Th>Name</Th><Th>Head</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {o.departments.map((d) => (
                    <tr key={d.id}>
                      <Td className="font-mono text-xs">{d.code}</Td>
                      <Td>{d.name}</Td>
                      <Td>{personName(d.head_employee_id)}</Td>
                      <Td>{d.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td className="text-right"><ToggleActive table="departments" id={d.id} active={d.is_active} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="self-start">
            <CardHeader title="Add department" description="The department head approves the second step of leave requests." />
            <CardBody>
              <ActionForm action={saveOrgItem} submitLabel="Add department" resetOnSuccess>
                <input type="hidden" name="_table" value="departments" />
                <Field label="Code" htmlFor="code" name="code" required><Input id="code" name="code" placeholder="ENG" required /></Field>
                <Field label="Name" htmlFor="name" name="name" required><Input id="name" name="name" required /></Field>
                <Field label="Department head" htmlFor="head_employee_id" name="head_employee_id">
                  <Select id="head_employee_id" name="head_employee_id" defaultValue="">
                    <option value="">—</option>
                    {o.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </Select>
                </Field>
                <Field label="Cost centre" htmlFor="cost_center" name="cost_center"><Input id="cost_center" name="cost_center" /></Field>
              </ActionForm>
            </CardBody>
          </Card>
          {o.departments.length > 0 && (
            <Card className="lg:col-span-3">
              <CardHeader title="Change a department head" />
              <CardBody>
                <ActionForm action={saveOrgItem} submitLabel="Update department">
                  <input type="hidden" name="_table" value="departments" />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Department" htmlFor="edit-id" name="id">
                      <Select id="edit-id" name="id" required>
                        {o.departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Code" htmlFor="edit-code" name="code" required hint="Re-enter the code"><Input id="edit-code" name="code" required /></Field>
                    <Field label="Name" htmlFor="edit-name" name="name" required><Input id="edit-name" name="name" required /></Field>
                    <Field label="Head" htmlFor="edit-head" name="head_employee_id">
                      <Select id="edit-head" name="head_employee_id" defaultValue="">
                        <option value="">—</option>
                        {o.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                      </Select>
                    </Field>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === "positions" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {o.positions.length === 0 ? <EmptyState title="No positions yet" /> : (
              <Table>
                <thead><tr><Th>Title</Th><Th>Department</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {o.positions.map((p) => (
                    <tr key={p.id}>
                      <Td>{p.title}</Td>
                      <Td>{deptName(p.department_id)}</Td>
                      <Td>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td className="text-right"><ToggleActive table="positions" id={p.id} active={p.is_active} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="self-start">
            <CardHeader title="Add position" />
            <CardBody>
              <ActionForm action={saveOrgItem} submitLabel="Add position" resetOnSuccess>
                <input type="hidden" name="_table" value="positions" />
                <Field label="Title" htmlFor="title" name="title" required><Input id="title" name="title" required /></Field>
                <Field label="Department" htmlFor="department_id" name="department_id">
                  <Select id="department_id" name="department_id" defaultValue="">
                    <option value="">—</option>
                    {o.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <Field label="Job level" htmlFor="job_level_id" name="job_level_id">
                  <Select id="job_level_id" name="job_level_id" defaultValue="">
                    <option value="">—</option>
                    {o.jobLevels.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
                  </Select>
                </Field>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "levels" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {o.jobLevels.length === 0 ? <EmptyState title="No job levels yet" /> : (
              <Table>
                <thead><tr><Th>Code</Th><Th>Name</Th><Th className="text-right">Rank</Th></tr></thead>
                <tbody>
                  {o.jobLevels.map((j) => (
                    <tr key={j.id}><Td className="font-mono text-xs">{j.code}</Td><Td>{j.name}</Td><Td className="text-right">{j.rank}</Td></tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="self-start">
            <CardHeader title="Add job level" description="Salary bands are visible only to people who can see compensation." />
            <CardBody>
              <ActionForm action={saveOrgItem} submitLabel="Add job level" resetOnSuccess>
                <input type="hidden" name="_table" value="job_levels" />
                <Field label="Code" htmlFor="lv-code" name="code" required><Input id="lv-code" name="code" placeholder="L3" required /></Field>
                <Field label="Name" htmlFor="lv-name" name="name" required><Input id="lv-name" name="name" placeholder="Senior" required /></Field>
                <Field label="Rank" htmlFor="rank" name="rank" required><Input id="rank" name="rank" type="number" min={0} defaultValue={0} required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min (₱)" htmlFor="salary_min" name="salary_min"><Input id="salary_min" name="salary_min" inputMode="decimal" /></Field>
                  <Field label="Max (₱)" htmlFor="salary_max" name="salary_max"><Input id="salary_max" name="salary_max" inputMode="decimal" /></Field>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "locations" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {o.locations.length === 0 ? <EmptyState title="No locations yet" /> : (
              <Table>
                <thead><tr><Th>Name</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {o.locations.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.name}</Td>
                      <Td>{l.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td className="text-right"><ToggleActive table="locations" id={l.id} active={l.is_active} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="self-start">
            <CardHeader title="Add location" description="Local holidays can be set per location." />
            <CardBody>
              <ActionForm action={saveOrgItem} submitLabel="Add location" resetOnSuccess>
                <input type="hidden" name="_table" value="locations" />
                <Field label="Name" htmlFor="loc-name" name="name" required><Input id="loc-name" name="name" placeholder="Head office, Makati" required /></Field>
                <Field label="Address" htmlFor="address" name="address"><Input id="address" name="address" /></Field>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
