-- Delivery metrics: weekly values per project, auto-filled where the system already knows them,
-- plus scheduled weekly and monthly report emails to a per-project recipient list.
--
-- * project_metric_entries  one manual value per project, metric and week (Monday). Wins over the auto value.
-- * project_report_settings  who gets the report, and whether weekly / monthly are on. Off by default.
-- * metric_report_runs       one generated report per project, kind and period: the email outbox and history.
-- * private.metric_catalogue the fixed list of metrics. src/lib/domain/delivery-metrics.ts mirrors it (a unit test
--                            fails when they drift) and adds labels and groups.
--
-- Entering and reading use RPCs; nothing is written directly. Anyone assigned to the project can enter values. Sending is done by the application tick through
-- two service_role RPCs (claim_pending_reports, complete_report_run), like the notification email path.

create table public.project_metric_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  metric_key      text not null check (char_length(metric_key) between 2 and 60),
  period_start    date not null check (extract(isodow from period_start) = 1),
  value           numeric(10,2) not null,
  entered_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, metric_key, period_start),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index project_metric_entries_period_idx on public.project_metric_entries (project_id, period_start);
create trigger project_metric_entries_updated_at before update on public.project_metric_entries
  for each row execute function private.set_updated_at();
create trigger project_metric_entries_audit after insert or update or delete on public.project_metric_entries
  for each row execute function private.audit_row_change();

create table public.project_report_settings (
  project_id      uuid primary key,
  organization_id uuid not null,
  weekly_enabled  boolean not null default false,
  monthly_enabled boolean not null default false,
  recipients      text[] not null default '{}' check (cardinality(recipients) <= 20),
  updated_by      uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create trigger project_report_settings_updated_at before update on public.project_report_settings
  for each row execute function private.set_updated_at();

create table public.metric_report_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  kind            text not null check (kind in ('weekly', 'monthly')),
  period_start    date not null,
  period_end      date not null,
  recipients      text[] not null,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'simulated', 'failed')),
  delivered_to    text[] not null default '{}',
  attempts        integer not null default 0,
  claimed_at      timestamptz,
  last_error      text check (last_error is null or char_length(last_error) <= 500),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  check (period_end >= period_start),
  unique (project_id, kind, period_start),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index metric_report_runs_pending_idx on public.metric_report_runs (created_at) where status = 'pending';
create index metric_report_runs_project_idx on public.metric_report_runs (project_id, period_start desc);

-- ---------------------------------------------------------------------------
-- The catalogue. agg says how weeks combine in a longer period: sum, avg, latest (the most recent week
-- that has a value), or computed (derived, never entered). lo and hi bound an entered value.
-- ---------------------------------------------------------------------------
create or replace function private.metric_catalogue()
returns table (key text, agg text, lo numeric, hi numeric, auto boolean)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('scope_creeps',            'sum',      0::numeric,    1000::numeric, true),
    ('schedule_variance_pct',   'avg',   -1000,         1000,          false),
    ('effort_variance_pct',     'avg',   -1000,         1000,          false),
    ('unit_test_coverage_pct',  'avg',      0,          100,           false),
    ('pull_requests',           'sum',      0,          10000,         true),
    ('test_pass_rate_pct',      'avg',      0,          100,           false),
    ('qa_bugs',                 'sum',      0,          10000,         false),
    ('test_execution_pct',      'avg',      0,          100,           false),
    ('test_automation_pct',     'avg',      0,          100,           false),
    ('uat_coverage_pct',        'avg',      0,          100,           false),
    ('uat_execution_pct',       'avg',      0,          100,           false),
    ('uat_automation_pct',      'avg',      0,          100,           false),
    ('uat_bugs',                'sum',      0,          10000,         false),
    ('releases_successful',     'sum',      0,          1000,          true),
    ('hotfix_releases',         'sum',      0,          1000,          false),
    ('rollbacks',               'sum',      0,          1000,          false),
    ('production_bugs',         'sum',      0,          10000,         false),
    ('retros_done',             'sum',      0,          100,           false),
    ('retro_action_items',      'sum',      0,          1000,          false),
    ('retro_pending_items',     'latest',   0,          1000,          false),
    ('metrics_reported_pct',    'computed', 0,          100,           false),
    ('csat_score',              'latest',   0,          100,           false),
    ('nps_score',               'latest', -100,         100,           false),
    ('esat_score',              'latest',   0,          100,           false),
    ('customer_escalations',    'sum',      0,          1000,          true),
    ('escalations_completed',   'sum',      0,          1000,          true),
    ('escalations_pending',     'latest',   0,          1000,          true),
    ('ai_processes_pct',        'latest',   0,          100,           false),
    ('ai_first_engineers_pct',  'latest',   0,          100,           false),
    ('ai_pocs',                 'sum',      0,          1000,          false)
  ) as t (key, agg, lo, hi, auto);
$$;

-- What the system already knows about a metric over a period, or null when it cannot know.
create or replace function private.metric_auto(p_project uuid, p_key text, p_from date, p_to date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to   timestamptz := (p_to + 1)::timestamptz;
begin
  return case p_key
    when 'scope_creeps' then
      (select count(*) from public.work_items w
        where w.project_id = p_project and w.type = 'change_request' and w.created_at >= v_from and w.created_at < v_to)
    when 'pull_requests' then
      (select count(*) from public.work_item_links l
        join public.work_items w on w.id = l.work_item_id and w.organization_id = l.organization_id
        where w.project_id = p_project and l.kind = 'pull_request' and l.created_at >= v_from and l.created_at < v_to)
    when 'releases_successful' then
      (select count(*) from public.releases r
        where r.project_id = p_project and r.status = 'released' and r.released_on between p_from and p_to)
    when 'customer_escalations' then
      (select count(*) from public.escalations e where e.project_id = p_project and e.created_at >= v_from and e.created_at < v_to)
    when 'escalations_completed' then
      (select count(*) from public.escalations e where e.project_id = p_project and e.resolved_at >= v_from and e.resolved_at < v_to)
    when 'escalations_pending' then
      (select count(*) from public.escalations e
        where e.project_id = p_project and e.created_at < v_to and (e.resolved_at is null or e.resolved_at >= v_to))
    else null end;
end;
$$;

-- Every metric for a period as [{key, value, source}]. A manual value wins; otherwise the auto value;
-- otherwise null (not reported). metrics_reported_pct is the share of the other metrics that have a value.
create or replace function private.metrics_for_period(p_project uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  v numeric;
  src text;
  v_out jsonb := '[]'::jsonb;
  v_have integer := 0;
  v_total integer := 0;
begin
  for c in select * from private.metric_catalogue() loop
    if c.agg = 'computed' then continue; end if;
    v_total := v_total + 1;
    src := null;
    select case c.agg
             when 'sum' then sum(e.value)
             when 'avg' then round(avg(e.value), 2)
             else (array_agg(e.value order by e.period_start desc))[1] end
      into v
      from public.project_metric_entries e
     where e.project_id = p_project and e.metric_key = c.key and e.period_start between p_from and p_to;
    if v is not null then
      src := 'manual';
    elsif c.auto then
      v := private.metric_auto(p_project, c.key, p_from, p_to);
      if v is not null then src := 'auto'; end if;
    end if;
    if v is not null then v_have := v_have + 1; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('key', c.key, 'value', v, 'source', src));
  end loop;
  return v_out || jsonb_build_array(jsonb_build_object(
    'key', 'metrics_reported_pct',
    'value', round(100.0 * v_have / greatest(v_total, 1)),
    'source', 'computed'));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs for people
-- ---------------------------------------------------------------------------
-- Who may enter metric values: the people who publish for the project, and everyone assigned to it, so
-- QA, UAT and engineering leads can record their own figures. They must still be able to read the project.
create or replace function public.can_enter_metrics(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_read_project(p.id) and (
      public.has_permission(p.organization_id, 'project.change_status')
      or exists (
        select 1 from public.project_memberships pm
         where pm.project_id = p.id and pm.membership_id = private.active_membership_id(p.organization_id))
    )
    from public.projects p where p.id = p_project
  ), false);
$$;

create or replace function public.project_metrics(p_project uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_read_project(p_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'invalid_dates: a period is at most 93 days' using errcode = 'P0001';
  end if;
  return private.metrics_for_period(p_project, p_from, p_to);
end;
$$;

-- p_entries: {metric_key: number | null}. A number sets the value for that week, null clears it.
create or replace function public.save_metric_entries(p_project uuid, p_week date, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  k text;
  j jsonb;
  c record;
  v numeric;
  n integer := 0;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.can_enter_metrics(p_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_week is null or extract(isodow from p_week) <> 1 or p_week > private.org_today(v_org) then
    raise exception 'invalid_week: choose a Monday that has started' using errcode = 'P0001';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'object' then
    raise exception 'invalid_entries: expected an object of metric values' using errcode = 'P0001';
  end if;

  for k, j in select * from jsonb_each(p_entries) loop
    select * into c from private.metric_catalogue() m where m.key = k and m.agg <> 'computed';
    if not found then
      raise exception 'unknown_metric: % cannot be entered', k using errcode = 'P0001';
    end if;
    if jsonb_typeof(j) = 'null' then
      delete from public.project_metric_entries where project_id = p_project and metric_key = k and period_start = p_week;
    else
      if jsonb_typeof(j) <> 'number' then
        raise exception 'out_of_range: % must be a number', k using errcode = 'P0001';
      end if;
      v := round((j #>> '{}')::numeric, 2);
      if v < c.lo or v > c.hi then
        raise exception 'out_of_range: % must be between % and %', k, c.lo, c.hi using errcode = 'P0001';
      end if;
      insert into public.project_metric_entries (organization_id, project_id, metric_key, period_start, value)
      values (v_org, p_project, k, p_week, v)
      on conflict (project_id, metric_key, period_start) do update set value = excluded.value, entered_by = auth.uid();
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.save_report_settings(p_project uuid, p_weekly boolean, p_monthly boolean, p_recipients text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_list text[];
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.can_act_on_project(p_project, 'project.change_status') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(btrim(x)) order by lower(btrim(x))), '{}') into v_list
    from unnest(coalesce(p_recipients, '{}')) as x where btrim(x) <> '';
  if cardinality(v_list) > 20 then
    raise exception 'too_many_recipients: at most 20 addresses' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_list) a where a !~ '^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$' or char_length(a) > 254) then
    raise exception 'invalid_recipients: one of the email addresses is not valid' using errcode = 'P0001';
  end if;
  if (coalesce(p_weekly, false) or coalesce(p_monthly, false)) and cardinality(v_list) = 0 then
    raise exception 'no_recipients: add at least one address before turning a report on' using errcode = 'P0001';
  end if;
  insert into public.project_report_settings (project_id, organization_id, weekly_enabled, monthly_enabled, recipients)
  values (p_project, v_org, coalesce(p_weekly, false), coalesce(p_monthly, false), v_list)
  on conflict (project_id) do update
    set weekly_enabled = excluded.weekly_enabled, monthly_enabled = excluded.monthly_enabled,
        recipients = excluded.recipients, updated_by = auth.uid();
  -- Addresses are personal data: the audit trail records how many, not which.
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (v_org, auth.uid(), 'project_report_settings.save', 'project_report_settings', p_project,
          jsonb_build_object('weekly', coalesce(p_weekly, false), 'monthly', coalesce(p_monthly, false), 'recipients', cardinality(v_list)));
end;
$$;

-- ---------------------------------------------------------------------------
-- The scheduled job: the latest complete week and month for each project that has a recipient list.
-- Idempotent: a period is generated once, so a missed day or an overlapping run is harmless.
-- ---------------------------------------------------------------------------
create or replace function private.job_metrics_reports(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.org_today(p_org);
  v_w0 date := date_trunc('week', v_today)::date - 7;
  v_m0 date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_m1 date := date_trunc('month', v_today)::date - 1;
  r record;
  n integer;
  v_weekly integer := 0;
  v_monthly integer := 0;
begin
  for r in
    select s.project_id, s.recipients, s.weekly_enabled, s.monthly_enabled, p.code, p.name, p.health, p.status
      from public.project_report_settings s
      join public.projects p on p.id = s.project_id and p.organization_id = s.organization_id
     where s.organization_id = p_org and cardinality(s.recipients) > 0
       and p.archived_at is null and p.status in ('planning', 'active', 'on_hold')
  loop
    if r.weekly_enabled then
      insert into public.metric_report_runs (organization_id, project_id, kind, period_start, period_end, recipients, payload)
      values (p_org, r.project_id, 'weekly', v_w0, v_w0 + 6, r.recipients,
              jsonb_build_object('project', jsonb_build_object('code', r.code, 'name', r.name, 'health', r.health, 'status', r.status),
                                 'kind', 'weekly', 'period_start', v_w0, 'period_end', v_w0 + 6,
                                 'metrics', private.metrics_for_period(r.project_id, v_w0, v_w0 + 6), 'generated_at', now()))
      on conflict (project_id, kind, period_start) do nothing;
      get diagnostics n = row_count;
      v_weekly := v_weekly + n;
    end if;
    if r.monthly_enabled then
      insert into public.metric_report_runs (organization_id, project_id, kind, period_start, period_end, recipients, payload)
      values (p_org, r.project_id, 'monthly', v_m0, v_m1, r.recipients,
              jsonb_build_object('project', jsonb_build_object('code', r.code, 'name', r.name, 'health', r.health, 'status', r.status),
                                 'kind', 'monthly', 'period_start', v_m0, 'period_end', v_m1,
                                 'metrics', private.metrics_for_period(r.project_id, v_m0, v_m1), 'generated_at', now()))
      on conflict (project_id, kind, period_start) do nothing;
      get diagnostics n = row_count;
      v_monthly := v_monthly + n;
    end if;
  end loop;
  return jsonb_build_object('weekly', v_weekly, 'monthly', v_monthly);
end;
$$;

-- The scheduler knows the new job.
alter table public.scheduled_jobs drop constraint scheduled_jobs_key_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_key_check
  check (key in ('timesheet_reminder', 'escalation_overdue', 'sprint_snapshot', 'retention', 'integration_sync', 'metrics_reports'));

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
    (p_org, 'retention', 1440, '{"outbox_days": 30, "notification_days": 90, "log_days": 90}'),
    (p_org, 'metrics_reports', 60, '{}')
  on conflict do nothing;
end;
$$;
select private.seed_automation_defaults(id) from public.organizations;

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
      when 'metrics_reports' then private.job_metrics_reports(j.organization_id)
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

-- ---------------------------------------------------------------------------
-- Sending: the tick claims pending runs, emails each recipient, and reports back.
-- A recipient already delivered to is not emailed again on a retry.
-- ---------------------------------------------------------------------------
create or replace function public.claim_pending_reports(p_limit integer)
returns table (id uuid, project_id uuid, organization_name text, project_code text, project_name text, kind text,
               period_start date, period_end date, recipients text[], delivered_to text[], payload jsonb)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select r.id from public.metric_report_runs r
     where r.status = 'pending' and r.attempts < 3 and (r.claimed_at is null or r.claimed_at < now() - interval '10 minutes')
     order by r.created_at limit greatest(1, least(p_limit, 50)) for update skip locked
  ), claimed as (
    update public.metric_report_runs r set attempts = r.attempts + 1, claimed_at = now() from due where r.id = due.id returning r.*
  )
  select c.id, c.project_id, o.name, p.code::text, p.name::text, c.kind, c.period_start, c.period_end, c.recipients, c.delivered_to, c.payload
    from claimed c
    join public.organizations o on o.id = c.organization_id
    join public.projects p on p.id = c.project_id;
$$;

create or replace function public.complete_report_run(p_id uuid, p_delivered text[], p_outcome text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.metric_report_runs;
  v_all text[];
begin
  select * into r from public.metric_report_runs where id = p_id and status = 'pending' for update;
  if not found then return; end if;
  select coalesce(array_agg(distinct x), '{}') into v_all from unnest(r.delivered_to || coalesce(p_delivered, '{}')) as x;
  update public.metric_report_runs
     set delivered_to = v_all,
         claimed_at = null,
         last_error = left(p_error, 500),
         status = case
                    when r.recipients <@ v_all then (case when p_outcome = 'simulated' then 'simulated' else 'sent' end)
                    when r.attempts >= 3 then 'failed'
                    else 'pending' end,
         sent_at = case when r.recipients <@ v_all then now() else null end
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.project_metric_entries enable row level security;
alter table public.project_report_settings enable row level security;
alter table public.metric_report_runs enable row level security;

grant select on public.project_metric_entries, public.project_report_settings, public.metric_report_runs to authenticated;
create policy project_metric_entries_select on public.project_metric_entries for select to authenticated
  using (public.can_read_project(project_id));
-- Recipient lists hold outside email addresses: only people who can publish for the project see them.
create policy project_report_settings_select on public.project_report_settings for select to authenticated
  using (public.can_act_on_project(project_id, 'project.change_status'));
create policy metric_report_runs_select on public.metric_report_runs for select to authenticated
  using (public.can_act_on_project(project_id, 'project.change_status'));

revoke execute on function
  public.can_enter_metrics(uuid),
  public.project_metrics(uuid, date, date),
  public.save_metric_entries(uuid, date, jsonb),
  public.save_report_settings(uuid, boolean, boolean, text[])
from public, anon;
grant execute on function
  public.can_enter_metrics(uuid),
  public.project_metrics(uuid, date, date),
  public.save_metric_entries(uuid, date, jsonb),
  public.save_report_settings(uuid, boolean, boolean, text[])
to authenticated;

revoke execute on function
  public.claim_pending_reports(integer),
  public.complete_report_run(uuid, text[], text, text)
from public, anon, authenticated;
grant execute on function
  public.claim_pending_reports(integer),
  public.complete_report_run(uuid, text[], text, text)
to service_role;
