-- Stride Phase 7 — Automation & integrations: transactional outbox, notification center with
-- deduplication and preferences, signed webhooks with retries, workflow rules, a scheduler and
-- integration connections (mock adapters first). See docs/DECISIONS/ADR-0012-automation.md.
--
-- Access: people read and configure everything through RLS and the permissions below. Background
-- work (dispatching events, delivering webhooks and email, running due jobs) has no user session,
-- so it runs through a small set of RPCs granted to service_role only. Nothing else uses a
-- privileged path, and service_role never reads tenant tables directly.

-- ---------------------------------------------------------------------------
-- Permissions and role templates (existing organizations are backfilled)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('automation.read',   'automation', 'See workflow rules, webhook endpoints and deliveries, scheduled jobs, the event stream and integrations (never secrets)'),
  ('automation.manage', 'automation', 'Create and change workflow rules, webhooks, scheduled jobs and integration connections');

update private.role_templates set permissions = permissions || array['automation.read','automation.manage'] where key = 'org_admin';
update private.role_templates set permissions = permissions || array['automation.read'] where key = 'delivery_head';
update private.role_templates set permissions = permissions || array['automation.read'] where key = 'program_manager';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.role_definitions r
join private.role_templates t on t.key = r.key
cross join lateral unnest(t.permissions) as p(perm)
where r.is_system and p.perm like 'automation.%'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Membership-level authorization helpers. The existing helpers answer about the calling user;
-- fan-out needs the same answer about a named recipient.
-- ---------------------------------------------------------------------------
create or replace function private.membership_has_permission(p_membership uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id and o.archived_at is null
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id
    where m.id = p_membership and m.status = 'active' and rp.permission_key = p_permission
  );
$$;

create or replace function private.membership_can_read_project(p_membership uuid, p_project uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.projects;
  m public.organization_memberships;
begin
  select * into p from public.projects where id = p_project;
  if not found then return false; end if;
  select * into m from public.organization_memberships where id = p_membership and organization_id = p.organization_id and status = 'active';
  if not found then return false; end if;
  if private.membership_has_permission(m.id, 'project.read_all') then return true; end if;
  if not private.membership_has_permission(m.id, 'project.read_assigned') then return false; end if;
  return coalesce(m.id in (p.project_manager_id, p.delivery_owner_id), false)
      or p.created_by = m.user_id
      or exists (select 1 from public.project_memberships pm where pm.project_id = p.id and pm.membership_id = m.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Outbox: one row per domain event, written by triggers in the same transaction as the change.
-- ---------------------------------------------------------------------------
create table public.outbox_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  event_type          text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type         text not null,
  entity_id           uuid not null,
  project_id          uuid,
  actor_membership_id uuid,
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default clock_timestamp(),
  processed_at        timestamptz,
  attempts            integer not null default 0,
  locked_until        timestamptz,
  error               text check (error is null or char_length(error) <= 500),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index outbox_events_pending_idx on public.outbox_events (created_at) where processed_at is null;
create index outbox_events_org_idx on public.outbox_events (organization_id, created_at desc);
comment on table public.outbox_events is 'Transactional outbox. Rows are inserted by private.emit_event only; the dispatcher claims, fans out and marks them processed.';

create or replace function private.emit_event(p_org uuid, p_type text, p_entity_type text, p_entity uuid, p_project uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.outbox_events (organization_id, event_type, entity_type, entity_id, project_id, actor_membership_id, payload)
  values (p_org, p_type, p_entity_type, p_entity, p_project, private.active_membership_id(p_org), coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Triggers: only changes people care about. Payloads carry ids and short labels, never free text
-- the author wrote for a different audience (descriptions, comments, reasons for leave).
create or replace function private.events_projects()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.health is distinct from old.health then
    perform private.emit_event(new.organization_id, 'project.health_changed', 'projects', new.id, new.id,
      jsonb_build_object('code', new.code, 'name', new.name, 'from', old.health, 'to', new.health));
  end if;
  if new.status is distinct from old.status then
    perform private.emit_event(new.organization_id, 'project.status_changed', 'projects', new.id, new.id,
      jsonb_build_object('code', new.code, 'name', new.name, 'from', old.status, 'to', new.status));
  end if;
  return null;
end $$;
create trigger projects_events after update of health, status on public.projects
  for each row execute function private.events_projects();

create or replace function private.events_work_items()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.blocked and not old.blocked then
    perform private.emit_event(new.organization_id, 'work_item.blocked', 'work_items', new.id, new.project_id,
      jsonb_build_object('key', new.key, 'title', new.title, 'assignee_membership_id', new.assignee_membership_id));
  end if;
  if new.assignee_membership_id is not null and (tg_op = 'INSERT' or new.assignee_membership_id is distinct from old.assignee_membership_id) then
    perform private.emit_event(new.organization_id, 'work_item.assigned', 'work_items', new.id, new.project_id,
      jsonb_build_object('key', new.key, 'title', new.title, 'assignee_membership_id', new.assignee_membership_id));
  end if;
  return null;
end $$;
create trigger work_items_events after insert or update of blocked, assignee_membership_id on public.work_items
  for each row execute function private.events_work_items();

create or replace function private.events_raid_items()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit_event(new.organization_id, 'raid.created', 'raid_items', new.id, new.project_id,
    jsonb_build_object('type', new.type, 'title', new.title, 'score', new.score, 'owner_membership_id', new.owner_membership_id));
  return null;
end $$;
create trigger raid_items_events after insert on public.raid_items
  for each row execute function private.events_raid_items();

create or replace function private.events_escalations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit_event(new.organization_id, 'escalation.raised', 'escalations', new.id, new.project_id,
    jsonb_build_object('title', new.title, 'severity', new.severity, 'escalated_to_membership_id', new.escalated_to_membership_id, 'respond_by', new.respond_by));
  return null;
end $$;
create trigger escalations_events after insert on public.escalations
  for each row execute function private.events_escalations();

create or replace function private.events_leave_requests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.emit_event(new.organization_id, 'leave.requested', 'leave_requests', new.id, null,
      jsonb_build_object('membership_id', new.membership_id, 'start_date', new.start_date, 'end_date', new.end_date, 'days', new.days));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform private.emit_event(new.organization_id, 'leave.decided', 'leave_requests', new.id, null,
      jsonb_build_object('membership_id', new.membership_id, 'status', new.status, 'start_date', new.start_date, 'end_date', new.end_date));
  end if;
  return null;
end $$;
create trigger leave_requests_events after insert or update of status on public.leave_requests
  for each row execute function private.events_leave_requests();

create or replace function private.events_timesheets()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    perform private.emit_event(new.organization_id, 'timesheet.submitted', 'timesheets', new.id, null,
      jsonb_build_object('membership_id', new.membership_id, 'week_start', new.week_start));
  elsif old.status = 'submitted' and new.status in ('approved', 'rejected') then
    perform private.emit_event(new.organization_id, 'timesheet.decided', 'timesheets', new.id, null,
      jsonb_build_object('membership_id', new.membership_id, 'week_start', new.week_start, 'status', new.status));
  end if;
  return null;
end $$;
create trigger timesheets_events after update of status on public.timesheets
  for each row execute function private.events_timesheets();

create or replace function private.events_releases()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit_event(new.organization_id, 'release.status_changed', 'releases', new.id, new.project_id,
    jsonb_build_object('name', new.name, 'from', old.status, 'to', new.status, 'release_manager_membership_id', new.release_manager_membership_id));
  return null;
end $$;
create trigger releases_events after update of status on public.releases
  for each row when (new.status is distinct from old.status) execute function private.events_releases();

create or replace function private.events_sprints()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit_event(new.organization_id, 'sprint.state_changed', 'sprints', new.id, new.project_id,
    jsonb_build_object('name', new.name, 'from', old.state, 'to', new.state));
  return null;
end $$;
create trigger sprints_events after update of state on public.sprints
  for each row when (new.state is distinct from old.state) execute function private.events_sprints();

create or replace function private.events_agent_approvals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    perform private.emit_event(new.organization_id, 'agent_approval.requested', 'agent_approvals', new.id, new.project_id,
      jsonb_build_object('summary', new.summary, 'requested_by_membership_id', new.requested_by_membership_id));
  end if;
  return null;
end $$;
create trigger agent_approvals_events after insert on public.agent_approvals
  for each row execute function private.events_agent_approvals();

-- ---------------------------------------------------------------------------
-- Notifications: per-recipient inbox. Unread repeats of the same thing collapse into one row.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  category        text not null check (category in ('delivery', 'governance', 'workforce', 'ai', 'system')),
  type            text not null,
  severity        text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title           text not null check (char_length(title) between 1 and 200),
  body            text check (body is null or char_length(body) <= 1000),
  link            text check (link is null or link ~ '^/[A-Za-z0-9/_\-\.?=&%]*$'),
  event_id        uuid,
  dedupe_key      text not null,
  occurrences     integer not null default 1,
  email_status    text check (email_status in ('pending', 'sent', 'simulated', 'failed')),
  email_attempts  integer not null default 0,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp(),
  read_at         timestamptz,
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
create unique index notifications_unread_dedupe_idx on public.notifications (membership_id, dedupe_key) where read_at is null;
create index notifications_inbox_idx on public.notifications (membership_id, created_at desc);
create index notifications_email_idx on public.notifications (created_at) where email_status = 'pending';
comment on column public.notifications.dedupe_key is 'Repeats of the same thing while unread update this row (occurrences, updated_at) instead of adding another.';

create table public.notification_preferences (
  organization_id uuid not null,
  membership_id   uuid not null,
  category        text not null check (category in ('delivery', 'governance', 'workforce', 'ai', 'system')),
  in_app          boolean not null default true,
  email           boolean not null default false,
  primary key (membership_id, category),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
comment on table public.notification_preferences is 'Absent row = in-app on, email off. Critical notifications are always delivered in-app.';

-- Writes one notification after the checks every recipient must pass.
create or replace function private.notify_member(
  p_org uuid, p_member uuid, p_event uuid, p_category text, p_type text,
  p_title text, p_body text, p_link text, p_severity text, p_dedupe text, p_project uuid, p_skip_actor boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref public.notification_preferences;
  v_actor uuid;
  v_in_app boolean;
  v_email boolean;
begin
  if p_member is null then return false; end if;
  if not exists (select 1 from public.organization_memberships m where m.id = p_member and m.organization_id = p_org and m.status = 'active') then
    return false;
  end if;
  if p_project is not null and not private.membership_can_read_project(p_member, p_project) then
    return false;
  end if;
  if p_skip_actor and p_event is not null then
    select actor_membership_id into v_actor from public.outbox_events where id = p_event;
    if v_actor = p_member then return false; end if;
  end if;

  select * into pref from public.notification_preferences where membership_id = p_member and category = p_category;
  v_in_app := coalesce(pref.in_app, true) or p_severity = 'critical';
  v_email := coalesce(pref.email, false);
  if not v_in_app and not v_email then return false; end if;
  if not v_in_app then
    -- Email only: still recorded so the send can be tracked, but marked read so it never shows as unread.
    insert into public.notifications (organization_id, membership_id, category, type, severity, title, body, link, event_id, dedupe_key, email_status, read_at)
    values (p_org, p_member, p_category, p_type, p_severity, left(p_title, 200), left(p_body, 1000), p_link, p_event, p_dedupe, 'pending', clock_timestamp());
    return true;
  end if;

  insert into public.notifications (organization_id, membership_id, category, type, severity, title, body, link, event_id, dedupe_key, email_status)
  values (p_org, p_member, p_category, p_type, p_severity, left(p_title, 200), left(p_body, 1000), p_link, p_event, p_dedupe, case when v_email then 'pending' end)
  on conflict (membership_id, dedupe_key) where read_at is null
  do update set occurrences = public.notifications.occurrences + 1, updated_at = clock_timestamp(),
                title = excluded.title, body = excluded.body, severity = excluded.severity, event_id = excluded.event_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhooks
-- ---------------------------------------------------------------------------
create table public.webhook_endpoints (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  name                 text not null check (char_length(btrim(name)) between 2 and 80),
  url                  text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  format               text not null default 'generic' check (format in ('generic', 'teams', 'slack')),
  event_types          text[] not null default '{*}' check (cardinality(event_types) between 1 and 40),
  enabled              boolean not null default true,
  consecutive_failures integer not null default 0,
  disabled_reason      text check (disabled_reason is null or char_length(disabled_reason) <= 300),
  last_success_at      timestamptz,
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, organization_id)
);
create trigger webhook_endpoints_updated_at before update on public.webhook_endpoints
  for each row execute function private.set_updated_at();
-- Re-enabling an endpoint (after the system disabled it) starts its failure count over.
create or replace function private.webhook_endpoints_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.enabled and not old.enabled then
    new.consecutive_failures := 0;
    new.disabled_reason := null;
  end if;
  return new;
end $$;
create trigger webhook_endpoints_before_update before update on public.webhook_endpoints
  for each row execute function private.webhook_endpoints_before_update();
create trigger webhook_endpoints_audit after insert or update or delete on public.webhook_endpoints
  for each row execute function private.audit_row_change();

-- Signing secrets live apart so no grant, audit row or export can ever include them.
create table public.webhook_secrets (
  endpoint_id uuid primary key references public.webhook_endpoints (id) on delete cascade,
  secret      text not null
);

create type public.delivery_status as enum ('pending', 'succeeded', 'dead');

create table public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  endpoint_id     uuid not null,
  event_id        uuid not null,
  event_type      text not null,
  payload         jsonb not null,
  status          public.delivery_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_status integer,
  error           text check (error is null or char_length(error) <= 300),
  created_at      timestamptz not null default clock_timestamp(),
  delivered_at    timestamptz,
  unique (endpoint_id, event_id),
  foreign key (endpoint_id, organization_id) references public.webhook_endpoints (id, organization_id) on delete cascade,
  foreign key (event_id, organization_id) references public.outbox_events (id, organization_id) on delete cascade
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id, created_at desc);

create or replace function private.new_webhook_secret()
returns text language sql volatile set search_path = '' as $$
  select 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
$$;

create or replace function public.create_webhook_endpoint(p_org uuid, p_name text, p_url text, p_format text, p_event_types text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_secret text := private.new_webhook_secret();
begin
  if not public.has_permission(p_org, 'automation.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.webhook_endpoints (organization_id, name, url, format, event_types)
  values (p_org, p_name, p_url, p_format, coalesce(p_event_types, '{*}'))
  returning id into v_id;
  insert into public.webhook_secrets (endpoint_id, secret) values (v_id, v_secret);
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end;
$$;

create or replace function public.rotate_webhook_secret(p_endpoint uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.webhook_endpoints;
  v_secret text := private.new_webhook_secret();
begin
  select * into e from public.webhook_endpoints where id = p_endpoint;
  if not found or not public.has_permission(e.organization_id, 'automation.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.webhook_secrets set secret = v_secret where endpoint_id = p_endpoint;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (e.organization_id, auth.uid(), 'webhook_endpoints.rotate_secret', 'webhook_endpoints', e.id, '{}'::jsonb);
  return v_secret;
end;
$$;

-- Turns a dead or failed delivery into a fresh attempt, and re-enables an endpoint the system disabled.
create or replace function public.redeliver_webhook(p_delivery uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.webhook_deliveries;
begin
  select * into d from public.webhook_deliveries where id = p_delivery;
  if not found or not public.has_permission(d.organization_id, 'automation.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.webhook_deliveries set status = 'pending', attempts = 0, next_attempt_at = now(), error = null where id = d.id;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (d.organization_id, auth.uid(), 'webhook_deliveries.redeliver', 'webhook_deliveries', d.id, jsonb_build_object('endpoint_id', d.endpoint_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow rules: when <event> and <conditions> then <actions>. Immutable version history.
-- Actions never emit events, so rules cannot trigger each other.
-- ---------------------------------------------------------------------------
create table public.workflow_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  description     text check (description is null or char_length(description) <= 1000),
  enabled         boolean not null default false,
  trigger_event   text not null check (trigger_event ~ '^[a-z_]+\.[a-z_]+$'),
  conditions      jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) <= 10),
  actions         jsonb not null check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 5),
  version         integer not null default 1,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  unique (id, organization_id)
);
create index workflow_rules_trigger_idx on public.workflow_rules (organization_id, trigger_event) where enabled and archived_at is null;
create trigger workflow_rules_updated_at before update on public.workflow_rules
  for each row execute function private.set_updated_at();
create trigger workflow_rules_audit after insert or update on public.workflow_rules
  for each row execute function private.audit_row_change();

create table public.workflow_rule_versions (
  rule_id         uuid not null references public.workflow_rules (id) on delete cascade,
  organization_id uuid not null,
  version         integer not null,
  snapshot        jsonb not null,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (rule_id, version)
);

create or replace function private.workflow_rules_versioning()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.trigger_event is distinct from old.trigger_event or new.conditions is distinct from old.conditions or new.actions is distinct from old.actions then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;
  return new;
end $$;
create trigger workflow_rules_versioning before insert or update on public.workflow_rules
  for each row execute function private.workflow_rules_versioning();

create or replace function private.workflow_rules_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workflow_rule_versions (rule_id, organization_id, version, snapshot)
  values (new.id, new.organization_id, new.version,
          jsonb_build_object('name', new.name, 'trigger_event', new.trigger_event, 'conditions', new.conditions, 'actions', new.actions))
  on conflict do nothing;
  return null;
end $$;
create trigger workflow_rules_snapshot after insert or update on public.workflow_rules
  for each row execute function private.workflow_rules_snapshot();

create table public.workflow_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rule_id         uuid not null references public.workflow_rules (id) on delete cascade,
  rule_version    integer not null,
  event_id        uuid not null,
  status          text not null check (status in ('succeeded', 'failed')),
  detail          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default clock_timestamp(),
  unique (rule_id, event_id),
  foreign key (event_id, organization_id) references public.outbox_events (id, organization_id) on delete cascade
);
create index workflow_runs_rule_idx on public.workflow_runs (rule_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Scheduler: per-organization jobs, a run log, and a platform heartbeat.
-- ---------------------------------------------------------------------------
create table public.scheduled_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  key              text not null check (key in ('timesheet_reminder', 'escalation_overdue', 'sprint_snapshot', 'retention', 'integration_sync')),
  enabled          boolean not null default true,
  interval_minutes integer not null check (interval_minutes between 5 and 10080),
  config           jsonb not null default '{}'::jsonb,
  next_run_at      timestamptz not null default now(),
  last_run_at      timestamptz,
  last_status      text check (last_status in ('succeeded', 'failed')),
  last_error       text check (last_error is null or char_length(last_error) <= 500),
  updated_at       timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);
create trigger scheduled_jobs_updated_at before update on public.scheduled_jobs
  for each row execute function private.set_updated_at();
create trigger scheduled_jobs_audit after update on public.scheduled_jobs
  for each row execute function private.audit_row_change();

create table public.job_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id          uuid not null,
  job_key         text not null,
  status          text not null check (status in ('succeeded', 'failed')),
  summary         jsonb not null default '{}'::jsonb,
  error           text check (error is null or char_length(error) <= 500),
  created_at      timestamptz not null default clock_timestamp(),
  foreign key (job_id, organization_id) references public.scheduled_jobs (id, organization_id) on delete cascade
);
create index job_runs_job_idx on public.job_runs (job_id, created_at desc);

create table public.scheduler_heartbeat (
  id           boolean primary key default true check (id),
  last_tick_at timestamptz not null default now(),
  summary      jsonb not null default '{}'::jsonb
);

-- Applies to every organization: the five jobs, and a trigger for organizations created later.
create or replace function private.seed_automation_defaults(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scheduled_jobs (organization_id, key, interval_minutes, config) values
    (p_org, 'escalation_overdue', 60, '{}'),
    (p_org, 'timesheet_reminder', 1440, '{"from_weekday": 2}'),
    (p_org, 'sprint_snapshot', 1440, '{}'),
    (p_org, 'integration_sync', 60, '{}'),
    (p_org, 'retention', 1440, '{"outbox_days": 30, "notification_days": 90, "log_days": 90}')
  on conflict do nothing;
end;
$$;

create or replace function private.organizations_seed_automation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_automation_defaults(new.id);
  return null;
end $$;
create trigger organizations_seed_automation after insert on public.organizations
  for each row execute function private.organizations_seed_automation();

-- ---------------------------------------------------------------------------
-- Integrations: connections, links between work items and external issues, sync runs.
-- Only mock adapters exist; "live" is rejected until a real adapter and a credential store do.
-- ---------------------------------------------------------------------------
create table public.integration_connections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider        text not null check (provider in ('github', 'azure_devops', 'jira')),
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  mode            text not null default 'mock' check (mode in ('mock')),
  config          jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  enabled         boolean not null default true,
  health          text not null default 'never_synced' check (health in ('never_synced', 'healthy', 'error')),
  last_sync_at    timestamptz,
  last_error      text check (last_error is null or char_length(last_error) <= 500),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);
create trigger integration_connections_updated_at before update on public.integration_connections
  for each row execute function private.set_updated_at();
create trigger integration_connections_audit after insert or update or delete on public.integration_connections
  for each row execute function private.audit_row_change();

create table public.integration_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id   uuid not null,
  work_item_id    uuid not null,
  external_id     text not null check (char_length(external_id) between 1 and 120),
  external_url    text check (external_url is null or external_url ~ '^https://'),
  external_status text,
  last_synced_at  timestamptz,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (connection_id, external_id),
  unique (connection_id, work_item_id),
  foreign key (connection_id, organization_id) references public.integration_connections (id, organization_id) on delete cascade,
  foreign key (work_item_id, organization_id) references public.work_items (id, organization_id) on delete cascade
);
create index integration_links_item_idx on public.integration_links (work_item_id);
create trigger integration_links_audit after insert or update or delete on public.integration_links
  for each row execute function private.audit_row_change();

create table public.integration_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id   uuid not null,
  status          text not null check (status in ('succeeded', 'failed')),
  summary         jsonb not null default '{}'::jsonb,
  error           text check (error is null or char_length(error) <= 500),
  created_at      timestamptz not null default clock_timestamp(),
  foreign key (connection_id, organization_id) references public.integration_connections (id, organization_id) on delete cascade
);
create index integration_sync_runs_idx on public.integration_sync_runs (connection_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Fan-out: default notification routing and webhook subscriptions for one event.
-- Idempotent: an event is marked processed in the same transaction, and a retry after a crash
-- finds nothing left to do or hits the unique/dedupe constraints.
-- ---------------------------------------------------------------------------
create or replace function private.event_link(e public.outbox_events)
returns text language sql immutable set search_path = '' as $$
  select case e.event_type
    when 'work_item.blocked'  then '/projects/' || e.project_id || '/items/' || (e.payload ->> 'key')
    when 'work_item.assigned' then '/projects/' || e.project_id || '/items/' || (e.payload ->> 'key')
    when 'raid.created'       then '/governance/raid'
    when 'escalation.raised'  then '/governance/escalations'
    when 'escalation.overdue' then '/governance/escalations'
    when 'leave.requested'    then '/leave'
    when 'leave.decided'      then '/leave'
    when 'timesheet.submitted' then '/timesheets/' || e.entity_id
    when 'timesheet.decided'  then '/timesheets/' || e.entity_id
    when 'timesheet.missing'  then '/timesheets'
    when 'release.status_changed' then '/releases/' || e.entity_id
    when 'sprint.state_changed' then '/projects/' || e.project_id || '/sprints'
    when 'agent_approval.requested' then '/agents/approvals'
    when 'integration.link_status_changed' then '/projects/' || e.project_id || '/items/' || (e.payload ->> 'key')
    else case when e.project_id is not null then '/projects/' || e.project_id end
  end;
$$;

create or replace function private.fan_out(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.outbox_events;
  p public.projects;
  v_pm uuid;
  v_owner uuid;
  v_to uuid;
  v_link text;
  v_n integer := 0;
  v_d integer := 0;
  v_dedupe text;
  r record;
  v_title text;
  v_body text;
  v_cat text;
  v_sev text := 'info';
  v_recipients uuid[] := '{}';
  v_member uuid;
begin
  select * into e from public.outbox_events where id = p_event for update;
  if not found or e.processed_at is not null then
    return jsonb_build_object('notifications', 0, 'deliveries', 0, 'skipped', true);
  end if;
  v_link := private.event_link(e);
  v_dedupe := e.event_type || ':' || e.entity_id;
  if e.project_id is not null then
    select * into p from public.projects where id = e.project_id;
    v_pm := p.project_manager_id;
    v_owner := p.delivery_owner_id;
  end if;

  case e.event_type
    when 'project.health_changed' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'code') || ' health is now ' || (e.payload ->> 'to');
      v_body := 'Was ' || (e.payload ->> 'from') || '.';
      v_sev := case e.payload ->> 'to' when 'red' then 'critical' when 'amber' then 'warning' else 'info' end;
      v_recipients := array[v_pm, v_owner];
    when 'project.status_changed' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'code') || ' moved to ' || replace(e.payload ->> 'to', '_', ' ');
      v_body := 'Was ' || replace(e.payload ->> 'from', '_', ' ') || '.';
      v_recipients := array[v_pm, v_owner];
    when 'work_item.blocked' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'key') || ' is blocked';
      v_body := e.payload ->> 'title';
      v_sev := 'warning';
      v_recipients := array[v_pm, (e.payload ->> 'assignee_membership_id')::uuid];
    when 'work_item.assigned' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'key') || ' was assigned to you';
      v_body := e.payload ->> 'title';
      v_dedupe := e.event_type || ':' || e.entity_id || ':' || (e.payload ->> 'assignee_membership_id');
      v_recipients := array[(e.payload ->> 'assignee_membership_id')::uuid];
    when 'raid.created' then
      v_cat := 'governance';
      if (e.payload ->> 'type') = 'risk' and coalesce((e.payload ->> 'score')::int, 0) < 15 then
        v_recipients := '{}';  -- only high risks interrupt anyone
      else
        v_title := 'New ' || (e.payload ->> 'type') || ' on ' || p.code;
        v_body := e.payload ->> 'title';
        v_sev := case when coalesce((e.payload ->> 'score')::int, 0) >= 15 then 'warning' else 'info' end;
        v_recipients := array[v_pm, (e.payload ->> 'owner_membership_id')::uuid];
      end if;
    when 'escalation.raised' then
      v_cat := 'governance';
      v_title := 'Escalation to you: ' || (e.payload ->> 'title');
      v_body := 'Severity ' || (e.payload ->> 'severity') || ', respond by ' || to_char((e.payload ->> 'respond_by')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC.';
      v_sev := case when (e.payload ->> 'severity') in ('high', 'critical') then 'critical' else 'warning' end;
      v_recipients := array[(e.payload ->> 'escalated_to_membership_id')::uuid];
    when 'escalation.overdue' then
      v_cat := 'governance';
      v_title := 'Escalation overdue: ' || (e.payload ->> 'title');
      v_body := 'The response deadline has passed.';
      v_sev := 'critical';
      v_recipients := array[(e.payload ->> 'escalated_to_membership_id')::uuid, v_pm];
    when 'leave.requested' then
      v_cat := 'workforce';
      v_title := 'Leave request awaiting review';
      v_body := (e.payload ->> 'start_date') || ' to ' || (e.payload ->> 'end_date') || ' (' || (e.payload ->> 'days') || ' days).';
      select manager_membership_id into v_to from public.organization_memberships where id = (e.payload ->> 'membership_id')::uuid;
      if v_to is not null then
        v_recipients := array[v_to];
      else
        select coalesce(array_agg(m.id), '{}') into v_recipients from public.organization_memberships m
        where m.organization_id = e.organization_id and m.status = 'active' and private.membership_has_permission(m.id, 'hr.manage');
      end if;
    when 'leave.decided' then
      v_cat := 'workforce';
      v_title := 'Your leave request was ' || (e.payload ->> 'status');
      v_body := (e.payload ->> 'start_date') || ' to ' || (e.payload ->> 'end_date') || '.';
      v_sev := case when (e.payload ->> 'status') = 'rejected' then 'warning' else 'info' end;
      v_recipients := array[(e.payload ->> 'membership_id')::uuid];
    when 'timesheet.submitted' then
      v_cat := 'workforce';
      v_title := 'Timesheet awaiting approval';
      v_body := 'Week of ' || (e.payload ->> 'week_start') || '.';
      select manager_membership_id into v_to from public.organization_memberships where id = (e.payload ->> 'membership_id')::uuid;
      if v_to is not null then
        v_recipients := array[v_to];
      else
        select coalesce(array_agg(m.id), '{}') into v_recipients from public.organization_memberships m
        where m.organization_id = e.organization_id and m.status = 'active' and private.membership_has_permission(m.id, 'timesheet.approve');
      end if;
    when 'timesheet.decided' then
      v_cat := 'workforce';
      v_title := 'Your timesheet was ' || (e.payload ->> 'status');
      v_body := 'Week of ' || (e.payload ->> 'week_start') || '.';
      v_sev := case when (e.payload ->> 'status') = 'rejected' then 'warning' else 'info' end;
      v_recipients := array[(e.payload ->> 'membership_id')::uuid];
    when 'timesheet.missing' then
      v_cat := 'workforce';
      v_title := 'Timesheet not submitted';
      v_body := 'Week of ' || (e.payload ->> 'week_start') || ' is still open.';
      v_sev := 'warning';
      v_dedupe := 'timesheet.missing:' || (e.payload ->> 'membership_id');
      v_recipients := array[(e.payload ->> 'membership_id')::uuid];
    when 'release.status_changed' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'name') || ' is now ' || replace(e.payload ->> 'to', '_', ' ');
      v_body := 'Was ' || replace(e.payload ->> 'from', '_', ' ') || '.';
      v_recipients := array[v_pm, (e.payload ->> 'release_manager_membership_id')::uuid];
    when 'sprint.state_changed' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'name') || ' ' || (e.payload ->> 'to');
      v_recipients := array[v_pm];
    when 'agent_approval.requested' then
      v_cat := 'ai';
      v_title := 'AI proposal awaiting approval';
      v_body := e.payload ->> 'summary';
      select coalesce(array_agg(m.id), '{}') into v_recipients from public.organization_memberships m
      where m.organization_id = e.organization_id and m.status = 'active' and m.id <> (e.payload ->> 'requested_by_membership_id')::uuid
        and private.membership_has_permission(m.id, 'agent.approve');
    when 'integration.link_status_changed' then
      v_cat := 'delivery';
      v_title := (e.payload ->> 'key') || ' external issue is now ' || (e.payload ->> 'to');
      v_body := (e.payload ->> 'external_id');
      v_recipients := array[v_pm, (e.payload ->> 'assignee_membership_id')::uuid];
    else
      v_recipients := '{}';
  end case;

  foreach v_member in array v_recipients loop
    if v_member is not null and private.notify_member(e.organization_id, v_member, e.id, v_cat, e.event_type, v_title, v_body, v_link, v_sev, v_dedupe, e.project_id,
                                                      e.event_type not in ('escalation.overdue', 'timesheet.missing')) then
      v_n := v_n + 1;
    end if;
  end loop;

  -- Webhook subscriptions. The payload is what an external system receives: ids and short labels only.
  for r in
    select w.id from public.webhook_endpoints w
    where w.organization_id = e.organization_id and w.enabled and (e.event_type = any (w.event_types) or '*' = any (w.event_types))
  loop
    insert into public.webhook_deliveries (organization_id, endpoint_id, event_id, event_type, payload)
    values (e.organization_id, r.id, e.id, e.event_type, private.webhook_payload(e))
    on conflict do nothing;
    if found then v_d := v_d + 1; end if;
  end loop;

  update public.outbox_events set processed_at = clock_timestamp(), locked_until = null, error = null where id = e.id;
  return jsonb_build_object('notifications', v_n, 'deliveries', v_d);
end;
$$;

create or replace function private.webhook_payload(e public.outbox_events)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'type', e.event_type, 'occurredAt', e.created_at, 'organizationId', e.organization_id,
    'entity', jsonb_build_object('type', e.entity_type, 'id', e.entity_id), 'projectId', e.project_id, 'data', e.payload);
$$;

-- Substitutes {{field}} placeholders from an event payload; unknown placeholders are left blank.
create or replace function private.render_template(p_text text, p_payload jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_out text := coalesce(p_text, '');
  kv record;
begin
  for kv in select key, value from jsonb_each_text(p_payload) loop
    v_out := replace(v_out, '{{' || kv.key || '}}', coalesce(kv.value, ''));
  end loop;
  return btrim(regexp_replace(v_out, '\{\{[a-z_]+\}\}', '', 'g'));
end $$;

-- Executes a rule's actions for one event. Conditions are evaluated by the dispatcher
-- (src/lib/automation/rules.ts); this applies the actions and records the run exactly once.
create or replace function private.apply_rule(p_event uuid, p_rule uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.outbox_events;
  w public.workflow_rules;
  a jsonb;
  v_detail jsonb := '[]'::jsonb;
  v_failed boolean := false;
  v_to uuid[];
  v_member uuid;
  v_title text;
  v_body text;
  v_link text;
  v_project public.projects;
  v_sev text;
  v_inserted uuid;
begin
  select * into e from public.outbox_events where id = p_event;
  select * into w from public.workflow_rules where id = p_rule and organization_id = e.organization_id and enabled and archived_at is null;
  if e.id is null or w.id is null then return jsonb_build_object('applied', false); end if;

  insert into public.workflow_runs (organization_id, rule_id, rule_version, event_id, status)
  values (e.organization_id, w.id, w.version, e.id, 'succeeded')
  on conflict (rule_id, event_id) do nothing
  returning id into v_inserted;
  if v_inserted is null then return jsonb_build_object('applied', false); end if;

  if e.project_id is not null then select * into v_project from public.projects where id = e.project_id; end if;
  v_link := private.event_link(e);

  for a in select * from jsonb_array_elements(w.actions) loop
    begin
      if a ->> 'type' = 'notify' then
        v_to := case a ->> 'to'
          when 'project_manager' then array[v_project.project_manager_id]
          when 'delivery_owner' then array[v_project.delivery_owner_id]
          when 'assignee' then array[(e.payload ->> 'assignee_membership_id')::uuid]
          when 'member' then array[(a ->> 'membershipId')::uuid]
          when 'role' then (
            select coalesce(array_agg(distinct m.id), '{}') from public.organization_memberships m
            join public.membership_roles mr on mr.membership_id = m.id
            join public.role_definitions rd on rd.id = mr.role_id
            where m.organization_id = e.organization_id and m.status = 'active' and rd.key = a ->> 'roleKey')
          else '{}'::uuid[] end;
        v_sev := coalesce(a ->> 'severity', 'info');
        v_title := private.render_template(coalesce(a ->> 'title', e.event_type), e.payload);
        v_body := nullif(private.render_template(a ->> 'message', e.payload), '');
        foreach v_member in array coalesce(v_to, '{}') loop
          if v_member is not null then
            perform private.notify_member(e.organization_id, v_member, e.id, 'system', 'rule:' || w.id, v_title, v_body, v_link, v_sev,
                                          'rule:' || w.id || ':' || e.entity_id, e.project_id, false);
          end if;
        end loop;
        v_detail := v_detail || jsonb_build_object('action', 'notify', 'recipients', coalesce(cardinality(v_to), 0));
      elsif a ->> 'type' = 'webhook' then
        insert into public.webhook_deliveries (organization_id, endpoint_id, event_id, event_type, payload)
        select e.organization_id, w2.id, e.id, e.event_type, private.webhook_payload(e)
        from public.webhook_endpoints w2
        where w2.id = (a ->> 'endpointId')::uuid and w2.organization_id = e.organization_id and w2.enabled
        on conflict do nothing;
        v_detail := v_detail || jsonb_build_object('action', 'webhook', 'queued', found);
      else
        raise exception 'unknown action';
      end if;
    exception when others then
      v_failed := true;
      v_detail := v_detail || jsonb_build_object('action', a ->> 'type', 'error', left(sqlerrm, 200));
    end;
  end loop;

  update public.workflow_runs set status = case when v_failed then 'failed' else 'succeeded' end, detail = v_detail where id = v_inserted;
  return jsonb_build_object('applied', true, 'failed', v_failed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (the ones that run in the database)
-- ---------------------------------------------------------------------------
create or replace function private.job_escalation_overdue(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  for r in
    select x.id, x.project_id, x.title, x.escalated_to_membership_id, x.respond_by from public.escalations x
    where x.organization_id = p_org and x.status <> 'resolved' and x.respond_by < now()
      and not exists (select 1 from public.outbox_events o where o.event_type = 'escalation.overdue' and o.entity_id = x.id)
  loop
    insert into public.outbox_events (organization_id, event_type, entity_type, entity_id, project_id, payload)
    values (p_org, 'escalation.overdue', 'escalations', r.id, r.project_id,
            jsonb_build_object('title', r.title, 'escalated_to_membership_id', r.escalated_to_membership_id, 'respond_by', r.respond_by));
    n := n + 1;
  end loop;
  return jsonb_build_object('events', n);
end $$;

create or replace function private.job_timesheet_reminder(p_org uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.org_today(p_org);
  v_week date := date_trunc('week', private.org_today(p_org))::date - 7;
  v_from integer := coalesce((p_config ->> 'from_weekday')::int, 2);
  n integer := 0;
  r record;
begin
  if extract(isodow from v_today) < v_from then
    return jsonb_build_object('events', 0, 'note', 'too early in the week');
  end if;
  for r in
    select m.id from public.organization_memberships m
    where m.organization_id = p_org and m.status = 'active' and m.created_at < (v_week + 7)
      and private.membership_has_permission(m.id, 'workforce.self')
      and not exists (select 1 from public.timesheets t where t.membership_id = m.id and t.week_start = v_week and t.status in ('submitted', 'approved'))
      and not exists (select 1 from public.outbox_events o where o.event_type = 'timesheet.missing' and o.entity_id = m.id and o.payload ->> 'week_start' = v_week::text)
  loop
    insert into public.outbox_events (organization_id, event_type, entity_type, entity_id, payload)
    values (p_org, 'timesheet.missing', 'organization_memberships', r.id, jsonb_build_object('membership_id', r.id, 'week_start', v_week));
    n := n + 1;
  end loop;
  return jsonb_build_object('events', n, 'week_start', v_week);
end $$;

create or replace function private.job_sprint_snapshot(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record;
begin
  for r in select id from public.sprints where organization_id = p_org and state = 'active' loop
    perform private.refresh_sprint_stats(r.id);
    n := n + 1;
  end loop;
  return jsonb_build_object('sprints', n);
end $$;

create or replace function private.job_retention(p_org uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_outbox integer := coalesce((p_config ->> 'outbox_days')::int, 30);
  v_notif integer := coalesce((p_config ->> 'notification_days')::int, 90);
  v_log integer := coalesce((p_config ->> 'log_days')::int, 90);
  a integer; b integer; c integer; d integer;
begin
  delete from public.webhook_deliveries where organization_id = p_org and status <> 'pending' and created_at < now() - make_interval(days => v_outbox);
  get diagnostics a = row_count;
  delete from public.outbox_events o where o.organization_id = p_org and o.processed_at is not null and o.created_at < now() - make_interval(days => v_outbox)
    and not exists (select 1 from public.webhook_deliveries w where w.event_id = o.id and w.status = 'pending');
  get diagnostics b = row_count;
  delete from public.notifications where organization_id = p_org and read_at is not null and read_at < now() - make_interval(days => v_notif);
  get diagnostics c = row_count;
  delete from public.job_runs where organization_id = p_org and created_at < now() - make_interval(days => v_log);
  delete from public.integration_sync_runs where organization_id = p_org and created_at < now() - make_interval(days => v_log);
  get diagnostics d = row_count;
  return jsonb_build_object('deliveries', a, 'events', b, 'notifications', c, 'logs', d);
end $$;

-- Runs one database-side job and logs it. integration_sync is run by the application.
create or replace function private.execute_job(p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.scheduled_jobs;
  v_summary jsonb;
begin
  select * into j from public.scheduled_jobs where id = p_job;
  if not found then raise exception 'unknown_job: no such job' using errcode = 'P0001'; end if;
  begin
    v_summary := case j.key
      when 'escalation_overdue' then private.job_escalation_overdue(j.organization_id)
      when 'timesheet_reminder' then private.job_timesheet_reminder(j.organization_id, j.config)
      when 'sprint_snapshot' then private.job_sprint_snapshot(j.organization_id)
      when 'retention' then private.job_retention(j.organization_id, j.config)
      else null end;
    if v_summary is null then
      raise exception 'app_job: % runs in the application', j.key using errcode = 'P0001';
    end if;
    perform private.record_job(j.id, 'succeeded', v_summary, null);
    return v_summary;
  exception when sqlstate 'P0001' then
    raise;
  when others then
    perform private.record_job(j.id, 'failed', '{}'::jsonb, left(sqlerrm, 500));
    return jsonb_build_object('error', left(sqlerrm, 200));
  end;
end;
$$;

create or replace function private.record_job(p_job uuid, p_status text, p_summary jsonb, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.scheduled_jobs;
begin
  select * into j from public.scheduled_jobs where id = p_job;
  update public.scheduled_jobs set last_run_at = now(), last_status = p_status, last_error = p_error where id = j.id;
  insert into public.job_runs (organization_id, job_id, job_key, status, summary, error)
  values (j.organization_id, j.id, j.key, p_status, coalesce(p_summary, '{}'::jsonb), p_error);
end $$;

-- Re-enabling a job, or shortening its interval, makes it due now.
create or replace function private.scheduled_jobs_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.enabled and not old.enabled) or new.interval_minutes < old.interval_minutes then
    new.next_run_at := now();
  end if;
  return new;
end $$;
create trigger scheduled_jobs_before_update before update on public.scheduled_jobs
  for each row execute function private.scheduled_jobs_before_update();

-- ---------------------------------------------------------------------------
-- RPCs for people
-- ---------------------------------------------------------------------------
create or replace function public.run_job_now(p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare j public.scheduled_jobs;
begin
  select * into j from public.scheduled_jobs where id = p_job;
  if not found or not public.has_permission(j.organization_id, 'automation.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.execute_job(j.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs for the background worker (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_outbox_events(p_limit integer)
returns setof public.outbox_events
language sql
security definer
set search_path = ''
as $$
  update public.outbox_events o
     set attempts = o.attempts + 1, locked_until = now() + interval '5 minutes'
   where o.id in (
     select x.id from public.outbox_events x
     where x.processed_at is null and x.attempts < 8 and (x.locked_until is null or x.locked_until < now())
     order by x.created_at limit greatest(1, least(p_limit, 200)) for update skip locked)
  returning o.*;
$$;

create or replace function public.fail_outbox_event(p_event uuid, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.outbox_events
     set error = left(p_error, 500), locked_until = now() + (power(2, least(attempts, 6)) || ' minutes')::interval
   where id = p_event and processed_at is null;
$$;

create or replace function public.rule_candidates(p_event uuid)
returns table (rule_id uuid, conditions jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.conditions
  from public.outbox_events e
  join public.workflow_rules w on w.organization_id = e.organization_id and w.trigger_event = e.event_type and w.enabled and w.archived_at is null
  where e.id = p_event;
$$;

create or replace function public.apply_workflow_rule(p_event uuid, p_rule uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.apply_rule(p_event, p_rule);
$$;

create or replace function public.fan_out_event(p_event uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.fan_out(p_event);
$$;

create or replace function public.claim_webhook_deliveries(p_limit integer)
returns table (id uuid, organization_id uuid, endpoint_id uuid, url text, format text, secret text, event_type text, payload jsonb, attempts integer)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select d.id from public.webhook_deliveries d
    join public.webhook_endpoints w on w.id = d.endpoint_id and w.enabled
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at limit greatest(1, least(p_limit, 100)) for update of d skip locked
  ), claimed as (
    update public.webhook_deliveries d
       set attempts = d.attempts + 1, next_attempt_at = now() + interval '2 minutes'
      from due where d.id = due.id
    returning d.*
  )
  select c.id, c.organization_id, c.endpoint_id, w.url, w.format, s.secret, c.event_type, c.payload, c.attempts
  from claimed c
  join public.webhook_endpoints w on w.id = c.endpoint_id
  join public.webhook_secrets s on s.endpoint_id = w.id;
$$;

create or replace function public.complete_webhook_delivery(p_delivery uuid, p_status integer, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.webhook_deliveries;
  v_delays interval[] := array['1 minute', '5 minutes', '30 minutes', '2 hours', '12 hours']::interval[];
  v_ok boolean := p_status between 200 and 299;
  v_fails integer;
begin
  select * into d from public.webhook_deliveries where id = p_delivery for update;
  if not found then return; end if;
  if v_ok then
    update public.webhook_deliveries set status = 'succeeded', response_status = p_status, error = null, delivered_at = now() where id = d.id;
    update public.webhook_endpoints set consecutive_failures = 0, last_success_at = now() where id = d.endpoint_id;
    return;
  end if;
  if d.attempts > cardinality(v_delays) then
    update public.webhook_deliveries set status = 'dead', response_status = p_status, error = left(coalesce(p_error, 'http_' || p_status), 300) where id = d.id;
  else
    update public.webhook_deliveries
       set response_status = p_status, error = left(coalesce(p_error, 'http_' || p_status), 300), next_attempt_at = now() + v_delays[d.attempts]
     where id = d.id;
  end if;
  update public.webhook_endpoints set consecutive_failures = consecutive_failures + 1 where id = d.endpoint_id returning consecutive_failures into v_fails;
  if v_fails >= 10 then
    update public.webhook_endpoints set enabled = false, disabled_reason = 'Disabled after 10 consecutive failed deliveries.' where id = d.endpoint_id and enabled;
  end if;
end;
$$;

create or replace function public.claim_pending_emails(p_limit integer)
returns table (id uuid, to_email text, title text, body text, link text, organization_name text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select n.id from public.notifications n
    where n.email_status = 'pending' and n.email_attempts < 3
    order by n.created_at limit greatest(1, least(p_limit, 100)) for update skip locked
  ), claimed as (
    update public.notifications n set email_attempts = n.email_attempts + 1 from due where n.id = due.id returning n.*
  )
  select c.id, up.email::text, c.title, c.body, c.link, o.name
  from claimed c
  join public.organization_memberships m on m.id = c.membership_id
  join public.user_profiles up on up.id = m.user_id
  join public.organizations o on o.id = c.organization_id;
$$;

create or replace function public.complete_notification_email(p_id uuid, p_status text)
returns void language sql security definer set search_path = '' as $$
  update public.notifications
     set email_status = case when p_status in ('sent', 'simulated') then p_status when email_attempts >= 3 then 'failed' else 'pending' end
   where id = p_id and email_status = 'pending';
$$;

create or replace function public.claim_due_jobs(p_limit integer)
returns setof public.scheduled_jobs
language sql
security definer
set search_path = ''
as $$
  update public.scheduled_jobs j
     set next_run_at = now() + make_interval(mins => j.interval_minutes)
   where j.id in (
     select x.id from public.scheduled_jobs x
     join public.organizations o on o.id = x.organization_id and o.archived_at is null
     where x.enabled and x.next_run_at <= now()
     order by x.next_run_at limit greatest(1, least(p_limit, 100)) for update of x skip locked)
  returning j.*;
$$;

create or replace function public.run_scheduled_job(p_job uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.execute_job(p_job);
$$;

create or replace function public.record_job_result(p_job uuid, p_status text, p_summary jsonb, p_error text)
returns void language sql security definer set search_path = '' as $$
  select private.record_job(p_job, p_status, p_summary, p_error);
$$;

create or replace function public.record_heartbeat(p_summary jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.scheduler_heartbeat (id, last_tick_at, summary) values (true, now(), coalesce(p_summary, '{}'::jsonb))
  on conflict (id) do update set last_tick_at = now(), summary = excluded.summary;
$$;

-- Integration worker inputs and outputs. Reads are scoped to one connection; the worker never
-- sees work item content, only the linked issue ids and the fields the notification needs.
create or replace function public.integration_sync_inputs(p_connection uuid)
returns table (link_id uuid, external_id text, external_status text, created_at timestamptz, work_item_key text, assignee_membership_id uuid, project_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.external_id, l.external_status, l.created_at, w.key, w.assignee_membership_id, w.project_id
  from public.integration_links l
  join public.work_items w on w.id = l.work_item_id
  where l.connection_id = p_connection;
$$;

create or replace function public.apply_integration_status(p_link uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.integration_links;
  w public.work_items;
begin
  select * into l from public.integration_links where id = p_link for update;
  if not found then return false; end if;
  update public.integration_links set last_synced_at = now(), external_status = p_status where id = l.id;
  if l.external_status is distinct from p_status and l.external_status is not null then
    select * into w from public.work_items where id = l.work_item_id;
    insert into public.outbox_events (organization_id, event_type, entity_type, entity_id, project_id, payload)
    values (l.organization_id, 'integration.link_status_changed', 'integration_links', l.id, w.project_id,
            jsonb_build_object('key', w.key, 'external_id', l.external_id, 'from', l.external_status, 'to', p_status, 'assignee_membership_id', w.assignee_membership_id));
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.record_integration_sync(p_connection uuid, p_status text, p_summary jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.integration_connections;
begin
  select * into c from public.integration_connections where id = p_connection;
  if not found then return; end if;
  update public.integration_connections
     set health = case when p_status = 'succeeded' then 'healthy' else 'error' end, last_sync_at = now(), last_error = left(p_error, 500)
   where id = c.id;
  insert into public.integration_sync_runs (organization_id, connection_id, status, summary, error)
  values (c.organization_id, c.id, p_status, coalesce(p_summary, '{}'::jsonb), left(p_error, 500));
end;
$$;

create or replace function public.due_integration_connections()
returns table (id uuid, organization_id uuid, provider text, mode text, config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.organization_id, c.provider, c.mode, c.config from public.integration_connections c where c.enabled;
$$;

-- ---------------------------------------------------------------------------
-- Backfill existing organizations
-- ---------------------------------------------------------------------------
select private.seed_automation_defaults(id) from public.organizations;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.outbox_events          enable row level security;
alter table public.notifications          enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.webhook_endpoints      enable row level security;
alter table public.webhook_secrets        enable row level security;
alter table public.webhook_deliveries     enable row level security;
alter table public.workflow_rules         enable row level security;
alter table public.workflow_rule_versions enable row level security;
alter table public.workflow_runs          enable row level security;
alter table public.scheduled_jobs         enable row level security;
alter table public.job_runs               enable row level security;
alter table public.scheduler_heartbeat    enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_links      enable row level security;
alter table public.integration_sync_runs  enable row level security;

-- The event stream is for operators, and only for projects they can already read.
grant select on public.outbox_events to authenticated;
create policy outbox_events_select on public.outbox_events for select to authenticated
  using (public.has_permission(organization_id, 'automation.read') and (project_id is null or public.can_read_project(project_id)));

-- Notifications belong to their recipient. Nobody inserts them from a session.
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (membership_id = private.active_membership_id(organization_id));
create policy notifications_update on public.notifications for update to authenticated
  using (membership_id = private.active_membership_id(organization_id))
  with check (membership_id = private.active_membership_id(organization_id));
create policy notifications_delete on public.notifications for delete to authenticated
  using (membership_id = private.active_membership_id(organization_id));

grant select, insert, update, delete on public.notification_preferences to authenticated;
create policy notification_preferences_all on public.notification_preferences for all to authenticated
  using (membership_id = private.active_membership_id(organization_id))
  with check (membership_id = private.active_membership_id(organization_id));

-- Endpoints: the secret is not a column here and webhook_secrets has no grant at all.
grant select on public.webhook_endpoints to authenticated;
grant update (name, url, format, event_types, enabled) on public.webhook_endpoints to authenticated;
grant delete on public.webhook_endpoints to authenticated;
create policy webhook_endpoints_select on public.webhook_endpoints for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));
create policy webhook_endpoints_update on public.webhook_endpoints for update to authenticated
  using (public.has_permission(organization_id, 'automation.manage'))
  with check (public.has_permission(organization_id, 'automation.manage'));
create policy webhook_endpoints_delete on public.webhook_endpoints for delete to authenticated
  using (public.has_permission(organization_id, 'automation.manage'));

grant select (id, organization_id, endpoint_id, event_id, event_type, status, attempts, next_attempt_at, response_status, error, created_at, delivered_at)
  on public.webhook_deliveries to authenticated;
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));

grant select on public.workflow_rules to authenticated;
grant insert (organization_id, name, description, enabled, trigger_event, conditions, actions) on public.workflow_rules to authenticated;
grant update (name, description, enabled, trigger_event, conditions, actions, archived_at) on public.workflow_rules to authenticated;
create policy workflow_rules_select on public.workflow_rules for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));
create policy workflow_rules_insert on public.workflow_rules for insert to authenticated
  with check (public.has_permission(organization_id, 'automation.manage'));
create policy workflow_rules_update on public.workflow_rules for update to authenticated
  using (public.has_permission(organization_id, 'automation.manage'))
  with check (public.has_permission(organization_id, 'automation.manage'));

grant select on public.workflow_rule_versions, public.workflow_runs to authenticated;
create policy workflow_rule_versions_select on public.workflow_rule_versions for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));
create policy workflow_runs_select on public.workflow_runs for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));

grant select on public.scheduled_jobs, public.job_runs to authenticated;
grant update (enabled, interval_minutes, config) on public.scheduled_jobs to authenticated;
create policy scheduled_jobs_select on public.scheduled_jobs for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));
create policy scheduled_jobs_update on public.scheduled_jobs for update to authenticated
  using (public.has_permission(organization_id, 'automation.manage'))
  with check (public.has_permission(organization_id, 'automation.manage'));
create policy job_runs_select on public.job_runs for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));

-- A timestamp with no tenant data, so any signed-in person can tell whether the scheduler is alive.
grant select on public.scheduler_heartbeat to authenticated;
create policy scheduler_heartbeat_select on public.scheduler_heartbeat for select to authenticated using (true);

grant select on public.integration_connections to authenticated;
grant insert (organization_id, provider, name, mode, config) on public.integration_connections to authenticated;
grant update (name, config, enabled) on public.integration_connections to authenticated;
grant delete on public.integration_connections to authenticated;
create policy integration_connections_select on public.integration_connections for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));
create policy integration_connections_insert on public.integration_connections for insert to authenticated
  with check (public.has_permission(organization_id, 'automation.manage'));
create policy integration_connections_update on public.integration_connections for update to authenticated
  using (public.has_permission(organization_id, 'automation.manage'))
  with check (public.has_permission(organization_id, 'automation.manage'));
create policy integration_connections_delete on public.integration_connections for delete to authenticated
  using (public.has_permission(organization_id, 'automation.manage'));

-- A link is visible to anyone who can read the work item's project; changing links needs manage.
grant select, insert, delete on public.integration_links to authenticated;
grant insert (organization_id, connection_id, work_item_id, external_id, external_url, external_status) on public.integration_links to authenticated;
create policy integration_links_select on public.integration_links for select to authenticated
  using (exists (select 1 from public.work_items w where w.id = work_item_id and public.can_read_project(w.project_id)));
create policy integration_links_insert on public.integration_links for insert to authenticated
  with check (public.has_permission(organization_id, 'automation.manage')
              and exists (select 1 from public.work_items w where w.id = work_item_id and public.can_read_project(w.project_id)));
create policy integration_links_delete on public.integration_links for delete to authenticated
  using (public.has_permission(organization_id, 'automation.manage'));

grant select on public.integration_sync_runs to authenticated;
create policy integration_sync_runs_select on public.integration_sync_runs for select to authenticated
  using (public.has_permission(organization_id, 'automation.read'));

-- Function privileges. Triggers and private.* helpers are not callable through the API.
revoke execute on function
  public.create_webhook_endpoint(uuid, text, text, text, text[]),
  public.rotate_webhook_secret(uuid),
  public.redeliver_webhook(uuid),
  public.run_job_now(uuid)
from public, anon;
grant execute on function
  public.create_webhook_endpoint(uuid, text, text, text, text[]),
  public.rotate_webhook_secret(uuid),
  public.redeliver_webhook(uuid),
  public.run_job_now(uuid)
to authenticated;

revoke execute on function
  public.claim_outbox_events(integer),
  public.fail_outbox_event(uuid, text),
  public.rule_candidates(uuid),
  public.apply_workflow_rule(uuid, uuid),
  public.fan_out_event(uuid),
  public.claim_webhook_deliveries(integer),
  public.complete_webhook_delivery(uuid, integer, text),
  public.claim_pending_emails(integer),
  public.complete_notification_email(uuid, text),
  public.claim_due_jobs(integer),
  public.run_scheduled_job(uuid),
  public.record_job_result(uuid, text, jsonb, text),
  public.record_heartbeat(jsonb),
  public.integration_sync_inputs(uuid),
  public.apply_integration_status(uuid, text),
  public.record_integration_sync(uuid, text, jsonb, text),
  public.due_integration_connections()
from public, anon, authenticated;
grant execute on function
  public.claim_outbox_events(integer),
  public.fail_outbox_event(uuid, text),
  public.rule_candidates(uuid),
  public.apply_workflow_rule(uuid, uuid),
  public.fan_out_event(uuid),
  public.claim_webhook_deliveries(integer),
  public.complete_webhook_delivery(uuid, integer, text),
  public.claim_pending_emails(integer),
  public.complete_notification_email(uuid, text),
  public.claim_due_jobs(integer),
  public.run_scheduled_job(uuid),
  public.record_job_result(uuid, text, jsonb, text),
  public.record_heartbeat(jsonb),
  public.integration_sync_inputs(uuid),
  public.apply_integration_status(uuid, text),
  public.record_integration_sync(uuid, text, jsonb, text),
  public.due_integration_connections()
to service_role;
