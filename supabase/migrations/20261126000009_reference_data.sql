-- =============================================================================
-- Surepay HRIS — 0009 Reference data (needed in every environment)
-- Roles, permissions, default schedule, leave types, 2026 holidays, default
-- leave approval flow, app settings. Demo/fake data lives in scripts/seed-demo.ts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.permissions (code, module, description) values
  ('employee.view',                'employees',     'View full employee 201 records'),
  ('employee.manage',              'employees',     'Create and edit employee records and documents'),
  ('employee.invite',              'employees',     'Invite employees to sign in to the HRIS'),
  ('employee.view_sensitive',      'employees',     'View government IDs (MFA required)'),
  ('employee.manage_sensitive',    'employees',     'Edit government IDs (MFA required)'),
  ('employee.view_compensation',   'employees',     'View salary and bank details (MFA required)'),
  ('employee.manage_compensation', 'employees',     'Edit salary and bank details (MFA required)'),
  ('org.manage',                   'organisation',  'Manage departments, positions, locations and job levels'),
  ('settings.manage',              'settings',      'Manage holidays, schedules and system settings'),
  ('leave.view_all',               'leave',         'View every employee''s leave requests and balances'),
  ('leave.manage',                 'leave',         'Cancel or correct any leave request'),
  ('leave.adjust',                 'leave',         'Post manual leave balance adjustments'),
  ('leave.configure',              'leave',         'Configure leave types and run accruals'),
  ('approvals.view_all',           'approvals',     'View every approval request'),
  ('approvals.override',           'approvals',     'Act on any pending approval (HR override)'),
  ('approvals.configure',          'approvals',     'Configure approval flows'),
  ('team.view',                    'team',          'Use team views (calendar, team list)'),
  ('reports.view',                 'reports',       'View HR reports and dashboards'),
  ('reports.export',               'reports',       'Export reports to Excel'),
  ('announcements.manage',         'announcements', 'Publish company announcements'),
  ('admin.users',                  'admin',         'Manage user accounts and role assignments (MFA required)'),
  ('admin.roles',                  'admin',         'Manage roles and permissions (MFA required)'),
  ('audit.view',                   'admin',         'View the audit log (MFA required)')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
insert into public.roles (code, name, description, is_system, requires_mfa) values
  ('super_admin',      'Super Admin',          'System settings, user accounts, roles and audit. No salary access by default.', true, true),
  ('hr_manager',       'HR Manager',           'Full HR access; approver of last resort.', true, true),
  ('hr_staff',         'HR Staff',             'Maintains 201 files, documents and leave records.', true, true),
  ('payroll_officer',  'Payroll Officer',      'Compensation data and (Phase 2) payroll runs.', true, true),
  ('finance_approver', 'Finance Approver',     'Reviews compensation and (Phase 2) approves payroll.', true, true),
  ('department_head',  'Department Head',      'Second-level approver; team views.', true, false),
  ('supervisor',       'Immediate Supervisor', 'First-level approver; team views.', true, false),
  ('employee',         'Employee',             'Self-service. Given to every account automatically.', true, false),
  ('auditor',          'Auditor (read-only)',  'Read-only access for ISMS and financial audits.', true, true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join lateral (values
  ('super_admin',      array['admin.users','admin.roles','audit.view','settings.manage','org.manage',
                             'approvals.configure','employee.view','employee.invite','reports.view']),
  ('hr_manager',       array['employee.view','employee.manage','employee.invite','employee.view_sensitive',
                             'employee.manage_sensitive','employee.view_compensation','employee.manage_compensation',
                             'org.manage','settings.manage','leave.view_all','leave.manage','leave.adjust',
                             'leave.configure','approvals.view_all','approvals.override','approvals.configure',
                             'team.view','reports.view','reports.export','announcements.manage']),
  ('hr_staff',         array['employee.view','employee.manage','employee.invite','employee.view_sensitive',
                             'employee.manage_sensitive','leave.view_all','leave.manage','team.view',
                             'reports.view','reports.export','announcements.manage']),
  ('payroll_officer',  array['employee.view','employee.view_sensitive','employee.view_compensation',
                             'employee.manage_compensation','leave.view_all','reports.view','reports.export']),
  ('finance_approver', array['employee.view','employee.view_compensation','reports.view']),
  ('department_head',  array['team.view']),
  ('supervisor',       array['team.view']),
  ('employee',         array[]::text[]),
  ('auditor',          array['employee.view','leave.view_all','approvals.view_all','audit.view','reports.view'])
) as m(role_code, perms) on m.role_code = r.code
cross join lateral unnest(m.perms) as perm(code)
join public.permissions p on p.code = perm.code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- App settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('company_name', '"Surepay Technologies Inc."', 'Shown on documents and emails'),
  ('allowed_email_domains', '[]', 'Only these email domains may sign in, e.g. ["surepay.example"]. Empty = no restriction. SET THIS BEFORE GO-LIVE.'),
  ('employee_no_format', '{"prefix":"SPT","pad":4}', 'Employee number format: PREFIX-YYYY-0001'),
  ('team_leave_warning_threshold', '2', 'Warn when this many teammates are already on leave'),
  ('session_idle_minutes', '15', 'Idle session timeout in minutes')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Default schedule
-- ---------------------------------------------------------------------------
insert into public.schedules (code, name, work_days, start_time, end_time, break_minutes, is_default)
values ('REG-MF', 'Regular Mon–Fri 9:00–18:00', '{1,2,3,4,5}', '09:00', '18:00', 60, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Leave types (seed values; HR must confirm company policy and current law)
-- ---------------------------------------------------------------------------
insert into public.leave_types (
  code, name, description, legal_basis, color, is_paid, is_statutory,
  balance_tracked, annual_credit, accrual_method, prorate_new_hires, allow_negative,
  carry_over_cap, convertible_to_cash, conversion_cap,
  counts_calendar_days, allow_half_day, min_notice_days, notice_enforcement, max_backdate_days,
  max_days_per_request, attachment_required_after_days,
  eligible_sex, requires_married, requires_solo_parent, min_service_months, eligible_employment_types,
  is_active, sort_order
) values
  ('VL', 'Vacation Leave', 'Planned time off.', 'Company policy', '#2563eb', true, false,
   true, 15, 'monthly', true, false, 5, true, 5,
   false, true, 3, 'warn', 0, null, null,
   null, false, false, 0, null, true, 10),
  ('SL', 'Sick Leave', 'Illness or medical appointments. May be filed after returning to work.', 'Company policy', '#dc2626', true, false,
   true, 15, 'monthly', true, false, 5, true, 5,
   false, true, 0, 'none', 5, null, 2,
   null, false, false, 0, null, true, 20),
  ('SIL', 'Service Incentive Leave', '5 days per year after one year of service; unused days convertible to cash. Already satisfied when VL/SL of at least 5 days are given, so inactive by default.', 'Labor Code Art. 95', '#0891b2', true, true,
   true, 5, 'anniversary', false, false, 0, true, null,
   false, true, 0, 'none', 0, null, null,
   null, false, false, 12, null, false, 30),
  ('ML', 'Maternity Leave', '105 days paid (120 if solo parent); 60 days for miscarriage or emergency termination. Up to 7 days may be allocated to the father or an alternate caregiver.', 'RA 11210 (Expanded Maternity Leave Law)', '#db2777', true, true,
   false, 0, 'none', false, false, 0, false, null,
   true, false, 0, 'none', 30, 120, 0,
   'female', false, false, 0, null, true, 40),
  ('PL', 'Paternity Leave', '7 days paid for each of the first four deliveries of the lawful spouse.', 'RA 8187 (Paternity Leave Act)', '#7c3aed', true, true,
   false, 0, 'none', false, false, 0, false, null,
   false, true, 0, 'none', 30, 7, 0,
   'male', true, false, 0, null, true, 50),
  ('SPL', 'Solo Parent Leave', '7 days per year after 6 months of service with a valid Solo Parent ID.', 'RA 8972 as amended by RA 11861', '#ea580c', true, true,
   true, 7, 'upfront', false, false, 0, false, null,
   false, true, 0, 'none', 5, null, null,
   null, false, true, 6, null, true, 60),
  ('VAWC', 'VAWC Leave', 'Up to 10 days paid for victims of violence against women and their children, with a barangay, court or prosecutor certification.', 'RA 9262, Sec. 43', '#9333ea', true, true,
   true, 10, 'upfront', false, false, 0, false, null,
   false, true, 0, 'none', 30, null, 0,
   'female', false, false, 0, null, true, 70),
  ('SLW', 'Special Leave for Women', 'Up to 2 months paid after surgery caused by gynecological disorders, after 6 months of service.', 'RA 9710 (Magna Carta of Women)', '#be185d', true, true,
   false, 0, 'none', false, false, 0, false, null,
   true, false, 0, 'none', 30, 60, 0,
   'female', false, false, 6, null, true, 80),
  ('BL', 'Bereavement Leave', 'Death in the immediate family.', 'Company policy', '#475569', true, false,
   false, 0, 'none', false, false, 0, false, null,
   false, true, 0, 'none', 5, 5, null,
   null, false, false, 0, null, true, 90),
  ('EL', 'Emergency Leave', 'Unplanned urgent personal matters.', 'Company policy', '#f59e0b', true, false,
   true, 3, 'upfront', true, false, 0, false, null,
   false, true, 0, 'none', 3, null, null,
   null, false, false, 0, null, true, 100),
  ('BDL', 'Birthday Leave', 'One day off within your birthday month.', 'Company policy', '#16a34a', true, false,
   true, 1, 'upfront', false, false, 0, false, null,
   false, false, 3, 'warn', 0, 1, null,
   null, false, false, 0, null, true, 110),
  ('LWOP', 'Leave Without Pay', 'Approved absence without pay when credits are used up.', null, '#64748b', false, false,
   false, 0, 'none', false, false, 0, false, null,
   false, true, 3, 'warn', 3, null, null,
   null, false, false, 0, null, true, 120)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2026 Philippine holidays — UNVERIFIED seed. HR must check each date against
-- the official Proclamation and tick "verified". Eid'l Fitr and Eid'l Adha are
-- proclaimed separately and must be added when announced.
-- ---------------------------------------------------------------------------
insert into public.holidays (holiday_date, name, holiday_type, is_verified, remarks) values
  ('2026-01-01', 'New Year''s Day', 'regular', false, null),
  ('2026-02-17', 'Chinese New Year', 'special_non_working', false, null),
  ('2026-04-02', 'Maundy Thursday', 'regular', false, null),
  ('2026-04-03', 'Good Friday', 'regular', false, null),
  ('2026-04-04', 'Black Saturday', 'special_non_working', false, null),
  ('2026-04-09', 'Araw ng Kagitingan', 'regular', false, null),
  ('2026-05-01', 'Labor Day', 'regular', false, null),
  ('2026-06-12', 'Independence Day', 'regular', false, null),
  ('2026-08-21', 'Ninoy Aquino Day', 'special_non_working', false, null),
  ('2026-08-31', 'National Heroes Day', 'regular', false, 'Last Monday of August'),
  ('2026-11-01', 'All Saints'' Day', 'special_non_working', false, null),
  ('2026-11-30', 'Bonifacio Day', 'regular', false, null),
  ('2026-12-08', 'Feast of the Immaculate Conception', 'special_non_working', false, null),
  ('2026-12-24', 'Christmas Eve', 'special_non_working', false, null),
  ('2026-12-25', 'Christmas Day', 'regular', false, null),
  ('2026-12-30', 'Rizal Day', 'regular', false, null),
  ('2026-12-31', 'Last Day of the Year', 'special_non_working', false, null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Default leave approval flow: Immediate Supervisor -> Department Head.
-- Steps with nobody to resolve are skipped; if nobody resolves at all, HR
-- managers receive the request.
-- ---------------------------------------------------------------------------
with flow as (
  insert into public.approval_flows (name, request_type)
  values ('Default leave approval', 'leave')
  returning id
)
insert into public.approval_flow_steps (flow_id, step_order, approver_kind, escalate_after_days)
select flow.id, s.step_order, s.kind::public.approver_kind, 2
from flow
cross join (values (1, 'supervisor'), (2, 'department_head')) as s(step_order, kind);

-- ---------------------------------------------------------------------------
-- Anonymous users get nothing from the public schema.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
