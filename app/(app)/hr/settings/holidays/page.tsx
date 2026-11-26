import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgOptions } from "@/lib/data/options";
import { formatDate, humanize, todayManila } from "@/lib/format";
import { ActionForm } from "@/components/ui/action-form";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, Select, TabLinks, Table, Td, Th } from "@/components/ui/primitives";
import { addHoliday, addSchedule, assignSchedule, deleteHoliday, setHolidayVerified } from "./actions";

export const metadata: Metadata = { title: "Holidays & schedules" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function HolidaysPage({ searchParams }: PageProps<"/hr/settings/holidays">) {
  await requirePermission("settings.manage");
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "holidays";
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? sp.year : todayManila().slice(0, 4);
  const supabase = await createClient();
  const options = await getOrgOptions();

  const [{ data: holidays }, { data: schedules }] = await Promise.all([
    supabase.from("holidays").select("id, holiday_date, name, holiday_type, location_id, is_verified, remarks").gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`).order("holiday_date"),
    supabase.from("schedules").select("id, code, name, work_days, start_time, end_time, break_minutes, is_default, is_night_shift").order("code"),
  ]);
  const unverified = (holidays ?? []).filter((h) => !h.is_verified).length;
  const locationName = (id: string | null) => (id ? options.locations.find((l) => l.id === id)?.name ?? "Local" : "Nationwide");

  return (
    <>
      <PageHeader title="Holidays & schedules" description="Leave day counts skip rest days (from the schedule) and non-working holidays." />
      <TabLinks active={tab} tabs={[{ key: "holidays", label: "Holidays", href: "?tab=holidays" }, { key: "schedules", label: "Work schedules", href: "?tab=schedules" }]} />

      {tab === "holidays" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm">
              {[Number(year) - 1, Number(year), Number(year) + 1].map((y) => (
                <a key={y} href={`?tab=holidays&year=${y}`} className={String(y) === year ? "font-semibold text-brand" : "text-muted hover:text-foreground"}>{y}</a>
              ))}
            </div>
            {unverified > 0 && (
              <Alert tone="warning">
                {unverified} holiday(s) in {year} are not verified. Check each against the official Proclamation, then mark it verified. Eid&apos;l Fitr and Eid&apos;l Adha are proclaimed separately — add them when announced.
              </Alert>
            )}
            <Card>
              {(holidays ?? []).length === 0 ? <EmptyState title={`No holidays for ${year}`} /> : (
                <Table>
                  <thead><tr><Th>Date</Th><Th>Holiday</Th><Th>Type</Th><Th>Scope</Th><Th>Verified</Th><Th /></tr></thead>
                  <tbody>
                    {(holidays ?? []).map((h) => (
                      <tr key={h.id}>
                        <Td className="whitespace-nowrap">{formatDate(h.holiday_date)}</Td>
                        <Td>{h.name}{h.remarks && <p className="text-xs text-muted">{h.remarks}</p>}</Td>
                        <Td><Badge tone={h.holiday_type === "regular" ? "brand" : "neutral"}>{humanize(h.holiday_type)}</Badge></Td>
                        <Td className="text-muted">{locationName(h.location_id)}</Td>
                        <Td>
                          <form action={setHolidayVerified}>
                            <input type="hidden" name="id" value={h.id} />
                            <input type="hidden" name="verified" value={String(!h.is_verified)} />
                            <Button size="sm" variant="ghost" type="submit">{h.is_verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Mark verified</Badge>}</Button>
                          </form>
                        </Td>
                        <Td className="text-right">
                          <form action={deleteHoliday}>
                            <input type="hidden" name="id" value={h.id} />
                            <Button size="sm" variant="ghost" type="submit" aria-label={`Delete ${h.name}`}>Delete</Button>
                          </form>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
          <Card className="self-start">
            <CardHeader title="Add holiday" />
            <CardBody>
              <ActionForm action={addHoliday} submitLabel="Add holiday" resetOnSuccess>
                <Field label="Date" htmlFor="holiday_date" name="holiday_date" required><Input id="holiday_date" name="holiday_date" type="date" required /></Field>
                <Field label="Name" htmlFor="name" name="name" required><Input id="name" name="name" required /></Field>
                <Field label="Type" htmlFor="holiday_type" name="holiday_type" hint="Special working days are counted as work days.">
                  <Select id="holiday_type" name="holiday_type" defaultValue="regular">
                    <option value="regular">Regular holiday</option>
                    <option value="special_non_working">Special non-working day</option>
                    <option value="special_working">Special working day</option>
                    <option value="local">Local holiday</option>
                  </Select>
                </Field>
                <Field label="Location" htmlFor="location_id" name="location_id">
                  <Select id="location_id" name="location_id" defaultValue="">
                    <option value="">Nationwide</option>
                    {options.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Select>
                </Field>
                <Field label="Remarks" htmlFor="remarks" name="remarks"><Input id="remarks" name="remarks" placeholder="e.g. Proclamation No. ___" /></Field>
                <Checkbox name="is_verified" label="Verified against the Proclamation" />
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "schedules" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <Table>
                <thead><tr><Th>Code</Th><Th>Schedule</Th><Th>Work days</Th><Th>Hours</Th></tr></thead>
                <tbody>
                  {(schedules ?? []).map((s) => (
                    <tr key={s.id}>
                      <Td className="font-mono text-xs">{s.code}{s.is_default && <Badge tone="brand" className="ml-2">Default</Badge>}</Td>
                      <Td>{s.name}</Td>
                      <Td>{(s.work_days as number[]).map((d) => DAYS[d - 1]).join(", ")}</Td>
                      <Td className="whitespace-nowrap">{String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)} ({s.break_minutes}m break)</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader title="Assign a schedule" description="Employees without an assignment use the default schedule." />
              <CardBody>
                <ActionForm action={assignSchedule} submitLabel="Assign" resetOnSuccess>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Employee" htmlFor="employee_id" name="employee_id" required>
                      <Select id="employee_id" name="employee_id" required defaultValue="">
                        <option value="" disabled>Choose</option>
                        {options.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Schedule" htmlFor="schedule_id" name="schedule_id" required>
                      <Select id="schedule_id" name="schedule_id" required>
                        {(schedules ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Effective from" htmlFor="effective_from" name="effective_from" required>
                      <Input id="effective_from" name="effective_from" type="date" defaultValue={todayManila()} required />
                    </Field>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          </div>
          <Card className="self-start">
            <CardHeader title="Add schedule" />
            <CardBody>
              <ActionForm action={addSchedule} submitLabel="Add schedule" resetOnSuccess>
                <Field label="Code" htmlFor="code" name="code" required><Input id="code" name="code" placeholder="CWW-4D" required /></Field>
                <Field label="Name" htmlFor="sname" name="name" required><Input id="sname" name="name" required /></Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-foreground">Work days</legend>
                  <div className="flex flex-wrap gap-3">
                    {DAYS.map((d, i) => <Checkbox key={d} name="work_days" value={String(i + 1)} label={d} defaultChecked={i < 5} />)}
                  </div>
                </fieldset>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Start" htmlFor="start_time" name="start_time"><Input id="start_time" name="start_time" type="time" defaultValue="09:00" /></Field>
                  <Field label="End" htmlFor="end_time" name="end_time"><Input id="end_time" name="end_time" type="time" defaultValue="18:00" /></Field>
                  <Field label="Break (min)" htmlFor="break_minutes" name="break_minutes"><Input id="break_minutes" name="break_minutes" type="number" defaultValue={60} /></Field>
                </div>
                <Checkbox name="is_flexible" label="Flexible hours" />
                <Checkbox name="is_night_shift" label="Night shift" />
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
