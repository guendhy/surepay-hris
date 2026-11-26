-- =============================================================================
-- Surepay HRIS — 0010 Functions used by the web app (session, dashboards)
-- =============================================================================

-- Everything the app needs to know about the signed-in user, in one round trip.
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'email', (select p.email from public.profiles p where p.id = auth.uid()),
    'is_active', coalesce((select p.is_active from public.profiles p where p.id = auth.uid()), false),
    'roles', coalesce((
      select jsonb_agg(r.code order by r.code)
      from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct rp.permission_code)
      from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid()), '[]'::jsonb),
    'requires_mfa', private.user_requires_mfa(auth.uid()),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'is_manager', (
      exists (select 1 from public.employees e
              where e.supervisor_id = private.current_employee_id() and e.archived_at is null)
      or exists (select 1 from public.departments d
                 where d.head_employee_id = private.current_employee_id())),
    'employee', (
      select jsonb_build_object(
        'id', e.id, 'employee_no', e.employee_no, 'first_name', e.first_name,
        'last_name', e.last_name, 'department_id', e.department_id,
        'department_name', d.name, 'position_title', p.title)
      from public.employees e
      left join public.departments d on d.id = e.department_id
      left join public.positions p on p.id = e.position_id
      where e.id = private.current_employee_id())
  )
  where auth.uid() is not null;
$$;

revoke execute on function public.my_access() from anon, public;
grant execute on function public.my_access() to authenticated;

-- HR dashboard figures (requires reports.view).
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
      select jsonb_agg(jsonb_build_object('name', e.first_name || ' ' || e.last_name, 'type', t.name))
      from public.leave_requests r
      join public.employees e on e.id = r.employee_id
      join public.leave_types t on t.id = r.leave_type_id
      where r.status = 'approved' and v_today between r.start_date and r.end_date), '[]'::jsonb),
    'pending_approvals', (select count(*) from public.approval_requests where status = 'pending'),
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
                            where not is_verified and holiday_date >= v_today)
  );
end;
$$;

revoke execute on function public.hr_dashboard_stats() from anon, public;
grant execute on function public.hr_dashboard_stats() to authenticated;

-- Live notification badge (Supabase Realtime respects RLS on this table).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- People who can receive delegated approvals (active employees with a login).
create or replace function public.get_delegate_candidates()
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id, e.first_name || ' ' || e.last_name
  from public.employees e
  join public.profiles p on p.id = e.user_id and p.is_active
  where auth.uid() is not null
    and e.archived_at is null
    and e.employment_status <> 'separated'
  order by e.last_name, e.first_name;
$$;

revoke execute on function public.get_delegate_candidates() from anon, public;
grant execute on function public.get_delegate_candidates() to authenticated;
