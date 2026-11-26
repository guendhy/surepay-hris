/**
 * Row shapes used by the UI. The Supabase client is untyped until you run
 * `npm run db:types` against your project (see README); these keep pages
 * type-safe in the meantime.
 */
export type LeaveType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  legal_basis: string | null;
  color: string;
  is_paid: boolean;
  is_statutory: boolean;
  balance_tracked: boolean;
  annual_credit: string;
  accrual_method: "upfront" | "monthly" | "anniversary" | "none";
  prorate_new_hires: boolean;
  allow_negative: boolean;
  carry_over_cap: string | null;
  convertible_to_cash: boolean;
  conversion_cap: string | null;
  counts_calendar_days: boolean;
  allow_half_day: boolean;
  min_notice_days: number;
  notice_enforcement: "none" | "warn" | "block";
  max_backdate_days: number;
  max_days_per_request: string | null;
  attachment_required_after_days: string | null;
  eligible_sex: "male" | "female" | null;
  requires_married: boolean;
  requires_solo_parent: boolean;
  min_service_months: number;
  is_active: boolean;
  sort_order: number;
};

export type LeaveBalance = {
  employee_id: string;
  leave_type_id: string;
  earned: string;
  used: string;
  balance: string;
  pending: string;
  available: string;
};

export type LeaveRequest = {
  id: string;
  request_no: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  day_portion: "full" | "am" | "pm";
  days: string;
  reason: string | null;
  attachment_path: string | null;
  status: "pending" | "approved" | "rejected" | "returned" | "cancelled";
  approval_request_id: string | null;
  submitted_at: string;
  decided_at: string | null;
  cancellation_reason: string | null;
};

export type LeavePreview = {
  days: number;
  balance_tracked: boolean;
  balance: number;
  pending: number;
  available: number;
  remaining_after: number;
  attachment_required: boolean;
  errors: string[];
  warnings: string[];
};

export type DirectoryEntry = {
  id: string;
  employee_no: string;
  full_name: string;
  first_name: string;
  last_name: string;
  work_email: string;
  department_id: string | null;
  department_name: string | null;
  position_title: string | null;
  supervisor_id: string | null;
  location_id: string | null;
  employment_status: string;
};

export type Employee = {
  id: string;
  employee_no: string;
  user_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  nickname: string | null;
  work_email: string;
  personal_email: string | null;
  mobile_number: string | null;
  birth_date: string | null;
  sex: "male" | "female" | null;
  civil_status: string | null;
  nationality: string | null;
  present_address: string | null;
  permanent_address: string | null;
  emergency_contacts: { name?: string; relationship?: string; phone?: string }[];
  is_solo_parent: boolean;
  solo_parent_id_expiry: string | null;
  department_id: string | null;
  position_id: string | null;
  job_level_id: string | null;
  location_id: string | null;
  supervisor_id: string | null;
  employment_type: string;
  employment_status: string;
  work_setup: string;
  date_hired: string;
  regularization_due_date: string | null;
  regularization_date: string | null;
  separation_date: string | null;
  separation_reason: string | null;
};

export type Option = { id: string; name: string };
