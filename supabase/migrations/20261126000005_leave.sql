-- =============================================================================
-- Surepay HRIS — 0005 Leave management
--
-- Balances are a LEDGER: every grant, accrual, use, reversal, conversion,
-- forfeiture and adjustment is a dated row. A balance is the sum of the ledger.
-- Filing rules are enforced here (not only in the UI) so they cannot be bypassed.
-- =============================================================================

create type public.accrual_method as enum ('upfront', 'monthly', 'anniversary', 'none');
create type public.day_portion as enum ('full', 'am', 'pm');
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'returned', 'cancelled');
create type public.ledger_entry_type as enum (
  'opening_balance', 'grant', 'accrual', 'usage', 'usage_reversal',
  'carry_over', 'forfeiture', 'conversion', 'adjustment'
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text,
  legal_basis text,
  color text not null default '#2563eb',
  is_paid boolean not null default true,
  is_statutory boolean not null default false,

  -- Balance & accrual
  balance_tracked boolean not null default true,
  annual_credit numeric(6, 2) not null default 0 check (annual_credit >= 0),
  accrual_method public.accrual_method not null default 'upfront',
  prorate_new_hires boolean not null default true,
  allow_negative boolean not null default false,
  carry_over_cap numeric(6, 2) default 0,          -- null = unlimited carry-over
  convertible_to_cash boolean not null default false,
  conversion_cap numeric(6, 2),                    -- null = convert all remaining

  -- Filing rules
  counts_calendar_days boolean not null default false, -- e.g. maternity: 105 calendar days
  allow_half_day boolean not null default true,
  min_notice_days integer not null default 0 check (min_notice_days >= 0),
  notice_enforcement text not null default 'warn' check (notice_enforcement in ('none', 'warn', 'block')),
  max_backdate_days integer not null default 0 check (max_backdate_days >= 0),
  max_days_per_request numeric(6, 2),
  attachment_required_after_days numeric(6, 2),    -- null = never; 0 = always

  -- Eligibility
  eligible_sex public.sex,
  requires_married boolean not null default false,
  requires_solo_parent boolean not null default false,
  min_service_months integer not null default 0 check (min_service_months >= 0),
  eligible_employment_types public.employment_type[],  -- null = all

  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger leave_types_updated_at before update on public.leave_types
for each row execute function private.set_updated_at();

alter table public.approval_flows
  add constraint approval_flows_leave_type_fk
  foreign key (leave_type_id) references public.leave_types (id) on delete cascade;

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  day_portion public.day_portion not null default 'full',
  days numeric(6, 2) not null check (days > 0),
  reason text,
  attachment_path text,
  status public.leave_status not null default 'pending',
  approval_request_id uuid references public.approval_requests (id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (day_portion = 'full' or start_date = end_date)
);

create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);
create index leave_requests_dates_idx on public.leave_requests (start_date, end_date) where status in ('pending', 'approved');

create trigger leave_requests_updated_at before update on public.leave_requests
for each row execute function private.set_updated_at();

create table public.leave_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  days numeric(7, 3) not null check (days <> 0),
  effective_date date not null,
  period_key text,  -- makes scheduled jobs idempotent (e.g. M2026-03, Y2026)
  leave_request_id uuid references public.leave_requests (id) on delete set null,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, entry_type, period_key)
);

create index leave_ledger_employee_idx on public.leave_ledger_entries (employee_id, leave_type_id, effective_date);

-- Balance view (security invoker: RLS of the underlying tables applies).
create view public.leave_balances
with (security_invoker = true)
as
with ledger as (
  select employee_id, leave_type_id,
         sum(days) as balance,
         sum(days) filter (where entry_type in ('opening_balance', 'grant', 'accrual', 'carry_over', 'adjustment')) as earned,
         -sum(days) filter (where entry_type in ('usage', 'usage_reversal')) as used
  from public.leave_ledger_entries
  group by employee_id, leave_type_id
),
pending as (
  select employee_id, leave_type_id, sum(days) as pending
  from public.leave_requests
  where status = 'pending'
  group by employee_id, leave_type_id
)
select coalesce(l.employee_id, p.employee_id) as employee_id,
       coalesce(l.leave_type_id, p.leave_type_id) as leave_type_id,
       coalesce(l.earned, 0)::numeric(8, 3) as earned,
       coalesce(l.used, 0)::numeric(8, 3) as used,
       coalesce(l.balance, 0)::numeric(8, 3) as balance,
       coalesce(p.pending, 0)::numeric(8, 3) as pending,
       (coalesce(l.balance, 0) - coalesce(p.pending, 0))::numeric(8, 3) as available
from ledger l
full join pending p on p.employee_id = l.employee_id and p.leave_type_id = l.leave_type_id;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.leave_balance(p_employee uuid, p_leave_type uuid, p_as_of date default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(days), 0)
  from public.leave_ledger_entries
  where employee_id = p_employee
    and leave_type_id = p_leave_type
    and (p_as_of is null or effective_date <= p_as_of);
$$;

create or replace function private.leave_pending(p_employee uuid, p_leave_type uuid, p_exclude uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(days), 0)
  from public.leave_requests
  where employee_id = p_employee
    and leave_type_id = p_leave_type
    and status = 'pending'
    and (p_exclude is null or id <> p_exclude);
$$;

-- Days a request deducts, honouring the schedule, holidays and half days.
create or replace function private.count_leave_days(
  p_employee uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_portion public.day_portion
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.leave_types;
  v_days numeric := 0;
  v_date date;
begin
  select * into v_type from public.leave_types where id = p_leave_type;
  if p_end < p_start then
    return 0;
  end if;
  if v_type.counts_calendar_days then
    v_days := (p_end - p_start) + 1;
  else
    v_date := p_start;
    while v_date <= p_end loop
      if private.is_workday(p_employee, v_date) then
        v_days := v_days + 1;
      end if;
      v_date := v_date + 1;
    end loop;
  end if;
  if p_portion <> 'full' then
    v_days := least(v_days, 1) * 0.5;
  end if;
  return v_days;
end;
$$;

-- Is the employee eligible for a leave type on a date? Returns a reason or null.
create or replace function private.leave_ineligibility_reason(
  p_emp public.employees,
  p_type public.leave_types,
  p_on date
)
returns text
language plpgsql
stable
as $$
begin
  if not p_type.is_active then
    return p_type.name || ' is not available.';
  end if;
  if p_type.eligible_sex is not null and p_emp.sex is distinct from p_type.eligible_sex then
    return p_type.name || ' is only available to ' || p_type.eligible_sex::text || ' employees.';
  end if;
  if p_type.requires_married and p_emp.civil_status is distinct from 'married' then
    return p_type.name || ' requires married civil status on your 201 file.';
  end if;
  if p_type.requires_solo_parent and not (
       p_emp.is_solo_parent and (p_emp.solo_parent_id_expiry is null or p_emp.solo_parent_id_expiry >= p_on)) then
    return p_type.name || ' requires a valid Solo Parent ID on file.';
  end if;
  if p_type.min_service_months > 0
     and (p_emp.date_hired + make_interval(months => p_type.min_service_months))::date > p_on then
    return p_type.name || ' requires at least ' || p_type.min_service_months || ' months of service.';
  end if;
  if p_type.eligible_employment_types is not null
     and not (p_emp.employment_type = any (p_type.eligible_employment_types)) then
    return p_type.name || ' is not available for ' || replace(p_emp.employment_type::text, '_', ' ') || ' employees.';
  end if;
  return null;
end;
$$;

-- Full validation. Returns days, available balance, errors and warnings.
create or replace function private.validate_leave_request(
  p_employee uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_portion public.day_portion,
  p_has_attachment boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_emp public.employees;
  v_type public.leave_types;
  v_today date := private.today();
  v_days numeric := 0;
  v_balance numeric := 0;
  v_pending numeric := 0;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_reason text;
  v_notice integer;
  v_team integer;
  v_threshold integer := coalesce((private.setting('team_leave_warning_threshold') #>> '{}')::int, 2);
  v_attachment_required boolean := false;
begin
  select * into v_emp from public.employees where id = p_employee;
  select * into v_type from public.leave_types where id = p_leave_type;

  if v_emp.id is null then
    return jsonb_build_object('errors', jsonb_build_array('No employee record is linked to your account.'));
  end if;
  if v_type.id is null then
    return jsonb_build_object('errors', jsonb_build_array('Unknown leave type.'));
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    return jsonb_build_object('errors', jsonb_build_array('End date must be on or after the start date.'));
  end if;
  if p_end - p_start > 366 then
    return jsonb_build_object('errors', jsonb_build_array('A single request cannot exceed one year.'));
  end if;

  v_reason := private.leave_ineligibility_reason(v_emp, v_type, p_start);
  if v_reason is not null then
    v_errors := v_errors || v_reason;
  end if;

  if p_portion <> 'full' and (p_start <> p_end or not v_type.allow_half_day) then
    v_errors := v_errors || ('Half-day filing is not allowed for this request.')::text;
  end if;

  v_days := private.count_leave_days(p_employee, p_leave_type, p_start, p_end, p_portion);
  if v_days <= 0 then
    v_errors := v_errors || ('The selected dates fall on rest days or holidays only.')::text;
  end if;

  -- Filing after the fact
  if p_start < v_today and (v_today - p_start) > v_type.max_backdate_days then
    v_errors := v_errors || (case when v_type.max_backdate_days = 0
      then v_type.name || ' must be filed before the leave starts.'
      else v_type.name || ' can be filed at most ' || v_type.max_backdate_days || ' day(s) after the fact.' end);
  end if;

  -- Advance notice
  if v_type.min_notice_days > 0 and v_type.notice_enforcement <> 'none' and p_start >= v_today then
    v_notice := private.business_days_between(v_today, p_start) + 1;
    if v_notice < v_type.min_notice_days then
      if v_type.notice_enforcement = 'block' then
        v_errors := v_errors || (v_type.name || ' must be filed at least ' || v_type.min_notice_days || ' working day(s) in advance.');
      else
        v_warnings := v_warnings || (v_type.name || ' should be filed at least ' || v_type.min_notice_days || ' working day(s) in advance.');
      end if;
    end if;
  end if;

  if v_type.max_days_per_request is not null and v_days > v_type.max_days_per_request then
    v_errors := v_errors || (v_type.name || ' allows at most ' || v_type.max_days_per_request || ' day(s) per request.');
  end if;

  if v_type.attachment_required_after_days is not null and v_days > v_type.attachment_required_after_days then
    v_attachment_required := true;
    if p_has_attachment is false then
      v_errors := v_errors || ('A supporting document is required for this request.')::text;
    end if;
  end if;

  -- Overlap with the employee's own pending/approved requests
  if exists (
    select 1 from public.leave_requests r
    where r.employee_id = p_employee
      and r.status in ('pending', 'approved')
      and r.start_date <= p_end and r.end_date >= p_start
      and not (r.start_date = r.end_date and p_start = p_end
               and r.day_portion <> 'full' and p_portion <> 'full' and r.day_portion <> p_portion)
  ) then
    v_errors := v_errors || ('You already have a leave request covering some of these dates.')::text;
  end if;

  -- Balance
  if v_type.balance_tracked then
    v_balance := private.leave_balance(p_employee, p_leave_type);
    v_pending := private.leave_pending(p_employee, p_leave_type);
    if not v_type.allow_negative and v_days > (v_balance - v_pending) then
      v_errors := v_errors || ('Insufficient ' || v_type.name || ' balance: ' || (v_balance - v_pending)
                               || ' day(s) available, ' || v_days || ' requested.');
    end if;
  end if;

  -- Team coverage warning (same department or same supervisor)
  select count(distinct r.employee_id) into v_team
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  where r.employee_id <> p_employee
    and r.status in ('pending', 'approved')
    and r.start_date <= p_end and r.end_date >= p_start
    and ((v_emp.department_id is not null and e.department_id = v_emp.department_id)
         or (v_emp.supervisor_id is not null and e.supervisor_id = v_emp.supervisor_id));
  if v_team >= v_threshold then
    v_warnings := v_warnings || (v_team || ' teammate(s) are already on leave during these dates.');
  end if;

  return jsonb_build_object(
    'days', v_days,
    'balance_tracked', v_type.balance_tracked,
    'balance', v_balance,
    'pending', v_pending,
    'available', v_balance - v_pending,
    'remaining_after', v_balance - v_pending - v_days,
    'attachment_required', v_attachment_required,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee-facing RPCs
-- ---------------------------------------------------------------------------
create or replace function public.preview_leave_request(
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_portion public.day_portion default 'full'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.validate_leave_request(
    private.current_employee_id(), p_leave_type_id, p_start, p_end, p_portion, null);
$$;

create or replace function public.submit_leave_request(
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_portion public.day_portion,
  p_reason text,
  p_attachment_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp uuid := private.current_employee_id();
  v_check jsonb;
  v_id uuid;
  v_no text;
  v_type public.leave_types;
  v_name text;
  v_approval uuid;
begin
  if v_emp is null then
    raise exception 'No employee record is linked to your account.';
  end if;
  if p_attachment_path is not null and p_attachment_path not like v_emp::text || '/leave/%' then
    raise exception 'Invalid attachment.';
  end if;

  -- Serialise submissions per employee so balance checks cannot race.
  perform 1 from public.employees where id = v_emp for update;

  v_check := private.validate_leave_request(v_emp, p_leave_type_id, p_start, p_end,
                                            coalesce(p_portion, 'full'), p_attachment_path is not null);
  if jsonb_array_length(coalesce(v_check -> 'errors', '[]'::jsonb)) > 0 then
    raise exception '%', (select string_agg(e, ' ') from jsonb_array_elements_text(v_check -> 'errors') e);
  end if;

  select * into v_type from public.leave_types where id = p_leave_type_id;
  select first_name || ' ' || last_name into v_name from public.employees where id = v_emp;

  v_no := 'LV-' || to_char(private.today(), 'YYYY') || '-'
          || lpad(private.next_counter('leave:' || to_char(private.today(), 'YYYY'))::text, 5, '0');

  insert into public.leave_requests
    (request_no, employee_id, leave_type_id, start_date, end_date, day_portion, days, reason, attachment_path)
  values
    (v_no, v_emp, p_leave_type_id, p_start, p_end, coalesce(p_portion, 'full'),
     (v_check ->> 'days')::numeric, nullif(trim(p_reason), ''), p_attachment_path)
  returning id into v_id;

  v_approval := private.start_approval(
    'leave', v_id, v_emp, p_leave_type_id,
    v_name || ' — ' || v_type.name || ', ' || to_char(p_start, 'DD Mon YYYY')
      || case when p_end <> p_start then ' to ' || to_char(p_end, 'DD Mon YYYY') else '' end
      || ' (' || (v_check ->> 'days') || ' day/s)');

  update public.leave_requests set approval_request_id = v_approval where id = v_id;
  return v_id;
end;
$$;

-- Called by the approval engine when a leave request is decided.
create or replace function private.on_leave_decision(p_leave_id uuid, p_status public.approval_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.leave_requests;
  v_type public.leave_types;
  v_user uuid;
  v_balance numeric;
begin
  select * into v_req from public.leave_requests where id = p_leave_id for update;
  select * into v_type from public.leave_types where id = v_req.leave_type_id;
  select user_id into v_user from public.employees where id = v_req.employee_id;

  if p_status = 'approved' then
    if v_type.balance_tracked and not v_type.allow_negative then
      v_balance := private.leave_balance(v_req.employee_id, v_req.leave_type_id);
      if v_balance < v_req.days then
        raise exception 'Cannot approve: % balance is now % day(s), request needs % day(s).',
          v_type.name, v_balance, v_req.days;
      end if;
    end if;

    update public.leave_requests
    set status = 'approved', decided_at = now(), decided_by = auth.uid()
    where id = p_leave_id;

    if v_type.balance_tracked then
      insert into public.leave_ledger_entries
        (employee_id, leave_type_id, entry_type, days, effective_date, leave_request_id, reason, created_by)
      values
        (v_req.employee_id, v_req.leave_type_id, 'usage', -v_req.days, v_req.start_date, v_req.id,
         'Leave ' || v_req.request_no, auth.uid());
    end if;
  else
    update public.leave_requests
    set status = p_status::text::public.leave_status,
        decided_at = case when p_status = 'cancelled' then decided_at else now() end,
        decided_by = case when p_status = 'cancelled' then decided_by else auth.uid() end
    where id = p_leave_id;
  end if;

  if p_status <> 'cancelled' then
    perform private.notify(
      v_user,
      'Leave ' || p_status::text,
      v_type.name || ' (' || v_req.request_no || ') from ' || to_char(v_req.start_date, 'DD Mon YYYY')
        || ' was ' || p_status::text || '.',
      '/me/leave', 'leave', true);
  end if;
end;
$$;

-- Employee cancels their own pending/returned or future approved leave.
-- HR (leave.manage) may cancel any leave with a reason.
create or replace function public.cancel_leave_request(p_leave_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.leave_requests;
  v_type public.leave_types;
  v_is_owner boolean;
  v_is_hr boolean := private.has_permission('leave.manage');
begin
  select * into v_req from public.leave_requests where id = p_leave_id for update;
  if v_req.id is null then
    raise exception 'Leave request not found.';
  end if;
  v_is_owner := v_req.employee_id = private.current_employee_id();

  if not (v_is_owner or v_is_hr) then
    raise exception 'You cannot cancel this request.';
  end if;
  if v_req.status not in ('pending', 'approved', 'returned') then
    raise exception 'Only pending or approved requests can be cancelled.';
  end if;
  if v_req.status = 'approved' and v_req.start_date <= private.today() and not v_is_hr then
    raise exception 'Leave that has already started can only be cancelled by HR.';
  end if;
  if coalesce(trim(p_reason), '') = '' and (v_is_hr and not v_is_owner) then
    raise exception 'Please give a reason for cancelling.';
  end if;

  select * into v_type from public.leave_types where id = v_req.leave_type_id;

  if v_req.status = 'pending' and v_req.approval_request_id is not null then
    perform private.finalize_approval(v_req.approval_request_id, 'cancelled');
  end if;

  if v_req.status = 'approved' and v_type.balance_tracked then
    insert into public.leave_ledger_entries
      (employee_id, leave_type_id, entry_type, days, effective_date, leave_request_id, reason, created_by)
    values
      (v_req.employee_id, v_req.leave_type_id, 'usage_reversal', v_req.days, v_req.start_date, v_req.id,
       'Cancelled ' || v_req.request_no, auth.uid());
  end if;

  update public.leave_requests
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = nullif(trim(p_reason), '')
  where id = p_leave_id;

  -- Let approvers know an approved leave was withdrawn.
  if v_req.status = 'approved' then
    perform private.notify(t.acted_by, 'Leave cancelled',
      v_req.request_no || ' (' || v_type.name || ') was cancelled.', '/team/calendar', 'leave', false)
    from public.approval_tasks t
    where t.approval_request_id = v_req.approval_request_id and t.status = 'approved' and t.acted_by is not null;
  end if;
end;
$$;

-- HR manual adjustment (opening balances, corrections).
create or replace function public.adjust_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_days numeric,
  p_reason text,
  p_entry_type public.ledger_entry_type default 'adjustment',
  p_effective_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_permission('leave.adjust') then
    raise exception 'You are not allowed to adjust leave balances.';
  end if;
  if p_entry_type not in ('adjustment', 'opening_balance') then
    raise exception 'Only adjustments and opening balances can be entered manually.';
  end if;
  if coalesce(p_days, 0) = 0 then
    raise exception 'Days must not be zero.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required.';
  end if;
  if p_employee_id = private.current_employee_id() then
    raise exception 'You cannot adjust your own leave balance.';
  end if;

  insert into public.leave_ledger_entries
    (employee_id, leave_type_id, entry_type, days, effective_date, reason, created_by)
  values
    (p_employee_id, p_leave_type_id, p_entry_type, p_days,
     coalesce(p_effective_date, private.today()), trim(p_reason), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

