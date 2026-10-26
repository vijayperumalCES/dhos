-- DHOS Phase 1 — Clients, teams, projects, project membership and status history.

create type public.project_status as enum ('proposed', 'approved', 'planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.project_health as enum ('not_assessed', 'green', 'amber', 'red');
create type public.project_methodology as enum ('scrum', 'kanban', 'waterfall', 'hybrid');
create type public.client_confidentiality as enum ('standard', 'confidential');

-- ---------------------------------------------------------------------------
-- Clients (minimal Phase 1 record; contacts and contracts arrive with Module D in Phase 4)
-- ---------------------------------------------------------------------------
create table public.clients (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  name                        text not null check (char_length(btrim(name)) between 2 and 160),
  code                        text check (code is null or code ~ '^[A-Z0-9-]{2,20}$'),
  industry                    text check (industry is null or char_length(industry) <= 80),
  website                     text check (website is null or website ~ '^https?://'),
  account_owner_membership_id uuid,
  confidentiality             public.client_confidentiality not null default 'standard',
  notes                       text check (notes is null or char_length(notes) <= 4000),
  created_by                  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  archived_at                 timestamptz,
  unique (id, organization_id),
  foreign key (account_owner_membership_id, organization_id) references public.organization_memberships (id, organization_id)
);
create unique index clients_org_name_uq on public.clients (organization_id, lower(name)) where archived_at is null;
create unique index clients_org_code_uq on public.clients (organization_id, code) where code is not null;

create trigger clients_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
create table public.teams (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 2 and 120),
  description        text check (description is null or char_length(description) <= 2000),
  lead_membership_id uuid,
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  unique (id, organization_id),
  foreign key (lead_membership_id, organization_id) references public.organization_memberships (id, organization_id)
);
create unique index teams_org_name_uq on public.teams (organization_id, lower(name)) where archived_at is null;

create trigger teams_updated_at before update on public.teams
  for each row execute function private.set_updated_at();
create trigger teams_audit after insert or update or delete on public.teams
  for each row execute function private.audit_row_change();

create table public.team_members (
  organization_id uuid not null,
  team_id         uuid not null,
  membership_id   uuid not null,
  team_role       text check (team_role is null or char_length(team_role) <= 80),
  joined_at       timestamptz not null default now(),
  primary key (team_id, membership_id),
  foreign key (team_id, organization_id) references public.teams (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
create index team_members_membership_idx on public.team_members (membership_id);

create trigger team_members_audit after insert or update or delete on public.team_members
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  code                text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  name                text not null check (char_length(btrim(name)) between 2 and 160),
  description         text check (description is null or char_length(description) <= 4000),
  client_id           uuid,
  sponsor_name        text check (sponsor_name is null or char_length(sponsor_name) <= 120),
  project_manager_id  uuid,
  delivery_owner_id   uuid,
  primary_team_id     uuid,
  methodology         public.project_methodology not null default 'scrum',
  status              public.project_status not null default 'proposed',
  status_changed_at   timestamptz not null default now(),
  health              public.project_health not null default 'not_assessed',
  health_reason       text check (health_reason is null or char_length(health_reason) <= 1000),
  health_updated_at   timestamptz,
  planned_start_date  date,
  target_end_date     date,
  actual_end_date     date,
  objectives          text check (objectives is null or char_length(objectives) <= 4000),
  scope_summary       text check (scope_summary is null or char_length(scope_summary) <= 4000),
  assumptions         text check (assumptions is null or char_length(assumptions) <= 4000),
  project_constraints text check (project_constraints is null or char_length(project_constraints) <= 4000),
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  unique (organization_id, code),
  unique (id, organization_id),
  check (target_end_date is null or planned_start_date is null or target_end_date >= planned_start_date),
  check (actual_end_date is null or status in ('completed', 'cancelled')),
  foreign key (client_id, organization_id) references public.clients (id, organization_id),
  foreign key (project_manager_id, organization_id) references public.organization_memberships (id, organization_id),
  foreign key (delivery_owner_id, organization_id) references public.organization_memberships (id, organization_id),
  foreign key (primary_team_id, organization_id) references public.teams (id, organization_id)
);
create index projects_org_status_idx on public.projects (organization_id, status) where archived_at is null;
create index projects_pm_idx on public.projects (project_manager_id);
create index projects_owner_idx on public.projects (delivery_owner_id);
create index projects_client_idx on public.projects (client_id);

create trigger projects_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function private.audit_row_change();

create table public.project_memberships (
  organization_id    uuid not null,
  project_id         uuid not null,
  membership_id      uuid not null,
  project_role       text not null default 'Member' check (char_length(btrim(project_role)) between 1 and 80),
  allocation_percent smallint check (allocation_percent is null or allocation_percent between 0 and 100),
  start_date         date,
  end_date           date,
  created_at         timestamptz not null default now(),
  primary key (project_id, membership_id),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
comment on column public.project_memberships.allocation_percent is 'Indicative planned allocation. Capacity planning (Phase 3) will supersede this with dated allocations.';
create index project_memberships_membership_idx on public.project_memberships (membership_id);

create trigger project_memberships_audit after insert or update or delete on public.project_memberships
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Project status history (lifecycle + health), written only by trigger
-- ---------------------------------------------------------------------------
create table public.project_status_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  change_type     text not null check (change_type in ('created', 'status', 'health')),
  from_status     public.project_status,
  to_status       public.project_status,
  from_health     public.project_health,
  to_health       public.project_health,
  reason          text check (reason is null or char_length(reason) <= 1000),
  changed_by      uuid references auth.users (id) on delete set null,
  changed_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index project_status_history_project_idx on public.project_status_history (project_id, changed_at desc);
create index project_status_history_org_idx on public.project_status_history (organization_id, changed_at desc);

-- Lifecycle state machine. Mirrored in src/lib/domain/project-lifecycle.ts; the pgTAP and
-- Vitest suites both assert the same transition table.
create or replace function public.is_valid_project_transition(p_from public.project_status, p_to public.project_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('proposed'::public.project_status, 'approved'::public.project_status),
    ('proposed', 'cancelled'),
    ('approved', 'planning'),
    ('approved', 'on_hold'),
    ('approved', 'cancelled'),
    ('planning', 'active'),
    ('planning', 'on_hold'),
    ('planning', 'cancelled'),
    ('active', 'on_hold'),
    ('active', 'completed'),
    ('active', 'cancelled'),
    ('on_hold', 'planning'),
    ('on_hold', 'active'),
    ('on_hold', 'cancelled')
  );
$$;

-- Deterministic pre-hook: enforce lifecycle rules regardless of the caller.
create or replace function private.projects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not public.is_valid_project_transition(old.status, new.status) then
      raise exception 'invalid_transition: % -> %', old.status, new.status using errcode = 'P0001';
    end if;
    new.status_changed_at := now();
    if new.status = 'completed' and new.actual_end_date is null then
      new.actual_end_date := current_date;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.health is distinct from old.health then
    new.health_updated_at := now();
  end if;
  if tg_op = 'INSERT' and new.health <> 'not_assessed' and new.health_updated_at is null then
    new.health_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger projects_before_write before insert or update on public.projects
  for each row execute function private.projects_before_write();

-- Post-hook: append status/health history.
create or replace function private.projects_record_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('dhos.change_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.project_status_history (organization_id, project_id, change_type, to_status, to_health, reason, changed_by)
    values (new.organization_id, new.id, 'created', new.status, new.health, v_reason, auth.uid());
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.project_status_history (organization_id, project_id, change_type, from_status, to_status, reason, changed_by)
    values (new.organization_id, new.id, 'status', old.status, new.status, v_reason, auth.uid());
  end if;
  if new.health is distinct from old.health then
    insert into public.project_status_history (organization_id, project_id, change_type, from_health, to_health, reason, changed_by)
    values (new.organization_id, new.id, 'health', old.health, new.health, coalesce(v_reason, new.health_reason), auth.uid());
  end if;
  return null;
end;
$$;

create trigger projects_record_history after insert or update of status, health on public.projects
  for each row execute function private.projects_record_history();

-- ---------------------------------------------------------------------------
-- Project-level authorization helpers
-- ---------------------------------------------------------------------------
create or replace function private.can_read_project_row(
  p_org uuid, p_project uuid, p_manager uuid, p_owner uuid, p_created_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
begin
  v_membership := private.active_membership_id(p_org);
  if v_membership is null then
    return false;
  end if;
  if public.has_permission(p_org, 'project.read_all') then
    return true;
  end if;
  if not public.has_permission(p_org, 'project.read_assigned') then
    return false;
  end if;
  return v_membership in (p_manager, p_owner)
      or p_created_by = (select auth.uid())
      or exists (select 1 from public.project_memberships pm where pm.project_id = p_project and pm.membership_id = v_membership);
end;
$$;

create or replace function public.can_read_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_read_project_row(p.organization_id, p.id, p.project_manager_id, p.delivery_owner_id, p.created_by)
    from public.projects p where p.id = p_project
  ), false);
$$;

create or replace function public.can_act_on_project(p_project uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_read_project(p.id) and public.has_permission(p.organization_id, p_permission)
    from public.projects p where p.id = p_project
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Project RPCs for controlled columns (status, health, archive)
-- ---------------------------------------------------------------------------
create or replace function public.transition_project_status(p_project uuid, p_to public.project_status, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_act_on_project(p_project, 'project.change_status') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select archived_at from public.projects where id = p_project) is not null then
    raise exception 'archived: restore the project before changing its status' using errcode = 'P0001';
  end if;
  if p_to in ('on_hold', 'cancelled') and v_reason is null then
    raise exception 'reason_required: a reason is required for % ', p_to using errcode = 'P0001';
  end if;
  perform set_config('dhos.change_reason', coalesce(v_reason, ''), true);
  update public.projects set status = p_to where id = p_project;
  perform set_config('dhos.change_reason', '', true);
end;
$$;

create or replace function public.set_project_health(p_project uuid, p_health public.project_health, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_act_on_project(p_project, 'project.change_status') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_health in ('amber', 'red') and v_reason is null then
    raise exception 'reason_required: a reason is required for % health', p_health using errcode = 'P0001';
  end if;
  perform set_config('dhos.change_reason', coalesce(v_reason, ''), true);
  -- Re-confirming the same rating refreshes health_updated_at (keeps it from going stale).
  update public.projects
     set health = p_health,
         health_reason = v_reason,
         health_updated_at = now()
   where id = p_project;
  perform set_config('dhos.change_reason', '', true);
end;
$$;

create or replace function public.set_project_archived(p_project uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_act_on_project(p_project, 'project.archive') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.projects
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_project;
end;
$$;
