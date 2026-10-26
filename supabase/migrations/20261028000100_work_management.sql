-- Stride Phase 2 — Work management: programs, milestones and baselines, configurable workflows,
-- work items (hierarchy, dependencies, comments, links, activity), sprints with burndown stats,
-- and project status reports. See docs/DECISIONS/ADR-0007-work-management-model.md.

-- ---------------------------------------------------------------------------
-- Permissions and role templates (existing organizations are backfilled)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('program.manage',   'delivery', 'Create and edit programs and assign projects to them'),
  ('milestone.manage', 'delivery', 'Create, edit and complete milestones and take schedule baselines on visible projects'),
  ('work.read',        'delivery', 'View work items, boards and sprints of visible projects'),
  ('work.create',      'delivery', 'Create work items in visible projects'),
  ('work.update',      'delivery', 'Edit, move and comment on work items in visible projects'),
  ('work.archive',     'delivery', 'Archive and restore work items in visible projects'),
  ('sprint.manage',    'delivery', 'Plan, start and complete sprints on visible projects'),
  ('workflow.manage',  'organization', 'Configure workflow states and transition rules');

update private.role_templates set permissions = array['org.settings.manage','org.members.read','org.members.manage','org.roles.manage','audit.read','team.read','team.manage','workflow.manage'] where key = 'org_admin';
update private.role_templates set permissions = array['org.members.read','audit.read','client.read','client.confidential.read','client.manage','project.read_all','project.create','project.update','project.change_status','project.archive','project.members.manage','team.read','team.manage','dashboard.portfolio.view','program.manage','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workflow.manage'] where key = 'delivery_head';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_all','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view','program.manage','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage'] where key = 'program_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage'] where key = 'project_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.update','team.read','dashboard.portfolio.view','work.read','work.create','work.update','work.archive','sprint.manage'] where key = 'engineering_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.update','team.read','work.read','work.create','work.update','work.archive'] where key = 'product_owner';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','sprint.manage'] where key = 'scrum_master';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update'] where key = 'developer';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update'] where key = 'qa_engineer';
update private.role_templates set permissions = array['org.members.read','project.read_all','team.read','team.manage','work.read'] where key = 'resource_manager';

insert into public.role_permissions (role_id, permission_key)
select r.id, unnest(t.permissions)
from public.role_definitions r
join private.role_templates t on t.key = r.key
where r.is_system
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function private.org_today(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select timezone from public.organization_settings where organization_id = p_org), 'UTC'))::date;
$$;

create or replace function private.member_name(p_membership uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name
  from public.organization_memberships m
  join public.user_profiles p on p.id = m.user_id
  where m.id = p_membership;
$$;

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
create type public.program_status as enum ('active', 'closed');

create table public.programs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  code                text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  name                text not null check (char_length(btrim(name)) between 2 and 160),
  description         text check (description is null or char_length(description) <= 4000),
  owner_membership_id uuid,
  status              public.program_status not null default 'active',
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (owner_membership_id, organization_id)
    references public.organization_memberships (id, organization_id) on delete set null (owner_membership_id)
);

create trigger programs_updated_at before update on public.programs
  for each row execute function private.set_updated_at();
create trigger programs_audit after insert or update or delete on public.programs
  for each row execute function private.audit_row_change();

alter table public.projects
  add column program_id uuid,
  add constraint projects_program_fkey foreign key (program_id, organization_id) references public.programs (id, organization_id);
create index projects_program_idx on public.projects (program_id);

-- ---------------------------------------------------------------------------
-- Milestones and baselines
-- ---------------------------------------------------------------------------
create table public.project_milestones (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  project_id          uuid not null,
  name                text not null check (char_length(btrim(name)) between 2 and 160),
  description         text check (description is null or char_length(description) <= 2000),
  due_date            date not null,
  baseline_due_date   date,
  completed_on        date,
  owner_membership_id uuid,
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (owner_membership_id, organization_id)
    references public.organization_memberships (id, organization_id) on delete set null (owner_membership_id)
);
create index project_milestones_project_idx on public.project_milestones (project_id, due_date);

create trigger project_milestones_updated_at before update on public.project_milestones
  for each row execute function private.set_updated_at();
create trigger project_milestones_audit after insert or update or delete on public.project_milestones
  for each row execute function private.audit_row_change();

create table public.project_baselines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  snapshot        jsonb not null,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index project_baselines_project_idx on public.project_baselines (project_id, created_at desc);

create trigger project_baselines_audit after insert on public.project_baselines
  for each row execute function private.audit_row_change();

-- Snapshot project dates and milestones; current due dates become the comparison baseline.
create or replace function public.take_project_baseline(p_project uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if not public.can_act_on_project(p_project, 'milestone.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select organization_id into v_org from public.projects where id = p_project;

  insert into public.project_baselines (organization_id, project_id, name, snapshot)
  select v_org, p_project, btrim(p_name), jsonb_build_object(
    'planned_start_date', p.planned_start_date,
    'target_end_date', p.target_end_date,
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'due_date', m.due_date, 'completed_on', m.completed_on) order by m.due_date)
      from public.project_milestones m where m.project_id = p_project), '[]'::jsonb))
  from public.projects p where p.id = p_project
  returning id into v_id;

  update public.project_milestones set baseline_due_date = due_date where project_id = p_project;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow states and transition rules
-- ---------------------------------------------------------------------------
create type public.workflow_category as enum ('todo', 'in_progress', 'done');

create table public.workflow_states (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 40),
  category        public.workflow_category not null,
  position        integer not null default 0,
  is_default      boolean not null default false,
  wip_limit       integer check (wip_limit is null or wip_limit between 1 and 999),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  unique (id, organization_id)
);
create unique index workflow_states_org_name_uq on public.workflow_states (organization_id, lower(name)) where archived_at is null;
create unique index workflow_states_org_default_uq on public.workflow_states (organization_id) where is_default;

create trigger workflow_states_updated_at before update on public.workflow_states
  for each row execute function private.set_updated_at();
create trigger workflow_states_audit after insert or update or delete on public.workflow_states
  for each row execute function private.audit_row_change();

create table public.workflow_transitions (
  organization_id uuid not null,
  from_state_id   uuid not null,
  to_state_id     uuid not null,
  primary key (from_state_id, to_state_id),
  check (from_state_id <> to_state_id),
  foreign key (from_state_id, organization_id) references public.workflow_states (id, organization_id) on delete cascade,
  foreign key (to_state_id, organization_id) references public.workflow_states (id, organization_id) on delete cascade
);

create or replace function private.seed_workflow_states(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workflow_states (organization_id, name, category, position, is_default)
  values (p_org, 'Backlog', 'todo', 10, true),
         (p_org, 'Ready', 'todo', 20, false),
         (p_org, 'In Progress', 'in_progress', 30, false),
         (p_org, 'In Review', 'in_progress', 40, false),
         (p_org, 'Testing', 'in_progress', 50, false),
         (p_org, 'Done', 'done', 60, false);
$$;

select private.seed_workflow_states(id) from public.organizations;

-- New organizations get the default workflow too.
create or replace function private.organizations_after_insert_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_workflow_states(new.id);
  return null;
end;
$$;
create trigger organizations_seed_workflow after insert on public.organizations
  for each row execute function private.organizations_after_insert_workflow();

-- States keep reports meaningful: the default and any state holding live items can't be archived,
-- and every organization keeps at least one active state per category.
create or replace function private.workflow_states_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat public.workflow_category;
begin
  if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null then
    if old.is_default then
      raise exception 'default_state: choose another default state before archiving this one' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.work_items w where w.state_id = old.id and w.archived_at is null) then
      raise exception 'state_in_use: move its work items to another state first' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    foreach v_cat in array enum_range(null::public.workflow_category) loop
      if not exists (
        select 1 from public.workflow_states s
        where s.organization_id = new.organization_id and s.archived_at is null and s.category = v_cat
      ) then
        raise exception 'category_required: keep at least one active % state', v_cat using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sprints
-- ---------------------------------------------------------------------------
create type public.sprint_state as enum ('planned', 'active', 'completed');

create table public.sprints (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  project_id       uuid not null,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  goal             text check (goal is null or char_length(goal) <= 1000),
  start_date       date not null,
  end_date         date not null,
  state            public.sprint_state not null default 'planned',
  started_at       timestamptz,
  completed_at     timestamptz,
  committed_points numeric(8,1),
  committed_count  integer,
  completed_points numeric(8,1),
  completed_count  integer,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organization_id),
  check (end_date >= start_date),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create unique index sprints_one_active_per_project on public.sprints (project_id) where state = 'active';
create index sprints_project_idx on public.sprints (project_id, start_date desc);

create trigger sprints_updated_at before update on public.sprints
  for each row execute function private.set_updated_at();
create trigger sprints_audit after insert or update or delete on public.sprints
  for each row execute function private.audit_row_change();

create table public.sprint_daily_stats (
  sprint_id       uuid not null references public.sprints (id) on delete cascade,
  organization_id uuid not null,
  day             date not null,
  scope_points    numeric(8,1) not null,
  done_points     numeric(8,1) not null,
  scope_count     integer not null,
  done_count      integer not null,
  primary key (sprint_id, day)
);

-- ---------------------------------------------------------------------------
-- Work items
-- ---------------------------------------------------------------------------
create type public.work_item_type as enum ('epic', 'feature', 'story', 'task', 'subtask', 'bug', 'incident', 'change_request');
create type public.work_item_priority as enum ('critical', 'high', 'medium', 'low');
create type public.work_item_severity as enum ('s1', 's2', 's3', 's4');

create table public.work_item_counters (
  project_id uuid primary key references public.projects (id) on delete cascade,
  last_seq   integer not null default 0
);

create table public.work_items (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  project_id             uuid not null,
  seq                    integer not null default 0,  -- assigned by work_items_before_write
  key                    text not null default '',    -- assigned by work_items_before_write
  type                   public.work_item_type not null,
  title                  text not null check (char_length(btrim(title)) between 2 and 300),
  description            text check (description is null or char_length(description) <= 20000),
  priority               public.work_item_priority not null default 'medium',
  business_value         smallint check (business_value is null or business_value between 0 and 100),
  severity               public.work_item_severity,
  state_id               uuid not null,
  parent_id              uuid,
  assignee_membership_id uuid,
  reporter_membership_id uuid,
  reviewer_membership_id uuid,
  team_id                uuid,
  sprint_id              uuid,
  start_date             date,
  due_date               date,
  completed_at           timestamptz,
  story_points           numeric(5,1) check (story_points is null or story_points between 0 and 999),
  estimate_hours         numeric(7,1) check (estimate_hours is null or estimate_hours between 0 and 99999),
  actual_hours           numeric(7,1) check (actual_hours is null or actual_hours between 0 and 99999),
  acceptance_criteria    text check (acceptance_criteria is null or char_length(acceptance_criteria) <= 10000),
  labels                 text[] not null default '{}' check (cardinality(labels) <= 20),
  component              text check (component is null or char_length(component) <= 80),
  rank                   double precision not null default 0,
  blocked                boolean not null default false,
  blocked_reason         text check (blocked_reason is null or char_length(blocked_reason) <= 1000),
  created_by             uuid default auth.uid() references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz,
  unique (project_id, seq),
  unique (organization_id, key),
  unique (id, organization_id),
  check (due_date is null or start_date is null or due_date >= start_date),
  check (severity is null or type in ('bug', 'incident')),
  check (blocked or blocked_reason is null),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (state_id, organization_id) references public.workflow_states (id, organization_id),
  foreign key (parent_id, organization_id) references public.work_items (id, organization_id) on delete set null (parent_id),
  foreign key (assignee_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (assignee_membership_id),
  foreign key (reporter_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (reporter_membership_id),
  foreign key (reviewer_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (reviewer_membership_id),
  foreign key (team_id, organization_id) references public.teams (id, organization_id),
  foreign key (sprint_id, organization_id) references public.sprints (id, organization_id) on delete set null (sprint_id)
);
create index work_items_project_rank_idx on public.work_items (project_id, rank) where archived_at is null;
create index work_items_sprint_idx on public.work_items (sprint_id) where archived_at is null;
create index work_items_assignee_idx on public.work_items (assignee_membership_id) where archived_at is null;
create index work_items_parent_idx on public.work_items (parent_id);
create index work_items_state_idx on public.work_items (state_id);

create trigger work_items_updated_at before update on public.work_items
  for each row execute function private.set_updated_at();
create trigger work_items_audit after insert or update or delete on public.work_items
  for each row execute function private.audit_row_change();

create trigger workflow_states_guard after update on public.workflow_states
  for each row execute function private.workflow_states_guard();

create or replace function public.allowed_parent_types(p_type public.work_item_type)
returns public.work_item_type[]
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'epic'           then '{}'::public.work_item_type[]
    when 'feature'        then '{epic}'::public.work_item_type[]
    when 'story'          then '{epic,feature}'::public.work_item_type[]
    when 'task'           then '{epic,feature,story}'::public.work_item_type[]
    when 'subtask'        then '{story,task}'::public.work_item_type[]
    when 'bug'            then '{epic,feature,story}'::public.work_item_type[]
    when 'incident'       then '{epic}'::public.work_item_type[]
    when 'change_request' then '{epic}'::public.work_item_type[]
  end;
$$;

-- Deterministic pre-hook: keys, defaults and every structural rule.
create or replace function private.work_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent record;
  v_sprint record;
  v_old_cat public.workflow_category;
  v_new_cat public.workflow_category;
begin
  if tg_op = 'INSERT' then
    insert into public.work_item_counters (project_id, last_seq) values (new.project_id, 1)
    on conflict (project_id) do update set last_seq = public.work_item_counters.last_seq + 1
    returning last_seq into new.seq;
    new.key := (select code from public.projects where id = new.project_id) || '-' || new.seq;
    if new.reporter_membership_id is null then
      new.reporter_membership_id := private.active_membership_id(new.organization_id);
    end if;
    if new.rank = 0 then
      new.rank := coalesce((select max(rank) from public.work_items where project_id = new.project_id), 0) + 1024;
    end if;
  end if;

  -- Parent: same project, allowed type, no cycles.
  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id or new.type is distinct from old.type) then
    select id, project_id, type into v_parent from public.work_items where id = new.parent_id;
    if v_parent.project_id is distinct from new.project_id then
      raise exception 'invalid_parent: the parent must be in the same project' using errcode = 'P0001';
    end if;
    if not (v_parent.type = any (public.allowed_parent_types(new.type))) then
      raise exception 'invalid_parent: a % cannot sit under a %', new.type, v_parent.type using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up(id, depth) as (
        select new.parent_id, 1
        union all
        select w.parent_id, u.depth + 1 from up u join public.work_items w on w.id = u.id
        where w.parent_id is not null and u.depth < 50
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'invalid_parent: that would create a loop' using errcode = 'P0001';
    end if;
  end if;

  -- Sprint: same project and not completed.
  if new.sprint_id is not null and (tg_op = 'INSERT' or new.sprint_id is distinct from old.sprint_id) then
    select project_id, state into v_sprint from public.sprints where id = new.sprint_id;
    if v_sprint.project_id is distinct from new.project_id then
      raise exception 'invalid_sprint: the sprint belongs to another project' using errcode = 'P0001';
    end if;
    if v_sprint.state = 'completed' then
      raise exception 'invalid_sprint: that sprint is already completed' using errcode = 'P0001';
    end if;
  end if;

  -- State: configured transition rules, and completion timestamp from the state's category.
  select category into v_new_cat from public.workflow_states where id = new.state_id;
  if tg_op = 'UPDATE' and new.state_id is distinct from old.state_id then
    if exists (select 1 from public.workflow_transitions t where t.from_state_id = old.state_id)
       and not exists (select 1 from public.workflow_transitions t where t.from_state_id = old.state_id and t.to_state_id = new.state_id) then
      raise exception 'invalid_transition: that workflow move is not allowed' using errcode = 'P0001';
    end if;
    select category into v_old_cat from public.workflow_states where id = old.state_id;
  end if;
  if v_new_cat = 'done' and (tg_op = 'INSERT' or v_old_cat is distinct from 'done' and new.state_id is distinct from old.state_id) then
    new.completed_at := now();
  elsif v_new_cat <> 'done' then
    new.completed_at := null;
  end if;

  if not new.blocked then
    new.blocked_reason := null;
  end if;
  return new;
end;
$$;

create trigger work_items_before_write before insert or update on public.work_items
  for each row execute function private.work_items_before_write();

-- ---------------------------------------------------------------------------
-- Activity feed (post-hook)
-- ---------------------------------------------------------------------------
create table public.work_item_activity (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  work_item_id    uuid not null,
  actor_id        uuid references auth.users (id) on delete set null,
  kind            text not null check (kind in ('created', 'changed', 'archived', 'restored')),
  field           text,
  from_value      text,
  to_value        text,
  created_at      timestamptz not null default now(),
  foreign key (work_item_id, organization_id) references public.work_items (id, organization_id) on delete cascade
);
create index work_item_activity_item_idx on public.work_item_activity (work_item_id, created_at desc);

create or replace function private.work_items_record_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  procedure_rows record;
begin
  if tg_op = 'INSERT' then
    insert into public.work_item_activity (organization_id, work_item_id, actor_id, kind, to_value)
    values (new.organization_id, new.id, v_actor, 'created', new.type::text);
    return null;
  end if;

  if new.archived_at is distinct from old.archived_at then
    insert into public.work_item_activity (organization_id, work_item_id, actor_id, kind)
    values (new.organization_id, new.id, v_actor, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;

  for procedure_rows in
    select * from (values
      ('state',        (select name from public.workflow_states where id = old.state_id), (select name from public.workflow_states where id = new.state_id), old.state_id is distinct from new.state_id),
      ('assignee',     private.member_name(old.assignee_membership_id), private.member_name(new.assignee_membership_id), old.assignee_membership_id is distinct from new.assignee_membership_id),
      ('sprint',       (select name from public.sprints where id = old.sprint_id), (select name from public.sprints where id = new.sprint_id), old.sprint_id is distinct from new.sprint_id),
      ('priority',     old.priority::text, new.priority::text, old.priority is distinct from new.priority),
      ('story_points', old.story_points::text, new.story_points::text, old.story_points is distinct from new.story_points),
      ('type',         old.type::text, new.type::text, old.type is distinct from new.type),
      ('parent',       (select key from public.work_items where id = old.parent_id), (select key from public.work_items where id = new.parent_id), old.parent_id is distinct from new.parent_id),
      ('blocked',      old.blocked::text, new.blocked::text, old.blocked is distinct from new.blocked),
      ('title',        old.title, new.title, old.title is distinct from new.title),
      ('due_date',     old.due_date::text, new.due_date::text, old.due_date is distinct from new.due_date)
    ) as t(field, from_value, to_value, changed)
    where changed
  loop
    insert into public.work_item_activity (organization_id, work_item_id, actor_id, kind, field, from_value, to_value)
    values (new.organization_id, new.id, v_actor, 'changed', procedure_rows.field, procedure_rows.from_value, procedure_rows.to_value);
  end loop;
  return null;
end;
$$;

create trigger work_items_record_activity after insert or update on public.work_items
  for each row execute function private.work_items_record_activity();

-- ---------------------------------------------------------------------------
-- Sprint burndown statistics (post-hook)
-- ---------------------------------------------------------------------------
create or replace function private.refresh_sprint_stats(p_sprint uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.sprints where id = p_sprint and state = 'active';
  if v_org is null then
    return;
  end if;
  insert into public.sprint_daily_stats (sprint_id, organization_id, day, scope_points, done_points, scope_count, done_count)
  select p_sprint, v_org, private.org_today(v_org),
         coalesce(sum(w.story_points), 0),
         coalesce(sum(w.story_points) filter (where s.category = 'done'), 0),
         count(*),
         count(*) filter (where s.category = 'done')
  from public.work_items w
  join public.workflow_states s on s.id = w.state_id
  where w.sprint_id = p_sprint and w.archived_at is null
  on conflict (sprint_id, day) do update
    set scope_points = excluded.scope_points, done_points = excluded.done_points,
        scope_count = excluded.scope_count, done_count = excluded.done_count;
end;
$$;

create or replace function private.work_items_refresh_sprints()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.sprint_id is not null then
    perform private.refresh_sprint_stats(old.sprint_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.sprint_id is not null
     and (tg_op = 'INSERT' or new.sprint_id is distinct from old.sprint_id) then
    perform private.refresh_sprint_stats(new.sprint_id);
  end if;
  return null;
end;
$$;

create trigger work_items_refresh_sprints
  after insert or delete or update of sprint_id, state_id, story_points, archived_at on public.work_items
  for each row execute function private.work_items_refresh_sprints();

-- ---------------------------------------------------------------------------
-- Dependencies, comments, links
-- ---------------------------------------------------------------------------
create type public.dependency_kind as enum ('blocks', 'relates_to', 'duplicates');

create table public.work_item_dependencies (
  organization_id uuid not null,
  predecessor_id  uuid not null,
  successor_id    uuid not null,
  kind            public.dependency_kind not null default 'blocks',
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (predecessor_id, successor_id, kind),
  check (predecessor_id <> successor_id),
  foreign key (predecessor_id, organization_id) references public.work_items (id, organization_id) on delete cascade,
  foreign key (successor_id, organization_id) references public.work_items (id, organization_id) on delete cascade
);
create index work_item_dependencies_successor_idx on public.work_item_dependencies (successor_id);

create trigger work_item_dependencies_audit after insert or delete on public.work_item_dependencies
  for each row execute function private.audit_row_change();

create or replace function private.prevent_blocking_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'blocks' and exists (
    with recursive chain(id, depth) as (
      select new.successor_id, 1
      union all
      select d.successor_id, c.depth + 1 from chain c
      join public.work_item_dependencies d on d.predecessor_id = c.id and d.kind = 'blocks'
      where c.depth < 100
    )
    select 1 from chain where id = new.predecessor_id
  ) then
    raise exception 'dependency_cycle: those items would block each other' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger work_item_dependencies_no_cycle before insert on public.work_item_dependencies
  for each row execute function private.prevent_blocking_cycle();

create table public.work_item_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  work_item_id    uuid not null,
  author_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  foreign key (work_item_id, organization_id) references public.work_items (id, organization_id) on delete cascade
);
create index work_item_comments_item_idx on public.work_item_comments (work_item_id, created_at);

create type public.work_item_link_kind as enum ('pull_request', 'build', 'test_run', 'release', 'document', 'other');

create table public.work_item_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  work_item_id    uuid not null,
  kind            public.work_item_link_kind not null default 'other',
  url             text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  title           text check (title is null or char_length(title) <= 200),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (work_item_id, organization_id) references public.work_items (id, organization_id) on delete cascade
);
create index work_item_links_item_idx on public.work_item_links (work_item_id);

-- ---------------------------------------------------------------------------
-- Project status reports (immutable records)
-- ---------------------------------------------------------------------------
create table public.project_status_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  period_start    date not null,
  period_end      date not null,
  health          public.project_health not null,
  summary         text not null check (char_length(btrim(summary)) between 1 and 4000),
  highlights      text check (highlights is null or char_length(highlights) <= 4000),
  next_steps      text check (next_steps is null or char_length(next_steps) <= 4000),
  decisions_needed text check (decisions_needed is null or char_length(decisions_needed) <= 4000),
  metrics         jsonb not null default '{}'::jsonb,
  author_id       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (period_end >= period_start),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index project_status_reports_project_idx on public.project_status_reports (project_id, created_at desc);

create trigger project_status_reports_audit after insert on public.project_status_reports
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- RPCs: sprints and archiving
-- ---------------------------------------------------------------------------
create or replace function public.start_sprint(p_sprint uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sprint record;
begin
  select * into v_sprint from public.sprints where id = p_sprint;
  if v_sprint.id is null or not public.can_act_on_project(v_sprint.project_id, 'sprint.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sprint.state <> 'planned' then
    raise exception 'sprint_state: only a planned sprint can be started' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sprints where project_id = v_sprint.project_id and state = 'active') then
    raise exception 'sprint_state: complete the active sprint before starting another' using errcode = 'P0001';
  end if;

  update public.sprints s
     set state = 'active',
         started_at = now(),
         committed_points = t.points,
         committed_count = t.items
    from (select coalesce(sum(story_points), 0) as points, count(*) as items
          from public.work_items where sprint_id = p_sprint and archived_at is null) t
   where s.id = p_sprint;
  perform private.refresh_sprint_stats(p_sprint);
end;
$$;

create or replace function public.complete_sprint(p_sprint uuid, p_move_to uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sprint record;
  v_target record;
begin
  select * into v_sprint from public.sprints where id = p_sprint;
  if v_sprint.id is null or not public.can_act_on_project(v_sprint.project_id, 'sprint.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sprint.state <> 'active' then
    raise exception 'sprint_state: only the active sprint can be completed' using errcode = 'P0001';
  end if;
  if p_move_to is not null then
    select project_id, state into v_target from public.sprints where id = p_move_to;
    if v_target.project_id is distinct from v_sprint.project_id or v_target.state <> 'planned' then
      raise exception 'invalid_sprint: unfinished work can only move to a planned sprint of the same project' using errcode = 'P0001';
    end if;
  end if;

  perform private.refresh_sprint_stats(p_sprint);
  update public.sprints s
     set completed_points = t.points, completed_count = t.items
    from (select coalesce(sum(w.story_points), 0) as points, count(*) as items
          from public.work_items w join public.workflow_states st on st.id = w.state_id
          where w.sprint_id = p_sprint and w.archived_at is null and st.category = 'done') t
   where s.id = p_sprint;

  update public.work_items w
     set sprint_id = p_move_to
    from public.workflow_states st
   where st.id = w.state_id and w.sprint_id = p_sprint and st.category <> 'done';

  update public.sprints set state = 'completed', completed_at = now() where id = p_sprint;
end;
$$;

create or replace function public.set_work_item_archived(p_item uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.work_items where id = p_item;
  if v_project is null or not public.can_act_on_project(v_project, 'work.archive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.work_items
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_read_work(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_read_project(p.id) and public.has_permission(p.organization_id, 'work.read')
    from public.projects p where p.id = p_project
  ), false);
$$;

create or replace function private.work_item_project(p_item uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select project_id from public.work_items where id = p_item;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.programs               enable row level security;
alter table public.project_milestones     enable row level security;
alter table public.project_baselines      enable row level security;
alter table public.workflow_states        enable row level security;
alter table public.workflow_transitions   enable row level security;
alter table public.sprints                enable row level security;
alter table public.sprint_daily_stats     enable row level security;
alter table public.work_item_counters     enable row level security;
alter table public.work_items             enable row level security;
alter table public.work_item_activity     enable row level security;
alter table public.work_item_dependencies enable row level security;
alter table public.work_item_comments     enable row level security;
alter table public.work_item_links        enable row level security;
alter table public.project_status_reports enable row level security;

-- programs
grant select on public.programs to authenticated;
grant insert (organization_id, code, name, description, owner_membership_id) on public.programs to authenticated;
grant update (code, name, description, owner_membership_id, status, archived_at) on public.programs to authenticated;
create policy programs_select on public.programs for select to authenticated
  using (
    public.is_org_member(organization_id) and (
      public.has_permission(organization_id, 'project.read_all')
      or public.has_permission(organization_id, 'program.manage')
      or owner_membership_id = private.active_membership_id(organization_id)
      or exists (select 1 from public.projects p where p.program_id = programs.id)
    )
  );
create policy programs_insert on public.programs for insert to authenticated
  with check (public.has_permission(organization_id, 'program.manage'));
create policy programs_update on public.programs for update to authenticated
  using (public.has_permission(organization_id, 'program.manage'))
  with check (public.has_permission(organization_id, 'program.manage'));

grant insert (program_id) on public.projects to authenticated;
grant update (program_id) on public.projects to authenticated;

-- milestones (readable by everyone who can read the project, including client stakeholders)
grant select on public.project_milestones to authenticated;
grant insert (organization_id, project_id, name, description, due_date, completed_on, owner_membership_id) on public.project_milestones to authenticated;
grant update (name, description, due_date, completed_on, owner_membership_id) on public.project_milestones to authenticated;
grant delete on public.project_milestones to authenticated;
create policy project_milestones_select on public.project_milestones for select to authenticated
  using (public.can_read_project(project_id));
create policy project_milestones_insert on public.project_milestones for insert to authenticated
  with check (public.can_act_on_project(project_id, 'milestone.manage'));
create policy project_milestones_update on public.project_milestones for update to authenticated
  using (public.can_act_on_project(project_id, 'milestone.manage'))
  with check (public.can_act_on_project(project_id, 'milestone.manage'));
create policy project_milestones_delete on public.project_milestones for delete to authenticated
  using (public.can_act_on_project(project_id, 'milestone.manage'));

grant select on public.project_baselines to authenticated;
create policy project_baselines_select on public.project_baselines for select to authenticated
  using (public.can_read_project(project_id));

-- workflow
grant select on public.workflow_states to authenticated;
grant insert (organization_id, name, category, position, wip_limit) on public.workflow_states to authenticated;
grant update (name, category, position, wip_limit, is_default, archived_at) on public.workflow_states to authenticated;
create policy workflow_states_select on public.workflow_states for select to authenticated
  using (public.is_org_member(organization_id));
create policy workflow_states_insert on public.workflow_states for insert to authenticated
  with check (public.has_permission(organization_id, 'workflow.manage'));
create policy workflow_states_update on public.workflow_states for update to authenticated
  using (public.has_permission(organization_id, 'workflow.manage'))
  with check (public.has_permission(organization_id, 'workflow.manage'));

grant select, insert, delete on public.workflow_transitions to authenticated;
create policy workflow_transitions_select on public.workflow_transitions for select to authenticated
  using (public.is_org_member(organization_id));
create policy workflow_transitions_insert on public.workflow_transitions for insert to authenticated
  with check (public.has_permission(organization_id, 'workflow.manage'));
create policy workflow_transitions_delete on public.workflow_transitions for delete to authenticated
  using (public.has_permission(organization_id, 'workflow.manage'));

-- sprints
grant select on public.sprints to authenticated;
grant insert (organization_id, project_id, name, goal, start_date, end_date) on public.sprints to authenticated;
grant update (name, goal, start_date, end_date) on public.sprints to authenticated;
grant delete on public.sprints to authenticated;
create policy sprints_select on public.sprints for select to authenticated
  using (public.can_read_work(project_id));
create policy sprints_insert on public.sprints for insert to authenticated
  with check (public.can_act_on_project(project_id, 'sprint.manage'));
create policy sprints_update on public.sprints for update to authenticated
  using (public.can_act_on_project(project_id, 'sprint.manage') and state <> 'completed')
  with check (public.can_act_on_project(project_id, 'sprint.manage'));
create policy sprints_delete on public.sprints for delete to authenticated
  using (public.can_act_on_project(project_id, 'sprint.manage') and state = 'planned');

grant select on public.sprint_daily_stats to authenticated;
create policy sprint_daily_stats_select on public.sprint_daily_stats for select to authenticated
  using (exists (select 1 from public.sprints s where s.id = sprint_id));

-- work items
grant select on public.work_items to authenticated;
grant insert (organization_id, project_id, type, title, description, priority, business_value, severity, state_id, parent_id,
              assignee_membership_id, reporter_membership_id, reviewer_membership_id, team_id, sprint_id, start_date, due_date,
              story_points, estimate_hours, actual_hours, acceptance_criteria, labels, component, rank, blocked, blocked_reason)
  on public.work_items to authenticated;
grant update (type, title, description, priority, business_value, severity, state_id, parent_id,
              assignee_membership_id, reporter_membership_id, reviewer_membership_id, team_id, sprint_id, start_date, due_date,
              story_points, estimate_hours, actual_hours, acceptance_criteria, labels, component, rank, blocked, blocked_reason)
  on public.work_items to authenticated;
create policy work_items_select on public.work_items for select to authenticated
  using (public.can_read_work(project_id));
create policy work_items_insert on public.work_items for insert to authenticated
  with check (public.can_act_on_project(project_id, 'work.create'));
create policy work_items_update on public.work_items for update to authenticated
  using (public.can_act_on_project(project_id, 'work.update') and archived_at is null)
  with check (public.can_act_on_project(project_id, 'work.update'));

create policy work_item_counters_none on public.work_item_counters for select to authenticated using (false);

grant select on public.work_item_activity to authenticated;
create policy work_item_activity_select on public.work_item_activity for select to authenticated
  using (public.can_read_work(private.work_item_project(work_item_id)));

grant select, insert, delete on public.work_item_dependencies to authenticated;
create policy work_item_dependencies_select on public.work_item_dependencies for select to authenticated
  using (public.can_read_work(private.work_item_project(predecessor_id)) and public.can_read_work(private.work_item_project(successor_id)));
create policy work_item_dependencies_insert on public.work_item_dependencies for insert to authenticated
  with check (public.can_act_on_project(private.work_item_project(successor_id), 'work.update')
              and public.can_read_work(private.work_item_project(predecessor_id)));
create policy work_item_dependencies_delete on public.work_item_dependencies for delete to authenticated
  using (public.can_act_on_project(private.work_item_project(successor_id), 'work.update'));

grant select on public.work_item_comments to authenticated;
grant insert (organization_id, work_item_id, body) on public.work_item_comments to authenticated;
grant update (body, edited_at, deleted_at) on public.work_item_comments to authenticated;
create policy work_item_comments_select on public.work_item_comments for select to authenticated
  using (public.can_read_work(private.work_item_project(work_item_id)));
create policy work_item_comments_insert on public.work_item_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_read_work(private.work_item_project(work_item_id)));
create policy work_item_comments_update on public.work_item_comments for update to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null)
  with check (author_id = (select auth.uid()));

grant select, delete on public.work_item_links to authenticated;
grant insert (organization_id, work_item_id, kind, url, title) on public.work_item_links to authenticated;
create policy work_item_links_select on public.work_item_links for select to authenticated
  using (public.can_read_work(private.work_item_project(work_item_id)));
create policy work_item_links_insert on public.work_item_links for insert to authenticated
  with check (public.can_act_on_project(private.work_item_project(work_item_id), 'work.update'));
create policy work_item_links_delete on public.work_item_links for delete to authenticated
  using (public.can_act_on_project(private.work_item_project(work_item_id), 'work.update'));

-- status reports
grant select on public.project_status_reports to authenticated;
grant insert (organization_id, project_id, period_start, period_end, health, summary, highlights, next_steps, decisions_needed, metrics)
  on public.project_status_reports to authenticated;
create policy project_status_reports_select on public.project_status_reports for select to authenticated
  using (public.can_read_project(project_id));
create policy project_status_reports_insert on public.project_status_reports for insert to authenticated
  with check (public.can_act_on_project(project_id, 'project.change_status'));

revoke execute on function
  public.take_project_baseline(uuid, text),
  public.start_sprint(uuid),
  public.complete_sprint(uuid, uuid),
  public.set_work_item_archived(uuid, boolean),
  public.can_read_work(uuid),
  public.allowed_parent_types(public.work_item_type)
from public, anon;
grant execute on function
  public.take_project_baseline(uuid, text),
  public.start_sprint(uuid),
  public.complete_sprint(uuid, uuid),
  public.set_work_item_archived(uuid, boolean),
  public.can_read_work(uuid),
  public.allowed_parent_types(public.work_item_type)
to authenticated;

-- Live board updates (RLS applies to Realtime as well).
alter publication supabase_realtime add table public.work_items;
