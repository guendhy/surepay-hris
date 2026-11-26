import { z } from "zod";

/** Shared Zod schemas — used by Server Actions (and forms) so rules live in one place. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const optionalText = (max = 500) => z.string().max(max).optional();
const optionalUuid = z.uuid().optional();

export const leaveRequestSchema = z
  .object({
    leave_type_id: z.uuid("Choose a leave type."),
    start_date: isoDate,
    end_date: isoDate,
    day_portion: z.enum(["full", "am", "pm"]).default("full"),
    reason: optionalText(1000),
  })
  .refine((v) => v.end_date >= v.start_date, { path: ["end_date"], message: "End date must be on or after the start date." })
  .refine((v) => v.day_portion === "full" || v.start_date === v.end_date, {
    path: ["day_portion"],
    message: "Half days are for single-day requests only.",
  });

export const employeeSchema = z.object({
  first_name: z.string().min(1, "Required").max(100),
  middle_name: optionalText(100),
  last_name: z.string().min(1, "Required").max(100),
  suffix: optionalText(20),
  nickname: optionalText(50),
  work_email: z.email("Use a valid email.").transform((v) => v.toLowerCase()),
  personal_email: z.email("Use a valid email.").optional(),
  mobile_number: z.string().regex(/^(\+63|0)9\d{9}$/, "Use a PH mobile number, e.g. 09171234567.").optional(),
  birth_date: isoDate.optional(),
  sex: z.enum(["male", "female"]).optional(),
  civil_status: z.enum(["single", "married", "widowed", "separated", "annulled"]).optional(),
  nationality: optionalText(50),
  present_address: optionalText(),
  permanent_address: optionalText(),
  is_solo_parent: z.coerce.boolean().default(false),
  solo_parent_id_expiry: isoDate.optional(),
  department_id: optionalUuid,
  position_id: optionalUuid,
  job_level_id: optionalUuid,
  location_id: optionalUuid,
  supervisor_id: optionalUuid,
  employment_type: z.enum(["probationary", "regular", "project", "fixed_term", "consultant", "intern"]),
  employment_status: z.enum(["active", "on_leave", "suspended", "separated"]).default("active"),
  work_setup: z.enum(["onsite", "hybrid", "remote"]).default("onsite"),
  date_hired: isoDate,
  regularization_date: isoDate.optional(),
  separation_date: isoDate.optional(),
  separation_reason: optionalText(),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;

/** Philippine government ID formats (digits only after stripping separators). */
export const governmentIdsSchema = z.object({
  tin: z.string().regex(/^\d{9}(\d{3})?(\d{2})?$/, "TIN must have 9, 12 or 14 digits.").optional(),
  sss: z.string().regex(/^\d{10}$/, "SSS number must have 10 digits.").optional(),
  philhealth: z.string().regex(/^\d{12}$/, "PhilHealth number must have 12 digits.").optional(),
  pagibig: z.string().regex(/^\d{12}$/, "Pag-IBIG MID must have 12 digits.").optional(),
});

export const compensationSchema = z.object({
  pay_type: z.enum(["monthly", "daily"]),
  basic_salary: z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, "Enter an amount like 35000 or 35000.50."),
  effective_date: isoDate,
  reason: z.string().min(3, "Give a reason, e.g. 'Annual merit increase'.").max(300),
  bank_name: optionalText(100),
  bank_account: z.string().regex(/^[0-9 -]{6,30}$/, "Use digits only.").optional(),
});

export const contactInfoSchema = z.object({
  mobile_number: z.string().regex(/^(\+63|0)9\d{9}$/, "Use a PH mobile number, e.g. 09171234567.").optional(),
  personal_email: z.email("Use a valid email.").optional(),
  present_address: optionalText(),
  emergency_name: optionalText(100),
  emergency_relationship: optionalText(50),
  emergency_phone: optionalText(30),
});

export const leaveTypeSchema = z.object({
  name: z.string().min(2).max(100),
  description: optionalText(1000),
  legal_basis: optionalText(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  is_paid: z.coerce.boolean(),
  balance_tracked: z.coerce.boolean(),
  annual_credit: z.coerce.number().min(0).max(365),
  accrual_method: z.enum(["upfront", "monthly", "anniversary", "none"]),
  prorate_new_hires: z.coerce.boolean(),
  allow_negative: z.coerce.boolean(),
  carry_over_cap: z.coerce.number().min(0).max(365).optional(),
  convertible_to_cash: z.coerce.boolean(),
  conversion_cap: z.coerce.number().min(0).max(365).optional(),
  counts_calendar_days: z.coerce.boolean(),
  allow_half_day: z.coerce.boolean(),
  min_notice_days: z.coerce.number().int().min(0).max(90),
  notice_enforcement: z.enum(["none", "warn", "block"]),
  max_backdate_days: z.coerce.number().int().min(0).max(90),
  max_days_per_request: z.coerce.number().min(0.5).max(366).optional(),
  attachment_required_after_days: z.coerce.number().min(0).max(366).optional(),
  eligible_sex: z.enum(["male", "female"]).optional(),
  requires_married: z.coerce.boolean(),
  requires_solo_parent: z.coerce.boolean(),
  min_service_months: z.coerce.number().int().min(0).max(120),
  is_active: z.coerce.boolean(),
});

export const holidaySchema = z.object({
  holiday_date: isoDate,
  name: z.string().min(2).max(100),
  holiday_type: z.enum(["regular", "special_non_working", "special_working", "local"]),
  location_id: optionalUuid,
  is_verified: z.coerce.boolean(),
  remarks: optionalText(200),
});

export const announcementSchema = z.object({
  title: z.string().min(3).max(150),
  body: z.string().min(3).max(5000),
  audience: z.enum(["all", "department", "location"]),
  department_id: optionalUuid,
  location_id: optionalUuid,
  expires_at: isoDate.optional(),
});

export const delegationSchema = z
  .object({
    delegate_user_id: z.uuid("Choose a person."),
    starts_on: isoDate,
    ends_on: isoDate,
    reason: optionalText(200),
  })
  .refine((v) => v.ends_on >= v.starts_on, { path: ["ends_on"], message: "End must be on or after start." });

/** Upload rules (mirrors the storage bucket settings). */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function validateUpload(file: File | null): string | null {
  if (!file || file.size === 0) return null;
  if (file.size > UPLOAD_MAX_BYTES) return "Files must be 10 MB or smaller.";
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) return "Upload a PDF, JPG, PNG or DOCX file.";
  return null;
}

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents: é → e
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_");
  return cleaned.slice(-80) || "file";
}
