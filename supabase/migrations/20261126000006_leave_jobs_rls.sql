-- =============================================================================
-- Surepay HRIS — 0006 Leave scheduled jobs, team calendar, grants and RLS
-- =============================================================================

-- Grants/accrues credits for the year of p_as_of, up to p_as_of.
--   upfront     : full annual credit on 1 Jan (pro-rated by month for new hires)
--   monthly     : annual credit / 12 on the 1st of each month (hired after the
--                 15th starts the following month)
--   anniversary : annual credit on each service anniversary (e.g. SIL)
-- min_service_months delays the first credit until the employee qualifies.
-- Idempotent: safe to run every day.
create or replace function public.run_leave_accruals(p_as_of date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_as_of date := coalesce(p_as_of, private.today());
  v_year integer := extract(year from v_as_of)::int;
  v_year_start date := make_date(v_year, 1, 1);
  v_emp public.employees;
  v_type public.leave_types;
  v_check public.leave_types;
  v_eligible_from date;
  v_start date;
  v_month date;
  v_amount numeric;
  v_anniv date;
  v_inserted integer := 0;
  v_rows integer;
begin
  if not (private.is_service_role() or private.has_permission('leave.configure')) then
    raise exception 'Not allowed.';
  end if;

  for v_emp in
    select * from public.employees
    where archived_at is null
      and employment_status <> 'separated'
      and date_hired <= v_as_of
  loop
    for v_type in
      select * from public.leave_types
      where is_active and balance_tracked and accrual_method <> 'none' and annual_credit > 0
    loop
      -- Non-service eligibility (sex, civil status, employment type...) as of today.
      v_check := v_type;
      v_check.min_service_months := 0;
      continue when private.leave_ineligibility_reason(v_emp, v_check, v_as_of) is not null;

      v_eligible_from := (v_emp.date_hired + make_interval(months => v_type.min_service_months))::date;
      continue when v_eligible_from > v_as_of;
      v_start := greatest(v_year_start, v_eligible_from);

      if v_type.accrual_method = 'upfront' then
        v_amount := v_type.annual_credit;
        if v_type.prorate_new_hires and v_start > v_year_start then
          -- months remaining including the start month, rounded to the nearest half day
          v_amount := round(v_type.annual_credit * (13 - extract(month from v_start)) / 12 * 2) / 2;
        end if;
        if v_amount > 0 then
          insert into public.leave_ledger_entries
            (employee_id, leave_type_id, entry_type, days, effective_date, period_key, reason)
          values
            (v_emp.id, v_type.id, 'grant', v_amount, v_start, 'Y' || v_year, 'Annual credit ' || v_year)
          on conflict do nothing;
          get diagnostics v_rows = row_count;
          v_inserted := v_inserted + v_rows;
        end if;

      elsif v_type.accrual_method = 'monthly' then
        v_month := date_trunc('month', v_start)::date;
        if extract(day from v_start) > 15 then
          v_month := (v_month + interval '1 month')::date;
        end if;
        while v_month <= v_as_of loop
          insert into public.leave_ledger_entries
            (employee_id, leave_type_id, entry_type, days, effective_date, period_key, reason)
          values
            (v_emp.id, v_type.id, 'accrual', round(v_type.annual_credit / 12, 3), v_month,
             'M' || to_char(v_month, 'YYYY-MM'), 'Monthly accrual ' || to_char(v_month, 'Mon YYYY'))
          on conflict do nothing;
          get diagnostics v_rows = row_count;
          v_inserted := v_inserted + v_rows;
          v_month := (v_month + interval '1 month')::date;
        end loop;

      elsif v_type.accrual_method = 'anniversary' then
        v_anniv := (v_emp.date_hired
                    + make_interval(years => v_year - extract(year from v_emp.date_hired)::int))::date;
        if v_anniv > v_emp.date_hired and v_anniv >= v_eligible_from and v_anniv <= v_as_of then
          insert into public.leave_ledger_entries
            (employee_id, leave_type_id, entry_type, days, effective_date, period_key, reason)
          values
            (v_emp.id, v_type.id, 'grant', v_type.annual_credit, v_anniv, 'A' || v_year,
             'Service anniversary credit ' || v_year)
          on conflict do nothing;
          get diagnostics v_rows = row_count;
          v_inserted := v_inserted + v_rows;
        end if;
      end if;
    end loop;
  end loop;
  return v_inserted;
end;
$$;

-- Year-end close for p_year (run on/after 1 Jan of the following year):
--   1. carry over up to carry_over_cap (null = unlimited)
--   2. convert the remainder to cash up to conversion_cap (if convertible)
--   3. forfeit whatever is left
-- Conversion rows are what payroll (Phase 2) pays out. Idempotent per year.
create or replace function public.run_leave_year_end(p_year integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dec31 date := make_date(p_year, 12, 31);
  v_row record;
  v_carry numeric;
  v_rest numeric;
  v_conv numeric;
  v_count integer := 0;
  v_rows integer;
begin
  if not (private.is_service_role() or private.has_permission('leave.configure')) then
    raise exception 'Not allowed.';
  end if;
  if p_year >= extract(year from private.today()) then
    raise exception 'Year-end can only be run for a year that has ended.';
  end if;

  for v_row in
    select e.id as employee_id, t.id as leave_type_id, t.carry_over_cap,
           t.convertible_to_cash, t.conversion_cap,
           private.leave_balance(e.id, t.id, v_dec31) as bal
    from public.employees e
    cross join public.leave_types t
    where t.balance_tracked
      and e.date_hired <= v_dec31
  loop
    continue when v_row.bal <= 0;
    v_carry := case when v_row.carry_over_cap is null then v_row.bal
                    else least(v_row.bal, v_row.carry_over_cap) end;
    v_rest := v_row.bal - v_carry;

    if v_rest > 0 and v_row.convertible_to_cash then
      v_conv := case when v_row.conversion_cap is null then v_rest
                     else least(v_rest, v_row.conversion_cap) end;
      insert into public.leave_ledger_entries
        (employee_id, leave_type_id, entry_type, days, effective_date, period_key, reason)
      values (v_row.employee_id, v_row.leave_type_id, 'conversion', -v_conv, v_dec31, 'Y' || p_year,
              'Year-end cash conversion ' || p_year)
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
      v_rest := v_rest - v_conv;
    end if;

    if v_rest > 0 then
      insert into public.leave_ledger_entries
        (employee_id, leave_type_id, entry_type, days, effective_date, period_key, reason)
      values (v_row.employee_id, v_row.leave_type_id, 'forfeiture', -v_rest, v_dec31, 'Y' || p_year,
              'Year-end forfeiture ' || p_year)
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Team calendar: approved/pending leave of people in the same department, with
-- the same supervisor, or reporting to the viewer — without reasons/attachments.
create or replace function public.get_team_leave_calendar(p_from date, p_to date)
returns table (
  leave_request_id uuid,
  employee_id uuid,
  employee_name text,
  leave_type_name text,
  color text,
  start_date date,
  end_date date,
  day_portion public.day_portion,
  status public.leave_status
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select e.id, e.department_id, e.supervisor_id
    from public.employees e where e.id = private.current_employee_id()
  )
  select r.id, e.id, e.first_name || ' ' || e.last_name, t.name, t.color,
         r.start_date, r.end_date, r.day_portion, r.status
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  join public.leave_types t on t.id = r.leave_type_id
  cross join me
  where r.status in ('pending', 'approved')
    and r.start_date <= p_to and r.end_date >= p_from
    and (
      e.id = me.id
      or (me.department_id is not null and e.department_id = me.department_id)
      or (me.supervisor_id is not null and e.supervisor_id = me.supervisor_id)
      or private.is_manager_of(e.id)
    )
  order by r.start_date, e.last_name;
$$;

revoke execute on function public.preview_leave_request(uuid, date, date, public.day_portion) from anon, public;
revoke execute on function public.submit_leave_request(uuid, date, date, public.day_portion, text, text) from anon, public;
revoke execute on function public.cancel_leave_request(uuid, text) from anon, public;
revoke execute on function public.adjust_leave_balance(uuid, uuid, numeric, text, public.ledger_entry_type, date) from anon, public;
revoke execute on function public.run_leave_accruals(date) from anon, public;
revoke execute on function public.run_leave_year_end(integer) from anon, public;
revoke execute on function public.get_team_leave_calendar(date, date) from anon, public;
grant execute on function public.preview_leave_request(uuid, date, date, public.day_portion) to authenticated;
grant execute on function public.submit_leave_request(uuid, date, date, public.day_portion, text, text) to authenticated;
grant execute on function public.cancel_leave_request(uuid, text) to authenticated;
grant execute on function public.adjust_leave_balance(uuid, uuid, numeric, text, public.ledger_entry_type, date) to authenticated;
grant execute on function public.run_leave_accruals(date) to authenticated, service_role;
grant execute on function public.run_leave_year_end(integer) to authenticated, service_role;
grant execute on function public.get_team_leave_calendar(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — requests and ledger are written only through the functions above.
-- ---------------------------------------------------------------------------
alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_ledger_entries enable row level security;

create policy leave_types_select on public.leave_types for select to authenticated using (true);
create policy leave_types_write on public.leave_types for all to authenticated
  using (private.has_permission('leave.configure'))
  with check (private.has_permission('leave.configure'));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (
    employee_id = private.current_employee_id()
    or private.has_permission('leave.view_all')
    or private.is_manager_of(employee_id)
    or (approval_request_id is not null and private.is_approver_on_request(approval_request_id))
  );

create policy leave_ledger_select on public.leave_ledger_entries for select to authenticated
  using (
    employee_id = private.current_employee_id()
    or private.has_permission('leave.view_all')
    or private.is_manager_of(employee_id)
  );
