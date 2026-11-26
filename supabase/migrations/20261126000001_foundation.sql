-- =============================================================================
-- Surepay HRIS — 0001 Foundation
-- Profiles, RBAC (roles / permissions), app settings, shared helper functions.
--
-- Conventions
--   * public  schema : tables + RPC functions exposed through the Supabase API.
--   * private schema : helper functions used by RLS policies and RPCs. It is NOT
--                      exposed through the API, so its functions cannot be called
--                      directly by clients.
--   * Every table has RLS enabled. Policies are declared next to the table.
--   * All "today" logic uses Asia/Manila, never the database's UTC current_date.
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Business date in the Philippines. The database runs in UTC, so current_date
-- would be "yesterday" between 00:00 and 08:00 Manila time.
create or replace function private.today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function private.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

-- MFA assurance level of the current session (Supabase puts it in the JWT).
create or replace function private.is_aal2()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Simple named counters for human-readable document numbers (EMP, LV, ...).
create table private.counters (
  key text primary key,
  value integer not null default 0
);

create or replace function private.next_counter(p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value integer;
begin
  insert into private.counters as c (key, value)
  values (p_key, 1)
  on conflict (key) do update set value = c.value + 1
  returning c.value into v_value;
  return v_value;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  requires_mfa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger roles_updated_at before update on public.roles
for each row execute function private.set_updated_at();

create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_id, permission_code)
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index user_roles_role_idx on public.user_roles (role_id);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- App settings (key/value, editable by admins)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger app_settings_updated_at before update on public.app_settings
for each row execute function private.set_updated_at();

alter table public.app_settings enable row level security;

create or replace function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Permission helpers (used everywhere in RLS)
-- ---------------------------------------------------------------------------
create or replace function private.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles pr on pr.id = ur.user_id and pr.is_active
    where ur.user_id = auth.uid()
      and rp.permission_code = p_code
  );
$$;

create or replace function private.has_role(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = p_code
  );
$$;

-- True when any of the user's roles requires MFA (HR, payroll, admin, ...).
create or replace function private.user_requires_mfa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user
      and r.requires_mfa
  );
$$;

-- Sensitive permission = permission AND an MFA-verified (aal2) session.
create or replace function private.has_sensitive_permission(p_code text)
returns boolean
language sql
stable
as $$
  select private.has_permission(p_code) and private.is_aal2();
$$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or private.has_permission('admin.users')
  or private.has_permission('employee.view')
);

-- Only admins change profiles (activation). Users change their name through
-- their employee record, which HR maintains.
create policy profiles_update on public.profiles
for update to authenticated
using (private.has_permission('admin.users'))
with check (private.has_permission('admin.users'));

create policy roles_select on public.roles
for select to authenticated using (true);

create policy roles_write on public.roles
for all to authenticated
using (private.has_sensitive_permission('admin.roles'))
with check (private.has_sensitive_permission('admin.roles'));

create policy permissions_select on public.permissions
for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
for select to authenticated using (true);

create policy role_permissions_write on public.role_permissions
for all to authenticated
using (private.has_sensitive_permission('admin.roles'))
with check (private.has_sensitive_permission('admin.roles'));

create policy user_roles_select on public.user_roles
for select to authenticated
using (user_id = auth.uid() or private.has_permission('admin.users'));

-- Granting roles requires an MFA session and nobody may change their own roles.
create policy user_roles_insert on public.user_roles
for insert to authenticated
with check (private.has_sensitive_permission('admin.users') and user_id <> auth.uid());

create policy user_roles_delete on public.user_roles
for delete to authenticated
using (private.has_sensitive_permission('admin.users') and user_id <> auth.uid());

create policy app_settings_select on public.app_settings
for select to authenticated using (true);

create policy app_settings_write on public.app_settings
for all to authenticated
using (private.has_permission('settings.manage'))
with check (private.has_permission('settings.manage'));
