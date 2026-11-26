# Build Prompt — Surepay Technologies Inc. HR Information System (HRIS)

**Stack:** Next.js · Supabase · Vercel

> **How to use this file:** Fill in the `[[...]]` placeholders, then paste everything below the
> line into Claude Code (or any AI coding assistant) as the opening instruction for a **new,
> empty repository**. Anything you leave blank, the assistant must ask about rather than guess.

---

## 1. Your role and objective

You are a senior full-stack engineer and HR-systems analyst. Build a production-grade **Human
Resource Information System (HRIS)** for **Surepay Technologies Inc.**, a Philippine fintech /
payments company. The system replaces spreadsheets and paper forms with one secure web
application covering the full employee lifecycle: hire → attend → leave → get paid → grow →
separate.

This is a **new, standalone project**. It shares no code, database, or user accounts with any
other Surepay product (e.g. UPass).

Work in phases (Section 12). At the start of each phase, restate the scope, list your
assumptions, and ask me about anything ambiguous before writing code. Do not invent company
policy: where a rule is a company choice rather than law, make it **configurable** and seed it
with the default given here.

## 2. Company context

| Item | Value |
|---|---|
| Company | Surepay Technologies Inc. |
| Country / jurisdiction | Philippines (DOLE, BIR, SSS, PhilHealth, Pag-IBIG, NPC) |
| Headcount (now / in 3 years) | [[e.g. 60 / 200]] |
| Work set-ups | Onsite, hybrid, full remote |
| Payroll frequency & cut-offs | [[e.g. semi-monthly; 11th–25th paid on 30th, 26th–10th paid on 15th]] |
| Work week / standard hours | [[e.g. Mon–Fri, 8 hours + 1 hour unpaid break]] |
| Branches / sites | [[e.g. Head office, Makati]] |
| Existing time-keeping device | [[e.g. ZKTeco biometrics — CSV export / none]] |
| Bank for payroll credit | [[e.g. BDO / UnionBank / Security Bank]] |
| Company email / identity provider | [[Google Workspace / Microsoft 365]] |
| Compliance programme | ISO/IEC 27001 ISMS in progress; must also satisfy RA 10173 (Data Privacy Act) and BSP expectations for a regulated payments company |

## 3. Technology stack and architecture

### 3.1 Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js** (latest stable, **App Router**, TypeScript `strict`), React Server Components, Server Actions for mutations, Route Handlers for the public/mobile API |
| UI | Tailwind CSS + **shadcn/ui** (Radix) components, `lucide-react` icons, TanStack Table for data grids, `react-hook-form` + **Zod** for forms and validation, `date-fns` / `date-fns-tz` |
| Database | **Supabase Postgres**, schema managed with **Supabase CLI migrations** (`supabase/migrations`), generated TypeScript types (`supabase gen types`) |
| Auth | **Supabase Auth** — email/password and SSO via [[Google / Azure]] OAuth, **MFA (TOTP)** via Supabase Auth MFA, `@supabase/ssr` for cookie-based sessions in Next.js |
| Authorisation | Postgres **Row Level Security (RLS) on every table** + an app-level permission check in every Server Action / Route Handler |
| File storage | **Supabase Storage**, private buckets only, short-lived signed URLs, storage RLS policies |
| Realtime | Supabase Realtime for in-app notifications and approval inbox updates |
| Scheduled jobs | **Vercel Cron** hitting protected Route Handlers (or Supabase `pg_cron`) for accruals, reminders, escalations, year-end processing |
| Background work | Supabase Edge Functions or a queue (e.g. Upstash QStash / Inngest) for jobs longer than a Vercel Function's max duration (payroll runs, bulk imports, bulk emails) — propose one |
| Email | **Resend** (React Email templates) or Supabase SMTP — propose one |
| Documents | `@react-pdf/renderer` (payslips, certificates, notices); **ExcelJS** for XLSX import/export |
| Hosting | **Vercel** (production + preview deployments per pull request), Functions region **`sin1` (Singapore)** |
| Data region | Supabase project in **Southeast Asia (Singapore)** — document this cross-border transfer in the privacy notice |
| Testing | **Vitest** (unit — all calculations), **Playwright** (end-to-end), **pgTAP** or SQL tests for RLS policies |
| Quality | ESLint, Prettier, TypeScript type-check, GitHub Actions CI on every PR |

### 3.2 Architecture rules

- **Server-first:** read data in Server Components; mutate through Server Actions that
  (1) authenticate, (2) check permission, (3) validate with Zod, (4) run inside a Postgres
  transaction (use RPC / Postgres functions for multi-table writes), (5) write the audit entry.
- **Never expose the Supabase `service_role` key to the browser.** It lives only in server-only
  modules (`import 'server-only'`) and is used only for jobs and admin tasks that RLS cannot
  express. Client components use the anon key and are fully governed by RLS.
- **Business logic lives in pure TypeScript modules** (`lib/leave/`, `lib/payroll/`,
  `lib/approvals/`) with no framework imports, so they are unit-testable. Database-critical
  invariants (balances, locks) are also enforced in Postgres (constraints, triggers, functions).
- **Money:** Postgres `numeric(15,2)`; in TypeScript use integer centavos or `decimal.js` —
  **never JavaScript floating-point arithmetic for pay or balances.**
- **Time:** store `timestamptz`; display and compute in **Asia/Manila**; dates shown as
  `DD MMM YYYY`. Work-day logic must use the employee's schedule and the holiday calendar.
- **Configurable, effective-dated tables** for everything the government or management can
  change (contribution tables, tax tables, holidays, leave credits, OT multipliers) — never
  hard-coded constants.
- Mobile-responsive; employee self-service must work well on a phone.
- Environments: **local** (Supabase CLI + Docker), **staging** (own Supabase project, Vercel
  preview deployments), **production**. Preview/staging never contains real employee data.

### 3.3 Suggested repository layout

```
app/
  (auth)/login, mfa, reset-password
  (app)/dashboard               # role-aware home
  (app)/me/...                  # employee self-service
  (app)/team/...                # supervisor / department head
  (app)/hr/employees, leave, attendance, payroll, reports, settings
  (app)/admin/users, roles, audit-log
  api/v1/...                    # Route Handlers for mobile / integrations
  api/cron/...                  # Vercel Cron endpoints (secret-protected)
components/                     # shadcn/ui + shared components
lib/
  supabase/ (server.ts, client.ts, admin.ts, middleware.ts)
  auth/ (permissions.ts, guards.ts)
  leave/ attendance/ payroll/ approvals/ audit/ crypto/ pdf/ excel/
  validations/                  # Zod schemas shared by forms and actions
supabase/
  migrations/  seed.sql  tests/ (RLS tests)
emails/                         # React Email templates
tests/ (unit/, e2e/)
docs/                           # how-to notes for HR users
```

## 4. Users, roles, and permissions (RBAC)

Implement RBAC in the database: `roles`, `permissions`, `role_permissions`, `user_roles`.
Expose the user's roles to Postgres through a **Supabase Custom Access Token Hook** (JWT claim)
and `security definer` helper functions such as `auth_has_permission('leave.approve')` and
`auth_is_in_reporting_line(employee_id)` used inside RLS policies. Permissions are granular
(e.g. `leave.approve`, `payroll.finalize`, `employee.view_salary`); roles are bundles of
permissions, editable by Super Admin.

| Role | Can do |
|---|---|
| **Super Admin** | System settings, roles/permissions, user accounts, audit logs. No access to salaries unless also given an HR role. |
| **HR Manager** | Everything HR: employee records, policies, approvals of last resort, reports, discipline cases. |
| **HR Staff** | Maintain 201 files, onboarding/offboarding, attendance corrections, document requests. |
| **Payroll Officer** | Payroll runs, adjustments, government reports, loans. Sees compensation data. |
| **Finance Approver** | Reviews and approves a payroll run before release; views bank file. |
| **Department Head** | Approves team requests (2nd level), views team dashboards, performance reviews. |
| **Immediate Supervisor** | Approves team requests (1st level), views team attendance and leave calendar. |
| **Employee** | Self-service: own profile, requests, payslips, documents, policy acknowledgements. |
| **Auditor (read-only)** | Read-only access to records and audit logs for ISMS/financial audits; sensitive fields stay masked. |

Rules: a user may hold several roles; **nobody approves their own request**; salary, bank, and
government ID fields are visible only with an explicit permission; **segregation of duties** —
the person who prepares a payroll run cannot be the one who approves or finalises it. Enforce
these rules in Postgres (RLS / triggers), not only in the UI.

## 5. Functional modules

### 5.1 Employee records (201 file)

- Personal: full name, nickname, birth date, sex, civil status, nationality, contact details,
  present/permanent address, emergency contacts, dependents (for HMO and solo-parent status).
- Government IDs: TIN, SSS, PhilHealth, Pag-IBIG (HDMF) — **encrypted at rest, masked in UI**
  (last 4 digits only) with format validation.
- Employment: employee no. (auto, configurable format e.g. `SPT-2026-0001`), position, job level,
  department, cost centre, immediate supervisor, work location, work set-up, schedule,
  employment type (probationary, regular, project, fixed-term, consultant, intern), date hired,
  regularisation due date (auto: hire date + 6 months), status, separation date and reason.
- Compensation (restricted): basic salary, pay type (monthly/daily), allowances (taxable and
  de minimis), bank name and account no. (encrypted), salary history with effective dates and
  reason (merit, promotion, adjustment).
- Education, work history, licences/certifications with expiry reminders, skills.
- Document vault (Supabase Storage, private bucket, path `employees/{employee_id}/...`): resume,
  signed contract, NBI/police clearance, medical, diplomas, government forms, signed NDA and
  ISMS acknowledgements — each with type, upload date, expiry, uploader.
- Movement history: promotions, transfers, change of supervisor/department — all dated.
- Employees can request changes to personal data; HR approves; old and new values are logged.

### 5.2 Organisation structure

- Departments, teams, positions, job levels/grades with salary bands, cost centres, locations.
- Reporting lines used by the approval engine and RLS; auto-generated, printable **org chart**.
- Headcount plan vs. actual per department.

### 5.3 Recruitment and applicant tracking *(Phase 3)*

- Manpower requisition (requested by Department Head, approved by HR Manager and management).
- Job postings, applicant pipeline (Applied → Screening → Exam → Interview → Offer → Hired /
  Rejected), interview scheduling and scorecards, offer letter generation.
- On "Hired", convert the applicant into an employee record without re-typing data.
- Applicant data has its own retention period and consent capture (Data Privacy Act).

### 5.4 Onboarding and offboarding

- **Onboarding checklist** per position, assigned to owners (HR, IT, Admin, Supervisor), with due
  dates: contract signing, government registration (SSS R-1A etc.), payroll set-up, HMO
  enrolment, equipment issue, **IT account provisioning**, ISMS policy briefing and
  acknowledgement, NDA, orientation. Inviting the employee creates their Supabase Auth account.
- Probation tracking: reminders to supervisor at month 3 and month 5; regularisation evaluation
  form; outcome recorded before day 180.
- **Offboarding / clearance**: resignation filing by employee (with 30-day notice tracking),
  acceptance, clearance routing to each department, **IT access revocation on the last day**
  (disable the HRIS account automatically and log who revoked what and when — ISMS control),
  asset return, exit interview, final pay computation, Certificate of Employment.

### 5.5 Time and attendance

- Work schedules and shifts (fixed, flexible with core hours, compressed week, night shift),
  rest days, assignment per employee with effective dates.
- Time capture: import biometric logs (CSV/API), web clock-in/out with optional geolocation and IP
  allow-list for WFH, or manual DTR entry with approval.
- Daily Time Record computation: late, undertime, absences, overtime, night differential, rest-day
  and holiday work — feeding payroll automatically.
- Requests with approval: **attendance correction** (missed punch), **official business / field
  work**, **work-from-home**, **change of schedule / shift swap**, **overtime** (pre-approval
  required; actual hours capped by DTR).
- Holiday calendar: regular and special non-working holidays per year, plus local holidays per
  location, maintained by HR (Proclamation-based; editable each year).
- Attendance cut-off lock: once payroll is processed, the period's DTR is locked (enforced by a
  Postgres trigger); later corrections become prior-period adjustments.

### 5.6 Leave management *(core — build in Phase 1)*

**Leave types** — configurable table; seed with the following and let HR edit credits and rules:

| Leave type | Seed rule | Basis |
|---|---|---|
| Vacation Leave (VL) | [[e.g. 15 days/yr]], accrued monthly, filed ≥ [[3]] working days in advance | Company policy |
| Sick Leave (SL) | [[e.g. 15 days/yr]], may be filed after the fact (within [[2]] days of return); medical certificate required if > [[2]] consecutive days | Company policy |
| Service Incentive Leave (SIL) | 5 days/yr after 1 year of service; unused convertible to cash. Satisfied automatically if VL/SL ≥ 5 days | Labor Code Art. 95 |
| Maternity Leave | 105 days paid (+15 if solo parent); 60 days for miscarriage / emergency termination; optional 30 days unpaid extension; up to 7 days transferable to the father/alternate caregiver; SSS benefit advance and reimbursement tracking | RA 11210 |
| Paternity Leave | 7 days paid, married employee, first 4 deliveries of the lawful spouse | RA 8187 |
| Solo Parent Leave | 7 days/yr, after 6 months of service, valid Solo Parent ID on file | RA 8972 as amended by RA 11861 |
| VAWC Leave | Up to 10 days paid, with supporting document (barangay/court/prosecutor certification) | RA 9262 |
| Special Leave for Women | Up to 2 months paid after gynaecological surgery, after 6 months of service | RA 9710 (Magna Carta of Women) |
| Bereavement Leave | [[e.g. 3–5 days]] for immediate family | Company policy |
| Emergency Leave | [[e.g. 3 days/yr]] | Company policy |
| Birthday Leave | [[e.g. 1 day, within birthday month]] | Company policy |
| Leave Without Pay (LWOP) | When credits are exhausted; deducts from payroll | — |

> All statutory entitlements must be checked by HR/legal before go-live; store the legal basis
> text on each leave type so policy changes are traceable.

**Each leave type is configurable for:** annual credit; accrual method (upfront on 1 Jan, monthly
pro-rata, on anniversary); pro-ration for new hires; eligibility (employment type, minimum
service, gender, civil status, solo-parent flag); paid/unpaid; half-day and hourly filing allowed;
minimum advance notice; maximum consecutive days; required attachments; whether weekends and
holidays are counted (default: excluded, based on the employee's schedule and holiday calendar);
carry-over cap and expiry; year-end cash conversion (cap and rate); whether it can go negative.

**Employee flow:**
1. Employee sees balances per type (earned, used, pending, available) and a team calendar.
2. Files a request: type, date range, whole/half day (AM/PM), reason, attachment. The system
   computes the working days deducted and shows the remaining balance **before** submitting.
3. Validation blocks (in the Server Action **and** in a Postgres function so they cannot be
   bypassed): insufficient balance (unless LWOP or negative allowed), overlapping requests,
   filing inside a locked payroll period, missing attachment, notice period not met (warn or
   block per type).
4. Warning (not block) if [[e.g. 2]] or more teammates are already on leave those days.

**Approval flow:** configurable chain per leave type and department (default: Immediate
Supervisor → Department Head; HR is notified and can override). Approvers can approve, reject
(reason required), or return for revision. Delegation when an approver is on leave;
auto-escalation if not acted on within [[e.g. 2 working days]] (Vercel Cron). Bulk approve from a
list. Email and in-app (Realtime) notifications at every step, with one-click deep links.

**After approval:** balance ledger updated; DTR marks the days as leave (not absent); payroll
reads paid/unpaid days. Employee can cancel before the leave starts (re-approval if already
approved); HR can cancel or adjust after the fact with a reason. Returned-early and extended
leave are handled as amendments, not new free-text notes.

**Balances are a ledger, not a single number:** every grant, accrual, use, cancellation,
carry-over, forfeiture, conversion, and manual adjustment is a dated row in
`leave_ledger_entries` with a reason and the user who made it. A balance is the sum of the
ledger (expose it through a Postgres view). Year-end job: apply carry-over caps, forfeit expired
credits, compute cash conversion for payroll, open new-year credits — idempotent and re-runnable.

**Reports:** leave balances per employee/department as of a date; leave usage by type and month;
absenteeism and SL patterns (e.g. Mondays/Fridays); pending approvals ageing; statutory leave
usage (maternity/paternity/solo parent) for compliance; cash-conversion liability.

### 5.7 Payroll *(Phase 2)*

- Payroll periods per the configured frequency; run states: **Draft → Computed → Reviewed →
  Approved (Finance) → Finalised/Locked → Released**. Re-computation allowed until approval;
  every change after that is an adjustment line with a reason. Runs execute as a background job
  with a progress record the UI subscribes to via Realtime.
- Earnings: basic pay, overtime, night differential, holiday and rest-day premiums, allowances
  (taxable / non-taxable / de minimis), commissions, incentives, retro pay, leave conversion,
  13th-month pay.
- Deductions: absences, tardiness, undertime, LWOP; SSS, PhilHealth, Pag-IBIG employee shares;
  withholding tax; SSS/Pag-IBIG salary and calamity loans; company loans and cash advances
  (amortisation schedules); HMO dependent premiums; other deductions.
- **Philippine rules (seed defaults, all configurable with effective dates):**
  - Overtime: +25% of hourly rate on ordinary days; +30% of the applicable rate on rest days
    and holidays.
  - Night differential: +10% for work between 10:00 PM and 6:00 AM.
  - Rest day or special non-working day worked: 130%; special day falling on rest day: 150%.
  - Regular holiday: 100% if unworked (subject to eligibility rules), 200% if worked, 260% if on
    rest day; double-holiday rules supported.
  - 13th-month pay: total basic salary earned in the calendar year ÷ 12, paid on or before
    24 December; pro-rated for separated employees (PD 851).
  - Withholding tax: TRAIN Law (RA 10963) graduated table, annualised method with year-end
    adjustment; ₱90,000 ceiling for tax-exempt 13th-month and other benefits; de minimis
    ceilings per BIR regulations.
  - SSS, PhilHealth, Pag-IBIG: seed the current contribution tables (salary brackets, rates,
    employer/employee shares, floors and ceilings, SSS EC and MPF portions) — **HR/Payroll must
    verify the seeded values against the latest agency circulars before go-live.**
- Outputs: payslip PDF (emailed and in self-service, password-protected), payroll register,
  bank credit file in [[bank]]'s format, journal entry export for accounting, cost-centre
  distribution.
- **Final pay** for separated employees: unpaid salary, pro-rated 13th month, convertible leave
  balances, tax refund/payable, less accountabilities from clearance — to be released within
  30 days of separation (DOLE Labor Advisory 06-20).

### 5.8 Government compliance and statutory reports

Generate in the agency-required layouts or upload formats where available:

- **SSS:** R-1A (new hire report), monthly contribution list, loan amortisation list.
- **PhilHealth:** ER2 / member registration, monthly remittance report (RF-1).
- **Pag-IBIG:** membership registration, monthly remittance (MCRF), loan amortisations.
- **BIR:** 1601-C (monthly remittance), 1604-C with alphalist (annual), **BIR Form 2316** per
  employee (annual and on separation).
- Tracking of remittance due dates, reference numbers, and proof-of-payment uploads.

### 5.9 Benefits and loans

- HMO enrolment of employee and dependents, plan levels, card numbers, effectivity dates.
- Company loans / cash advances: application, approval, amortisation schedule, payroll
  deduction, early settlement, balance on separation.
- SSS / Pag-IBIG loan deductions entered from the agency billing.
- Other benefits: rice/clothing/laundry allowances (de minimis), internet/WFH allowance,
  medical reimbursement claims with receipts and approval.

### 5.10 Performance management *(Phase 3)*

- Review cycles (probationary, mid-year, annual), templates per job level.
- Goals/KPIs (company → department → individual), self-assessment, supervisor assessment,
  optional 360/peer feedback, calibration, final rating.
- Performance Improvement Plans with milestones; link ratings to merit increase recommendations.

### 5.11 Training and development *(Phase 3)*

- Training catalogue, schedules, enrolment requests and approval, attendance, certificates.
- **Mandatory training tracking** — ISMS/security awareness, Data Privacy, AML/KYC (fintech),
  OSH — with due dates, completion %, and overdue reminders to the employee and supervisor.
- Training bond/agreement tracking (amount, period, pro-rated liability on early resignation).

### 5.12 Employee relations and discipline

- Code of Conduct offences and penalty matrix (configurable).
- Incident report → **Notice to Explain** (minimum 5 calendar days to answer) → employee's
  written explanation → administrative hearing/conference → **Notice of Decision**. The system
  enforces the twin-notice due-process steps and dates and generates the notice documents.
- Restricted access (HR Manager and assigned investigators only, enforced by RLS); offence
  history used to compute repeat-offence penalties within the configured period.
- Commendations and recognitions.

### 5.13 Company assets

- Assets issued to employees (laptop, phone, ID, access card, tokens): serial no., issue/return
  date, condition, acknowledgement. Unreturned assets appear in clearance and final pay.
- Coordinate with the ISMS asset register (export/link) rather than duplicating it if one exists.

### 5.14 Employee self-service (ESS) portal

One home page for each employee showing: leave balances, pending requests and their status,
today's schedule and attendance, latest payslip, announcements, tasks (policies to acknowledge,
trainings due, evaluations to complete). Employees can:

- File and track leave, OT, OB, WFH, attendance correction, schedule change requests.
- Download payslips, BIR 2316, and request documents: **Certificate of Employment** (issued
  within 3 days of request), COE with compensation, SSS/Pag-IBIG/loan certifications.
- Update personal data (with HR approval), upload documents, view team calendar.
- Read and **acknowledge company and ISMS policies** (timestamped, versioned — re-acknowledge
  when a policy version changes).
- Submit resignation and track clearance.

Manager self-service: approval inbox across all request types (live via Realtime), team
attendance and leave calendar, team headcount and probation due dates, performance reviews to
complete.

Make the ESS installable as a **PWA** (manifest + icons) so employees can add it to their phone.

### 5.15 Approval workflow engine (shared)

One reusable engine for every request type (leave, OT, OB, WFH, correction, loan, reimbursement,
data change, requisition, resignation), modelled as `approval_flows`, `approval_steps`,
`approval_requests`, `approval_actions`:

- Configurable chains per request type, department, and condition (e.g. OT > 4 hours adds
  Department Head; loan > ₱[[amount]] adds HR Manager).
- Approver resolution by role, by reporting line, or by named person.
- Delegation with date range, escalation after N working days, parallel or sequential steps.
- Full history: who acted, when, what decision, comments — **immutable** (no UPDATE/DELETE
  grants on `approval_actions`).
- State transitions run in a Postgres function so two approvers cannot act on the same step
  concurrently.

### 5.16 Notifications and announcements

- In-app notification centre (Supabase Realtime) and email (queued); templates editable by HR.
- Reminders (Vercel Cron): pending approvals, probation due, contract/ID/licence expiry,
  birthdays and work anniversaries, missing time logs, mandatory training due, government
  remittance deadlines.
- Company announcements with target audience (all, department, location) and read receipts.

### 5.17 Reports and dashboards

- **HR dashboard:** headcount (by department, type, gender, location), new hires and
  separations this month, attrition and turnover rate, upcoming regularisations, open
  positions, on leave today, pending approvals, birthdays.
- **Payroll dashboard:** payroll cost trend, OT cost by department, government contribution
  totals, upcoming remittance deadlines.
- Standard reports: master list, 201 completeness (missing documents/IDs), attendance summary,
  tardiness ranking, leave balances, OT summary, payroll register, contribution reports,
  13th-month report, separation report, training compliance.
- Every report filterable by date range, department, location, status; exportable to XLSX and
  PDF; export actions are logged. Heavy aggregations go in Postgres views/functions, not in
  client-side JavaScript.

### 5.18 Administration and settings

Company profile and logo, departments/positions/locations, schedules, holiday calendar, leave
types and policies, payroll settings and rate tables, contribution and tax tables, approval
chains, document types, email templates, employee number format, session and MFA policy, data
retention periods, roles and permissions, user accounts (invite, deactivate, reset MFA).

## 6. Data model guidance

Propose a full ERD and the first migrations before coding Phase 1. At minimum (Postgres, `uuid`
primary keys, `created_at`/`updated_at`/`created_by` on every table):

`profiles` (1:1 with `auth.users`), `employees`, `departments`, `positions`, `job_levels`,
`locations`, `employment_histories`, `salary_histories`, `employee_documents`, `dependents`,
`roles`, `permissions`, `role_permissions`, `user_roles`, `schedules`, `employee_schedules`,
`holidays`, `time_logs`, `daily_time_records`, `leave_types`, `leave_policies`,
`leave_ledger_entries`, `leave_requests`, `overtime_requests`, `attendance_requests`,
`approval_flows`, `approval_steps`, `approval_requests`, `approval_actions`, `payroll_periods`,
`payroll_runs`, `payroll_items`, `payslips`, `contribution_tables`, `tax_tables`, `loans`,
`loan_payments`, `assets`, `policies`, `policy_versions`, `policy_acknowledgements`,
`trainings`, `training_attendances`, `disciplinary_cases`, `notifications`, `announcements`,
`audit_log`.

- Use Postgres enums or check constraints for statuses; foreign keys everywhere.
- Soft-delete (`archived_at`) master data; never hard-delete employees, payroll, ledger, or
  approval history.
- Anything that touches balances or money runs in a single transaction inside a Postgres
  function called via `supabase.rpc()`.
- Seed data in `supabase/seed.sql` (roles, permissions, leave types, holidays for
  [[current year]], contribution and tax tables) plus a separate **demo seed** of fake data.

## 7. Security, privacy, and ISMS requirements

Surepay is a payments company working toward ISO/IEC 27001. Treat employee data as
**confidential personal and sensitive personal information** under RA 10173.

- **Authentication:** Supabase Auth with company-domain restriction ([[@surepay domain]]),
  strong password policy, **MFA (TOTP) mandatory for HR, Payroll, Finance, Auditor, and Admin
  roles** — enforce by requiring the `aal2` assurance level in middleware and in RLS for
  sensitive tables; optional SSO; rate-limited login; idle session timeout [[15 min]];
  disabled accounts cannot obtain sessions.
- **Authorisation:** **RLS enabled on every table with no exceptions** — employees can only
  reach their own rows, supervisors their reporting line, HR/payroll by permission. Server
  Actions and Route Handlers re-check permissions. Storage buckets have matching RLS policies.
  Add automated tests proving one employee cannot read another's payslip, salary, or documents.
- **Encryption:** TLS everywhere (Vercel/Supabase default); Supabase encrypts data at rest;
  additionally apply **application-level field encryption (AES-256-GCM)** in a server-only
  module for government IDs, bank accounts, and medical/disciplinary details, with the key in
  Vercel encrypted environment variables (or Supabase Vault) and a documented key-rotation
  procedure. Salary visibility is controlled by RLS + column-restricted views.
- **Secrets:** only in Vercel / Supabase environment settings; `.env.local` git-ignored;
  `service_role` key server-only; cron endpoints protected by `CRON_SECRET`.
- **Audit trail:** Postgres triggers write create/update/delete on all HR and payroll tables to
  an **append-only `audit_log`** (old/new values as JSONB, actor, timestamp, IP/user agent where
  available). Also log logins, failed logins, MFA changes, permission changes, exports, and
  views of sensitive fields. No role (including Super Admin) can update or delete audit rows.
- **Data privacy:** privacy notice and consent capture (including cross-border hosting in
  Singapore); data-subject requests (access, correction); configurable **retention and
  disposal** schedule per record type (payroll/tax records per BIR rules; applicant data deleted
  after [[1 year]]); data-breach incident logging hook; **no real employee data in local,
  preview, or staging environments** (use masked or fake data).
- **Secure development:** OWASP Top 10; Zod validation on every input; security headers and a
  Content Security Policy in `next.config`; CSRF-safe Server Actions; file-upload checks (type,
  size, extension allow-list); dependency scanning (Dependabot / `npm audit`) in CI; Supabase
  Security Advisor and Performance Advisor clean before each release.
- **Availability:** Supabase daily backups with **Point-in-Time Recovery** enabled on
  production, a tested restore procedure, Vercel instant rollback, uptime/health check route,
  error monitoring (e.g. Sentry or Vercel Observability).

## 8. Non-functional requirements

- Core pages interactive in < 2 s on a typical connection; use streaming and Suspense for
  dashboards; paginate and index all list queries.
- Payroll computation for [[200]] employees completes in < 2 minutes as a background job with
  visible progress.
- Accessibility: keyboard navigable, visible focus states, WCAG AA contrast, clear error messages.
- Light and dark themes; English UI with strings ready for localisation.
- Anything listed as company policy is configurable in Settings without a code change.
- Clean, documented code; shared Zod schemas between forms and Server Actions; no `any`.

## 9. Integrations and API

- Versioned REST API under `/api/v1` (Route Handlers, Supabase JWT auth, same permission
  checks) for every ESS feature so a mobile app can be added later.
- Biometric device log import (CSV first; device API later).
- Bank payroll file export; accounting journal export (CSV/XLSX for [[accounting system]]).
- Email via [[Resend / SMTP provider]]; optional Google/Microsoft calendar sync for approved leave.
- Outgoing webhook or scheduled export to deprovision IT accounts on separation (ISMS).

## 10. Data migration

Provide XLSX import templates and validated importers for: employees and 201 data, opening
leave balances as of go-live date, year-to-date payroll figures (gross, taxable, tax withheld,
contributions) for correct annualised tax, and existing loans with remaining balances. Imports
run as background jobs, produce a row-by-row error report, and are re-runnable without creating
duplicates (upsert on employee number).

## 11. Testing and acceptance

- **Vitest** unit tests for every calculation: leave day counting (weekends, holidays, half
  days, schedules), accrual and pro-ration, carry-over and forfeiture, OT/ND/holiday premiums,
  contributions per bracket, withholding tax, 13th month, final pay.
- **RLS tests** (pgTAP or SQL run against the local Supabase) for every table: allowed and denied
  cases per role.
- **Playwright** end-to-end tests for each approval flow, including self-approval prevention,
  delegation, escalation, and an employee trying to open another employee's payslip (must fail).
- CI (GitHub Actions) runs lint, type-check, unit, RLS, and e2e tests on every PR; Vercel
  preview deployment per PR against the staging Supabase project.
- Demo seed with realistic fake data (departments, ~50 employees, a full year of attendance and
  leave) for demos and UAT.
- For each phase, provide a UAT checklist written for HR users, not developers.

## 12. Delivery phases

| Phase | Scope |
|---|---|
| **1 — Foundation & Leave** | Project setup (Next.js, Supabase, Vercel, CI), auth + MFA, RBAC + RLS, audit log, organisation structure, employee 201 records, document vault, holiday calendar, schedules, **leave management end-to-end**, approval engine, notifications, ESS home, basic HR dashboard. |
| **2 — Time & Payroll** | Attendance import and DTR, OT/OB/WFH/correction requests, payroll engine, payslips, government contributions and tax, loans, 13th month, final pay, statutory reports, bank file. |
| **3 — Lifecycle & Growth** | Onboarding/offboarding and clearance, recruitment/ATS, performance management, training and mandatory compliance tracking, discipline/due process, assets, policy acknowledgement. |
| **4 — Analytics & Hardening** | Advanced dashboards and reports, data-privacy tooling (retention, DSAR), mobile API and PWA polish, performance tuning, security review / penetration test, go-live data migration. |

## 13. What I expect from you, in order

1. Confirm the stack and list the accounts/keys I must create myself (GitHub repo, Supabase
   project in Singapore, Vercel project linked to the repo, email provider) — never ask me to
   paste secrets into chat; tell me which environment variables to set where.
2. List clarifying questions on the `[[...]]` placeholders and any policy gaps — wait for answers.
3. Deliver the ERD, RLS strategy, and folder plan for Phase 1 — wait for approval.
4. Scaffold the project and build Phase 1 in small, reviewable increments
   (migration → RLS policies + tests → pure logic + unit tests → Server Actions → UI → e2e test),
   running the test suite after each increment.
5. At the end of each phase: summary of what was built, how to run it locally
   (`supabase start`, `npm run dev`), how to deploy, test results, known gaps, and the UAT
   checklist.

**Definition of done for any feature:** migration committed, RLS policies written and tested,
permission checked in the server code, input validated with Zod, audit-logged, unit/e2e tests
passing, responsive UI in light and dark mode, deployed to a Vercel preview, and a short note in
`docs/` on how HR uses it.
