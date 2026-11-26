import type { OrgOptions } from "@/lib/data/options";
import type { Employee } from "@/lib/types";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";

const EMPLOYMENT_TYPES = ["probationary", "regular", "project", "fixed_term", "consultant", "intern"];
const STATUSES = ["active", "on_leave", "suspended", "separated"];
const SETUPS = ["onsite", "hybrid", "remote"];
const CIVIL = ["single", "married", "widowed", "separated", "annulled"];
const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Fields for creating/editing a 201 record. Used inside <ActionForm>. */
export function EmployeeFields({ options, employee }: { options: OrgOptions; employee?: Employee }) {
  const e = employee;
  return (
    <div className="flex flex-col gap-8">
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">Name & contact</legend>
        <Field label="First name" htmlFor="first_name" name="first_name" required>
          <Input id="first_name" name="first_name" defaultValue={e?.first_name} required />
        </Field>
        <Field label="Middle name" htmlFor="middle_name" name="middle_name">
          <Input id="middle_name" name="middle_name" defaultValue={e?.middle_name ?? ""} />
        </Field>
        <Field label="Last name" htmlFor="last_name" name="last_name" required>
          <Input id="last_name" name="last_name" defaultValue={e?.last_name} required />
        </Field>
        <Field label="Suffix" htmlFor="suffix" name="suffix">
          <Input id="suffix" name="suffix" defaultValue={e?.suffix ?? ""} placeholder="Jr., III" />
        </Field>
        <Field label="Work email" htmlFor="work_email" name="work_email" required hint="Used to sign in. Must be unique.">
          <Input id="work_email" name="work_email" type="email" defaultValue={e?.work_email} required />
        </Field>
        <Field label="Personal email" htmlFor="personal_email" name="personal_email">
          <Input id="personal_email" name="personal_email" type="email" defaultValue={e?.personal_email ?? ""} />
        </Field>
        <Field label="Mobile number" htmlFor="mobile_number" name="mobile_number">
          <Input id="mobile_number" name="mobile_number" defaultValue={e?.mobile_number ?? ""} placeholder="09171234567" />
        </Field>
        <Field label="Nickname" htmlFor="nickname" name="nickname">
          <Input id="nickname" name="nickname" defaultValue={e?.nickname ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">Personal</legend>
        <Field label="Birth date" htmlFor="birth_date" name="birth_date">
          <Input id="birth_date" name="birth_date" type="date" defaultValue={e?.birth_date ?? ""} />
        </Field>
        <Field label="Sex" htmlFor="sex" name="sex" hint="Used for leave eligibility.">
          <Select id="sex" name="sex" defaultValue={e?.sex ?? ""}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Civil status" htmlFor="civil_status" name="civil_status">
          <Select id="civil_status" name="civil_status" defaultValue={e?.civil_status ?? ""}>
            <option value="">—</option>
            {CIVIL.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nationality" htmlFor="nationality" name="nationality">
          <Input id="nationality" name="nationality" defaultValue={e?.nationality ?? "Filipino"} />
        </Field>
        <Field label="Present address" htmlFor="present_address" name="present_address" className="sm:col-span-2">
          <Textarea id="present_address" name="present_address" defaultValue={e?.present_address ?? ""} className="min-h-16" />
        </Field>
        <Field label="Permanent address" htmlFor="permanent_address" name="permanent_address" className="sm:col-span-2">
          <Textarea id="permanent_address" name="permanent_address" defaultValue={e?.permanent_address ?? ""} className="min-h-16" />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <Checkbox label="Solo parent (ID on file)" name="is_solo_parent" defaultChecked={e?.is_solo_parent} />
        </div>
        <Field label="Solo Parent ID valid until" htmlFor="solo_parent_id_expiry" name="solo_parent_id_expiry">
          <Input id="solo_parent_id_expiry" name="solo_parent_id_expiry" type="date" defaultValue={e?.solo_parent_id_expiry ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">Employment</legend>
        <Field label="Department" htmlFor="department_id" name="department_id">
          <Select id="department_id" name="department_id" defaultValue={e?.department_id ?? ""}>
            <option value="">—</option>
            {options.departments.filter((d) => d.is_active || d.id === e?.department_id).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Position" htmlFor="position_id" name="position_id">
          <Select id="position_id" name="position_id" defaultValue={e?.position_id ?? ""}>
            <option value="">—</option>
            {options.positions.filter((p) => p.is_active || p.id === e?.position_id).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job level" htmlFor="job_level_id" name="job_level_id">
          <Select id="job_level_id" name="job_level_id" defaultValue={e?.job_level_id ?? ""}>
            <option value="">—</option>
            {options.jobLevels.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="location_id" name="location_id">
          <Select id="location_id" name="location_id" defaultValue={e?.location_id ?? ""}>
            <option value="">—</option>
            {options.locations.filter((l) => l.is_active || l.id === e?.location_id).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Immediate supervisor" htmlFor="supervisor_id" name="supervisor_id" hint="First-level approver for requests.">
          <Select id="supervisor_id" name="supervisor_id" defaultValue={e?.supervisor_id ?? ""}>
            <option value="">—</option>
            {options.people.filter((p) => p.id !== e?.id).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Employment type" htmlFor="employment_type" name="employment_type" required>
          <Select id="employment_type" name="employment_type" defaultValue={e?.employment_type ?? "probationary"}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Work set-up" htmlFor="work_setup" name="work_setup">
          <Select id="work_setup" name="work_setup" defaultValue={e?.work_setup ?? "onsite"}>
            {SETUPS.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date hired" htmlFor="date_hired" name="date_hired" required>
          <Input id="date_hired" name="date_hired" type="date" defaultValue={e?.date_hired ?? ""} required />
        </Field>
        {e && (
          <>
            <Field label="Status" htmlFor="employment_status" name="employment_status" hint="Separating an employee disables their login.">
              <Select id="employment_status" name="employment_status" defaultValue={e.employment_status}>
                {STATUSES.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Regularisation date" htmlFor="regularization_date" name="regularization_date">
              <Input id="regularization_date" name="regularization_date" type="date" defaultValue={e.regularization_date ?? ""} />
            </Field>
            <Field label="Separation date" htmlFor="separation_date" name="separation_date">
              <Input id="separation_date" name="separation_date" type="date" defaultValue={e.separation_date ?? ""} />
            </Field>
            <Field label="Separation reason" htmlFor="separation_reason" name="separation_reason">
              <Input id="separation_reason" name="separation_reason" defaultValue={e.separation_reason ?? ""} />
            </Field>
          </>
        )}
      </fieldset>
    </div>
  );
}
