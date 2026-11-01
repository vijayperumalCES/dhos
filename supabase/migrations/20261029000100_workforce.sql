-- Stride Phase 3 — Workforce: work calendars and holidays, attendance with approved corrections,
-- leave types, balances and requests, weekly timesheets with approval, dated resource allocations,
-- and capacity / utilisation. See docs/DECISIONS/ADR-0008-workforce-model.md.
--
-- Access policy (separate from delivery data): a person's attendance, leave and timesheets are
-- visible to themselves, their direct manager (reporting line) and holders of hr.read /
-- timesheet.read_all. Requests are reviewed by the direct manager or by hr.manage /
-- timesheet.approve holders, never by the requester. Everyone else sees availability only
-- ("on leave", without type or reason) through team_availability().

-- ---------------------------------------------------------------------------
-- Permissions and role templates (existing organizations are backfilled)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('workforce.self',      'people', 'Record own attendance, request leave and log time'),
  ('hr.read',             'people', 'View attendance, leave requests and balances of every member'),
  ('hr.manage',           'people', 'Configure calendars, holidays and leave types; set balances; review any attendance correction or leave request'),
  ('timesheet.read_all',  'people', 'View every member''s timesheets and the timesheet compliance report'),
  ('timesheet.approve',   'people', 'Approve or reject any member''s timesheet (managers can always review their direct reports)'),
  ('resource.read',       'people', 'View allocations, capacity and utilisation across the organization'),
  ('resource.manage',     'people', 'Create, change and remove dated resource allocations on visible projects');

update private.role_templates set permissions = array['org.members.read','audit.read','client.read','client.confidential.read','client.manage','project.read_all','project.create','project.update','project.change_status','project.archive','project.members.manage','team.read','team.manage','dashboard.portfolio.view','program.manage','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workflow.manage','workforce.self','timesheet.read_all','timesheet.approve','resource.read','resource.manage'] where key = 'delivery_head';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_all','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view','program.manage','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workforce.self','resource.read','resource.manage'] where key = 'program_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workforce.self','resource.read'] where key = 'project_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.update','team.read','dashboard.portfolio.view','work.read','work.create','work.update','work.archive','sprint.manage','workforce.self','resource.read'] where key = 'engineering_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.update','team.read','work.read','work.create','work.update','work.archive','workforce.self'] where key = 'product_owner';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','sprint.manage','workforce.self'] where key = 'scrum_master';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','workforce.self'] where key = 'developer';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','workforce.self'] where key = 'qa_engineer';
update private.role_templates set permissions = array['org.members.read','project.read_all','team.read','team.manage','work.read','workforce.self','timesheet.read_all','resource.read','resource.manage'] where key = 'resource_manager';
update private.role_templates set permissions = array['org.members.read','team.read','workforce.self','hr.read','hr.manage'] where key = 'hr_admin';
update private.role_templates set permissions = array['org.members.read','client.read','client.confidential.read','project.read_all','dashboard.portfolio.view','workforce.self','timesheet.read_all','resource.read'] where key = 'finance_manager';
update private.role_templates set permissions = array['org.members.read','workforce.self'] where key = 'ai_agent_operator';
update private.role_templates set description = 'Manages calendars, attendance and leave policy. Sees attendance and leave detail for everyone.' where key = 'hr_admin';

insert into public.role_permissions (role_id, permission_key)
select r.id, unnest(t.permissions)
from public.role_definitions r
join private.role_templates t on t.key = r.key
where r.is_system
on conflict do nothing;

update public.role_definitions r set description = t.description
from private.role_templates t
where r.key = t.key and r.is_system and r.key = 'hr_admin';

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
-- Permission check for an arbitrary membership (has_permission answers only for the caller).
create or replace function private.membership_has_permission(p_membership uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership_roles mr
    join public.role_permissions rp on rp.role_id = mr.role_id
    where mr.membership_id = p_membership and rp.permission_key = p_permission
  );
$$;

-- The caller may see this person's attendance and leave: themselves, their direct manager, or hr.read.
create or replace function private.can_view_hr_of(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.active_membership_id(m.organization_id) is not null and (
      m.id = private.active_membership_id(m.organization_id)
      or m.manager_membership_id = private.active_membership_id(m.organization_id)
      or public.has_permission(m.organization_id, 'hr.read')
    )
    from public.organization_memberships m where m.id = p_membership
  ), false);
$$;

-- The caller may review this person's attendance corrections and leave: their direct manager or
-- hr.manage — but never their own requests.
create or replace function private.can_review_hr_of(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.active_membership_id(m.organization_id) is not null
       and m.id <> private.active_membership_id(m.organization_id)
       and (m.manager_membership_id = private.active_membership_id(m.organization_id)
            or public.has_permission(m.organization_id, 'hr.manage'))
    from public.organization_memberships m where m.id = p_membership
  ), false);
$$;

create or replace function private.can_view_timesheets_of(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.active_membership_id(m.organization_id) is not null and (
      m.id = private.active_membership_id(m.organization_id)
      or m.manager_membership_id = private.active_membership_id(m.organization_id)
      or public.has_permission(m.organization_id, 'timesheet.read_all')
    )
    from public.organization_memberships m where m.id = p_membership
  ), false);
$$;

create or replace function private.can_review_timesheets_of(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.active_membership_id(m.organization_id) is not null
       and m.id <> private.active_membership_id(m.organization_id)
       and (m.manager_membership_id = private.active_membership_id(m.organization_id)
            or public.has_permission(m.organization_id, 'timesheet.approve'))
    from public.organization_memberships m where m.id = p_membership
  ), false);
$$;

-- Active membership of the caller in p_org that may use self-service workforce features.
create or replace function private.self_workforce_membership(p_org uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership uuid := private.active_membership_id(p_org);
begin
  if v_membership is null or not public.has_permission(p_org, 'workforce.self') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_membership;
end;
$$;

create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- ---------------------------------------------------------------------------
-- Work calendars and holidays
-- ---------------------------------------------------------------------------
create table public.work_calendars (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  working_days    smallint[] not null default '{1,2,3,4,5}'
                  check (cardinality(working_days) between 1 and 7 and working_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  hours_per_day   numeric(4,2) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  unique (id, organization_id),
  check (not (is_default and archived_at is not null))
);
comment on column public.work_calendars.working_days is 'ISO weekdays (1 = Monday … 7 = Sunday) that are working days.';
create unique index work_calendars_org_name_uq on public.work_calendars (organization_id, lower(name)) where archived_at is null;
create unique index work_calendars_org_default_uq on public.work_calendars (organization_id) where is_default;

create trigger work_calendars_updated_at before update on public.work_calendars
  for each row execute function private.set_updated_at();
create trigger work_calendars_audit after insert or update or delete on public.work_calendars
  for each row execute function private.audit_row_change();

create table public.holidays (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  calendar_id     uuid not null,
  holiday_date    date not null,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  created_at      timestamptz not null default now(),
  unique (calendar_id, holiday_date),
  foreign key (calendar_id, organization_id) references public.work_calendars (id, organization_id) on delete cascade
);
create index holidays_calendar_date_idx on public.holidays (calendar_id, holiday_date);

create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function private.audit_row_change();

alter table public.organization_memberships
  add column work_calendar_id uuid,
  add constraint organization_memberships_calendar_fkey
    foreign key (work_calendar_id, organization_id) references public.work_calendars (id, organization_id);

-- The calendar that applies to a member: their own, else the organization default.
create or replace function private.member_calendar(p_membership uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    m.work_calendar_id,
    (select c.id from public.work_calendars c where c.organization_id = m.organization_id and c.is_default))
  from public.organization_memberships m where m.id = p_membership;
$$;

-- Working days of a member in [p_from, p_to]: the calendar's weekdays minus its holidays.
create or replace function private.member_working_days(p_membership uuid, p_from date, p_to date)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select d::date
  from public.work_calendars c
  cross join generate_series(p_from, p_to, interval '1 day') d
  where c.id = private.member_calendar(p_membership)
    and extract(isodow from d)::smallint = any (c.working_days)
    and not exists (select 1 from public.holidays h where h.calendar_id = c.id and h.holiday_date = d::date);
$$;

-- ---------------------------------------------------------------------------
-- Leave types, balances and requests
-- ---------------------------------------------------------------------------
create table public.leave_types (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 2 and 60),
  code                  text not null check (code ~ '^[A-Z0-9_]{2,20}$'),
  is_paid               boolean not null default true,
  requires_approval     boolean not null default true,
  annual_allowance_days numeric(5,1) check (annual_allowance_days is null or annual_allowance_days between 0 and 365),
  position              integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz,
  unique (id, organization_id),
  unique (organization_id, code)
);
comment on column public.leave_types.annual_allowance_days is 'Default yearly allowance. NULL = balance not tracked (e.g. unpaid leave).';

create trigger leave_types_updated_at before update on public.leave_types
  for each row execute function private.set_updated_at();
create trigger leave_types_audit after insert or update or delete on public.leave_types
  for each row execute function private.audit_row_change();

create table public.leave_balances (
  organization_id uuid not null,
  membership_id   uuid not null,
  leave_type_id   uuid not null,
  year            smallint not null check (year between 2000 and 2100),
  granted_days    numeric(5,1) not null check (granted_days between 0 and 365),
  updated_at      timestamptz not null default now(),
  primary key (membership_id, leave_type_id, year),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (leave_type_id, organization_id) references public.leave_types (id, organization_id) on delete cascade
);

create trigger leave_balances_updated_at before update on public.leave_balances
  for each row execute function private.set_updated_at();
create trigger leave_balances_audit after insert or update or delete on public.leave_balances
  for each row execute function private.audit_row_change();

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  leave_type_id   uuid not null,
  start_date      date not null,
  end_date        date not null,
  half_day        boolean not null default false,
  days            numeric(5,1) not null default 0,  -- computed by leave_requests_before_write
  reason          text check (reason is null or char_length(reason) <= 1000),
  status          public.request_status not null default 'pending',
  reviewer_id     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date),
  check (not half_day or start_date = end_date),
  check (extract(year from start_date) = extract(year from end_date)),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (leave_type_id, organization_id) references public.leave_types (id, organization_id)
);
create index leave_requests_member_idx on public.leave_requests (membership_id, start_date);
create index leave_requests_org_status_idx on public.leave_requests (organization_id, status, start_date);

create trigger leave_requests_updated_at before update on public.leave_requests
  for each row execute function private.set_updated_at();
create trigger leave_requests_audit after insert or update or delete on public.leave_requests
  for each row execute function private.audit_row_change();

-- Remaining days of a tracked leave type in a year. Pending requests count as reserved.
create or replace function private.leave_remaining(p_membership uuid, p_type uuid, p_year integer, p_include_pending boolean, p_excluding uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.granted_days from public.leave_balances b
                   where b.membership_id = p_membership and b.leave_type_id = p_type and b.year = p_year), 0)
       - coalesce((select sum(r.days) from public.leave_requests r
                   where r.membership_id = p_membership and r.leave_type_id = p_type
                     and extract(year from r.start_date) = p_year
                     and (r.status = 'approved' or (p_include_pending and r.status = 'pending'))
                     and (p_excluding is null or r.id <> p_excluding)), 0);
$$;

-- Deterministic pre-hook: day count from the member's calendar, no overlaps, balance available.
create or replace function private.leave_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type record;
  v_working integer;
begin
  if tg_op = 'UPDATE' and new.start_date = old.start_date and new.end_date = old.end_date
     and new.half_day = old.half_day and new.leave_type_id = old.leave_type_id
     and not (new.status = 'approved' and old.status <> 'approved') then
    return new;
  end if;

  select * into v_type from public.leave_types where id = new.leave_type_id;
  if tg_op = 'INSERT' and v_type.archived_at is not null then
    raise exception 'leave_type_archived: that leave type is no longer offered' using errcode = 'P0001';
  end if;

  select count(*) into v_working from private.member_working_days(new.membership_id, new.start_date, new.end_date);
  if v_working = 0 then
    raise exception 'no_working_days: the selected dates contain no working days' using errcode = 'P0001';
  end if;
  new.days := case when new.half_day then 0.5 else v_working end;

  if new.status in ('pending', 'approved') and exists (
    select 1 from public.leave_requests r
    where r.membership_id = new.membership_id and r.id <> new.id
      and r.status in ('pending', 'approved')
      and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'leave_overlap: you already have leave requested for some of those days' using errcode = 'P0001';
  end if;

  if v_type.annual_allowance_days is not null and new.status in ('pending', 'approved')
     and private.leave_remaining(new.membership_id, new.leave_type_id, extract(year from new.start_date)::integer,
                                 new.status = 'pending', new.id) < new.days then
    raise exception 'insufficient_balance: not enough % left for %', v_type.name, extract(year from new.start_date) using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger leave_requests_before_write before insert or update on public.leave_requests
  for each row execute function private.leave_requests_before_write();

create or replace function public.request_leave(
  p_org uuid, p_leave_type uuid, p_start date, p_end date, p_half_day boolean default false, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership uuid := private.self_workforce_membership(p_org);
  v_auto boolean;
  v_id uuid;
begin
  select not requires_approval into v_auto from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_auto is null then
    raise exception 'unknown_leave_type' using errcode = '22023';
  end if;
  if p_end < p_start then
    raise exception 'invalid_dates: the end date is before the start date' using errcode = 'P0001';
  end if;
  if extract(year from p_start) <> extract(year from p_end) then
    raise exception 'leave_year: split leave that crosses the year end into two requests' using errcode = 'P0001';
  end if;
  if coalesce(p_half_day, false) and p_start <> p_end then
    raise exception 'invalid_dates: a half day must start and end on the same date' using errcode = 'P0001';
  end if;
  insert into public.leave_requests (organization_id, membership_id, leave_type_id, start_date, end_date, half_day, reason, status, reviewed_at)
  values (p_org, v_membership, p_leave_type, p_start, p_end, coalesce(p_half_day, false), nullif(btrim(coalesce(p_reason, '')), ''),
          case when v_auto then 'approved'::public.request_status else 'pending'::public.request_status end,
          case when v_auto then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_leave_request(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_req from public.leave_requests where id = p_request for update;
  if v_req.id is null or not private.can_review_hr_of(v_req.membership_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request_state: only a pending request can be reviewed' using errcode = 'P0001';
  end if;
  if not p_approve and v_note is null then
    raise exception 'reason_required: give a reason when rejecting' using errcode = 'P0001';
  end if;
  update public.leave_requests
     set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
         reviewer_id = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_request;
end;
$$;

-- The requester may withdraw a pending request or approved leave that hasn't started;
-- reviewers (manager / hr.manage) may cancel any pending or approved request.
create or replace function public.cancel_leave_request(p_request uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_own boolean;
begin
  select * into v_req from public.leave_requests where id = p_request for update;
  if v_req.id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_own := v_req.membership_id = private.active_membership_id(v_req.organization_id);
  if not (v_own or private.can_review_hr_of(v_req.membership_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_req.status not in ('pending', 'approved') then
    raise exception 'request_state: that request is already closed' using errcode = 'P0001';
  end if;
  if v_own and not private.can_review_hr_of(v_req.membership_id) and v_req.status = 'approved'
     and v_req.start_date <= private.org_today(v_req.organization_id) then
    raise exception 'request_state: leave that has started can only be cancelled by your manager or HR' using errcode = 'P0001';
  end if;
  update public.leave_requests
     set status = 'cancelled', review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), review_note)
   where id = p_request;
end;
$$;

create or replace function public.set_leave_balance(p_membership uuid, p_leave_type uuid, p_year integer, p_days numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_memberships where id = p_membership;
  if v_org is null or not public.has_permission(v_org, 'hr.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.leave_balances (organization_id, membership_id, leave_type_id, year, granted_days)
  values (v_org, p_membership, p_leave_type, p_year, p_days)
  on conflict (membership_id, leave_type_id, year) do update set granted_days = excluded.granted_days;
end;
$$;

-- Grants every active member the default allowance of each tracked type for a year.
-- Existing balances are left untouched. Returns the number of balances created.
create or replace function public.grant_annual_leave_allowances(p_org uuid, p_year integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.has_permission(p_org, 'hr.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.leave_balances (organization_id, membership_id, leave_type_id, year, granted_days)
  select p_org, m.id, t.id, p_year, t.annual_allowance_days
  from public.organization_memberships m
  cross join public.leave_types t
  where m.organization_id = p_org and m.status = 'active'
    and private.membership_has_permission(m.id, 'workforce.self')
    and t.organization_id = p_org and t.archived_at is null and t.annual_allowance_days is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance and corrections
-- ---------------------------------------------------------------------------
create type public.work_mode as enum ('office', 'remote');
create type public.attendance_source as enum ('self', 'correction');

create table public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  work_date       date not null,
  check_in_at     timestamptz not null,
  check_out_at    timestamptz,
  work_mode       public.work_mode not null default 'office',
  note            text check (note is null or char_length(note) <= 500),
  source          public.attendance_source not null default 'self',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (membership_id, work_date),
  check (check_out_at is null or check_out_at > check_in_at),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
create index attendance_records_org_date_idx on public.attendance_records (organization_id, work_date);

create trigger attendance_records_updated_at before update on public.attendance_records
  for each row execute function private.set_updated_at();
create trigger attendance_records_audit after insert or update or delete on public.attendance_records
  for each row execute function private.audit_row_change();

create table public.attendance_corrections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  work_date       date not null,
  check_in_at     timestamptz not null,
  check_out_at    timestamptz not null,
  work_mode       public.work_mode not null default 'office',
  reason          text not null check (char_length(btrim(reason)) between 3 and 1000),
  status          public.request_status not null default 'pending',
  reviewer_id     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (check_out_at > check_in_at),
  check (check_out_at - check_in_at <= interval '24 hours'),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
create index attendance_corrections_member_idx on public.attendance_corrections (membership_id, work_date);
create unique index attendance_corrections_one_pending on public.attendance_corrections (membership_id, work_date) where status = 'pending';

create trigger attendance_corrections_updated_at before update on public.attendance_corrections
  for each row execute function private.set_updated_at();
create trigger attendance_corrections_audit after insert or update or delete on public.attendance_corrections
  for each row execute function private.audit_row_change();

-- Check-in and check-out use the server clock and the organization's calendar date, so
-- attendance timestamps can't be back-dated; past days change only through corrections.
create or replace function public.check_in(p_org uuid, p_mode public.work_mode default 'office', p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership uuid := private.self_workforce_membership(p_org);
  v_id uuid;
begin
  insert into public.attendance_records (organization_id, membership_id, work_date, check_in_at, work_mode, note)
  values (p_org, v_membership, private.org_today(p_org), now(), coalesce(p_mode, 'office'), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (membership_id, work_date) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'already_checked_in: you have already checked in today' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

create or replace function public.check_out(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership uuid := private.self_workforce_membership(p_org);
begin
  update public.attendance_records
     set check_out_at = now()
   where membership_id = v_membership and work_date = private.org_today(p_org) and check_out_at is null;
  if not found then
    raise exception 'not_checked_in: check in first (or you have already checked out today)' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.request_attendance_correction(
  p_org uuid, p_work_date date, p_check_in timestamptz, p_check_out timestamptz,
  p_mode public.work_mode, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership uuid := private.self_workforce_membership(p_org);
  v_id uuid;
begin
  if p_work_date > private.org_today(p_org) then
    raise exception 'future_date: attendance can only be corrected for today or earlier' using errcode = 'P0001';
  end if;
  if p_work_date < private.org_today(p_org) - 60 then
    raise exception 'too_old: corrections are accepted for the last 60 days only' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.attendance_corrections
             where membership_id = v_membership and work_date = p_work_date and status = 'pending') then
    raise exception 'correction_pending: a correction for that day is already waiting for review' using errcode = 'P0001';
  end if;
  insert into public.attendance_corrections (organization_id, membership_id, work_date, check_in_at, check_out_at, work_mode, reason)
  values (p_org, v_membership, p_work_date, p_check_in, p_check_out, coalesce(p_mode, 'office'), btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_attendance_correction(p_correction uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_c from public.attendance_corrections where id = p_correction for update;
  if v_c.id is null or not private.can_review_hr_of(v_c.membership_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_c.status <> 'pending' then
    raise exception 'request_state: only a pending request can be reviewed' using errcode = 'P0001';
  end if;
  if not p_approve and v_note is null then
    raise exception 'reason_required: give a reason when rejecting' using errcode = 'P0001';
  end if;

  update public.attendance_corrections
     set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
         reviewer_id = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_correction;

  if p_approve then
    insert into public.attendance_records (organization_id, membership_id, work_date, check_in_at, check_out_at, work_mode, note, source)
    values (v_c.organization_id, v_c.membership_id, v_c.work_date, v_c.check_in_at, v_c.check_out_at, v_c.work_mode, v_c.reason, 'correction')
    on conflict (membership_id, work_date) do update
      set check_in_at = excluded.check_in_at, check_out_at = excluded.check_out_at,
          work_mode = excluded.work_mode, note = excluded.note, source = 'correction';
  end if;
end;
$$;

create or replace function public.cancel_attendance_correction(p_correction uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendance_corrections
     set status = 'cancelled'
   where id = p_correction and status = 'pending'
     and membership_id = private.active_membership_id(organization_id);
  if not found then
    raise exception 'request_state: only your own pending requests can be withdrawn' using errcode = 'P0001';
  end if;
end;
$$;

-- Attendance exceptions for the people the caller may see: working days without a record
-- (and without approved leave) and records that were never checked out. Today is excluded.
create or replace function public.attendance_exceptions(p_org uuid, p_from date, p_to date)
returns table (membership_id uuid, work_date date, kind text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.active_membership_id(p_org) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to - p_from > 92 then
    raise exception 'range_too_large: choose at most 92 days' using errcode = 'P0001';
  end if;
  return query
  with people as (
    select m.id from public.organization_memberships m
    where m.organization_id = p_org and m.status = 'active'
      and private.membership_has_permission(m.id, 'workforce.self')
      and private.can_view_hr_of(m.id)
  ),
  days as (
    select p.id as membership_id, d as work_date
    from people p
    cross join lateral private.member_working_days(p.id, p_from, least(p_to, private.org_today(p_org) - 1)) d
  )
  select d.membership_id, d.work_date, 'missing'::text
  from days d
  where not exists (select 1 from public.attendance_records a where a.membership_id = d.membership_id and a.work_date = d.work_date)
    and not exists (select 1 from public.leave_requests r
                    where r.membership_id = d.membership_id and r.status = 'approved'
                      and d.work_date between r.start_date and r.end_date)
  union all
  select a.membership_id, a.work_date, 'incomplete'::text
  from public.attendance_records a
  join people p on p.id = a.membership_id
  where a.check_out_at is null and a.work_date between p_from and least(p_to, private.org_today(p_org) - 1)
  order by 2 desc, 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timesheets
-- ---------------------------------------------------------------------------
create type public.timesheet_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.time_category as enum ('delivery', 'internal', 'training', 'presales');

create table public.timesheets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  week_start      date not null check (extract(isodow from week_start) = 1),
  status          public.timesheet_status not null default 'draft',
  submitted_at    timestamptz,
  reviewer_id     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (membership_id, week_start),
  unique (id, organization_id),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
comment on column public.timesheets.week_start is 'Monday of the ISO week.';
create index timesheets_org_week_idx on public.timesheets (organization_id, week_start);

create trigger timesheets_updated_at before update on public.timesheets
  for each row execute function private.set_updated_at();
create trigger timesheets_audit after insert or update or delete on public.timesheets
  for each row execute function private.audit_row_change();

create table public.time_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  timesheet_id    uuid not null,
  entry_date      date not null,
  category        public.time_category not null default 'delivery',
  project_id      uuid,
  work_item_id    uuid,
  hours           numeric(4,2) not null check (hours > 0 and hours <= 24),
  note            text check (note is null or char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((category = 'delivery') = (project_id is not null)),
  check (work_item_id is null or project_id is not null),
  foreign key (timesheet_id, organization_id) references public.timesheets (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id) references public.projects (id, organization_id),
  foreign key (work_item_id, organization_id) references public.work_items (id, organization_id) on delete set null (work_item_id)
);
create index time_entries_timesheet_idx on public.time_entries (timesheet_id, entry_date);
create index time_entries_project_idx on public.time_entries (project_id, entry_date);
create index time_entries_work_item_idx on public.time_entries (work_item_id);

create trigger time_entries_updated_at before update on public.time_entries
  for each row execute function private.set_updated_at();

-- Owner and timesheet defaults on insert; locked once submitted or approved.
create or replace function private.timesheets_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Signed-in callers always own the timesheets they create (seed and tests run as postgres).
    if auth.uid() is not null then
      new.membership_id := private.self_workforce_membership(new.organization_id);
      new.status := 'draft';
    end if;
    if new.week_start > private.org_today(new.organization_id) + 7 then
      raise exception 'future_week: timesheets can be started at most one week ahead' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger timesheets_before_write before insert on public.timesheets
  for each row execute function private.timesheets_before_write();

create or replace function private.time_entries_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sheet record;
begin
  if tg_op = 'DELETE' then
    select * into v_sheet from public.timesheets where id = old.timesheet_id;
    -- The timesheet itself is being deleted (organization or membership removal).
    if v_sheet.id is null then
      return old;
    end if;
  else
    select * into v_sheet from public.timesheets where id = new.timesheet_id;
  end if;
  -- A deleted work item only clears its reference; that must not be blocked by the lock.
  if tg_op = 'UPDATE' and old.work_item_id is not null and new.work_item_id is null
     and (new.entry_date, new.category, new.project_id, new.hours, new.note)
         is not distinct from (old.entry_date, old.category, old.project_id, old.hours, old.note) then
    return new;
  end if;
  if v_sheet.status not in ('draft', 'rejected') then
    raise exception 'timesheet_locked: recall or reopen the timesheet before changing it' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.timesheet_id <> new.timesheet_id then
    raise exception 'timesheet_locked: entries cannot move between timesheets' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.entry_date not between v_sheet.week_start and v_sheet.week_start + 6 then
    raise exception 'invalid_entry: the date must fall within the timesheet week' using errcode = 'P0001';
  end if;
  if new.project_id is not null and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
     and auth.uid() is not null and not public.can_read_project(new.project_id) then
    raise exception 'invalid_entry: you can only log time to projects you can see' using errcode = 'P0001';
  end if;
  if new.work_item_id is not null
     and (select project_id from public.work_items where id = new.work_item_id) is distinct from new.project_id then
    raise exception 'invalid_entry: the work item belongs to another project' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(e.hours), 0) from public.time_entries e
      where e.timesheet_id = new.timesheet_id and e.entry_date = new.entry_date and e.id <> new.id) + new.hours > 24 then
    raise exception 'invalid_entry: a day can hold at most 24 hours' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger time_entries_before_write before insert or update or delete on public.time_entries
  for each row execute function private.time_entries_before_write();

create or replace function public.submit_timesheet(p_timesheet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sheet record;
begin
  select * into v_sheet from public.timesheets where id = p_timesheet for update;
  if v_sheet.id is null or v_sheet.membership_id is distinct from private.active_membership_id(v_sheet.organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sheet.status not in ('draft', 'rejected') then
    raise exception 'timesheet_state: this timesheet has already been submitted' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.time_entries where timesheet_id = p_timesheet) then
    raise exception 'timesheet_empty: log some time before submitting' using errcode = 'P0001';
  end if;
  update public.timesheets
     set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null
   where id = p_timesheet;
end;
$$;

-- The owner may pull a submitted (not yet reviewed) timesheet back to draft.
create or replace function public.recall_timesheet(p_timesheet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.timesheets set status = 'draft', submitted_at = null
   where id = p_timesheet and status = 'submitted'
     and membership_id = private.active_membership_id(organization_id);
  if not found then
    raise exception 'timesheet_state: only your own submitted timesheet can be recalled' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.review_timesheet(p_timesheet uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sheet record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_sheet from public.timesheets where id = p_timesheet for update;
  if v_sheet.id is null or not private.can_review_timesheets_of(v_sheet.membership_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sheet.status <> 'submitted' then
    raise exception 'timesheet_state: only a submitted timesheet can be reviewed' using errcode = 'P0001';
  end if;
  if not p_approve and v_note is null then
    raise exception 'reason_required: give a reason when rejecting' using errcode = 'P0001';
  end if;
  update public.timesheets
     set status = case when p_approve then 'approved'::public.timesheet_status else 'rejected'::public.timesheet_status end,
         reviewer_id = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_timesheet;
end;
$$;

-- Timesheet status per member for one week, for the people the caller may see.
create or replace function public.timesheet_compliance(p_org uuid, p_week_start date)
returns table (membership_id uuid, timesheet_id uuid, status text, total_hours numeric, submitted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.active_membership_id(p_org) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.id, t.id, coalesce(t.status::text, 'missing'),
         coalesce((select sum(e.hours) from public.time_entries e where e.timesheet_id = t.id), 0)::numeric,
         t.submitted_at
  from public.organization_memberships m
  left join public.timesheets t on t.membership_id = m.id and t.week_start = p_week_start
  where m.organization_id = p_org and m.status = 'active'
    and private.membership_has_permission(m.id, 'workforce.self')
    and private.can_view_timesheets_of(m.id)
  order by m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resource allocations (dated; supersede project_memberships.allocation_percent)
-- ---------------------------------------------------------------------------
create table public.resource_allocations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  project_id      uuid not null,
  start_date      date not null,
  end_date        date not null,
  percent         smallint not null check (percent between 1 and 100),
  role            text check (role is null or char_length(role) <= 80),
  notes           text check (notes is null or char_length(notes) <= 1000),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 3660),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
comment on column public.resource_allocations.percent is 'Share of the member''s available capacity planned for this project.';
create index resource_allocations_member_idx on public.resource_allocations (membership_id, start_date, end_date);
create index resource_allocations_project_idx on public.resource_allocations (project_id, start_date);

create trigger resource_allocations_updated_at before update on public.resource_allocations
  for each row execute function private.set_updated_at();
create trigger resource_allocations_audit after insert or update or delete on public.resource_allocations
  for each row execute function private.audit_row_change();

comment on column public.project_memberships.allocation_percent is 'Indicative only. Superseded by resource_allocations (dated) in Phase 3.';

-- ---------------------------------------------------------------------------
-- Capacity, utilisation and availability
-- ---------------------------------------------------------------------------
-- Per member for [p_from, p_to]: working days from their calendar, holidays, approved leave,
-- capacity (available days × hours per day), allocation against that capacity and time logged
-- on delivery work in submitted or approved timesheets. Attendance is deliberately not used.
create or replace function public.capacity_overview(p_org uuid, p_from date, p_to date)
returns table (
  membership_id uuid,
  calendar_days integer,
  working_days integer,
  holiday_days integer,
  leave_days numeric,
  hours_per_day numeric,
  capacity_hours numeric,
  allocated_hours numeric,
  peak_allocation_percent integer,
  logged_hours numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_org, 'resource.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 183 then
    raise exception 'range_too_large: choose a range of at most 184 days' using errcode = 'P0001';
  end if;
  return query
  with people as (
    select m.id, c.id as calendar_id, c.working_days as wd, c.hours_per_day as hpd
    from public.organization_memberships m
    join public.work_calendars c on c.id = private.member_calendar(m.id)
    where m.organization_id = p_org and m.status = 'active'
      and private.membership_has_permission(m.id, 'workforce.self')
  ),
  days as (
    select p.id, p.hpd, d::date as day,
           extract(isodow from d)::smallint = any (p.wd) as weekday,
           exists (select 1 from public.holidays h where h.calendar_id = p.calendar_id and h.holiday_date = d::date) as holiday
    from people p cross join generate_series(p_from, p_to, interval '1 day') d
  ),
  workdays as (
    select d.id, d.hpd, d.day,
           coalesce((select max(case when r.half_day then 0.5 else 1 end) from public.leave_requests r
                     where r.membership_id = d.id and r.status = 'approved' and d.day between r.start_date and r.end_date), 0) as leave_frac,
           coalesce((select sum(a.percent) from public.resource_allocations a
                     where a.membership_id = d.id and d.day between a.start_date and a.end_date), 0) as alloc
    from days d where d.weekday and not d.holiday
  )
  select p.id,
         (p_to - p_from + 1)::integer,
         (select count(*) from workdays w where w.id = p.id)::integer,
         (select count(*) from days d where d.id = p.id and d.weekday and d.holiday)::integer,
         coalesce((select sum(w.leave_frac) from workdays w where w.id = p.id), 0)::numeric,
         p.hpd,
         coalesce((select sum((1 - w.leave_frac) * w.hpd) from workdays w where w.id = p.id), 0)::numeric,
         coalesce((select sum((1 - w.leave_frac) * w.hpd * w.alloc / 100.0) from workdays w where w.id = p.id), 0)::numeric(10,1),
         coalesce((select max(w.alloc) from workdays w where w.id = p.id and w.leave_frac < 1), 0)::integer,
         coalesce((select sum(e.hours) from public.time_entries e
                   join public.timesheets t on t.id = e.timesheet_id
                   where t.membership_id = p.id and t.status in ('submitted', 'approved')
                     and e.category = 'delivery' and e.entry_date between p_from and p_to), 0)::numeric
  from people p;
end;
$$;

-- Who is away when, without saying why: approved leave (no type or reason) and holidays.
create or replace function public.team_availability(p_org uuid, p_from date, p_to date)
returns table (membership_id uuid, day date, kind text, half_day boolean, label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission(p_org, 'org.members.read') or public.has_permission(p_org, 'team.read')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'range_too_large: choose a range of at most 63 days' using errcode = 'P0001';
  end if;
  return query
  select r.membership_id, d::date, 'leave'::text, r.half_day, 'On leave'::text
  from public.leave_requests r
  join public.organization_memberships m on m.id = r.membership_id and m.status = 'active'
  cross join lateral generate_series(greatest(r.start_date, p_from), least(r.end_date, p_to), interval '1 day') d
  where r.organization_id = p_org and r.status = 'approved'
    and r.start_date <= p_to and r.end_date >= p_from
    and d::date in (select private.member_working_days(r.membership_id, d::date, d::date))
  union all
  select null::uuid, h.holiday_date, 'holiday'::text, false, h.name
  from public.holidays h
  join public.work_calendars c on c.id = h.calendar_id and c.is_default
  where h.organization_id = p_org and h.holiday_date between p_from and p_to
  order by 2, 1;
end;
$$;

-- Milestones due during a leave request on projects the requester is allocated to or a member of.
-- Names are shown only for projects the caller can read.
create or replace function public.leave_milestone_conflicts(p_request uuid)
returns table (project_id uuid, project_name text, milestone_name text, due_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_req record;
begin
  select * into v_req from public.leave_requests where id = p_request;
  if v_req.id is null or not private.can_view_hr_of(v_req.membership_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id,
         case when public.can_read_project(p.id) then p.name else 'A project you can''t view' end,
         case when public.can_read_project(p.id) then ms.name else 'Milestone' end,
         ms.due_date
  from public.project_milestones ms
  join public.projects p on p.id = ms.project_id and p.archived_at is null
  where ms.completed_on is null
    and ms.due_date between v_req.start_date and v_req.end_date
    and (exists (select 1 from public.resource_allocations a
                 where a.project_id = p.id and a.membership_id = v_req.membership_id
                   and a.start_date <= v_req.end_date and a.end_date >= v_req.start_date)
         or exists (select 1 from public.project_memberships pm
                    where pm.project_id = p.id and pm.membership_id = v_req.membership_id))
  order by ms.due_date;
end;
$$;

create or replace function public.set_member_calendar(p_membership uuid, p_calendar uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_memberships where id = p_membership;
  if v_org is null or not public.has_permission(v_org, 'hr.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.organization_memberships set work_calendar_id = p_calendar where id = p_membership;
end;
$$;

-- Swaps the default calendar in one statement pair so the org is never left without one.
create or replace function public.set_default_calendar(p_calendar uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.work_calendars;
begin
  select * into v_cal from public.work_calendars where id = p_calendar;
  if v_cal.id is null or not public.has_permission(v_cal.organization_id, 'hr.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_cal.archived_at is not null then
    raise exception 'calendar_archived: restore the calendar before making it the default' using errcode = 'P0001';
  end if;
  update public.work_calendars set is_default = false
  where organization_id = v_cal.organization_id and is_default and id <> p_calendar;
  update public.work_calendars set is_default = true where id = p_calendar;
end;
$$;

-- ---------------------------------------------------------------------------
-- Defaults for existing and new organizations
-- ---------------------------------------------------------------------------
create or replace function private.seed_workforce_defaults(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.work_calendars (organization_id, name, is_default) values (p_org, 'Standard (Mon–Fri)', true);
  insert into public.leave_types (organization_id, name, code, is_paid, requires_approval, annual_allowance_days, position) values
    (p_org, 'Annual leave', 'ANNUAL', true,  true,  20,   10),
    (p_org, 'Sick leave',   'SICK',   true,  false, 10,   20),
    (p_org, 'Unpaid leave', 'UNPAID', false, true,  null, 30);
$$;

select private.seed_workforce_defaults(id) from public.organizations;

create or replace function private.organizations_after_insert_workforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_workforce_defaults(new.id);
  return null;
end;
$$;
create trigger organizations_seed_workforce after insert on public.organizations
  for each row execute function private.organizations_after_insert_workforce();

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.work_calendars         enable row level security;
alter table public.holidays               enable row level security;
alter table public.leave_types            enable row level security;
alter table public.leave_balances         enable row level security;
alter table public.leave_requests         enable row level security;
alter table public.attendance_records     enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.timesheets             enable row level security;
alter table public.time_entries           enable row level security;
alter table public.resource_allocations   enable row level security;

-- calendars, holidays and leave types: readable by every member, configured by hr.manage
grant select on public.work_calendars to authenticated;
grant insert (organization_id, name, working_days, hours_per_day) on public.work_calendars to authenticated;
grant update (name, working_days, hours_per_day, is_default, archived_at) on public.work_calendars to authenticated;
create policy work_calendars_select on public.work_calendars for select to authenticated
  using (public.is_org_member(organization_id));
create policy work_calendars_insert on public.work_calendars for insert to authenticated
  with check (public.has_permission(organization_id, 'hr.manage'));
create policy work_calendars_update on public.work_calendars for update to authenticated
  using (public.has_permission(organization_id, 'hr.manage'))
  with check (public.has_permission(organization_id, 'hr.manage'));

grant select, delete on public.holidays to authenticated;
grant insert (organization_id, calendar_id, holiday_date, name) on public.holidays to authenticated;
create policy holidays_select on public.holidays for select to authenticated
  using (public.is_org_member(organization_id));
create policy holidays_insert on public.holidays for insert to authenticated
  with check (public.has_permission(organization_id, 'hr.manage'));
create policy holidays_delete on public.holidays for delete to authenticated
  using (public.has_permission(organization_id, 'hr.manage'));

grant select on public.leave_types to authenticated;
grant insert (organization_id, name, code, is_paid, requires_approval, annual_allowance_days, position) on public.leave_types to authenticated;
grant update (name, is_paid, requires_approval, annual_allowance_days, position, archived_at) on public.leave_types to authenticated;
create policy leave_types_select on public.leave_types for select to authenticated
  using (public.is_org_member(organization_id));
create policy leave_types_insert on public.leave_types for insert to authenticated
  with check (public.has_permission(organization_id, 'hr.manage'));
create policy leave_types_update on public.leave_types for update to authenticated
  using (public.has_permission(organization_id, 'hr.manage'))
  with check (public.has_permission(organization_id, 'hr.manage'));

-- personal records: self, direct manager, HR (writes only through RPCs)
grant select on public.leave_balances to authenticated;
create policy leave_balances_select on public.leave_balances for select to authenticated
  using (private.can_view_hr_of(membership_id));

grant select on public.leave_requests to authenticated;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (private.can_view_hr_of(membership_id));

grant select on public.attendance_records to authenticated;
create policy attendance_records_select on public.attendance_records for select to authenticated
  using (private.can_view_hr_of(membership_id));

grant select on public.attendance_corrections to authenticated;
create policy attendance_corrections_select on public.attendance_corrections for select to authenticated
  using (private.can_view_hr_of(membership_id));

-- timesheets: the owner creates and edits entries; status changes through RPCs
grant select on public.timesheets to authenticated;
grant insert (organization_id, week_start) on public.timesheets to authenticated;
create policy timesheets_select on public.timesheets for select to authenticated
  using (private.can_view_timesheets_of(membership_id));
create policy timesheets_insert on public.timesheets for insert to authenticated
  with check (public.has_permission(organization_id, 'workforce.self'));

grant select, delete on public.time_entries to authenticated;
grant insert (organization_id, timesheet_id, entry_date, category, project_id, work_item_id, hours, note) on public.time_entries to authenticated;
grant update (entry_date, category, project_id, work_item_id, hours, note) on public.time_entries to authenticated;
create policy time_entries_select on public.time_entries for select to authenticated
  using (exists (select 1 from public.timesheets t where t.id = timesheet_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (exists (select 1 from public.timesheets t
                      where t.id = timesheet_id and t.membership_id = private.active_membership_id(t.organization_id)));
create policy time_entries_update on public.time_entries for update to authenticated
  using (exists (select 1 from public.timesheets t
                 where t.id = timesheet_id and t.membership_id = private.active_membership_id(t.organization_id)))
  with check (exists (select 1 from public.timesheets t
                      where t.id = timesheet_id and t.membership_id = private.active_membership_id(t.organization_id)));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (exists (select 1 from public.timesheets t
                 where t.id = timesheet_id and t.membership_id = private.active_membership_id(t.organization_id)));

-- allocations: resource.read sees all, everyone sees their own; resource.manage on visible projects
grant select, delete on public.resource_allocations to authenticated;
grant insert (organization_id, membership_id, project_id, start_date, end_date, percent, role, notes) on public.resource_allocations to authenticated;
grant update (start_date, end_date, percent, role, notes) on public.resource_allocations to authenticated;
create policy resource_allocations_select on public.resource_allocations for select to authenticated
  using (
    public.has_permission(organization_id, 'resource.read')
    or membership_id = private.active_membership_id(organization_id)
  );
create policy resource_allocations_insert on public.resource_allocations for insert to authenticated
  with check (public.has_permission(organization_id, 'resource.manage') and public.can_read_project(project_id));
create policy resource_allocations_update on public.resource_allocations for update to authenticated
  using (public.has_permission(organization_id, 'resource.manage') and public.can_read_project(project_id))
  with check (public.has_permission(organization_id, 'resource.manage') and public.can_read_project(project_id));
create policy resource_allocations_delete on public.resource_allocations for delete to authenticated
  using (public.has_permission(organization_id, 'resource.manage') and public.can_read_project(project_id));

revoke execute on function
  public.request_leave(uuid, uuid, date, date, boolean, text),
  public.review_leave_request(uuid, boolean, text),
  public.cancel_leave_request(uuid, text),
  public.set_leave_balance(uuid, uuid, integer, numeric),
  public.grant_annual_leave_allowances(uuid, integer),
  public.check_in(uuid, public.work_mode, text),
  public.check_out(uuid),
  public.request_attendance_correction(uuid, date, timestamptz, timestamptz, public.work_mode, text),
  public.review_attendance_correction(uuid, boolean, text),
  public.cancel_attendance_correction(uuid),
  public.attendance_exceptions(uuid, date, date),
  public.submit_timesheet(uuid),
  public.recall_timesheet(uuid),
  public.review_timesheet(uuid, boolean, text),
  public.timesheet_compliance(uuid, date),
  public.capacity_overview(uuid, date, date),
  public.team_availability(uuid, date, date),
  public.leave_milestone_conflicts(uuid),
  public.set_member_calendar(uuid, uuid),
  public.set_default_calendar(uuid)
from public, anon;
grant execute on function
  public.request_leave(uuid, uuid, date, date, boolean, text),
  public.review_leave_request(uuid, boolean, text),
  public.cancel_leave_request(uuid, text),
  public.set_leave_balance(uuid, uuid, integer, numeric),
  public.grant_annual_leave_allowances(uuid, integer),
  public.check_in(uuid, public.work_mode, text),
  public.check_out(uuid),
  public.request_attendance_correction(uuid, date, timestamptz, timestamptz, public.work_mode, text),
  public.review_attendance_correction(uuid, boolean, text),
  public.cancel_attendance_correction(uuid),
  public.attendance_exceptions(uuid, date, date),
  public.submit_timesheet(uuid),
  public.recall_timesheet(uuid),
  public.review_timesheet(uuid, boolean, text),
  public.timesheet_compliance(uuid, date),
  public.capacity_overview(uuid, date, date),
  public.team_availability(uuid, date, date),
  public.leave_milestone_conflicts(uuid),
  public.set_member_calendar(uuid, uuid),
  public.set_default_calendar(uuid)
to authenticated;
