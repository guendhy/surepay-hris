import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDays, humanize } from "@/lib/format";
import type { LeaveType } from "@/lib/types";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui/primitives";
import { saveLeaveType } from "./actions";

export const metadata: Metadata = { title: "Leave types" };

export default async function LeaveTypesPage({ searchParams }: PageProps<"/hr/settings/leave-types">) {
  await requirePermission("leave.configure");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("leave_types").select("*").order("sort_order");
  const types = (data ?? []) as LeaveType[];
  const editing = types.find((t) => t.id === sp.edit);

  return (
    <>
      <PageHeader
        title="Leave types"
        description="Seeded with Philippine statutory leaves and common company leaves. Confirm credits and rules against company policy and current law before go-live."
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2 self-start">
          <Table>
            <thead><tr><Th>Leave type</Th><Th className="text-right">Credit</Th><Th>Accrual</Th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className={t.id === editing?.id ? "bg-brand-soft/50" : ""}>
                  <Td>
                    <Link href={`?edit=${t.id}`} className="font-medium text-brand hover:underline">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge>{t.code}</Badge>
                      {t.is_statutory && <Badge tone="brand">Statutory</Badge>}
                      {!t.is_paid && <Badge tone="warning">Unpaid</Badge>}
                      {!t.is_active && <Badge tone="danger">Inactive</Badge>}
                    </div>
                  </Td>
                  <Td className="text-right">{t.balance_tracked ? formatDays(t.annual_credit) : t.max_days_per_request ? `≤ ${formatDays(t.max_days_per_request)}/req` : "—"}</Td>
                  <Td>{t.balance_tracked ? humanize(t.accrual_method) : "Per occurrence"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="xl:col-span-3">
          {!editing ? (
            <CardBody className="text-sm text-muted">Choose a leave type to view or change its rules.</CardBody>
          ) : (
            <>
              <CardHeader title={editing.name} description={editing.legal_basis ?? undefined} />
              <CardBody>
                <ActionForm action={saveLeaveType} submitLabel="Save leave type" key={editing.id}>
                  <input type="hidden" name="id" value={editing.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" htmlFor="name" name="name" required><Input id="name" name="name" defaultValue={editing.name} required /></Field>
                    <Field label="Colour" htmlFor="color" name="color"><Input id="color" name="color" type="color" defaultValue={editing.color} className="h-10 p-1" /></Field>
                    <Field label="Description (shown to employees)" htmlFor="description" name="description" className="sm:col-span-2">
                      <Textarea id="description" name="description" defaultValue={editing.description ?? ""} className="min-h-16" />
                    </Field>
                    <Field label="Legal basis / policy reference" htmlFor="legal_basis" name="legal_basis" className="sm:col-span-2">
                      <Input id="legal_basis" name="legal_basis" defaultValue={editing.legal_basis ?? ""} />
                    </Field>
                  </div>

                  <h3 className="pt-2 text-sm font-semibold text-foreground">Balance & accrual</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:gap-6">
                      <Checkbox name="is_active" label="Active" defaultChecked={editing.is_active} />
                      <Checkbox name="is_paid" label="Paid" defaultChecked={editing.is_paid} />
                      <Checkbox name="balance_tracked" label="Track a balance" defaultChecked={editing.balance_tracked} />
                      <Checkbox name="allow_negative" label="Allow negative balance" defaultChecked={editing.allow_negative} />
                    </div>
                    <Field label="Annual credit (days)" htmlFor="annual_credit" name="annual_credit"><Input id="annual_credit" name="annual_credit" inputMode="decimal" defaultValue={editing.annual_credit} /></Field>
                    <Field label="Accrual" htmlFor="accrual_method" name="accrual_method">
                      <Select id="accrual_method" name="accrual_method" defaultValue={editing.accrual_method}>
                        <option value="monthly">Monthly (credit ÷ 12)</option>
                        <option value="upfront">Upfront on 1 January</option>
                        <option value="anniversary">On service anniversary</option>
                        <option value="none">None</option>
                      </Select>
                    </Field>
                    <div className="flex items-end pb-2"><Checkbox name="prorate_new_hires" label="Pro-rate for new hires" defaultChecked={editing.prorate_new_hires} /></div>
                    <Field label="Carry-over cap (days)" htmlFor="carry_over_cap" name="carry_over_cap"><Input id="carry_over_cap" name="carry_over_cap" inputMode="decimal" defaultValue={editing.carry_over_cap ?? ""} /></Field>
                    <div className="flex items-end pb-2"><Checkbox name="carry_over_unlimited" label="Unlimited carry-over" defaultChecked={editing.carry_over_cap === null} /></div>
                    <div />
                    <div className="flex items-end pb-2"><Checkbox name="convertible_to_cash" label="Convert unused to cash at year-end" defaultChecked={editing.convertible_to_cash} /></div>
                    <Field label="Conversion cap (days)" htmlFor="conversion_cap" name="conversion_cap" hint="Blank = all remaining"><Input id="conversion_cap" name="conversion_cap" inputMode="decimal" defaultValue={editing.conversion_cap ?? ""} /></Field>
                  </div>

                  <h3 className="pt-2 text-sm font-semibold text-foreground">Filing rules</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:gap-6">
                      <Checkbox name="allow_half_day" label="Allow half days" defaultChecked={editing.allow_half_day} />
                      <Checkbox name="counts_calendar_days" label="Count calendar days (incl. rest days/holidays)" defaultChecked={editing.counts_calendar_days} />
                    </div>
                    <Field label="Advance notice (working days)" htmlFor="min_notice_days" name="min_notice_days"><Input id="min_notice_days" name="min_notice_days" type="number" min={0} defaultValue={editing.min_notice_days} /></Field>
                    <Field label="If notice not met" htmlFor="notice_enforcement" name="notice_enforcement">
                      <Select id="notice_enforcement" name="notice_enforcement" defaultValue={editing.notice_enforcement}>
                        <option value="warn">Warn</option>
                        <option value="block">Block</option>
                        <option value="none">Ignore</option>
                      </Select>
                    </Field>
                    <Field label="May file up to N days after" htmlFor="max_backdate_days" name="max_backdate_days"><Input id="max_backdate_days" name="max_backdate_days" type="number" min={0} defaultValue={editing.max_backdate_days} /></Field>
                    <Field label="Max days per request" htmlFor="max_days_per_request" name="max_days_per_request" hint="Blank = no limit"><Input id="max_days_per_request" name="max_days_per_request" inputMode="decimal" defaultValue={editing.max_days_per_request ?? ""} /></Field>
                    <Field label="Attachment required above (days)" htmlFor="attachment_required_after_days" name="attachment_required_after_days" hint="Blank = never, 0 = always"><Input id="attachment_required_after_days" name="attachment_required_after_days" inputMode="decimal" defaultValue={editing.attachment_required_after_days ?? ""} /></Field>
                  </div>

                  <h3 className="pt-2 text-sm font-semibold text-foreground">Eligibility</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Sex" htmlFor="eligible_sex" name="eligible_sex">
                      <Select id="eligible_sex" name="eligible_sex" defaultValue={editing.eligible_sex ?? ""}>
                        <option value="">Any</option>
                        <option value="female">Female only</option>
                        <option value="male">Male only</option>
                      </Select>
                    </Field>
                    <Field label="Minimum service (months)" htmlFor="min_service_months" name="min_service_months"><Input id="min_service_months" name="min_service_months" type="number" min={0} defaultValue={editing.min_service_months} /></Field>
                    <div className="flex flex-col justify-end gap-2 pb-2">
                      <Checkbox name="requires_married" label="Married only" defaultChecked={editing.requires_married} />
                      <Checkbox name="requires_solo_parent" label="Solo Parent ID required" defaultChecked={editing.requires_solo_parent} />
                    </div>
                  </div>
                </ActionForm>
              </CardBody>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
