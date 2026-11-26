-- =============================================================================
-- Surepay HRIS — 0004 Notifications, announcements, and the approval engine
--
-- One engine serves every request type (leave now; OT, OB, loans, ... later).
-- All state transitions happen inside security-definer functions that lock the
-- request row, so two approvers can never act on the same step concurrently and
-- nobody can approve their own request.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Notifications and outgoing email queue
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  link text,
  category text not null default 'general',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Drained by /api/cron/emails (and right after actions via next/server `after`).
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body_text text not null,
  link text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index email_outbox_queued_idx on public.email_outbox (created_at) where status = 'queued';

create or replace function private.notify(
  p_user uuid,
  p_title text,
  p_body text,
  p_link text,
  p_category text,
  p_email boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if p_user is null then
    return;
  end if;
  insert into public.notifications (user_id, title, body, link, category)
  values (p_user, p_title, p_body, p_link, coalesce(p_category, 'general'));

  if p_email then
    select email into v_email from public.profiles where id = p_user and is_active;
    if v_email is not null then
      insert into public.email_outbox (to_email, subject, body_text, link)
      values (v_email, '[Surepay HRIS] ' || p_title, coalesce(p_body, p_title), p_link);
    end if;
  end if;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids));
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from anon, public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'department', 'location')),
  department_id uuid references public.departments (id) on delete cascade,
  location_id uuid references public.locations (id) on delete cascade,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audience <> 'department' or department_id is not null),
  check (audience <> 'location' or location_id is not null)
);

create trigger announcements_updated_at before update on public.announcements
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Approval engine tables
-- ---------------------------------------------------------------------------
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'returned', 'cancelled');
create type public.approval_task_status as enum ('pending', 'approved', 'rejected', 'returned', 'skipped', 'cancelled');
create type public.approver_kind as enum ('supervisor', 'department_head', 'role', 'user');

create table public.approval_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  request_type text not null check (request_type ~ '^[a-z_]+$'),
  leave_type_id uuid, -- FK added in the leave migration
  department_id uuid references public.departments (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger approval_flows_updated_at before update on public.approval_flows
for each row execute function private.set_updated_at();

create table public.approval_flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.approval_flows (id) on delete cascade,
  step_order integer not null check (step_order between 1 and 20),
  approver_kind public.approver_kind not null,
  role_code text references public.roles (code) on update cascade on delete restrict,
  approver_user_id uuid references auth.users (id) on delete set null,
  escalate_after_days integer not null default 2 check (escalate_after_days >= 0),
  unique (flow_id, step_order),
  check (approver_kind <> 'role' or role_code is not null),
  check (approver_kind <> 'user' or approver_user_id is not null)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  subject_id uuid not null,
  requester_employee_id uuid not null references public.employees (id) on delete cascade,
  requester_user_id uuid references auth.users (id) on delete set null,
  flow_id uuid references public.approval_flows (id) on delete set null,
  status public.approval_status not null default 'pending',
  current_step integer not null default 0,
  summary text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (request_type, subject_id)
);

create index approval_requests_requester_idx on public.approval_requests (requester_employee_id);

create table public.approval_tasks (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests (id) on delete cascade,
  step_order integer not null,
  approver_user_id uuid not null references auth.users (id) on delete cascade,
  delegated_from_user_id uuid references auth.users (id) on delete set null,
  is_escalation boolean not null default false,
  status public.approval_task_status not null default 'pending',
  comment text,
  acted_at timestamptz,
  acted_by uuid references auth.users (id) on delete set null,
  due_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

create index approval_tasks_approver_idx on public.approval_tasks (approver_user_id, status);
create index approval_tasks_request_idx on public.approval_tasks (approval_request_id);

create table public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_user_id uuid not null references auth.users (id) on delete cascade,
  delegate_user_id uuid not null references auth.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (delegator_user_id <> delegate_user_id),
  check (ends_on >= starts_on)
);

create index approval_delegations_delegator_idx on public.approval_delegations (delegator_user_id);

-- ---------------------------------------------------------------------------
-- Engine functions
-- ---------------------------------------------------------------------------

-- Delegate in force today for an approver (or the approver themself).
create or replace function private.delegate_for(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select d.delegate_user_id
     from public.approval_delegations d
     join public.profiles p on p.id = d.delegate_user_id and p.is_active
     where d.delegator_user_id = p_user
       and d.is_active
       and private.today() between d.starts_on and d.ends_on
     order by d.created_at desc
     limit 1),
    p_user
  );
$$;

-- Most specific active flow: leave type + department > leave type > department > default.
create or replace function private.find_approval_flow(
  p_request_type text,
  p_leave_type_id uuid,
  p_department_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id
  from public.approval_flows f
  where f.is_active
    and f.request_type = p_request_type
    and (f.leave_type_id is null or f.leave_type_id = p_leave_type_id)
    and (f.department_id is null or f.department_id = p_department_id)
    and exists (select 1 from public.approval_flow_steps s where s.flow_id = f.id)
  order by (f.leave_type_id is not null)::int * 2 + (f.department_id is not null)::int desc,
           f.created_at
  limit 1;
$$;

create or replace function private.resolve_step_approvers(
  p_step public.approval_flow_steps,
  p_requester_employee uuid
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_step.approver_kind = 'supervisor' then
    return query
      select s.user_id
      from public.employees e
      join public.employees s on s.id = e.supervisor_id
      where e.id = p_requester_employee
        and s.user_id is not null
        and s.employment_status <> 'separated';
  elsif p_step.approver_kind = 'department_head' then
    return query
      select h.user_id
      from public.employees e
      join public.departments d on d.id = e.department_id
      join public.employees h on h.id = d.head_employee_id
      where e.id = p_requester_employee
        and h.user_id is not null
        and h.employment_status <> 'separated';
  elsif p_step.approver_kind = 'role' then
    return query
      select ur.user_id
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where r.code = p_step.role_code;
  elsif p_step.approver_user_id is not null then
    return next p_step.approver_user_id;
  end if;
end;
$$;

-- Creates one task per resolved approver (after delegation). Skips the
-- requester, inactive accounts, and anyone who already approved this request.
create or replace function private.create_approval_tasks(
  p_request public.approval_requests,
  p_step_order integer,
  p_candidates uuid[],
  p_escalate_days integer,
  p_is_escalation boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_final uuid;
  v_count integer := 0;
  v_due timestamptz;
begin
  if p_escalate_days > 0 then
    v_due := (private.add_business_days(private.today(), p_escalate_days) + time '17:00')
             at time zone 'Asia/Manila';
  end if;

  foreach v_user in array coalesce(p_candidates, '{}'::uuid[]) loop
    continue when v_user is null;
    v_final := private.delegate_for(v_user);
    if v_final = p_request.requester_user_id then
      v_final := v_user; -- never delegate a task to the requester
    end if;
    continue when v_final = p_request.requester_user_id;
    continue when not exists (select 1 from public.profiles where id = v_final and is_active);
    continue when exists (
      select 1 from public.approval_tasks t
      where t.approval_request_id = p_request.id and t.acted_by = v_final and t.status = 'approved'
    );
    continue when exists (
      select 1 from public.approval_tasks t
      where t.approval_request_id = p_request.id and t.step_order = p_step_order
        and t.approver_user_id = v_final and t.status = 'pending'
    );

    insert into public.approval_tasks
      (approval_request_id, step_order, approver_user_id, delegated_from_user_id, due_at, is_escalation)
    values
      (p_request.id, p_step_order, v_final,
       case when v_final <> v_user then v_user end, v_due, p_is_escalation);

    perform private.notify(
      v_final,
      case when p_is_escalation then 'Escalated approval' else 'Approval needed' end,
      coalesce(p_request.summary, 'A request needs your approval.'),
      '/team/approvals', 'approval', true
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.finalize_approval(
  p_request_id uuid,
  p_status public.approval_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests;
begin
  update public.approval_requests
  set status = p_status, completed_at = now()
  where id = p_request_id and status = 'pending'
  returning * into v_req;

  if v_req.id is null then
    raise exception 'This request is no longer pending.';
  end if;

  update public.approval_tasks
  set status = (case when p_status = 'cancelled' then 'cancelled' else 'skipped' end)::public.approval_task_status
  where approval_request_id = p_request_id and status = 'pending';

  -- Dispatch to the subject's handler.
  if v_req.request_type = 'leave' then
    perform private.on_leave_decision(v_req.subject_id, p_status);
  end if;
end;
$$;

-- Moves the request to the next step that has at least one approver.
create or replace function private.advance_approval(p_request_id uuid, p_after_step integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_step public.approval_flow_steps;
  v_candidates uuid[];
  v_created integer;
begin
  select * into v_req from public.approval_requests where id = p_request_id for update;

  for v_step in
    select * from public.approval_flow_steps
    where flow_id = v_req.flow_id and step_order > p_after_step
    order by step_order
  loop
    select array_agg(a) into v_candidates
    from private.resolve_step_approvers(v_step, v_req.requester_employee_id) a;

    v_created := private.create_approval_tasks(v_req, v_step.step_order, v_candidates, v_step.escalate_after_days);
    if v_created > 0 then
      update public.approval_requests set current_step = v_step.step_order where id = v_req.id;
      return;
    end if;
  end loop;

  -- No further step has an approver.
  if exists (select 1 from public.approval_tasks where approval_request_id = v_req.id and status = 'approved') then
    perform private.finalize_approval(v_req.id, 'approved');
    return;
  end if;

  -- Nobody could be resolved at all: fall back to HR managers, then super admins.
  if p_after_step < 99 then
    select array_agg(ur.user_id) into v_candidates
    from public.user_roles ur join public.roles r on r.id = ur.role_id
    where r.code = 'hr_manager';
    v_created := private.create_approval_tasks(v_req, 99, v_candidates, 2);
    if v_created > 0 then
      update public.approval_requests set current_step = 99 where id = v_req.id;
      return;
    end if;

    select array_agg(ur.user_id) into v_candidates
    from public.user_roles ur join public.roles r on r.id = ur.role_id
    where r.code = 'super_admin';
    v_created := private.create_approval_tasks(v_req, 100, v_candidates, 2);
    if v_created > 0 then
      update public.approval_requests set current_step = 100 where id = v_req.id;
      return;
    end if;
  end if;

  raise exception 'No approver could be found for this request. Ask HR to set your supervisor or approval flow.';
end;
$$;

-- Starts an approval for a subject row. Called by submit_* functions.
create or replace function private.start_approval(
  p_request_type text,
  p_subject_id uuid,
  p_requester_employee uuid,
  p_leave_type_id uuid,
  p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp public.employees;
  v_request_id uuid;
begin
  select * into v_emp from public.employees where id = p_requester_employee;

  insert into public.approval_requests
    (request_type, subject_id, requester_employee_id, requester_user_id, flow_id, summary)
  values
    (p_request_type, p_subject_id, v_emp.id, v_emp.user_id,
     private.find_approval_flow(p_request_type, p_leave_type_id, v_emp.department_id), p_summary)
  returning id into v_request_id;

  perform private.advance_approval(v_request_id, 0);
  return v_request_id;
end;
$$;

create or replace function public.act_on_approval_task(
  p_task_id uuid,
  p_decision text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.approval_tasks;
  v_req public.approval_requests;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;
  if p_decision not in ('approved', 'rejected', 'returned') then
    raise exception 'Invalid decision.';
  end if;

  select * into v_task from public.approval_tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'Approval task not found.';
  end if;

  -- Lock the request first, then re-read the task under the lock.
  select * into v_req from public.approval_requests where id = v_task.approval_request_id for update;
  select * into v_task from public.approval_tasks where id = p_task_id for update;

  if v_task.status <> 'pending' or v_req.status <> 'pending' then
    raise exception 'This approval has already been acted on.';
  end if;
  if v_req.requester_user_id = v_uid then
    raise exception 'You cannot approve your own request.';
  end if;
  if v_task.approver_user_id <> v_uid and not private.has_permission('approvals.override') then
    raise exception 'You are not an approver for this request.';
  end if;
  if p_decision in ('rejected', 'returned') and coalesce(trim(p_comment), '') = '' then
    raise exception 'Please give a reason when rejecting or returning a request.';
  end if;

  update public.approval_tasks
  set status = p_decision::public.approval_task_status,
      comment = nullif(trim(p_comment), ''),
      acted_at = now(),
      acted_by = v_uid
  where id = p_task_id;

  -- Other approvers on the same step no longer need to act.
  update public.approval_tasks
  set status = 'skipped'
  where approval_request_id = v_req.id
    and step_order = v_task.step_order
    and status = 'pending'
    and id <> p_task_id;

  if p_decision = 'approved' then
    perform private.advance_approval(v_req.id, v_task.step_order);
  else
    perform private.finalize_approval(v_req.id, p_decision::public.approval_status);
  end if;
end;
$$;

-- All-or-nothing bulk action.
create or replace function public.bulk_act_on_approval_tasks(
  p_task_ids uuid[],
  p_decision text,
  p_comment text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  foreach v_id in array coalesce(p_task_ids, '{}'::uuid[]) loop
    perform public.act_on_approval_task(v_id, p_decision, p_comment);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Overdue tasks get an extra task for HR managers (original approver keeps theirs).
create or replace function public.escalate_overdue_approvals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.approval_tasks;
  v_req public.approval_requests;
  v_hr uuid[];
  v_count integer := 0;
begin
  if not (private.is_service_role() or private.has_permission('approvals.configure')) then
    raise exception 'Not allowed.';
  end if;

  select array_agg(ur.user_id) into v_hr
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where r.code = 'hr_manager';

  for v_task in
    select t.*
    from public.approval_tasks t
    join public.approval_requests r on r.id = t.approval_request_id
    where t.status = 'pending'
      and r.status = 'pending'
      and not t.is_escalation
      and t.escalated_at is null
      and t.due_at < now()
    for update of t
  loop
    update public.approval_tasks set escalated_at = now() where id = v_task.id;
    select * into v_req from public.approval_requests where id = v_task.approval_request_id;
    perform private.create_approval_tasks(v_req, v_task.step_order, v_hr, 0, true);
    perform private.notify(v_task.approver_user_id, 'Approval overdue',
      coalesce(v_req.summary, 'A request') || ' is waiting for your action and was escalated to HR.',
      '/team/approvals', 'approval', true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.act_on_approval_task(uuid, text, text) from anon, public;
revoke execute on function public.bulk_act_on_approval_tasks(uuid[], text, text) from anon, public;
revoke execute on function public.escalate_overdue_approvals() from anon, public;
grant execute on function public.act_on_approval_task(uuid, text, text) to authenticated;
grant execute on function public.bulk_act_on_approval_tasks(uuid[], text, text) to authenticated;
grant execute on function public.escalate_overdue_approvals() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security; -- no policies: service role only
alter table public.announcements enable row level security;
alter table public.approval_flows enable row level security;
alter table public.approval_flow_steps enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_tasks enable row level security;
alter table public.approval_delegations enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy announcements_select on public.announcements for select to authenticated
  using (
    private.has_permission('announcements.manage')
    or (
      published_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        audience = 'all'
        or (audience = 'department' and department_id = (
              select e.department_id from public.employees e where e.id = private.current_employee_id()))
        or (audience = 'location' and location_id = (
              select e.location_id from public.employees e where e.id = private.current_employee_id()))
      )
    )
  );
create policy announcements_write on public.announcements for all to authenticated
  using (private.has_permission('announcements.manage'))
  with check (private.has_permission('announcements.manage'));

create policy approval_flows_select on public.approval_flows for select to authenticated using (true);
create policy approval_flows_write on public.approval_flows for all to authenticated
  using (private.has_permission('approvals.configure'))
  with check (private.has_permission('approvals.configure'));

create policy approval_flow_steps_select on public.approval_flow_steps for select to authenticated using (true);
create policy approval_flow_steps_write on public.approval_flow_steps for all to authenticated
  using (private.has_permission('approvals.configure'))
  with check (private.has_permission('approvals.configure'));

-- Cross-table checks go through security-definer helpers; referencing each
-- other's tables directly in policies would recurse.
create or replace function private.is_approver_on_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.approval_tasks t
    where t.approval_request_id = p_request_id and t.approver_user_id = auth.uid()
  );
$$;

create or replace function private.is_requester_of(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.approval_requests r
    where r.id = p_request_id and r.requester_user_id = auth.uid()
  );
$$;

-- Requests/tasks are written only through the engine functions (no write policies).
create policy approval_requests_select on public.approval_requests for select to authenticated
  using (
    requester_user_id = auth.uid()
    or private.has_permission('approvals.view_all')
    or private.is_approver_on_request(id)
  );

create policy approval_tasks_select on public.approval_tasks for select to authenticated
  using (
    approver_user_id = auth.uid()
    or private.has_permission('approvals.view_all')
    or private.is_requester_of(approval_request_id)
  );

create policy approval_delegations_select on public.approval_delegations for select to authenticated
  using (delegator_user_id = auth.uid() or delegate_user_id = auth.uid()
         or private.has_permission('approvals.configure'));
create policy approval_delegations_insert on public.approval_delegations for insert to authenticated
  with check (delegator_user_id = auth.uid() or private.has_permission('approvals.configure'));
create policy approval_delegations_update on public.approval_delegations for update to authenticated
  using (delegator_user_id = auth.uid() or private.has_permission('approvals.configure'))
  with check (delegator_user_id = auth.uid() or private.has_permission('approvals.configure'));
