# Architecture

## Layers

```
Browser ──► Next.js on Vercel (sin1)
              proxy.ts            refresh session, send signed-out users to /login
              lib/auth/session    Data Access Layer: getSession / requireUser / requirePermission
              Server Components   read data with the user's session (RLS applies)
              Server Actions      authorise → validate (Zod) → call Postgres → revalidate
              /api/cron/*         scheduled jobs (service role, CRON_SECRET)
          ──► Supabase (Singapore)
              Auth                password / SSO, TOTP MFA (aal2)
              Postgres            tables + RLS + business rules in SQL functions
              Storage             private bucket "employee-files", signed URLs
              Realtime            live notification badge
```

**Rule of thumb:** anything that must never be bypassed — balances, filing rules, approval transitions, segregation of duties, audit — lives in Postgres. The UI only guides the user; the database decides.

## Database migrations (`supabase/migrations`)

| File | Contents |
|---|---|
| 0001 foundation | `private` schema, profiles, roles/permissions, app settings, permission helpers |
| 0002 org & employees | departments, positions, job levels, locations, employees, encrypted IDs, compensation, salary & movement history, documents, auth-user triggers |
| 0003 calendar | holidays, schedules, work-day functions |
| 0004 approvals & notifications | approval engine, delegations, escalation, notifications, email outbox, announcements |
| 0005 leave | leave types, requests, ledger, balance view, validation and submit/cancel/adjust functions |
| 0006 leave jobs & RLS | accruals, year-end close, team calendar, leave RLS |
| 0007 audit | append-only audit log and triggers |
| 0008 storage | bucket and storage policies |
| 0009 reference data | roles, permissions, leave types, 2026 holidays, default approval flow |
| 0010 app support | `my_access`, HR dashboard stats, Realtime, delegate list |

## Core data model

```
auth.users 1─1 profiles 1─* user_roles *─1 roles *─* permissions
                 │
employees ───────┘ (user_id, linked by work email)
  ├─ employee_government_ids (ciphertext + last4)
  ├─ employee_compensation ── salary_histories
  ├─ employment_histories, dependents, employee_documents
  ├─ employee_schedules ─ schedules            holidays
  ├─ supervisor_id → employees                departments.head_employee_id → employees
  ├─ leave_requests ─ approval_requests ─ approval_tasks
  └─ leave_ledger_entries ──► leave_balances (view)
```

## Leave

- **Day count** (`private.count_leave_days`): each date in the range counts if it is a work day in the employee's schedule and not a non-working holiday for their location. Maternity and special leave for women count calendar days. Half day = 0.5.
- **Validation** (`private.validate_leave_request`): eligibility (sex, civil status, solo parent ID, service length, employment type), half-day rules, back-dating window, advance notice (warn or block), max days per request, attachment requirement, overlap with own requests, balance (balance − pending), team-coverage warning. The form calls the same function for its live preview.
- **Ledger**: grants, accruals, usage, reversals, conversions, forfeitures and adjustments are rows; `leave_balances` sums them. Scheduled jobs use `period_key` + a unique constraint to stay idempotent.
- **Year-end** (`run_leave_year_end`): carry over up to the cap, convert the remainder to cash up to the conversion cap, forfeit the rest. Conversion rows are the input for Phase 2 payroll.

## Approvals

1. `submit_leave_request` inserts the request and calls `private.start_approval`.
2. The most specific active flow is chosen (leave type + department → leave type → department → default).
3. `advance_approval` walks the steps: supervisor, department head, everyone with a role, or a named user. It skips the requester, inactive accounts, people who already approved, and steps with nobody; delegation is applied. If nobody can be found, HR managers (then super admins) get the request.
4. `act_on_approval_task` locks the request row, checks the actor, records the decision, and either advances or finalises. Finalising calls the subject handler (`on_leave_decision`), which writes the ledger usage and notifies the employee.
5. `escalate_overdue_approvals` (daily) adds HR managers to tasks past their due date.

## Testing

`npm test` runs:
- `tests/unit` — encryption, formatting, validation
- `tests/db` — every migration applied to PGlite (Postgres in WASM) with a small Supabase shim (auth schema, API roles, storage). Covers day counting, filing rules, the approval chain, delegation, escalation, accruals, year-end, and RLS for each role.

Not yet automated: browser end-to-end tests against a running Supabase (Playwright) — planned with Phase 2.
