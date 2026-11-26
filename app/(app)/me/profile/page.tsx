import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPeso, fullName, humanize, masked } from "@/lib/format";
import type { Employee } from "@/lib/types";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Card, CardBody, CardHeader, DescriptionList, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { updateContactInfo } from "./actions";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const session = await requireUser();
  const supabase = await createClient();
  const employeeId = session.employee?.id;

  if (!employeeId) {
    return (
      <>
        <PageHeader title="My profile" />
        <Alert tone="warning">Your login is not linked to an employee record yet. Please contact HR.</Alert>
      </>
    );
  }

  const [{ data: emp }, { data: ids }, { data: comp }, { data: directory }] = await Promise.all([
    supabase.from("employees").select("*, departments(name), positions(title), locations(name)").eq("id", employeeId).single(),
    supabase.from("employee_government_ids").select("tin_last4, sss_last4, philhealth_last4, pagibig_last4").eq("employee_id", employeeId).maybeSingle(),
    supabase.from("employee_compensation").select("pay_type, basic_salary, bank_name, bank_account_last4").eq("employee_id", employeeId).maybeSingle(),
    supabase.rpc("get_employee_directory"),
  ]);
  const e = emp as Employee & { departments: { name: string } | null; positions: { title: string } | null; locations: { name: string } | null };
  const supervisor = (directory ?? []).find((d: { id: string }) => d.id === e.supervisor_id) as { full_name: string } | undefined;
  const contact = e.emergency_contacts?.[0] ?? {};

  return (
    <>
      <PageHeader
        title={fullName(e)}
        description={`${e.employee_no} · ${e.positions?.title ?? "No position"} · ${e.departments?.name ?? "No department"}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader title="Employment" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Employee no.", value: e.employee_no },
                  { label: "Date hired", value: formatDate(e.date_hired) },
                  { label: "Employment type", value: humanize(e.employment_type) },
                  { label: "Status", value: humanize(e.employment_status) },
                  { label: "Work set-up", value: humanize(e.work_setup) },
                  { label: "Location", value: e.locations?.name ?? "—" },
                  { label: "Immediate supervisor", value: supervisor?.full_name ?? "—" },
                  { label: "Work email", value: e.work_email },
                  ...(e.employment_type === "probationary"
                    ? [{ label: "Regularisation due", value: formatDate(e.regularization_due_date) }]
                    : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Personal" description="To correct your name, birth date or civil status, send HR a request with supporting documents." />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Birth date", value: formatDate(e.birth_date) },
                  { label: "Sex", value: humanize(e.sex) },
                  { label: "Civil status", value: humanize(e.civil_status) },
                  { label: "Nationality", value: e.nationality ?? "—" },
                  { label: "Permanent address", value: e.permanent_address ?? "—" },
                  { label: "Solo parent", value: e.is_solo_parent ? `Yes (ID valid until ${formatDate(e.solo_parent_id_expiry)})` : "No" },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Government IDs & pay" description="Stored encrypted. Only the last 4 digits are shown." />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "TIN", value: masked(ids?.tin_last4) },
                  { label: "SSS", value: masked(ids?.sss_last4) },
                  { label: "PhilHealth", value: masked(ids?.philhealth_last4) },
                  { label: "Pag-IBIG", value: masked(ids?.pagibig_last4) },
                  { label: "Basic salary", value: comp ? `${formatPeso(comp.basic_salary)} / ${comp.pay_type === "daily" ? "day" : "month"}` : "—" },
                  { label: "Payroll account", value: comp?.bank_name ? `${comp.bank_name} ${masked(comp.bank_account_last4)}` : "—" },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader title="Contact details" description="You can update these yourself." />
          <CardBody>
            <ActionForm action={updateContactInfo} submitLabel="Save contact details">
                                <Field label="Mobile number" htmlFor="mobile_number" name="mobile_number">
                    <Input id="mobile_number" name="mobile_number" defaultValue={e.mobile_number ?? ""} placeholder="09171234567" />
                  </Field>
                  <Field label="Personal email" htmlFor="personal_email" name="personal_email">
                    <Input id="personal_email" name="personal_email" type="email" defaultValue={e.personal_email ?? ""} />
                  </Field>
                  <Field label="Present address" htmlFor="present_address" name="present_address">
                    <Textarea id="present_address" name="present_address" defaultValue={e.present_address ?? ""} />
                  </Field>
                  <p className="pt-2 text-sm font-medium text-foreground">Emergency contact</p>
                  <Field label="Name" htmlFor="emergency_name">
                    <Input id="emergency_name" name="emergency_name" defaultValue={contact.name ?? ""} />
                  </Field>
                  <Field label="Relationship" htmlFor="emergency_relationship">
                    <Input id="emergency_relationship" name="emergency_relationship" defaultValue={contact.relationship ?? ""} />
                  </Field>
                  <Field label="Phone" htmlFor="emergency_phone">
                    <Input id="emergency_phone" name="emergency_phone" defaultValue={contact.phone ?? ""} />
                  </Field>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
