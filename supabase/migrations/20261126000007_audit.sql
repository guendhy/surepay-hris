-- =============================================================================
-- Surepay HRIS — 0007 Append-only audit trail (ISO 27001 A.8.15 logging)
-- =============================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  context jsonb
);

create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);

-- Row-change trigger. Only changed columns are stored for updates.
create or replace function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_record text;
  v_key text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    -- keep only the keys that actually changed
    for v_key in select jsonb_object_keys(v_new) loop
      if v_new -> v_key = v_old -> v_key then
        v_new := v_new - v_key;
        v_old := v_old - v_key;
      end if;
    end loop;
    v_new := v_new - 'updated_at';
    v_old := v_old - 'updated_at';
    if v_new = '{}'::jsonb then
      return null;
    end if;
  end if;

  v_record := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'id',
    to_jsonb(coalesce(new, old)) ->> 'employee_id',
    to_jsonb(coalesce(new, old)) ->> 'key',
    to_jsonb(coalesce(new, old)) ->> 'user_id'
  );

  insert into public.audit_log (actor_user_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, v_record, v_old, v_new);
  return null;
end;
$$;

-- Audit rows can never be changed or removed, by anyone.
create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The audit log is append-only.';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
for each row execute function private.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
for each statement execute function private.audit_log_immutable();

-- Attach the row-change trigger to every HR table.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'roles', 'role_permissions', 'user_roles', 'app_settings',
    'locations', 'departments', 'job_levels', 'positions',
    'employees', 'employee_government_ids', 'employee_compensation', 'salary_histories',
    'dependents', 'employee_documents',
    'holidays', 'schedules', 'employee_schedules',
    'announcements', 'approval_flows', 'approval_flow_steps', 'approval_tasks', 'approval_delegations',
    'leave_types', 'leave_requests', 'leave_ledger_entries'
  ] loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
       for each row execute function private.audit_trigger()', v_table);
  end loop;
end;
$$;

-- Application events (sign-in, MFA, exports, viewing sensitive data).
create or replace function public.log_event(p_action text, p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null and not private.is_service_role() then
    raise exception 'Not signed in.';
  end if;
  if p_action !~ '^(auth|mfa|export|view|file|admin)\.[a-z_.]+$' then
    raise exception 'Invalid audit action.';
  end if;
  insert into public.audit_log (actor_user_id, action, context)
  values (auth.uid(), p_action, coalesce(p_context, '{}'::jsonb));
end;
$$;

revoke execute on function public.log_event(text, jsonb) from anon, public;
grant execute on function public.log_event(text, jsonb) to authenticated, service_role;

alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log for select to authenticated
  using (private.has_sensitive_permission('audit.view'));
-- No insert/update/delete policies: rows are written only by the definer functions.

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
