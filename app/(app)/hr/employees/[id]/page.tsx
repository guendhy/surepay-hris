import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgOptions } from "@/lib/data/options";
import { formatDate, formatDateRange, formatDateTime, formatDays, formatPeso, fullName, humanize, masked, todayManila } from "@/lib/format";
import type { Employee, LeaveBalance, LeaveType } from "@/lib/types";
import { ActionForm } from "@/components/ui/action-form";
import { BalanceCards } from "@/components/leave/balance-cards";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  TabLinks,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { EmployeeFields } from "../employee-fields";
import { RevealId } from "./reveal-id";
import { OneTimeLinkForm } from "@/components/auth/one-time-link-form";
import { authEmailsEnabled } from "@/lib/env";
import {
  adjustBalance,
  archiveDocument,
  createPasswordLink,
  inviteEmployee,
  saveCompensation,
  saveGovernmentIds,
  updateEmployee,
  uploadDocument,
} from "../actions";

export const metadata: Metadata = { title: "Employee" };

const DOCUMENT_TYPES = [
  "Employment contract",
  "Resume / CV",
  "NBI / Police clearance",
  "Medical certificate",
  "Diploma / Transcript",
  "Government form",
  "NDA",
  "ISMS policy acknowledgement",
  "Solo Parent ID",
  "Other",
];

export default async function EmployeePage({ params, searchParams }: PageProps<"/hr/employees/[id]">) {
  const session = await requirePermission("employee.view");
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "profile";
  const supabase = await createClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("*, departments(name), positions(title)")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();
  const e = emp as Employee & { departments: { name: string } | null; positions: { title: string } | null };

  const canSensitive = can(session, "employee.view_sensitive");
  const canComp = can(session, "employee.view_compensation");
  const tabs = [
    { key: "profile", label: "201 profile", href: `?tab=profile` },
    ...(canSensitive || canComp ? [{ key: "ids", label: "IDs & pay", href: `?tab=ids` }] : []),
    { key: "documents", label: "Documents", href: `?tab=documents` },
    ...(can(session, "leave.view_all") ? [{ key: "leave", label: "Leave", href: `?tab=leave` }] : []),
    { key: "history", label: "History", href: `?tab=history` },
  ];

  return (
    <>
      <PageHeader
        title={fullName(e)}
        description={`${e.employee_no} · ${e.positions?.title ?? "No position"} · ${e.departments?.name ?? "No department"}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={e.employment_status} />
            {e.user_id ? <Badge tone="success">Has login</Badge> : <Badge>No login</Badge>}
          </div>
        }
      />
      {sp.created && <Alert tone="success" className="mb-4">Employee created. Add government IDs, compensation and documents below.</Alert>}
      <TabLinks tabs={tabs} active={tab} />

      {tab === "profile" && <ProfileTab employee={e} canManage={can(session, "employee.manage")} canInvite={can(session, "employee.invite")} />}
      {tab === "ids" && (canSensitive || canComp) && (
        <IdsTab employeeId={e.id} canSensitive={canSensitive} canComp={canComp} canManageSensitive={can(session, "employee.manage_sensitive")} canManageComp={can(session, "employee.manage_compensation")} />
      )}
      {tab === "documents" && <DocumentsTab employeeId={e.id} canManage={can(session, "employee.manage")} />}
      {tab === "leave" && can(session, "leave.view_all") && <LeaveTab employeeId={e.id} canAdjust={can(session, "leave.adjust")} />}
      {tab === "history" && <HistoryTab employeeId={e.id} canComp={canComp} />}
    </>
  );
}

async function ProfileTab({ employee, canManage, canInvite }: { employee: Employee; canManage: boolean; canInvite: boolean }) {
  const options = await getOrgOptions();
  const emails = authEmailsEnabled();
  return (
    <div className="flex flex-col gap-6">
      {canInvite && (
        <Card>
          <CardBody className="flex flex-col gap-3">
            {!employee.user_id ? (
              <>
                <p className="text-sm text-muted">
                  This employee cannot sign in yet.{" "}
                  {emails ? (
                    <>Send an invitation to <strong className="text-foreground">{employee.work_email}</strong>.</>
                  ) : (
                    <>Create a one-time invite link and send it to <strong className="text-foreground">{employee.work_email}</strong> yourself — email delivery is not set up yet.</>
                  )}
                </p>
                <OneTimeLinkForm action={inviteEmployee} employeeId={employee.id} label={emails ? "Send invitation" : "Create invite link"} />
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Login: <strong className="text-foreground">{employee.work_email}</strong>. If the employee forgot their password or their invite link expired, create a one-time reset link.
                </p>
                <OneTimeLinkForm action={createPasswordLink} employeeId={employee.id} label="Create password reset link" />
              </>
            )}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody>
          {canManage ? (
            <ActionForm action={updateEmployee} submitLabel="Save changes">
              <input type="hidden" name="id" value={employee.id} />
              <EmployeeFields options={options} employee={employee} />
            </ActionForm>
          ) : (
            <DescriptionList
              items={[
                { label: "Work email", value: employee.work_email },
                { label: "Mobile", value: employee.mobile_number ?? "—" },
                { label: "Birth date", value: formatDate(employee.birth_date) },
                { label: "Employment type", value: humanize(employee.employment_type) },
                { label: "Date hired", value: formatDate(employee.date_hired) },
                { label: "Work set-up", value: humanize(employee.work_setup) },
              ]}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

async function IdsTab({
  employeeId,
  canSensitive,
  canComp,
  canManageSensitive,
  canManageComp,
}: {
  employeeId: string;
  canSensitive: boolean;
  canComp: boolean;
  canManageSensitive: boolean;
  canManageComp: boolean;
}) {
  const supabase = await createClient();
  const [{ data: ids }, { data: comp }] = await Promise.all([
    canSensitive
      ? supabase.from("employee_government_ids").select("tin_last4, sss_last4, philhealth_last4, pagibig_last4, updated_at").eq("employee_id", employeeId).maybeSingle()
      : Promise.resolve({ data: null }),
    canComp
      ? supabase.from("employee_compensation").select("pay_type, basic_salary, effective_date, bank_name, bank_account_last4").eq("employee_id", employeeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  await supabase.rpc("log_event", { p_action: "view.employee_sensitive", p_context: { employee_id: employeeId } });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canSensitive && (
        <Card>
          <CardHeader title="Government IDs" description="Encrypted at rest. Revealing a full number is logged." />
          <CardBody className="flex flex-col gap-6">
            <ul className="flex flex-col gap-3 text-sm">
              {(
                [
                  ["tin", "TIN", ids?.tin_last4],
                  ["sss", "SSS", ids?.sss_last4],
                  ["philhealth", "PhilHealth", ids?.philhealth_last4],
                  ["pagibig", "Pag-IBIG MID", ids?.pagibig_last4],
                ] as const
              ).map(([key, label, last4]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{label}</span>
                  <span className="flex items-center gap-3 font-mono text-foreground">
                    {last4 ? <RevealId employeeId={employeeId} field={key} masked={masked(last4)} /> : <span className="text-muted">Not on file</span>}
                  </span>
                </li>
              ))}
            </ul>
            {canManageSensitive && (
              <ActionForm action={saveGovernmentIds} submitLabel="Save IDs" resetOnSuccess>
                <input type="hidden" name="employee_id" value={employeeId} />
                <p className="text-xs text-muted">Fill in only the IDs you want to add or replace. Separators are ignored.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="TIN" htmlFor="tin" name="tin"><Input id="tin" name="tin" autoComplete="off" placeholder="000-000-000-000" /></Field>
                  <Field label="SSS" htmlFor="sss" name="sss"><Input id="sss" name="sss" autoComplete="off" placeholder="00-0000000-0" /></Field>
                  <Field label="PhilHealth" htmlFor="philhealth" name="philhealth"><Input id="philhealth" name="philhealth" autoComplete="off" placeholder="00-000000000-0" /></Field>
                  <Field label="Pag-IBIG MID" htmlFor="pagibig" name="pagibig"><Input id="pagibig" name="pagibig" autoComplete="off" placeholder="0000-0000-0000" /></Field>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      )}
      {canComp && (
        <Card>
          <CardHeader title="Compensation" description="Every change is recorded in salary history with a reason." />
          <CardBody className="flex flex-col gap-6">
            <DescriptionList
              items={[
                { label: "Basic salary", value: comp ? `${formatPeso(comp.basic_salary)} / ${comp.pay_type === "daily" ? "day" : "month"}` : "Not set" },
                { label: "Effective", value: formatDate(comp?.effective_date) },
                { label: "Payroll account", value: comp?.bank_name ? `${comp.bank_name} ${masked(comp.bank_account_last4)}` : "—" },
              ]}
            />
            {canManageComp && (
              <ActionForm action={saveCompensation} submitLabel="Save compensation">
                <input type="hidden" name="employee_id" value={employeeId} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Pay type" htmlFor="pay_type" name="pay_type" required>
                    <Select id="pay_type" name="pay_type" defaultValue={comp?.pay_type ?? "monthly"}>
                      <option value="monthly">Monthly</option>
                      <option value="daily">Daily</option>
                    </Select>
                  </Field>
                  <Field label="Basic salary (₱)" htmlFor="basic_salary" name="basic_salary" required>
                    <Input id="basic_salary" name="basic_salary" inputMode="decimal" defaultValue={comp?.basic_salary ?? ""} required />
                  </Field>
                  <Field label="Effective date" htmlFor="effective_date" name="effective_date" required>
                    <Input id="effective_date" name="effective_date" type="date" defaultValue={todayManila()} required />
                  </Field>
                  <Field label="Reason" htmlFor="reason" name="reason" required>
                    <Input id="reason" name="reason" placeholder="e.g. Regularisation adjustment" required />
                  </Field>
                  <Field label="Bank" htmlFor="bank_name" name="bank_name">
                    <Input id="bank_name" name="bank_name" defaultValue={comp?.bank_name ?? ""} />
                  </Field>
                  <Field label="Account number" htmlFor="bank_account" name="bank_account" hint="Leave blank to keep the current one.">
                    <Input id="bank_account" name="bank_account" autoComplete="off" />
                  </Field>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

async function DocumentsTab({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_documents")
    .select("id, document_type, title, file_name, expires_on, storage_path, created_at")
    .eq("employee_id", employeeId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const today = todayManila();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="201 documents" />
        {(data ?? []).length === 0 ? (
          <EmptyState title="No documents uploaded" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Type</Th>
                <Th>Expires</Th>
                <Th>Uploaded</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((d) => (
                <tr key={d.id}>
                  <Td>
                    <a href={`/api/files?path=${encodeURIComponent(d.storage_path)}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {d.title}
                    </a>
                    <p className="text-xs text-muted">{d.file_name}</p>
                  </Td>
                  <Td>{d.document_type}</Td>
                  <Td className={d.expires_on && d.expires_on < today ? "text-danger" : ""}>{formatDate(d.expires_on)}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(d.created_at)}</Td>
                  <Td className="text-right">
                    {canManage && (
                      <form action={archiveDocument}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="employee_id" value={employeeId} />
                        <Button size="sm" variant="ghost" type="submit">Archive</Button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {canManage && (
        <Card className="self-start">
          <CardHeader title="Upload document" />
          <CardBody>
            <ActionForm action={uploadDocument} submitLabel="Upload" resetOnSuccess>
              <input type="hidden" name="employee_id" value={employeeId} />
              <Field label="Type" htmlFor="document_type" name="document_type" required>
                <Select id="document_type" name="document_type" required>
                  {DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Title" htmlFor="title" name="title" required>
                <Input id="title" name="title" required />
              </Field>
              <Field label="Expires on" htmlFor="expires_on" name="expires_on" hint="For clearances, IDs, certificates.">
                <Input id="expires_on" name="expires_on" type="date" />
              </Field>
              <Field label="File" htmlFor="file" name="file" required hint="PDF, JPG, PNG or DOCX, up to 10 MB.">
                <Input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="py-2" required />
              </Field>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

async function LeaveTab({ employeeId, canAdjust }: { employeeId: string; canAdjust: boolean }) {
  const supabase = await createClient();
  const [types, balances, ledger, requests] = await Promise.all([
    supabase.from("leave_types").select("*").order("sort_order"),
    supabase.from("leave_balances").select("*").eq("employee_id", employeeId),
    supabase.from("leave_ledger_entries").select("id, leave_type_id, entry_type, days, effective_date, reason, created_at").eq("employee_id", employeeId).order("effective_date", { ascending: false }).limit(100),
    supabase.from("leave_requests").select("id, request_no, leave_type_id, start_date, end_date, days, status").eq("employee_id", employeeId).order("start_date", { ascending: false }).limit(50),
  ]);
  const leaveTypes = (types.data ?? []) as LeaveType[];
  const typeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <BalanceCards types={leaveTypes.filter((t) => t.is_active)} balances={(balances.data ?? []) as LeaveBalance[]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Ledger" description="Latest 100 entries" />
          {(ledger.data ?? []).length === 0 ? (
            <EmptyState title="No entries yet" />
          ) : (
            <Table>
              <thead>
                <tr><Th>Date</Th><Th>Type</Th><Th>Entry</Th><Th className="text-right">Days</Th><Th>Note</Th></tr>
              </thead>
              <tbody>
                {(ledger.data ?? []).map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap">{formatDate(l.effective_date)}</Td>
                    <Td>{typeName(l.leave_type_id)}</Td>
                    <Td className="capitalize">{String(l.entry_type).replace(/_/g, " ")}</Td>
                    <Td className={`text-right ${Number(l.days) < 0 ? "text-danger" : "text-success"}`}>{Number(l.days) > 0 ? "+" : ""}{formatDays(l.days)}</Td>
                    <Td className="text-muted">{l.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          {canAdjust && (
            <Card>
              <CardHeader title="Adjust balance" description="Opening balances at go-live, or corrections." />
              <CardBody>
                <ActionForm action={adjustBalance} submitLabel="Post adjustment" resetOnSuccess>
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <Field label="Leave type" htmlFor="leave_type_id" name="leave_type_id" required>
                    <Select id="leave_type_id" name="leave_type_id" required>
                      {leaveTypes.filter((t) => t.balance_tracked).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Entry" htmlFor="entry_type" name="entry_type">
                    <Select id="entry_type" name="entry_type" defaultValue="adjustment">
                      <option value="adjustment">Adjustment</option>
                      <option value="opening_balance">Opening balance</option>
                    </Select>
                  </Field>
                  <Field label="Days" htmlFor="days" name="days" required hint="Negative to deduct, e.g. -1.5">
                    <Input id="days" name="days" inputMode="decimal" required />
                  </Field>
                  <Field label="Effective date" htmlFor="effective_date" name="effective_date" required>
                    <Input id="effective_date" name="effective_date" type="date" defaultValue={todayManila()} required />
                  </Field>
                  <Field label="Reason" htmlFor="adj_reason" name="reason" required>
                    <Input id="adj_reason" name="reason" required />
                  </Field>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Requests" />
            {(requests.data ?? []).length === 0 ? (
              <EmptyState title="No requests" />
            ) : (
              <ul className="divide-y divide-border">
                {(requests.data ?? []).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <p className="text-foreground">{typeName(r.leave_type_id)} · {formatDays(r.days)}d</p>
                      <p className="text-xs text-muted">{formatDateRange(r.start_date, r.end_date)}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

async function HistoryTab({ employeeId, canComp }: { employeeId: string; canComp: boolean }) {
  const supabase = await createClient();
  const [{ data: moves }, { data: salaries }] = await Promise.all([
    supabase.from("employment_histories").select("id, effective_date, change_type, remarks, created_at").eq("employee_id", employeeId).order("effective_date", { ascending: false }),
    canComp
      ? supabase.from("salary_histories").select("id, effective_date, pay_type, basic_salary, reason, created_at").eq("employee_id", employeeId).order("effective_date", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Employment movements" description="Recorded automatically when the 201 record changes." />
        {(moves ?? []).length === 0 ? (
          <EmptyState title="No movements" />
        ) : (
          <ul className="divide-y divide-border">
            {(moves ?? []).map((m) => (
              <li key={m.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-foreground">{humanize(m.change_type)}</span>
                <span className="text-muted">{formatDate(m.effective_date)} · logged {formatDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canComp && (
        <Card>
          <CardHeader title="Salary history" />
          {(salaries ?? []).length === 0 ? (
            <EmptyState title="No salary history" />
          ) : (
            <Table>
              <thead><tr><Th>Effective</Th><Th className="text-right">Basic</Th><Th>Reason</Th></tr></thead>
              <tbody>
                {(salaries ?? []).map((s) => (
                  <tr key={s.id}>
                    <Td className="whitespace-nowrap">{formatDate(s.effective_date)}</Td>
                    <Td className="whitespace-nowrap text-right">{formatPeso(s.basic_salary)}{s.pay_type === "daily" ? "/day" : "/mo"}</Td>
                    <Td className="text-muted">{s.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
