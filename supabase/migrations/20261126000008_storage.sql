-- =============================================================================
-- Surepay HRIS — 0008 Private file storage
--
-- Bucket "employee-files", object paths:  {employee_id}/{category}/{file}
--   category = documents | leave
-- Files are only ever served through short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-files', 'employee-files', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create or replace function private.file_employee_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;

create or replace function private.can_read_employee_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.file_employee_id(p_name) is not null and (
    private.file_employee_id(p_name) = private.current_employee_id()
    or private.has_permission('employee.view')
    or (split_part(p_name, '/', 2) = 'leave' and (
          private.has_permission('leave.view_all')
          or private.is_manager_of(private.file_employee_id(p_name))
          or exists (
            select 1 from public.leave_requests r
            where r.attachment_path = p_name
              and r.approval_request_id is not null
              and private.is_approver_on_request(r.approval_request_id)
          )))
  );
$$;

create or replace function private.can_write_employee_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.file_employee_id(p_name) is not null and (
    private.has_permission('employee.manage')
    or (private.file_employee_id(p_name) = private.current_employee_id()
        and split_part(p_name, '/', 2) in ('leave', 'documents'))
  );
$$;

create policy employee_files_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-files' and private.can_read_employee_file(name));

create policy employee_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-files' and private.can_write_employee_file(name));

-- Employees may remove their own leave attachment (e.g. when a submit fails);
-- everything else is removed by HR only.
create policy employee_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-files' and (
      private.has_permission('employee.manage')
      or (private.file_employee_id(name) = private.current_employee_id()
          and split_part(name, '/', 2) = 'leave'
          and not exists (select 1 from public.leave_requests r where r.attachment_path = name))
    )
  );
