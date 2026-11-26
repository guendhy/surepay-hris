-- =============================================================================
-- Surepay HRIS — 0002 Organisation structure and employee 201 records
-- =============================================================================

create type public.employment_type as enum (
  'probationary', 'regular', 'project', 'fixed_term', 'consultant', 'intern'
);
create type public.employment_status as enum ('active', 'on_leave', 'suspended', 'separated');
create type public.work_setup as enum ('onsite', 'hybrid', 'remote');
create type public.sex as enum ('male', 'female');
create type public.civil_status as enum ('single', 'married', 'widowed', 'separated', 'annulled');
create type public.pay_type as enum ('monthly', 'daily');

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references public.departments (id) on delete set null,
  head_employee_id uuid, -- FK added after employees exists
  cost_center text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);

create table public.job_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  rank integer not null default 0,
  salary_min numeric(15, 2),
  salary_max numeric(15, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references public.departments (id) on delete set null,
  job_level_id uuid references public.job_levels (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, department_id)
);

create trigger locations_updated_at before update on public.locations
for each row execute function private.set_updated_at();
create trigger departments_updated_at before update on public.departments
for each row execute function private.set_updated_at();
create trigger job_levels_updated_at before update on public.job_levels
for each row execute function private.set_updated_at();
create trigger positions_updated_at before update on public.positions
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Employees (201 file — non-sensitive part)
-- ---------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique,
  user_id uuid unique references auth.users (id) on delete set null,

  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  nickname text,
  work_email text not null unique check (work_email = lower(work_email) and work_email like '%@%'),
  personal_email text,
  mobile_number text,
  birth_date date,
  sex public.sex,
  civil_status public.civil_status,
  nationality text default 'Filipino',
  present_address text,
  permanent_address text,
  emergency_contacts jsonb not null default '[]'::jsonb,
  is_solo_parent boolean not null default false,
  solo_parent_id_expiry date,

  department_id uuid references public.departments (id) on delete set null,
  position_id uuid references public.positions (id) on delete set null,
  job_level_id uuid references public.job_levels (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  supervisor_id uuid references public.employees (id) on delete set null,
  employment_type public.employment_type not null default 'probationary',
  employment_status public.employment_status not null default 'active',
  work_setup public.work_setup not null default 'onsite',
  date_hired date not null,
  regularization_due_date date,
  regularization_date date,
  separation_date date,
  separation_reason text,

  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (supervisor_id is distinct from id),
  check (separation_date is null or separation_date >= date_hired)
);

create index employees_department_idx on public.employees (department_id);
create index employees_supervisor_idx on public.employees (supervisor_id);
create index employees_name_idx on public.employees (last_name, first_name);

alter table public.departments
  add constraint departments_head_fk
  foreign key (head_employee_id) references public.employees (id) on delete set null;

create trigger employees_updated_at before update on public.employees
for each row execute function private.set_updated_at();

-- Employee number (e.g. SPT-2026-0001) and regularisation due date defaults.
create or replace function private.employees_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := coalesce(private.setting('employee_no_format'), '{"prefix":"SPT","pad":4}'::jsonb);
  v_year text := to_char(coalesce(new.date_hired, private.today()), 'YYYY');
  v_seq integer;
begin
  if new.employee_no is null or new.employee_no = '' then
    v_seq := private.next_counter('employee_no:' || v_year);
    new.employee_no := (v_cfg ->> 'prefix') || '-' || v_year || '-'
      || lpad(v_seq::text, coalesce((v_cfg ->> 'pad')::int, 4), '0');
  end if;
  if new.regularization_due_date is null and new.employment_type = 'probationary' then
    new.regularization_due_date := (new.date_hired + interval '6 months')::date;
  end if;
  new.work_email := lower(new.work_email);
  return new;
end;
$$;

create trigger employees_before_insert before insert on public.employees
for each row execute function private.employees_before_insert();

-- ---------------------------------------------------------------------------
-- Sensitive data — separate tables with stricter RLS.
-- *_enc columns hold application-level AES-256-GCM ciphertext; the database
-- never sees plaintext government IDs or bank account numbers.
-- ---------------------------------------------------------------------------
create table public.employee_government_ids (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  tin_enc text,
  tin_last4 text,
  sss_enc text,
  sss_last4 text,
  philhealth_enc text,
  philhealth_last4 text,
  pagibig_enc text,
  pagibig_last4 text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.employee_compensation (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  pay_type public.pay_type not null default 'monthly',
  basic_salary numeric(15, 2) not null check (basic_salary >= 0),
  allowances jsonb not null default '[]'::jsonb,
  bank_name text,
  bank_account_enc text,
  bank_account_last4 text,
  effective_date date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.salary_histories (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  effective_date date not null,
  pay_type public.pay_type not null,
  basic_salary numeric(15, 2) not null,
  reason text not null,
  remarks text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index salary_histories_employee_idx on public.salary_histories (employee_id, effective_date desc);

create trigger employee_government_ids_updated_at before update on public.employee_government_ids
for each row execute function private.set_updated_at();
create trigger employee_compensation_updated_at before update on public.employee_compensation
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Movement history, dependents, documents
-- ---------------------------------------------------------------------------
create table public.employment_histories (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  effective_date date not null,
  change_type text not null check (change_type in (
    'hired', 'promotion', 'transfer', 'supervisor_change', 'status_change',
    'employment_type_change', 'regularization', 'separation', 'other'
  )),
  from_data jsonb,
  to_data jsonb,
  remarks text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index employment_histories_employee_idx on public.employment_histories (employee_id, effective_date desc);

create table public.dependents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  full_name text not null,
  relationship text not null,
  birth_date date,
  is_hmo_dependent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  document_type text not null,
  title text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  expires_on date,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index employee_documents_employee_idx on public.employee_documents (employee_id);

-- Automatic movement history for changes HR makes on the employee record.
create or replace function private.employees_track_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := private.today();
begin
  if tg_op = 'INSERT' then
    insert into public.employment_histories (employee_id, effective_date, change_type, to_data, created_by)
    values (new.id, new.date_hired, 'hired',
            jsonb_build_object('department_id', new.department_id, 'position_id', new.position_id,
                               'employment_type', new.employment_type), auth.uid());
    return new;
  end if;

  if new.position_id is distinct from old.position_id or new.job_level_id is distinct from old.job_level_id then
    insert into public.employment_histories (employee_id, effective_date, change_type, from_data, to_data, created_by)
    values (new.id, v_date, 'promotion',
            jsonb_build_object('position_id', old.position_id, 'job_level_id', old.job_level_id),
            jsonb_build_object('position_id', new.position_id, 'job_level_id', new.job_level_id), auth.uid());
  end if;
  if new.department_id is distinct from old.department_id or new.location_id is distinct from old.location_id then
    insert into public.employment_histories (employee_id, effective_date, change_type, from_data, to_data, created_by)
    values (new.id, v_date, 'transfer',
            jsonb_build_object('department_id', old.department_id, 'location_id', old.location_id),
            jsonb_build_object('department_id', new.department_id, 'location_id', new.location_id), auth.uid());
  end if;
  if new.supervisor_id is distinct from old.supervisor_id then
    insert into public.employment_histories (employee_id, effective_date, change_type, from_data, to_data, created_by)
    values (new.id, v_date, 'supervisor_change',
            jsonb_build_object('supervisor_id', old.supervisor_id),
            jsonb_build_object('supervisor_id', new.supervisor_id), auth.uid());
  end if;
  if new.employment_type is distinct from old.employment_type then
    insert into public.employment_histories (employee_id, effective_date, change_type, from_data, to_data, created_by)
    values (new.id, coalesce(new.regularization_date, v_date),
            case when new.employment_type = 'regular' then 'regularization' else 'employment_type_change' end,
            jsonb_build_object('employment_type', old.employment_type),
            jsonb_build_object('employment_type', new.employment_type), auth.uid());
  end if;
  if new.employment_status is distinct from old.employment_status then
    insert into public.employment_histories (employee_id, effective_date, change_type, from_data, to_data, created_by)
    values (new.id, coalesce(new.separation_date, v_date),
            case when new.employment_status = 'separated' then 'separation' else 'status_change' end,
            jsonb_build_object('employment_status', old.employment_status),
            jsonb_build_object('employment_status', new.employment_status, 'reason', new.separation_reason),
            auth.uid());
  end if;
  return new;
end;
$$;

create trigger employees_track_history after insert or update on public.employees
for each row execute function private.employees_track_history();

-- When an employee is separated, deactivate their login (ISMS access revocation).
create or replace function private.employees_on_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.employment_status = 'separated' and old.employment_status is distinct from 'separated'
     and new.user_id is not null then
    update public.profiles set is_active = false where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger employees_on_separation after update of employment_status on public.employees
for each row execute function private.employees_on_separation();

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
create or replace function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.employees e
  where e.user_id = auth.uid() and e.archived_at is null
  limit 1;
$$;

-- True when the current user is in the target employee's management chain
-- (direct or indirect supervisor) or heads the target's department.
create or replace function private.is_manager_of(p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive
  me as (select private.current_employee_id() as id),
  chain (id, supervisor_id, depth) as (
    select e.id, e.supervisor_id, 0
    from public.employees e
    where e.id = p_employee
    union all
    select e.id, e.supervisor_id, c.depth + 1
    from public.employees e
    join chain c on e.id = c.supervisor_id
    where c.depth < 25
  )
  select (select id from me) is not null
    and p_employee is distinct from (select id from me)
    and (
      exists (select 1 from chain where supervisor_id = (select id from me))
      or exists (
        select 1
        from public.employees t
        join public.departments d on d.id = t.department_id
        where t.id = p_employee and d.head_employee_id = (select id from me)
      )
    );
$$;

-- Directory: the limited, non-sensitive columns every signed-in employee may see
-- (names for approvals, team calendars, org chart). Full records stay restricted.
create or replace function public.get_employee_directory()
returns table (
  id uuid,
  employee_no text,
  full_name text,
  first_name text,
  last_name text,
  work_email text,
  department_id uuid,
  department_name text,
  position_title text,
  supervisor_id uuid,
  location_id uuid,
  employment_status public.employment_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.employee_no,
         e.first_name || ' ' || e.last_name,
         e.first_name, e.last_name, e.work_email,
         e.department_id, d.name, p.title, e.supervisor_id, e.location_id, e.employment_status
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.positions p on p.id = e.position_id
  where auth.uid() is not null
    and e.archived_at is null
    and e.employment_status <> 'separated'
  order by e.last_name, e.first_name;
$$;

revoke execute on function public.get_employee_directory() from anon, public;
grant execute on function public.get_employee_directory() to authenticated;

-- Employees may update their own contact details (logged by the audit trigger).
create or replace function public.update_my_contact_info(
  p_mobile_number text,
  p_personal_email text,
  p_present_address text,
  p_emergency_contacts jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp uuid := private.current_employee_id();
begin
  if v_emp is null then
    raise exception 'No employee record is linked to your account.';
  end if;
  if p_emergency_contacts is not null and jsonb_typeof(p_emergency_contacts) <> 'array' then
    raise exception 'Emergency contacts must be a list.';
  end if;
  update public.employees
  set mobile_number = nullif(trim(p_mobile_number), ''),
      personal_email = nullif(lower(trim(p_personal_email)), ''),
      present_address = nullif(trim(p_present_address), ''),
      emergency_contacts = coalesce(p_emergency_contacts, emergency_contacts)
  where id = v_emp;
end;
$$;

revoke execute on function public.update_my_contact_info(text, text, text, jsonb) from anon, public;
grant execute on function public.update_my_contact_info(text, text, text, jsonb) to authenticated;

-- Compensation changes always go through this function so a salary history
-- row with a reason is written in the same transaction.
create or replace function public.set_employee_compensation(
  p_employee_id uuid,
  p_pay_type public.pay_type,
  p_basic_salary numeric,
  p_effective_date date,
  p_reason text,
  p_bank_name text,
  p_bank_account_enc text,
  p_bank_account_last4 text,
  p_allowances jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.employee_compensation;
begin
  if not private.has_sensitive_permission('employee.manage_compensation') then
    raise exception 'You are not allowed to change compensation (MFA session required).';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required for compensation changes.';
  end if;

  select * into v_old from public.employee_compensation where employee_id = p_employee_id;

  insert into public.employee_compensation as c
    (employee_id, pay_type, basic_salary, effective_date, bank_name, bank_account_enc,
     bank_account_last4, allowances, updated_by)
  values (p_employee_id, p_pay_type, p_basic_salary, p_effective_date, p_bank_name,
          p_bank_account_enc, p_bank_account_last4, coalesce(p_allowances, '[]'::jsonb), auth.uid())
  on conflict (employee_id) do update set
    pay_type = excluded.pay_type,
    basic_salary = excluded.basic_salary,
    effective_date = excluded.effective_date,
    bank_name = excluded.bank_name,
    bank_account_enc = coalesce(excluded.bank_account_enc, c.bank_account_enc),
    bank_account_last4 = coalesce(excluded.bank_account_last4, c.bank_account_last4),
    allowances = excluded.allowances,
    updated_by = auth.uid();

  if v_old.employee_id is null
     or v_old.basic_salary is distinct from p_basic_salary
     or v_old.pay_type is distinct from p_pay_type then
    insert into public.salary_histories (employee_id, effective_date, pay_type, basic_salary, reason, created_by)
    values (p_employee_id, p_effective_date, p_pay_type, p_basic_salary, p_reason, auth.uid());
  end if;
end;
$$;

revoke execute on function public.set_employee_compensation(uuid, public.pay_type, numeric, date, text, text, text, text, jsonb) from anon, public;
grant execute on function public.set_employee_compensation(uuid, public.pay_type, numeric, date, text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- New auth users: domain restriction, profile, link to employee, default role.
-- ---------------------------------------------------------------------------
create or replace function private.auth_user_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domains jsonb := coalesce(private.setting('allowed_email_domains'), '[]'::jsonb);
begin
  if jsonb_array_length(v_domains) > 0
     and not exists (
       select 1 from jsonb_array_elements_text(v_domains) d
       where lower(split_part(new.email, '@', 2)) = lower(d)
     ) then
    raise exception 'Sign-ups are limited to company email addresses.';
  end if;
  return new;
end;
$$;

create or replace function private.auth_user_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email),
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;

  update public.employees
  set user_id = new.id
  where work_email = lower(new.email) and user_id is null;

  insert into public.user_roles (user_id, role_id)
  select new.id, r.id from public.roles r where r.code = 'employee'
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_before_insert before insert on auth.users
for each row execute function private.auth_user_before_insert();

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.auth_user_after_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.locations enable row level security;
alter table public.departments enable row level security;
alter table public.job_levels enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_government_ids enable row level security;
alter table public.employee_compensation enable row level security;
alter table public.salary_histories enable row level security;
alter table public.employment_histories enable row level security;
alter table public.dependents enable row level security;
alter table public.employee_documents enable row level security;

-- Org reference data: readable by every signed-in user, managed by HR.
create policy locations_select on public.locations for select to authenticated using (true);
create policy locations_write on public.locations for all to authenticated
  using (private.has_permission('org.manage')) with check (private.has_permission('org.manage'));

create policy departments_select on public.departments for select to authenticated using (true);
create policy departments_write on public.departments for all to authenticated
  using (private.has_permission('org.manage')) with check (private.has_permission('org.manage'));

create policy job_levels_select on public.job_levels for select to authenticated using (true);
create policy job_levels_write on public.job_levels for all to authenticated
  using (private.has_permission('org.manage')) with check (private.has_permission('org.manage'));

create policy positions_select on public.positions for select to authenticated using (true);
create policy positions_write on public.positions for all to authenticated
  using (private.has_permission('org.manage')) with check (private.has_permission('org.manage'));

-- Full employee record: the employee themself or HR. Managers use the directory.
create policy employees_select on public.employees for select to authenticated
  using (id = private.current_employee_id() or private.has_permission('employee.view'));
create policy employees_insert on public.employees for insert to authenticated
  with check (private.has_permission('employee.manage'));
create policy employees_update on public.employees for update to authenticated
  using (private.has_permission('employee.manage'))
  with check (private.has_permission('employee.manage'));
-- No delete policy: employees are archived, never deleted.

create policy gov_ids_select on public.employee_government_ids for select to authenticated
  using (employee_id = private.current_employee_id()
         or private.has_sensitive_permission('employee.view_sensitive'));
create policy gov_ids_insert on public.employee_government_ids for insert to authenticated
  with check (private.has_sensitive_permission('employee.manage_sensitive'));
create policy gov_ids_update on public.employee_government_ids for update to authenticated
  using (private.has_sensitive_permission('employee.manage_sensitive'))
  with check (private.has_sensitive_permission('employee.manage_sensitive'));

create policy compensation_select on public.employee_compensation for select to authenticated
  using (employee_id = private.current_employee_id()
         or private.has_sensitive_permission('employee.view_compensation'));
create policy compensation_insert on public.employee_compensation for insert to authenticated
  with check (private.has_sensitive_permission('employee.manage_compensation'));
create policy compensation_update on public.employee_compensation for update to authenticated
  using (private.has_sensitive_permission('employee.manage_compensation'))
  with check (private.has_sensitive_permission('employee.manage_compensation'));

create policy salary_histories_select on public.salary_histories for select to authenticated
  using (employee_id = private.current_employee_id()
         or private.has_sensitive_permission('employee.view_compensation'));
create policy salary_histories_insert on public.salary_histories for insert to authenticated
  with check (private.has_sensitive_permission('employee.manage_compensation'));

create policy employment_histories_select on public.employment_histories for select to authenticated
  using (employee_id = private.current_employee_id() or private.has_permission('employee.view'));
create policy employment_histories_insert on public.employment_histories for insert to authenticated
  with check (private.has_permission('employee.manage'));

create policy dependents_select on public.dependents for select to authenticated
  using (employee_id = private.current_employee_id() or private.has_permission('employee.view'));
create policy dependents_write on public.dependents for all to authenticated
  using (private.has_permission('employee.manage'))
  with check (private.has_permission('employee.manage'));

create policy documents_select on public.employee_documents for select to authenticated
  using (employee_id = private.current_employee_id() or private.has_permission('employee.view'));
create policy documents_insert on public.employee_documents for insert to authenticated
  with check (
    private.has_permission('employee.manage')
    or (employee_id = private.current_employee_id() and uploaded_by = auth.uid())
  );
create policy documents_update on public.employee_documents for update to authenticated
  using (private.has_permission('employee.manage'))
  with check (private.has_permission('employee.manage'));
