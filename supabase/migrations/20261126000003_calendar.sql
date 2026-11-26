-- =============================================================================
-- Surepay HRIS — 0003 Holiday calendar and work schedules
-- =============================================================================

create type public.holiday_type as enum ('regular', 'special_non_working', 'special_working', 'local');

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  holiday_type public.holiday_type not null,
  location_id uuid references public.locations (id) on delete cascade, -- null = nationwide
  is_verified boolean not null default false, -- HR confirmed against the Proclamation
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (holiday_date, location_id, name)
);

create index holidays_date_idx on public.holidays (holiday_date);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  -- ISO day of week: 1 = Monday ... 7 = Sunday
  work_days smallint[] not null default '{1,2,3,4,5}',
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  break_minutes integer not null default 60 check (break_minutes >= 0),
  is_flexible boolean not null default false,
  core_start time,
  core_end time,
  is_night_shift boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (work_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(work_days) > 0)
);

-- Exactly one default schedule.
create unique index schedules_one_default on public.schedules (is_default) where is_default;

create table public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  schedule_id uuid not null references public.schedules (id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (employee_id, effective_from)
);

create trigger holidays_updated_at before update on public.holidays
for each row execute function private.set_updated_at();
create trigger schedules_updated_at before update on public.schedules
for each row execute function private.set_updated_at();

-- Schedule in force for an employee on a date (falls back to the default).
create or replace function private.schedule_for(p_employee uuid, p_date date)
returns public.schedules
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.schedules s
  where s.id = coalesce(
    (select es.schedule_id
     from public.employee_schedules es
     where es.employee_id = p_employee
       and es.effective_from <= p_date
       and (es.effective_to is null or es.effective_to >= p_date)
     order by es.effective_from desc
     limit 1),
    (select d.id from public.schedules d where d.is_default limit 1)
  );
$$;

-- Non-working holiday for the employee's location (or nationwide) on a date.
create or replace function private.is_holiday_for(p_employee uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.holidays h
    left join public.employees e on e.id = p_employee
    where h.holiday_date = p_date
      and h.holiday_type in ('regular', 'special_non_working', 'local')
      and (h.location_id is null or h.location_id = e.location_id)
  );
$$;

create or replace function private.is_workday(p_employee uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_schedule public.schedules;
begin
  v_schedule := private.schedule_for(p_employee, p_date);
  if v_schedule.id is null then
    -- No schedule configured at all: assume Monday–Friday.
    if extract(isodow from p_date) > 5 then
      return false;
    end if;
  elsif not (extract(isodow from p_date)::smallint = any (v_schedule.work_days)) then
    return false;
  end if;
  return not private.is_holiday_for(p_employee, p_date);
end;
$$;

-- Add N business days (Mon–Fri, nationwide non-working holidays excluded).
create or replace function private.add_business_days(p_from date, p_days integer)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date := p_from;
  v_left integer := greatest(p_days, 0);
begin
  while v_left > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) <= 5 and not exists (
      select 1 from public.holidays h
      where h.holiday_date = v_date
        and h.location_id is null
        and h.holiday_type in ('regular', 'special_non_working')
    ) then
      v_left := v_left - 1;
    end if;
  end loop;
  return v_date;
end;
$$;

-- Business days strictly between two dates (used for notice-period checks).
create or replace function private.business_days_between(p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from generate_series(p_from + 1, p_to - 1, interval '1 day') g(d)
  where extract(isodow from g.d) <= 5
    and not exists (
      select 1 from public.holidays h
      where h.holiday_date = g.d::date
        and h.location_id is null
        and h.holiday_type in ('regular', 'special_non_working')
    );
$$;

-- RLS ------------------------------------------------------------------------
alter table public.holidays enable row level security;
alter table public.schedules enable row level security;
alter table public.employee_schedules enable row level security;

create policy holidays_select on public.holidays for select to authenticated using (true);
create policy holidays_write on public.holidays for all to authenticated
  using (private.has_permission('settings.manage'))
  with check (private.has_permission('settings.manage'));

create policy schedules_select on public.schedules for select to authenticated using (true);
create policy schedules_write on public.schedules for all to authenticated
  using (private.has_permission('settings.manage'))
  with check (private.has_permission('settings.manage'));

create policy employee_schedules_select on public.employee_schedules for select to authenticated
  using (employee_id = private.current_employee_id()
         or private.has_permission('employee.view')
         or private.is_manager_of(employee_id));
create policy employee_schedules_write on public.employee_schedules for all to authenticated
  using (private.has_permission('employee.manage'))
  with check (private.has_permission('employee.manage'));
