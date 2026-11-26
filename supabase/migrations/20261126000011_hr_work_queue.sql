-- =============================================================================
-- Surepay HRIS — 0011 HR work queue figures for the redesigned dashboard
-- Adds escalated approvals, expiring documents and employees without a login
-- to hr_dashboard_stats(). Existing keys are unchanged.
-- =============================================================================

create or replace function public.hr_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.today();
  v_month_start date := date_trunc('month', private.today())::date;
begin
  if not private.has_permission('reports.view') then
    raise exception 'Not allowed.';
  end if;

  return jsonb_build_object(
    'headcount', (select count(*) from public.employees
                  where archived_at is null and employment_status <> 'separated'),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc)
      from (select coalesce(d.name, 'Unassigned') as name, count(*) as n
            from public.employees e left join public.departments d on d.id = e.department_id
            where e.archived_at is null and e.employment_status <> 'separated'
            group by d.name) x), '[]'::jsonb),
    'by_employment_type', coalesce((
      select jsonb_agg(jsonb_build_object('name', t, 'count', n) order by n desc)
      from (select employment_type::text as t, count(*) as n
            from public.employees
            where archived_at is null and employment_status <> 'separated'
            group by employment_type) x), '[]'::jsonb),
    'new_hires_this_month', (select count(*) from public.employees
                             where date_hired >= v_month_start and date_hired <= v_today),
    'separations_this_month', (select count(*) from public.employees
                               where separation_date >= v_month_start and separation_date <= v_today),
    'on_leave_today', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.first_name || ' ' || e.last_name, 'type', t.name,
                                          'code', t.code, 'department', d.name))
      from public.leave_requests r
      join public.employees e on e.id = r.employee_id
      join public.leave_types t on t.id = r.leave_type_id
      left join public.departments d on d.id = e.department_id
      where r.status = 'approved' and v_today between r.start_date and r.end_date), '[]'::jsonb),
    'pending_approvals', (select count(*) from public.approval_requests where status = 'pending'),
    'escalated_approvals', (
      select count(distinct t.approval_request_id)
      from public.approval_tasks t
      join public.approval_requests r on r.id = t.approval_request_id
      where r.status = 'pending' and t.status = 'pending'
        and (t.escalated_at is not null or t.is_escalation)),
    'regularizations_due', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name,
                                          'due', e.regularization_due_date) order by e.regularization_due_date)
      from public.employees e
      where e.employment_type = 'probationary' and e.archived_at is null
        and e.employment_status <> 'separated'
        and e.regularization_due_date between v_today - 30 and v_today + 45), '[]'::jsonb),
    'birthdays_this_month', coalesce((
      select jsonb_agg(jsonb_build_object('name', e.first_name || ' ' || e.last_name,
                                          'day', extract(day from e.birth_date)) order by extract(day from e.birth_date))
      from public.employees e
      where e.archived_at is null and e.employment_status <> 'separated'
        and extract(month from e.birth_date) = extract(month from v_today)), '[]'::jsonb),
    'unverified_holidays', (select count(*) from public.holidays
                            where not is_verified and holiday_date >= v_today),
    'expiring_documents', (select count(*) from public.employee_documents d
                           join public.employees e on e.id = d.employee_id
                           where d.archived_at is null and d.expires_on is not null
                             and d.expires_on <= v_today + 30
                             and e.archived_at is null and e.employment_status <> 'separated'),
    'no_login', (select count(*) from public.employees
                 where user_id is null and archived_at is null and employment_status <> 'separated')
  );
end;
$$;

revoke execute on function public.hr_dashboard_stats() from anon, public;
grant execute on function public.hr_dashboard_stats() to authenticated;
