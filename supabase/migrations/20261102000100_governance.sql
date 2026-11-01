-- Stride Phase 4 — Delivery governance: unified RAID register, decisions, actions, escalations with
-- evidence and deadlines, change requests, releases with quality gates, client contacts and
-- contracts, and versioned documents. See docs/DECISIONS/ADR-0009-governance-model.md.
--
-- Access: project-scoped records are readable with governance.read / release.read / document.read
-- on a project the caller can read, and writable with the matching *.manage permission. Status
-- changes of escalations, change requests, releases and gates go through RPCs. Contacts and
-- contracts are visible exactly when their client is.

-- ---------------------------------------------------------------------------
-- Permissions and role templates (existing organizations are backfilled)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('governance.read',    'governance', 'View RAID items, decisions, actions, escalations and change requests on visible projects'),
  ('governance.manage',  'governance', 'Create and edit RAID items, decisions, actions and escalations; draft and submit change requests'),
  ('change.approve',     'governance', 'Approve or reject change requests (never your own)'),
  ('release.read',       'governance', 'View releases and their quality gates on visible projects'),
  ('release.manage',     'governance', 'Create releases, record quality gate results, move releases through review and out'),
  ('release.approve',    'governance', 'Approve a release for go-live and waive a required quality gate with a reason'),
  ('document.read',      'governance', 'View internal project documents (client-visible documents need no permission)'),
  ('document.manage',    'governance', 'Create documents and add versions on visible projects');

update private.role_templates set permissions = array['org.members.read','audit.read','client.read','client.confidential.read','client.manage','project.read_all','project.create','project.update','project.change_status','project.archive','project.members.manage','team.read','team.manage','dashboard.portfolio.view','program.manage','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workflow.manage','workforce.self','timesheet.read_all','timesheet.approve','resource.read','resource.manage','governance.read','governance.manage','change.approve','release.read','release.manage','release.approve','document.read','document.manage'] where key = 'delivery_head';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_all','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view','program.manage','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workforce.self','resource.read','resource.manage','governance.read','governance.manage','change.approve','release.read','release.manage','document.read','document.manage'] where key = 'program_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view','milestone.manage','work.read','work.create','work.update','work.archive','sprint.manage','workforce.self','resource.read','governance.read','governance.manage','release.read','release.manage','document.read','document.manage'] where key = 'project_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.update','team.read','dashboard.portfolio.view','work.read','work.create','work.update','work.archive','sprint.manage','workforce.self','resource.read','governance.read','governance.manage','release.read','release.manage','document.read'] where key = 'engineering_manager';
update private.role_templates set permissions = array['org.members.read','client.read','project.read_assigned','project.update','team.read','work.read','work.create','work.update','work.archive','workforce.self','governance.read','governance.manage','release.read','document.read','document.manage'] where key = 'product_owner';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','sprint.manage','workforce.self','governance.read','governance.manage','release.read','document.read'] where key = 'scrum_master';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','workforce.self','governance.read','release.read','document.read'] where key = 'developer';
update private.role_templates set permissions = array['org.members.read','project.read_assigned','team.read','work.read','work.create','work.update','workforce.self','governance.read','release.read','release.manage','document.read'] where key = 'qa_engineer';
update private.role_templates set permissions = array['org.members.read','client.read','client.confidential.read','project.read_all','dashboard.portfolio.view','workforce.self','timesheet.read_all','resource.read','governance.read','document.read'] where key = 'finance_manager';

insert into public.role_permissions (role_id, permission_key)
select r.id, unnest(t.permissions)
from public.role_definitions r
join private.role_templates t on t.key = r.key
where r.is_system
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Visibility of a client, identical to the clients select policy.
create or replace function private.can_see_client(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.has_permission(c.organization_id, 'client.read')
       and (
         c.confidentiality = 'standard'
         or public.has_permission(c.organization_id, 'client.confidential.read')
         or c.account_owner_membership_id = private.active_membership_id(c.organization_id)
         or private.is_assigned_to_client_project(c.id, c.organization_id)
       )
    from public.clients c where c.id = p_client
  ), false);
$$;

-- Editing rights over a client's contacts and contracts, identical to the clients update policy.
create or replace function private.can_manage_client(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.has_permission(c.organization_id, 'client.manage')
       and (
         c.confidentiality = 'standard'
         or public.has_permission(c.organization_id, 'client.confidential.read')
         or c.account_owner_membership_id = private.active_membership_id(c.organization_id)
       )
    from public.clients c where c.id = p_client
  ), false);
$$;

-- Could this member see this project? Used to refuse escalations to someone who couldn't open them.
create or replace function private.membership_can_read_project(p_membership uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.membership_has_permission(m.id, 'project.read_all')
       or (private.membership_has_permission(m.id, 'project.read_assigned') and (
             m.id in (p.project_manager_id, p.delivery_owner_id)
             or p.created_by = m.user_id
             or exists (select 1 from public.project_memberships pm where pm.project_id = p.id and pm.membership_id = m.id)))
    from public.organization_memberships m
    join public.projects p on p.organization_id = m.organization_id
    where m.id = p_membership and m.status = 'active' and p.id = p_project
  ), false);
$$;

-- Today's date in the organization's time zone.
create or replace function private.org_today(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select timezone from public.organization_settings where organization_id = p_org), 'UTC'))::date;
$$;

-- ---------------------------------------------------------------------------
-- RAID register
-- ---------------------------------------------------------------------------
create type public.raid_type as enum ('risk', 'assumption', 'issue', 'dependency');
create type public.raid_status as enum ('open', 'in_progress', 'resolved', 'accepted', 'closed');

create table public.raid_items (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  project_id              uuid not null,
  type                    public.raid_type not null,
  title                   text not null check (char_length(btrim(title)) between 2 and 200),
  description             text check (description is null or char_length(description) <= 4000),
  status                  public.raid_status not null default 'open',
  probability             smallint check (probability between 1 and 5),
  impact                  smallint check (impact between 1 and 5),
  score                   smallint generated always as (probability * impact) stored,
  owner_membership_id     uuid,
  raised_by_membership_id uuid,
  due_date                date,
  mitigation              text check (mitigation is null or char_length(mitigation) <= 4000),
  contingency             text check (contingency is null or char_length(contingency) <= 4000),
  resolution_note         text check (resolution_note is null or char_length(resolution_note) <= 2000),
  resolved_at             timestamptz,
  created_by              uuid default auth.uid() references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  archived_at             timestamptz,
  unique (id, organization_id),
  unique (id, project_id, organization_id),
  check (type <> 'risk' or (probability is not null and impact is not null)),
  check (probability is null or type = 'risk'),
  check (impact is null or type in ('risk', 'issue')),
  check (type = 'risk' or status <> 'accepted'),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (owner_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (owner_membership_id),
  foreign key (raised_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (raised_by_membership_id)
);
comment on column public.raid_items.score is 'probability × impact (risks only); 1–25.';
create index raid_items_project_idx on public.raid_items (project_id, status) where archived_at is null;
create index raid_items_org_open_idx on public.raid_items (organization_id, due_date) where archived_at is null and status in ('open', 'in_progress');

create or replace function private.raid_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.resolved_at := null;
    new.resolution_note := null;
    new.raised_by_membership_id := coalesce(new.raised_by_membership_id, private.active_membership_id(new.organization_id));
    return new;
  end if;
  if new.status in ('resolved', 'closed', 'accepted') then
    if nullif(btrim(coalesce(new.resolution_note, '')), '') is null then
      raise exception 'reason_required: say how this was resolved, closed or accepted' using errcode = 'P0001';
    end if;
    if old.status not in ('resolved', 'closed', 'accepted') then
      new.resolved_at := now();
    end if;
  else
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
create trigger raid_items_before_write before insert or update on public.raid_items
  for each row execute function private.raid_items_before_write();
create trigger raid_items_updated_at before update on public.raid_items
  for each row execute function private.set_updated_at();
create trigger raid_items_audit after insert or update or delete on public.raid_items
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------
create type public.decision_status as enum ('proposed', 'accepted', 'rejected', 'superseded');

create table public.decisions (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete cascade,
  project_id                 uuid not null,
  title                      text not null check (char_length(btrim(title)) between 2 and 200),
  context                    text check (context is null or char_length(context) <= 4000),
  decision                   text check (decision is null or char_length(decision) <= 4000),
  rationale                  text check (rationale is null or char_length(rationale) <= 4000),
  consequences               text check (consequences is null or char_length(consequences) <= 4000),
  status                     public.decision_status not null default 'proposed',
  decided_on                 date,
  decided_by_membership_id   uuid,
  superseded_by_id           uuid,
  created_by                 uuid default auth.uid() references auth.users (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, project_id, organization_id),
  check (status in ('proposed') or decided_on is not null),
  check (status <> 'superseded' or superseded_by_id is not null),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (decided_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (decided_by_membership_id),
  foreign key (superseded_by_id, project_id, organization_id) references public.decisions (id, project_id, organization_id) on delete set null (superseded_by_id)
);
create index decisions_project_idx on public.decisions (project_id, decided_on desc);

create or replace function private.decisions_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := array['updated_at', 'status', 'superseded_by_id'];
begin
  if tg_op = 'INSERT' then
    new.status := 'proposed';
    new.decided_on := null;
    new.decided_by_membership_id := null;
    new.superseded_by_id := null;
    return new;
  end if;

  if old.status <> 'proposed' then
    -- Recorded decisions are locked; the only change is accepted -> superseded.
    if (to_jsonb(new) - v_keys) is distinct from (to_jsonb(old) - v_keys)
       or not (old.status = 'accepted' and new.status in ('accepted', 'superseded')) then
      raise exception 'decision_locked: a recorded decision can only be superseded by a newer one' using errcode = 'P0001';
    end if;
    if new.status = 'superseded' then
      if new.superseded_by_id is null or new.superseded_by_id = new.id
         or not exists (select 1 from public.decisions d
                        where d.id = new.superseded_by_id and d.project_id = new.project_id and d.status = 'accepted') then
        raise exception 'invalid_link: choose an accepted decision on the same project that replaces this one' using errcode = 'P0001';
      end if;
    else
      new.superseded_by_id := old.superseded_by_id;
    end if;
    return new;
  end if;

  if new.status = 'superseded' then
    raise exception 'decision_transition: only an accepted decision can be superseded' using errcode = 'P0001';
  end if;
  new.superseded_by_id := null;
  if new.status in ('accepted', 'rejected') then
    if nullif(btrim(coalesce(new.decision, '')), '') is null then
      raise exception 'reason_required: state the decision before recording it' using errcode = 'P0001';
    end if;
    new.decided_on := private.org_today(new.organization_id);
    new.decided_by_membership_id := private.active_membership_id(new.organization_id);
  else
    new.decided_on := null;
    new.decided_by_membership_id := null;
  end if;
  return new;
end;
$$;
create trigger decisions_before_write before insert or update on public.decisions
  for each row execute function private.decisions_before_write();
create trigger decisions_updated_at before update on public.decisions
  for each row execute function private.set_updated_at();
create trigger decisions_audit after insert or update or delete on public.decisions
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------
create type public.action_status as enum ('open', 'in_progress', 'done', 'cancelled');

create table public.project_actions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null,
  title               text not null check (char_length(btrim(title)) between 2 and 200),
  description         text check (description is null or char_length(description) <= 4000),
  status              public.action_status not null default 'open',
  owner_membership_id uuid not null,
  due_date            date not null,
  completed_at        timestamptz,
  raid_item_id        uuid,
  decision_id         uuid,
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (owner_membership_id, organization_id) references public.organization_memberships (id, organization_id),
  foreign key (raid_item_id, project_id, organization_id) references public.raid_items (id, project_id, organization_id) on delete set null (raid_item_id),
  foreign key (decision_id, project_id, organization_id) references public.decisions (id, project_id, organization_id) on delete set null (decision_id)
);
create index project_actions_project_idx on public.project_actions (project_id, status);
create index project_actions_owner_idx on public.project_actions (owner_membership_id, due_date) where status in ('open', 'in_progress');
create index project_actions_org_due_idx on public.project_actions (organization_id, due_date) where status in ('open', 'in_progress');

create or replace function private.project_actions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('done', 'cancelled') then
    if tg_op = 'INSERT' or old.status not in ('done', 'cancelled') then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger project_actions_before_write before insert or update on public.project_actions
  for each row execute function private.project_actions_before_write();
create trigger project_actions_updated_at before update on public.project_actions
  for each row execute function private.set_updated_at();
create trigger project_actions_audit after insert or update or delete on public.project_actions
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Escalations and evidence
-- ---------------------------------------------------------------------------
create type public.escalation_severity as enum ('medium', 'high', 'critical');
create type public.escalation_status as enum ('open', 'acknowledged', 'resolved');

create table public.escalations (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete cascade,
  project_id                 uuid not null,
  title                      text not null check (char_length(btrim(title)) between 2 and 200),
  description                text not null check (char_length(btrim(description)) between 2 and 4000),
  severity                   public.escalation_severity not null,
  status                     public.escalation_status not null default 'open',
  escalated_to_membership_id uuid not null,
  raised_by_membership_id    uuid,
  respond_by                 timestamptz not null,
  acknowledged_at            timestamptz,
  resolved_at                timestamptz,
  resolution_note            text check (resolution_note is null or char_length(resolution_note) <= 2000),
  raid_item_id               uuid,
  created_by                 uuid default auth.uid() references auth.users (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, project_id, organization_id),
  check (status <> 'resolved' or (resolved_at is not null and resolution_note is not null)),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (escalated_to_membership_id, organization_id) references public.organization_memberships (id, organization_id),
  foreign key (raised_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (raised_by_membership_id),
  foreign key (raid_item_id, project_id, organization_id) references public.raid_items (id, project_id, organization_id) on delete set null (raid_item_id)
);
create index escalations_project_idx on public.escalations (project_id, status);
create index escalations_open_idx on public.escalations (organization_id, respond_by) where status in ('open', 'acknowledged');
create index escalations_recipient_idx on public.escalations (escalated_to_membership_id) where status in ('open', 'acknowledged');

create trigger escalations_updated_at before update on public.escalations
  for each row execute function private.set_updated_at();
create trigger escalations_audit after insert or update or delete on public.escalations
  for each row execute function private.audit_row_change();

create table public.escalation_evidence (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  escalation_id   uuid not null,
  kind            text not null check (kind in ('link', 'note')),
  title           text not null check (char_length(btrim(title)) between 2 and 200),
  url             text check (url is null or url ~ '^https?://'),
  note            text check (note is null or char_length(note) <= 2000),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (kind <> 'link' or url is not null),
  check (kind <> 'note' or note is not null),
  foreign key (escalation_id, project_id, organization_id) references public.escalations (id, project_id, organization_id) on delete cascade
);
create index escalation_evidence_escalation_idx on public.escalation_evidence (escalation_id, created_at);

create trigger escalation_evidence_audit after insert on public.escalation_evidence
  for each row execute function private.audit_row_change();

-- Escalations are raised only through this function, so none exists without evidence, a future
-- deadline and a recipient who can open the project.
create or replace function public.raise_escalation(
  p_project uuid, p_title text, p_description text, p_severity public.escalation_severity,
  p_to uuid, p_respond_by timestamptz, p_raid_item uuid, p_evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_ev jsonb;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.can_act_on_project(p_project, 'governance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_respond_by is null or p_respond_by <= now() then
    raise exception 'invalid_deadline: choose a response deadline in the future' using errcode = 'P0001';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0 then
    raise exception 'evidence_required: add at least one piece of evidence' using errcode = 'P0001';
  end if;
  if p_to is null
     or not exists (select 1 from public.organization_memberships m where m.id = p_to and m.organization_id = v_org and m.status = 'active')
     or not private.membership_has_permission(p_to, 'governance.read')
     or not private.membership_can_read_project(p_to, p_project) then
    raise exception 'invalid_recipient: that person can''t open governance records on this project' using errcode = 'P0001';
  end if;

  insert into public.escalations (organization_id, project_id, title, description, severity, escalated_to_membership_id,
                                  raised_by_membership_id, respond_by, raid_item_id)
  values (v_org, p_project, p_title, p_description, p_severity, p_to, private.active_membership_id(v_org), p_respond_by, p_raid_item)
  returning id into v_id;

  for v_ev in select * from jsonb_array_elements(p_evidence) loop
    insert into public.escalation_evidence (organization_id, project_id, escalation_id, kind, title, url, note)
    values (v_org, p_project, v_id, coalesce(v_ev ->> 'kind', 'note'), v_ev ->> 'title',
            nullif(btrim(coalesce(v_ev ->> 'url', '')), ''), nullif(btrim(coalesce(v_ev ->> 'note', '')), ''));
  end loop;
  return v_id;
end;
$$;

-- The person it was escalated to confirms they have seen it.
create or replace function public.acknowledge_escalation(p_escalation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.escalations;
begin
  select * into e from public.escalations where id = p_escalation;
  if e.id is null
     or e.escalated_to_membership_id is distinct from private.active_membership_id(e.organization_id)
     or not public.can_act_on_project(e.project_id, 'governance.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.status <> 'open' then
    raise exception 'escalation_state: this escalation has already been acknowledged or resolved' using errcode = 'P0001';
  end if;
  update public.escalations set status = 'acknowledged', acknowledged_at = now() where id = p_escalation;
end;
$$;

-- Resolved by the recipient or by a governance manager, with a note.
create or replace function public.resolve_escalation(p_escalation uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.escalations;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into e from public.escalations where id = p_escalation;
  if e.id is null
     or not (
       (e.escalated_to_membership_id = private.active_membership_id(e.organization_id)
         and public.can_act_on_project(e.project_id, 'governance.read'))
       or public.can_act_on_project(e.project_id, 'governance.manage')
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.status = 'resolved' then
    raise exception 'escalation_state: this escalation has already been resolved' using errcode = 'P0001';
  end if;
  if v_note is null then
    raise exception 'reason_required: say how this was resolved' using errcode = 'P0001';
  end if;
  update public.escalations
     set status = 'resolved', resolved_at = now(), resolution_note = v_note,
         acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_escalation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Change requests
-- ---------------------------------------------------------------------------
create type public.change_status as enum ('draft', 'submitted', 'approved', 'rejected', 'implemented', 'withdrawn');

create table public.change_requests (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  project_id                  uuid not null,
  title                       text not null check (char_length(btrim(title)) between 2 and 200),
  description                 text check (description is null or char_length(description) <= 4000),
  justification               text check (justification is null or char_length(justification) <= 4000),
  impact_schedule_days        integer check (impact_schedule_days between -365 and 3650),
  impact_effort_hours         numeric(8,1) check (impact_effort_hours is null or impact_effort_hours between 0 and 999999),
  impact_scope                text check (impact_scope is null or char_length(impact_scope) <= 2000),
  impact_risk                 text check (impact_risk is null or char_length(impact_risk) <= 2000),
  status                      public.change_status not null default 'draft',
  requested_by_membership_id  uuid,
  submitted_at                timestamptz,
  decided_by_membership_id    uuid,
  decided_at                  timestamptz,
  decision_note               text check (decision_note is null or char_length(decision_note) <= 2000),
  implemented_at              timestamptz,
  created_by                  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (requested_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (requested_by_membership_id),
  foreign key (decided_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (decided_by_membership_id)
);
create index change_requests_project_idx on public.change_requests (project_id, status);
create index change_requests_org_status_idx on public.change_requests (organization_id, status);

-- Content is editable only while a draft; every other field changes through the RPCs below.
create or replace function private.change_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text[] := array['updated_at', 'status', 'submitted_at', 'decided_by_membership_id', 'decided_at', 'decision_note', 'implemented_at'];
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.submitted_at := null;
    new.decided_by_membership_id := null;
    new.decided_at := null;
    new.decision_note := null;
    new.implemented_at := null;
    new.requested_by_membership_id := coalesce(new.requested_by_membership_id, private.active_membership_id(new.organization_id));
    return new;
  end if;
  if old.status <> 'draft' and (to_jsonb(new) - v_state) is distinct from (to_jsonb(old) - v_state) then
    raise exception 'change_locked: a submitted change request can no longer be edited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger change_requests_before_write before insert or update on public.change_requests
  for each row execute function private.change_requests_before_write();
create trigger change_requests_updated_at before update on public.change_requests
  for each row execute function private.set_updated_at();
create trigger change_requests_audit after insert or update or delete on public.change_requests
  for each row execute function private.audit_row_change();

create or replace function public.submit_change_request(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.change_requests;
begin
  select * into c from public.change_requests where id = p_change;
  if c.id is null or not public.can_act_on_project(c.project_id, 'governance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then
    raise exception 'change_state: only a draft can be submitted' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(c.justification, '')), '') is null then
    raise exception 'incomplete: add a justification before submitting' using errcode = 'P0001';
  end if;
  update public.change_requests set status = 'submitted', submitted_at = now() where id = p_change;
end;
$$;

-- The author (or a governance manager) withdraws a draft or submitted request.
create or replace function public.withdraw_change_request(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.change_requests;
begin
  select * into c from public.change_requests where id = p_change;
  if c.id is null or not public.can_act_on_project(c.project_id, 'governance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status not in ('draft', 'submitted') then
    raise exception 'change_state: only a draft or submitted request can be withdrawn' using errcode = 'P0001';
  end if;
  update public.change_requests set status = 'withdrawn' where id = p_change;
end;
$$;

-- Approved or rejected by someone with change.approve who is not the requester.
create or replace function public.decide_change_request(p_change uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.change_requests;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_me uuid;
begin
  select * into c from public.change_requests where id = p_change;
  if c.id is null or not public.can_act_on_project(c.project_id, 'change.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_me := private.active_membership_id(c.organization_id);
  if c.requested_by_membership_id is not distinct from v_me or c.created_by = (select auth.uid()) then
    raise exception 'self_review: you can''t decide your own change request' using errcode = 'P0001';
  end if;
  if c.status <> 'submitted' then
    raise exception 'change_state: only a submitted request can be decided' using errcode = 'P0001';
  end if;
  if not p_approve and v_note is null then
    raise exception 'reason_required: say why the change is rejected' using errcode = 'P0001';
  end if;
  update public.change_requests
     set status = case when p_approve then 'approved'::public.change_status else 'rejected'::public.change_status end,
         decided_by_membership_id = v_me, decided_at = now(), decision_note = v_note
   where id = p_change;
end;
$$;

create or replace function public.implement_change_request(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.change_requests;
begin
  select * into c from public.change_requests where id = p_change;
  if c.id is null or not public.can_act_on_project(c.project_id, 'governance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'approved' then
    raise exception 'change_state: only an approved change can be marked implemented' using errcode = 'P0001';
  end if;
  update public.change_requests set status = 'implemented', implemented_at = now() where id = p_change;
end;
$$;

-- ---------------------------------------------------------------------------
-- Releases and quality gates
-- ---------------------------------------------------------------------------
create type public.release_status as enum ('planned', 'in_review', 'approved', 'released', 'cancelled');
create type public.gate_status as enum ('pending', 'passed', 'failed', 'waived');

create table public.releases (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  project_id                  uuid not null,
  name                        text not null check (char_length(btrim(name)) between 2 and 120),
  version                     text check (version is null or char_length(version) between 1 and 40),
  status                      public.release_status not null default 'planned',
  planned_date                date,
  released_on                 date,
  notes                       text check (notes is null or char_length(notes) <= 4000),
  release_manager_membership_id uuid,
  approved_by_membership_id   uuid,
  approved_at                 timestamptz,
  created_by                  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, project_id, organization_id),
  check (status = 'released' or released_on is null),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (release_manager_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (release_manager_membership_id),
  foreign key (approved_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (approved_by_membership_id)
);
create unique index releases_project_name_uq on public.releases (project_id, lower(name));
create index releases_project_idx on public.releases (project_id, planned_date);
create index releases_org_active_idx on public.releases (organization_id, planned_date) where status in ('planned', 'in_review', 'approved');

create or replace function private.releases_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'planned';
    new.released_on := null;
    new.approved_by_membership_id := null;
    new.approved_at := null;
  elsif old.status in ('released', 'cancelled') and (
          new.name is distinct from old.name or new.version is distinct from old.version
          or new.planned_date is distinct from old.planned_date or new.notes is distinct from old.notes
          or new.release_manager_membership_id is distinct from old.release_manager_membership_id) then
    raise exception 'release_locked: a released or cancelled release can no longer be edited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger releases_before_write before insert or update on public.releases
  for each row execute function private.releases_before_write();
create trigger releases_updated_at before update on public.releases
  for each row execute function private.set_updated_at();
create trigger releases_audit after insert or update or delete on public.releases
  for each row execute function private.audit_row_change();

create table public.release_gates (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null,
  project_id                  uuid not null,
  release_id                  uuid not null,
  name                        text not null check (char_length(btrim(name)) between 2 and 120),
  category                    text not null default 'quality' check (category in ('quality', 'security', 'uat', 'operations', 'compliance')),
  is_required                 boolean not null default true,
  status                      public.gate_status not null default 'pending',
  note                        text check (note is null or char_length(note) <= 1000),
  checked_by_membership_id    uuid,
  checked_at                  timestamptz,
  position                    smallint not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (release_id, project_id, organization_id) references public.releases (id, project_id, organization_id) on delete cascade,
  foreign key (checked_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (checked_by_membership_id)
);
create unique index release_gates_release_name_uq on public.release_gates (release_id, lower(name));
create index release_gates_release_idx on public.release_gates (release_id, position);

create trigger release_gates_updated_at before update on public.release_gates
  for each row execute function private.set_updated_at();
create trigger release_gates_audit after insert or update or delete on public.release_gates
  for each row execute function private.audit_row_change();

-- Every release starts with the same five gates; teams add or remove gates until approval.
create or replace function private.releases_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.release_gates (organization_id, project_id, release_id, name, category, position) values
    (new.organization_id, new.project_id, new.id, 'Automated tests passing',    'quality',    10),
    (new.organization_id, new.project_id, new.id, 'No open critical defects',   'quality',    20),
    (new.organization_id, new.project_id, new.id, 'Security review',            'security',   30),
    (new.organization_id, new.project_id, new.id, 'UAT sign-off',               'uat',        40),
    (new.organization_id, new.project_id, new.id, 'Rollback plan agreed',       'operations', 50);
  return null;
end;
$$;
create trigger releases_seed_gates after insert on public.releases
  for each row execute function private.releases_after_insert();

-- Pass, fail or reset a gate; waiving needs release.approve and a reason.
create or replace function public.record_gate_result(p_gate uuid, p_status public.gate_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.release_gates;
  r public.releases;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into g from public.release_gates where id = p_gate;
  if g.id is null or not public.can_act_on_project(g.project_id, 'release.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.releases where id = g.release_id;
  if r.status in ('released', 'cancelled') then
    raise exception 'release_locked: a released or cancelled release can no longer be changed' using errcode = 'P0001';
  end if;
  if p_status = 'waived' and not public.can_act_on_project(g.project_id, 'release.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status in ('waived', 'failed') and v_note is null then
    raise exception 'reason_required: say why this gate is %', case when p_status = 'waived' then 'waived' else 'failed' end using errcode = 'P0001';
  end if;

  update public.release_gates
     set status = p_status,
         note = v_note,
         checked_by_membership_id = case when p_status = 'pending' then null else private.active_membership_id(g.organization_id) end,
         checked_at = case when p_status = 'pending' then null else now() end
   where id = p_gate;

  -- A required gate that stops being satisfied withdraws an existing approval.
  if r.status = 'approved' and g.is_required and p_status not in ('passed', 'waived') then
    update public.releases set status = 'in_review', approved_by_membership_id = null, approved_at = null where id = r.id;
  end if;
end;
$$;

-- Moves a release through planned -> in_review -> approved -> released (or cancelled).
create or replace function public.transition_release(p_release uuid, p_to public.release_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releases;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_open integer;
begin
  select * into r from public.releases where id = p_release;
  if r.id is null
     or not public.can_act_on_project(r.project_id, case when p_to = 'approved' then 'release.approve' else 'release.manage' end) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (
       (r.status = 'planned'   and p_to in ('in_review', 'cancelled'))
    or (r.status = 'in_review' and p_to in ('planned', 'approved', 'cancelled'))
    or (r.status = 'approved'  and p_to in ('in_review', 'released', 'cancelled'))
  ) then
    raise exception 'release_transition: a % release can''t move to %', r.status, p_to using errcode = 'P0001';
  end if;
  if p_to = 'cancelled' and v_note is null then
    raise exception 'reason_required: say why the release is cancelled' using errcode = 'P0001';
  end if;
  if p_to = 'approved' then
    select count(*) into v_open from public.release_gates
     where release_id = r.id and is_required and status not in ('passed', 'waived');
    if v_open > 0 then
      raise exception 'gates_open: % required quality gate(s) still need a pass or a waiver', v_open using errcode = 'P0001';
    end if;
  end if;

  perform set_config('stride_ces.change_reason', coalesce(v_note, ''), true);
  update public.releases
     set status = p_to,
         approved_by_membership_id = case when p_to = 'approved' then private.active_membership_id(r.organization_id)
                                          when p_to in ('released') then approved_by_membership_id else null end,
         approved_at = case when p_to = 'approved' then now() when p_to in ('released') then approved_at else null end,
         released_on = case when p_to = 'released' then private.org_today(r.organization_id) else null end
   where id = r.id;
  perform set_config('stride_ces.change_reason', '', true);
end;
$$;

-- Gate counts and open serious defects for one release (RLS applies: the caller sees what they may see).
create or replace function public.release_readiness(p_release uuid)
returns table (required_total integer, required_ready integer, failed integer, open_critical_defects integer, open_high_defects integer)
language sql
stable
set search_path = ''
as $$
  select
    count(*) filter (where g.is_required)::integer,
    count(*) filter (where g.is_required and g.status in ('passed', 'waived'))::integer,
    count(*) filter (where g.status = 'failed')::integer,
    (select count(*) from public.work_items w
       join public.workflow_states s on s.id = w.state_id
      where w.project_id = r.project_id and w.archived_at is null and s.category <> 'done'
        and w.type in ('bug', 'incident') and w.severity = 's1')::integer,
    (select count(*) from public.work_items w
       join public.workflow_states s on s.id = w.state_id
      where w.project_id = r.project_id and w.archived_at is null and s.category <> 'done'
        and w.type in ('bug', 'incident') and w.severity = 's2')::integer
  from public.releases r
  left join public.release_gates g on g.release_id = r.id
  where r.id = p_release
  group by r.id, r.project_id;
$$;

-- ---------------------------------------------------------------------------
-- Client contacts and contracts (visible exactly when the client is)
-- ---------------------------------------------------------------------------
create type public.contract_type as enum ('msa', 'sow', 'nda', 'support', 'other');
create type public.contract_status as enum ('draft', 'active', 'expired', 'terminated');

create table public.client_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id       uuid not null,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  job_title       text check (job_title is null or char_length(job_title) <= 120),
  email           text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text check (phone is null or char_length(phone) <= 40),
  is_primary      boolean not null default false,
  notes           text check (notes is null or char_length(notes) <= 1000),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade
);
create unique index client_contacts_primary_uq on public.client_contacts (client_id) where is_primary and archived_at is null;
create index client_contacts_client_idx on public.client_contacts (client_id) where archived_at is null;

create trigger client_contacts_updated_at before update on public.client_contacts
  for each row execute function private.set_updated_at();
create trigger client_contacts_audit after insert or update or delete on public.client_contacts
  for each row execute function private.audit_row_change();

create table public.client_contracts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  client_id           uuid not null,
  title               text not null check (char_length(btrim(title)) between 2 and 160),
  reference           text check (reference is null or char_length(reference) <= 60),
  contract_type       public.contract_type not null default 'sow',
  status              public.contract_status not null default 'draft',
  start_date          date,
  end_date            date,
  renewal_notice_days smallint check (renewal_notice_days is null or renewal_notice_days between 0 and 730),
  notes               text check (notes is null or char_length(notes) <= 2000),
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade
);
comment on table public.client_contracts is 'Contract terms and dates only. Monetary values arrive with Phase 5 under a finance-only policy.';
create index client_contracts_client_idx on public.client_contracts (client_id) where archived_at is null;
create index client_contracts_end_idx on public.client_contracts (organization_id, end_date) where archived_at is null and status = 'active';

create trigger client_contracts_updated_at before update on public.client_contracts
  for each row execute function private.set_updated_at();
create trigger client_contracts_audit after insert or update or delete on public.client_contracts
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Documents and versions
-- ---------------------------------------------------------------------------
create type public.document_type as enum ('charter', 'requirements', 'specification', 'design', 'plan', 'report', 'other');
create type public.document_visibility as enum ('internal', 'client');

create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null,
  title               text not null check (char_length(btrim(title)) between 2 and 160),
  doc_type            public.document_type not null default 'other',
  visibility          public.document_visibility not null default 'internal',
  description         text check (description is null or char_length(description) <= 1000),
  current_version     integer not null default 0,
  owner_membership_id uuid,
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  unique (id, organization_id),
  unique (id, project_id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (owner_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (owner_membership_id)
);
create index documents_project_idx on public.documents (project_id) where archived_at is null;

create trigger documents_updated_at before update on public.documents
  for each row execute function private.set_updated_at();
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function private.audit_row_change();

create table public.document_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  document_id     uuid not null,
  version         integer not null check (version >= 1),
  content         text check (content is null or char_length(content) <= 200000),
  url             text check (url is null or url ~ '^https?://'),
  change_note     text check (change_note is null or char_length(change_note) <= 500),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (document_id, version),
  check (content is not null or url is not null),
  foreign key (document_id, project_id, organization_id) references public.documents (id, project_id, organization_id) on delete cascade
);
create index document_versions_document_idx on public.document_versions (document_id, version desc);

create trigger document_versions_audit after insert on public.document_versions
  for each row execute function private.audit_row_change();

-- Versions are append-only: no update or delete grant, and a trigger for anyone with more privilege.
create or replace function private.document_versions_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.documents d where d.id = old.document_id) then
    return old; -- cascade from a deleted document or organization
  end if;
  raise exception 'immutable: document versions can''t be changed or deleted' using errcode = 'P0001';
end;
$$;
create trigger document_versions_immutable before update or delete on public.document_versions
  for each row execute function private.document_versions_immutable();

create or replace function public.create_document(
  p_project uuid, p_title text, p_type public.document_type, p_visibility public.document_visibility,
  p_description text, p_content text, p_url text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.can_act_on_project(p_project, 'document.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.documents (organization_id, project_id, title, doc_type, visibility, description, current_version, owner_membership_id)
  values (v_org, p_project, p_title, p_type, p_visibility, nullif(btrim(coalesce(p_description, '')), ''), 1, private.active_membership_id(v_org))
  returning id into v_id;
  insert into public.document_versions (organization_id, project_id, document_id, version, content, url, change_note)
  values (v_org, p_project, v_id, 1, nullif(btrim(coalesce(p_content, '')), ''), nullif(btrim(coalesce(p_url, '')), ''),
          coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Initial version'));
  return v_id;
end;
$$;

create or replace function public.add_document_version(p_document uuid, p_content text, p_url text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  v_next integer;
begin
  select * into d from public.documents where id = p_document for update;
  if d.id is null or not public.can_act_on_project(d.project_id, 'document.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.archived_at is not null then
    raise exception 'document_archived: restore the document before adding a version' using errcode = 'P0001';
  end if;
  v_next := d.current_version + 1;
  insert into public.document_versions (organization_id, project_id, document_id, version, content, url, change_note)
  values (d.organization_id, d.project_id, d.id, v_next, nullif(btrim(coalesce(p_content, '')), ''), nullif(btrim(coalesce(p_url, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''));
  update public.documents set current_version = v_next where id = d.id;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.raid_items          enable row level security;
alter table public.decisions           enable row level security;
alter table public.project_actions     enable row level security;
alter table public.escalations         enable row level security;
alter table public.escalation_evidence enable row level security;
alter table public.change_requests     enable row level security;
alter table public.releases            enable row level security;
alter table public.release_gates       enable row level security;
alter table public.client_contacts     enable row level security;
alter table public.client_contracts    enable row level security;
alter table public.documents           enable row level security;
alter table public.document_versions   enable row level security;

-- RAID, decisions, actions, escalations, change requests: governance.read / governance.manage
grant select on public.raid_items to authenticated;
grant insert (organization_id, project_id, type, title, description, probability, impact, owner_membership_id, due_date, mitigation, contingency) on public.raid_items to authenticated;
grant update (title, description, status, probability, impact, owner_membership_id, due_date, mitigation, contingency, resolution_note, archived_at) on public.raid_items to authenticated;
create policy raid_items_select on public.raid_items for select to authenticated
  using (public.can_act_on_project(project_id, 'governance.read'));
create policy raid_items_insert on public.raid_items for insert to authenticated
  with check (public.can_act_on_project(project_id, 'governance.manage'));
create policy raid_items_update on public.raid_items for update to authenticated
  using (public.can_act_on_project(project_id, 'governance.manage'))
  with check (public.can_act_on_project(project_id, 'governance.manage'));

grant select on public.decisions to authenticated;
grant insert (organization_id, project_id, title, context, decision, rationale, consequences) on public.decisions to authenticated;
grant update (title, context, decision, rationale, consequences, status, superseded_by_id) on public.decisions to authenticated;
create policy decisions_select on public.decisions for select to authenticated
  using (public.can_act_on_project(project_id, 'governance.read'));
create policy decisions_insert on public.decisions for insert to authenticated
  with check (public.can_act_on_project(project_id, 'governance.manage'));
create policy decisions_update on public.decisions for update to authenticated
  using (public.can_act_on_project(project_id, 'governance.manage'))
  with check (public.can_act_on_project(project_id, 'governance.manage'));

grant select on public.project_actions to authenticated;
grant insert (organization_id, project_id, title, description, owner_membership_id, due_date, raid_item_id, decision_id) on public.project_actions to authenticated;
grant update (title, description, status, owner_membership_id, due_date, raid_item_id, decision_id) on public.project_actions to authenticated;
grant delete on public.project_actions to authenticated;
create policy project_actions_select on public.project_actions for select to authenticated
  using (public.can_act_on_project(project_id, 'governance.read'));
create policy project_actions_insert on public.project_actions for insert to authenticated
  with check (public.can_act_on_project(project_id, 'governance.manage'));
create policy project_actions_update on public.project_actions for update to authenticated
  using (public.can_act_on_project(project_id, 'governance.manage')
         or owner_membership_id = private.active_membership_id(organization_id) and public.can_act_on_project(project_id, 'governance.read'))
  with check (public.can_act_on_project(project_id, 'governance.manage')
              or owner_membership_id = private.active_membership_id(organization_id) and public.can_act_on_project(project_id, 'governance.read'));
create policy project_actions_delete on public.project_actions for delete to authenticated
  using (public.can_act_on_project(project_id, 'governance.manage'));

-- escalations: created and resolved only through RPCs; content editable by managers while unresolved
grant select on public.escalations to authenticated;
grant update (title, description, severity, escalated_to_membership_id, respond_by) on public.escalations to authenticated;
create policy escalations_select on public.escalations for select to authenticated
  using (public.can_act_on_project(project_id, 'governance.read'));
create policy escalations_update on public.escalations for update to authenticated
  using (public.can_act_on_project(project_id, 'governance.manage') and status <> 'resolved')
  with check (public.can_act_on_project(project_id, 'governance.manage') and status <> 'resolved');

grant select on public.escalation_evidence to authenticated;
grant insert (organization_id, project_id, escalation_id, kind, title, url, note) on public.escalation_evidence to authenticated;
create policy escalation_evidence_select on public.escalation_evidence for select to authenticated
  using (public.can_act_on_project(project_id, 'governance.read'));
create policy escalation_evidence_insert on public.escalation_evidence for insert to authenticated
  with check (public.can_act_on_project(project_id, 'governance.manage')
              and exists (select 1 from public.escalations e where e.id = escalation_id and e.status <> 'resolved'));

grant select on public.change_requests to authenticated;
grant insert (organization_id, project_id, title, description, justification, impact_schedule_days, impact_effort_hours, impact_scope, impact_risk) on public.change_requests to authenticated;
grant update (title, description, justification, impact_schedule_days, impact_effort_hours, impact_scope, impact_risk) on public.change_requests to authenticated;
create policy change_requests_select on public.change_requests for select to authenticated
  using (public.can_act_on_project(project_id, 'governance.read'));
create policy change_requests_insert on public.change_requests for insert to authenticated
  with check (public.can_act_on_project(project_id, 'governance.manage'));
create policy change_requests_update on public.change_requests for update to authenticated
  using (public.can_act_on_project(project_id, 'governance.manage'))
  with check (public.can_act_on_project(project_id, 'governance.manage'));

-- releases and gates: release.read / release.manage; status changes only through RPCs
grant select on public.releases to authenticated;
grant insert (organization_id, project_id, name, version, planned_date, notes, release_manager_membership_id) on public.releases to authenticated;
grant update (name, version, planned_date, notes, release_manager_membership_id) on public.releases to authenticated;
create policy releases_select on public.releases for select to authenticated
  using (public.can_act_on_project(project_id, 'release.read'));
create policy releases_insert on public.releases for insert to authenticated
  with check (public.can_act_on_project(project_id, 'release.manage'));
create policy releases_update on public.releases for update to authenticated
  using (public.can_act_on_project(project_id, 'release.manage'))
  with check (public.can_act_on_project(project_id, 'release.manage'));

grant select, delete on public.release_gates to authenticated;
grant insert (organization_id, project_id, release_id, name, category, is_required, position) on public.release_gates to authenticated;
grant update (name, category, is_required, position) on public.release_gates to authenticated;
create policy release_gates_select on public.release_gates for select to authenticated
  using (public.can_act_on_project(project_id, 'release.read'));
create policy release_gates_insert on public.release_gates for insert to authenticated
  with check (public.can_act_on_project(project_id, 'release.manage')
              and exists (select 1 from public.releases r where r.id = release_id and r.status in ('planned', 'in_review')));
create policy release_gates_update on public.release_gates for update to authenticated
  using (public.can_act_on_project(project_id, 'release.manage')
         and exists (select 1 from public.releases r where r.id = release_id and r.status in ('planned', 'in_review')))
  with check (public.can_act_on_project(project_id, 'release.manage'));
create policy release_gates_delete on public.release_gates for delete to authenticated
  using (public.can_act_on_project(project_id, 'release.manage')
         and exists (select 1 from public.releases r where r.id = release_id and r.status in ('planned', 'in_review')));

-- contacts and contracts follow client visibility
grant select on public.client_contacts to authenticated;
grant insert (organization_id, client_id, name, job_title, email, phone, is_primary, notes) on public.client_contacts to authenticated;
grant update (name, job_title, email, phone, is_primary, notes, archived_at) on public.client_contacts to authenticated;
create policy client_contacts_select on public.client_contacts for select to authenticated
  using (private.can_see_client(client_id));
create policy client_contacts_insert on public.client_contacts for insert to authenticated
  with check (private.can_manage_client(client_id));
create policy client_contacts_update on public.client_contacts for update to authenticated
  using (private.can_manage_client(client_id))
  with check (private.can_manage_client(client_id));

grant select on public.client_contracts to authenticated;
grant insert (organization_id, client_id, title, reference, contract_type, status, start_date, end_date, renewal_notice_days, notes) on public.client_contracts to authenticated;
grant update (title, reference, contract_type, status, start_date, end_date, renewal_notice_days, notes, archived_at) on public.client_contracts to authenticated;
create policy client_contracts_select on public.client_contracts for select to authenticated
  using (private.can_see_client(client_id));
create policy client_contracts_insert on public.client_contracts for insert to authenticated
  with check (private.can_manage_client(client_id));
create policy client_contracts_update on public.client_contracts for update to authenticated
  using (private.can_manage_client(client_id))
  with check (private.can_manage_client(client_id));

-- documents: internal need document.read; client-visible are open to anyone who can read the project
grant select on public.documents to authenticated;
grant update (title, doc_type, visibility, description, owner_membership_id, archived_at) on public.documents to authenticated;
create policy documents_select on public.documents for select to authenticated
  using (public.can_read_project(project_id)
         and (visibility = 'client' or public.has_permission(organization_id, 'document.read')));
create policy documents_update on public.documents for update to authenticated
  using (public.can_act_on_project(project_id, 'document.manage'))
  with check (public.can_act_on_project(project_id, 'document.manage'));

grant select on public.document_versions to authenticated;
create policy document_versions_select on public.document_versions for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));

revoke execute on function
  public.raise_escalation(uuid, text, text, public.escalation_severity, uuid, timestamptz, uuid, jsonb),
  public.acknowledge_escalation(uuid),
  public.resolve_escalation(uuid, text),
  public.submit_change_request(uuid),
  public.withdraw_change_request(uuid),
  public.decide_change_request(uuid, boolean, text),
  public.implement_change_request(uuid),
  public.record_gate_result(uuid, public.gate_status, text),
  public.transition_release(uuid, public.release_status, text),
  public.release_readiness(uuid),
  public.create_document(uuid, text, public.document_type, public.document_visibility, text, text, text, text),
  public.add_document_version(uuid, text, text, text)
from public, anon;
grant execute on function
  public.raise_escalation(uuid, text, text, public.escalation_severity, uuid, timestamptz, uuid, jsonb),
  public.acknowledge_escalation(uuid),
  public.resolve_escalation(uuid, text),
  public.submit_change_request(uuid),
  public.withdraw_change_request(uuid),
  public.decide_change_request(uuid, boolean, text),
  public.implement_change_request(uuid),
  public.record_gate_result(uuid, public.gate_status, text),
  public.transition_release(uuid, public.release_status, text),
  public.release_readiness(uuid),
  public.create_document(uuid, text, public.document_type, public.document_visibility, text, text, text, text),
  public.add_document_version(uuid, text, text, text)
to authenticated;
