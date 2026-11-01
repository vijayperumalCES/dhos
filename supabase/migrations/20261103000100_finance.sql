-- Stride Phase 5 — Financial and portfolio intelligence: rate cards, project budgets with approved
-- baselines, an append-only actuals ledger, non-labour forecasts, contract values, revenue
-- schedules and the project financial report. See docs/DECISIONS/ADR-0010-finance-model.md.
--
-- Access: finance data has its own permissions (finance.read / finance.manage / finance.approve)
-- and never rides on project membership alone. Rates and contract values are readable only through
-- their own policies; the report functions return project totals, never a person's rate. Every
-- finance read also requires visibility of the project's client (confidential clients stay hidden).
-- Single currency: organization_settings.currency_code.

-- ---------------------------------------------------------------------------
-- Permissions and role templates (existing organizations are backfilled)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('finance.read',    'finance', 'View budgets, actuals, forecasts, variance and margin on visible projects (never individual rates)'),
  ('finance.manage',  'finance', 'Manage rate cards and member rates, draft budgets, record costs, forecasts, contract values and revenue'),
  ('finance.approve', 'finance', 'Approve a project budget as its baseline (never your own draft)');

update private.role_templates set permissions = permissions || array['finance.read','finance.approve'] where key = 'delivery_head';
update private.role_templates set permissions = permissions || array['finance.read','finance.manage','finance.approve'] where key = 'finance_manager';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.role_definitions r
join private.role_templates t on t.key = r.key
cross join lateral unnest(t.permissions) as p(perm)
where r.is_system and p.perm like 'finance.%'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- A finance permission on a project the caller can read, for a project whose client the caller can
-- see (internal projects have no client).
create or replace function private.can_see_project_finance(p_project uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_act_on_project(p.id, p_permission)
       and (p.client_id is null or private.can_see_client(p.client_id))
    from public.projects p where p.id = p_project
  ), false);
$$;

-- Audit trigger for money: records who changed what and when, with the amounts redacted so the
-- audit log (readable with audit.read) can't be used to read rates or values.
create or replace function private.audit_finance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_hidden jsonb := '"redacted"'::jsonb;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || case when v_key = any (tg_argv)
          then jsonb_build_object(v_key, jsonb_build_object('from', v_hidden, 'to', v_hidden))
          else jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)) end;
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  else
    v_changes := coalesce(v_new, v_old) - 'updated_at' - 'created_at';
    for v_key in select unnest(tg_argv) loop
      if v_changes ? v_key then
        v_changes := v_changes || jsonb_build_object(v_key, v_hidden);
      end if;
    end loop;
  end if;

  if not exists (select 1 from public.organizations o where o.id = (v_row ->> 'organization_id')::uuid) then
    return null;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes)
  values ((v_row ->> 'organization_id')::uuid, auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name,
          case when v_row ? 'id' then (v_row ->> 'id')::uuid else null end, v_changes);
  return null;
end;
$$;

create type public.cost_category as enum ('labour', 'software', 'infrastructure', 'travel', 'subcontractor', 'other');

-- ---------------------------------------------------------------------------
-- Rates: a rate card per role title and an optional rate per person. Lines are effective-dated and
-- never edited; a change is a new line with a later date, so past actuals keep the rate they earned.
-- ---------------------------------------------------------------------------
create table public.rate_card_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role_title      text not null check (char_length(btrim(role_title)) between 2 and 120),
  cost_rate       numeric(10,2) not null check (cost_rate >= 0 and cost_rate < 100000),
  bill_rate       numeric(10,2) check (bill_rate is null or (bill_rate >= 0 and bill_rate < 100000)),
  effective_from  date not null,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index rate_card_lines_role_date_idx on public.rate_card_lines (organization_id, lower(btrim(role_title)), effective_from);
comment on column public.rate_card_lines.cost_rate is 'Hourly cost of one person in this role to the organization, in the organization currency.';
comment on column public.rate_card_lines.bill_rate is 'Hourly price charged to clients. Informational until time-and-materials billing arrives.';

create table public.member_cost_rates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id   uuid not null,
  cost_rate       numeric(10,2) not null check (cost_rate >= 0 and cost_rate < 100000),
  effective_from  date not null,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (membership_id, effective_from),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade
);
comment on table public.member_cost_rates is 'Overrides the rate card for one person. Finance-only; never joined into a report that names a person.';

create trigger rate_card_lines_audit after insert or delete on public.rate_card_lines
  for each row execute function private.audit_finance_change('cost_rate', 'bill_rate');
create trigger member_cost_rates_audit after insert or delete on public.member_cost_rates
  for each row execute function private.audit_finance_change('cost_rate');

-- The cost rate that applies to a member on a date: their own rate if they have one, else the rate
-- card line for their job title. Null means "unrated" and is reported as such, never as zero.
create or replace function private.cost_rate_for(p_membership uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.cost_rate from public.member_cost_rates r
      where r.membership_id = p_membership and r.effective_from <= p_date
      order by r.effective_from desc limit 1),
    (select l.cost_rate from public.rate_card_lines l
      join public.organization_memberships m on m.organization_id = l.organization_id
       and lower(btrim(m.job_title)) = lower(btrim(l.role_title))
      where m.id = p_membership and l.effective_from <= p_date
      order by l.effective_from desc limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- Budgets: versioned; one approved version is the baseline, a later approval supersedes it.
-- ---------------------------------------------------------------------------
create type public.budget_status as enum ('draft', 'approved', 'superseded');

create table public.project_budgets (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null,
  project_id                 uuid not null,
  version                    integer not null,
  name                       text not null check (char_length(btrim(name)) between 2 and 120),
  status                     public.budget_status not null default 'draft',
  notes                      text check (notes is null or char_length(notes) <= 2000),
  drafted_by_membership_id   uuid,
  approved_by_membership_id  uuid,
  approved_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (id, organization_id),
  unique (project_id, version),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (drafted_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (drafted_by_membership_id),
  foreign key (approved_by_membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete set null (approved_by_membership_id)
);
create unique index project_budgets_one_draft_idx on public.project_budgets (project_id) where status = 'draft';
create unique index project_budgets_one_baseline_idx on public.project_budgets (project_id) where status = 'approved';

create table public.budget_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  budget_id       uuid not null,
  category        public.cost_category not null,
  amount          numeric(14,2) not null check (amount >= 0 and amount < 1e12),
  note            text check (note is null or char_length(note) <= 500),
  unique (budget_id, category),
  foreign key (budget_id, organization_id) references public.project_budgets (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index budget_lines_project_idx on public.budget_lines (project_id);

create or replace function private.project_budgets_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := coalesce((select max(b.version) from public.project_budgets b where b.project_id = new.project_id), 0) + 1;
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by_membership_id := null;
    new.drafted_by_membership_id := coalesce(new.drafted_by_membership_id, private.active_membership_id(new.organization_id));
    return new;
  end if;
  -- Once approved the content is frozen; only the RPCs move the status.
  if old.status <> 'draft' and (new.name, new.notes, new.version, new.project_id) is distinct from (old.name, old.notes, old.version, old.project_id) then
    raise exception 'immutable: an approved budget can''t be edited; start a revision instead' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger project_budgets_before_write before insert or update on public.project_budgets
  for each row execute function private.project_budgets_before_write();
create trigger project_budgets_updated_at before update on public.project_budgets
  for each row execute function private.set_updated_at();
create trigger project_budgets_audit after insert or update or delete on public.project_budgets
  for each row execute function private.audit_row_change();

create or replace function private.budget_lines_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.budget_status;
begin
  select b.status into v_status from public.project_budgets b where b.id = coalesce(new.budget_id, old.budget_id);
  -- A cascade from deleting the budget or project finds no budget row and is allowed.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'immutable: an approved budget can''t be edited; start a revision instead' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger budget_lines_before_write before insert or update or delete on public.budget_lines
  for each row execute function private.budget_lines_before_write();
create trigger budget_lines_audit after insert or update or delete on public.budget_lines
  for each row execute function private.audit_finance_change('amount');

-- ---------------------------------------------------------------------------
-- Actuals ledger (facts) and non-labour forecasts (opinions)
-- ---------------------------------------------------------------------------
-- Labour actuals are not stored: they are approved timesheet hours × the rate that applied.
create table public.cost_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  entry_date      date not null,
  category        public.cost_category not null check (category <> 'labour'),
  amount          numeric(14,2) not null check (amount <> 0 and abs(amount) < 1e12),
  description     text not null check (char_length(btrim(description)) between 2 and 300),
  vendor          text check (vendor is null or char_length(vendor) <= 120),
  reference       text check (reference is null or char_length(reference) <= 80),
  reverses_id     uuid references public.cost_entries (id),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create unique index cost_entries_reverses_idx on public.cost_entries (reverses_id) where reverses_id is not null;
create index cost_entries_project_idx on public.cost_entries (project_id, entry_date);
comment on table public.cost_entries is 'Append-only. A mistake is corrected with reverse_cost_entry(), which writes a negative entry that points back.';

create or replace function private.cost_entries_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_date > private.org_today(new.organization_id) then
    raise exception 'future_date: costs are recorded when they are incurred, not in advance (use a forecast)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger cost_entries_before_insert before insert on public.cost_entries
  for each row execute function private.cost_entries_before_insert();
create trigger cost_entries_audit after insert on public.cost_entries
  for each row execute function private.audit_finance_change('amount');

create table public.forecast_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  category        public.cost_category not null check (category <> 'labour'),
  period          date not null check (extract(day from period) = 1),
  amount          numeric(14,2) not null check (amount >= 0 and amount < 1e12),
  note            text check (note is null or char_length(note) <= 300),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, category, period),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
comment on table public.forecast_entries is 'Expected non-labour spend per month. Labour is forecast from dated resource allocations. A forecast is an opinion and can be edited; the ledger cannot.';
create trigger forecast_entries_updated_at before update on public.forecast_entries
  for each row execute function private.set_updated_at();
create trigger forecast_entries_audit after insert or update or delete on public.forecast_entries
  for each row execute function private.audit_finance_change('amount');

-- ---------------------------------------------------------------------------
-- Contract values and revenue schedule
-- ---------------------------------------------------------------------------
alter table public.client_contracts add constraint client_contracts_id_org_key unique (id, organization_id);

create type public.billing_model as enum ('fixed_price', 'time_and_materials', 'retainer');

create table public.contract_values (
  contract_id     uuid primary key,
  organization_id uuid not null,
  total_value     numeric(14,2) not null check (total_value >= 0 and total_value < 1e12),
  billing_model   public.billing_model not null default 'fixed_price',
  notes           text check (notes is null or char_length(notes) <= 1000),
  updated_by      uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  foreign key (contract_id, organization_id) references public.client_contracts (id, organization_id) on delete cascade
);
comment on table public.contract_values is 'Kept apart from client_contracts so the amount can have a finance-only policy (a column can''t have its own row security).';
create trigger contract_values_updated_at before update on public.contract_values
  for each row execute function private.set_updated_at();
create trigger contract_values_audit after insert or update or delete on public.contract_values
  for each row execute function private.audit_finance_change('total_value');

create type public.revenue_status as enum ('planned', 'recognised');

create table public.revenue_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id      uuid not null,
  contract_id     uuid,
  description     text not null check (char_length(btrim(description)) between 2 and 200),
  planned_date    date not null,
  amount          numeric(14,2) not null check (amount > 0 and amount < 1e12),
  status          public.revenue_status not null default 'planned',
  recognised_on   date,
  recognised_by   uuid references auth.users (id) on delete set null,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'recognised') = (recognised_on is not null)),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (contract_id, organization_id) references public.client_contracts (id, organization_id) on delete set null (contract_id)
);
create index revenue_lines_project_idx on public.revenue_lines (project_id, planned_date);
comment on table public.revenue_lines is 'Planned lines are the revenue forecast; a recognised line is a fact and can no longer be changed.';

create or replace function private.revenue_lines_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'planned';
    new.recognised_on := null;
    new.recognised_by := null;
    return new;
  end if;
  if old.status = 'recognised' then
    raise exception 'immutable: recognised revenue can''t be changed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger revenue_lines_before_write before insert or update on public.revenue_lines
  for each row execute function private.revenue_lines_before_write();
create trigger revenue_lines_updated_at before update on public.revenue_lines
  for each row execute function private.set_updated_at();
create trigger revenue_lines_audit after insert or update or delete on public.revenue_lines
  for each row execute function private.audit_finance_change('amount');

-- ---------------------------------------------------------------------------
-- RPCs that move state
-- ---------------------------------------------------------------------------
-- Starts a draft budget, copying the baseline's lines when there is one (a revision).
create or replace function public.start_budget(p_project uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_base uuid;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not private.can_see_project_finance(p_project, 'finance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.project_budgets where project_id = p_project and status = 'draft') then
    raise exception 'draft_exists: finish or discard the current draft first' using errcode = 'P0001';
  end if;
  insert into public.project_budgets (organization_id, project_id, name) values (v_org, p_project, p_name)
  returning id into v_id;
  select b.id into v_base from public.project_budgets b where b.project_id = p_project and b.status = 'approved';
  if v_base is not null then
    insert into public.budget_lines (organization_id, project_id, budget_id, category, amount, note)
    select organization_id, project_id, v_id, category, amount, note from public.budget_lines where budget_id = v_base;
  end if;
  return v_id;
end;
$$;

-- Makes a draft the baseline. The previous baseline is kept as superseded. Someone other than the
-- drafter approves, and the budget needs at least one non-zero line.
create or replace function public.approve_budget(p_budget uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.project_budgets;
  v_me uuid;
begin
  select * into b from public.project_budgets where id = p_budget;
  if not found or not private.can_see_project_finance(b.project_id, 'finance.approve') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_me := private.active_membership_id(b.organization_id);
  if b.status <> 'draft' then
    raise exception 'budget_state: only a draft budget can be approved' using errcode = 'P0001';
  end if;
  if b.drafted_by_membership_id is not distinct from v_me then
    raise exception 'self_review: someone other than the drafter must approve this budget' using errcode = 'P0001';
  end if;
  if coalesce((select sum(l.amount) from public.budget_lines l where l.budget_id = b.id), 0) <= 0 then
    raise exception 'incomplete: add at least one budget line with an amount' using errcode = 'P0001';
  end if;
  update public.project_budgets set status = 'superseded' where project_id = b.project_id and status = 'approved';
  update public.project_budgets set status = 'approved', approved_by_membership_id = v_me, approved_at = now() where id = b.id;
end;
$$;

-- Corrects a ledger entry by writing the opposite entry that points back at it.
create or replace function public.reverse_cost_entry(p_entry uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.cost_entries;
  v_id uuid;
begin
  select * into e from public.cost_entries where id = p_entry;
  if not found or not private.can_see_project_finance(e.project_id, 'finance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required: say why this entry is reversed' using errcode = 'P0001';
  end if;
  if e.reverses_id is not null or exists (select 1 from public.cost_entries r where r.reverses_id = e.id) then
    raise exception 'already_reversed: this entry is a reversal or has been reversed already' using errcode = 'P0001';
  end if;
  insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description, vendor, reference, reverses_id)
  values (e.organization_id, e.project_id, private.org_today(e.organization_id), e.category, -e.amount,
          left('Reversal: ' || btrim(p_reason), 300), e.vendor, e.reference, e.id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.recognise_revenue(p_line uuid, p_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.revenue_lines;
begin
  select * into l from public.revenue_lines where id = p_line;
  if not found or not private.can_see_project_finance(l.project_id, 'finance.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if l.status <> 'planned' then
    raise exception 'revenue_state: this revenue is already recognised' using errcode = 'P0001';
  end if;
  if p_on is null or p_on > private.org_today(l.organization_id) then
    raise exception 'future_date: revenue can only be recognised on or before today' using errcode = 'P0001';
  end if;
  update public.revenue_lines set status = 'recognised', recognised_on = p_on, recognised_by = auth.uid() where id = l.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- One row per project the caller may see finances for. Facts (approved labour hours priced at the
-- rate in force on the day, the ledger, recognised revenue) are kept apart from forecasts (dated
-- allocations from today, monthly non-labour forecasts from this month, planned revenue). Hours with
-- no rate are counted, not priced, so a gap in the rate card shows up instead of reading as zero.
create or replace function public.project_financials(p_org uuid, p_project uuid default null)
returns table (
  project_id uuid,
  budget_version integer,
  baseline_approved_at timestamptz,
  budget_total numeric,
  budget_labour numeric,
  labour_actual numeric,
  other_actual numeric,
  approved_hours numeric,
  unrated_hours numeric,
  labour_forecast numeric,
  unrated_forecast_hours numeric,
  other_forecast numeric,
  revenue_recognised numeric,
  revenue_planned numeric,
  has_revenue boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.org_today(p_org);
begin
  if not public.has_permission(p_org, 'finance.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with scope as (
    select p.id from public.projects p
    where p.organization_id = p_org and p.archived_at is null
      and (p_project is null or p.id = p_project)
      and private.can_see_project_finance(p.id, 'finance.read')
  ),
  base as (
    select b.project_id, b.version, b.approved_at,
           coalesce(sum(l.amount), 0) as total,
           coalesce(sum(l.amount) filter (where l.category = 'labour'), 0) as labour
    from public.project_budgets b
    left join public.budget_lines l on l.budget_id = b.id
    where b.status = 'approved' and b.project_id in (select id from scope)
    group by b.project_id, b.version, b.approved_at
  ),
  worked as (
    select e.project_id,
           sum(e.hours) as hours,
           sum(e.hours * r.rate) filter (where r.rate is not null) as cost,
           coalesce(sum(e.hours) filter (where r.rate is null), 0) as unrated
    from public.time_entries e
    join public.timesheets t on t.id = e.timesheet_id and t.status = 'approved'
    cross join lateral (select private.cost_rate_for(t.membership_id, e.entry_date) as rate) r
    where e.category = 'delivery' and e.project_id in (select id from scope)
    group by e.project_id
  ),
  planned as (
    select a.project_id,
           sum(d.hours * d.rate) filter (where d.rate is not null) as cost,
           coalesce(sum(d.hours) filter (where d.rate is null), 0) as unrated
    from public.resource_allocations a
    cross join lateral (
      select (select c.hours_per_day from public.work_calendars c where c.id = private.member_calendar(a.membership_id)) * a.percent / 100.0 as hours,
             private.cost_rate_for(a.membership_id, wd.day) as rate
      from private.member_working_days(a.membership_id, greatest(a.start_date, v_today), a.end_date) as wd(day)
    ) d
    where a.end_date >= v_today and a.project_id in (select id from scope)
    group by a.project_id
  ),
  ledger as (
    select c.project_id, sum(c.amount) as total
    from public.cost_entries c where c.project_id in (select id from scope) group by c.project_id
  ),
  outlook as (
    select f.project_id, sum(f.amount) as total
    from public.forecast_entries f
    where f.project_id in (select id from scope) and f.period >= date_trunc('month', v_today)::date
    group by f.project_id
  ),
  revenue as (
    select r.project_id,
           coalesce(sum(r.amount) filter (where r.status = 'recognised'), 0) as done,
           coalesce(sum(r.amount) filter (where r.status = 'planned'), 0) as remaining,
           count(*) > 0 as any_lines
    from public.revenue_lines r where r.project_id in (select id from scope) group by r.project_id
  )
  select s.id,
         base.version, base.approved_at, base.total, base.labour,
         coalesce(worked.cost, 0)::numeric, coalesce(ledger.total, 0)::numeric,
         coalesce(worked.hours, 0)::numeric, worked.unrated,
         coalesce(planned.cost, 0)::numeric, planned.unrated,
         coalesce(outlook.total, 0)::numeric,
         coalesce(revenue.done, 0), coalesce(revenue.remaining, 0), coalesce(revenue.any_lines, false)
  from scope s
  left join base on base.project_id = s.id
  left join worked on worked.project_id = s.id
  left join planned on planned.project_id = s.id
  left join ledger on ledger.project_id = s.id
  left join outlook on outlook.project_id = s.id
  left join revenue on revenue.project_id = s.id;
end;
$$;

-- Twelve months of actuals for one project, for the burn chart.
create or replace function public.project_monthly_actuals(p_project uuid)
returns table (month date, labour numeric, other numeric, hours numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_first date;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not private.can_see_project_finance(p_project, 'finance.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_first := (date_trunc('month', private.org_today(v_org)) - interval '11 months')::date;
  return query
  select m.d::date,
         coalesce((select sum(e.hours * coalesce(private.cost_rate_for(t.membership_id, e.entry_date), 0))
                   from public.time_entries e join public.timesheets t on t.id = e.timesheet_id and t.status = 'approved'
                   where e.project_id = p_project and e.category = 'delivery'
                     and date_trunc('month', e.entry_date) = m.d), 0)::numeric,
         coalesce((select sum(c.amount) from public.cost_entries c
                   where c.project_id = p_project and date_trunc('month', c.entry_date) = m.d), 0)::numeric,
         coalesce((select sum(e.hours) from public.time_entries e join public.timesheets t on t.id = e.timesheet_id and t.status = 'approved'
                   where e.project_id = p_project and e.category = 'delivery'
                     and date_trunc('month', e.entry_date) = m.d), 0)::numeric
  from generate_series(v_first, v_first + interval '11 months', interval '1 month') m(d)
  order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.rate_card_lines   enable row level security;
alter table public.member_cost_rates enable row level security;
alter table public.project_budgets   enable row level security;
alter table public.budget_lines      enable row level security;
alter table public.cost_entries      enable row level security;
alter table public.forecast_entries  enable row level security;
alter table public.contract_values   enable row level security;
alter table public.revenue_lines     enable row level security;

-- Rates: finance.manage only, for both reading and writing. Lines are never edited.
grant select, delete on public.rate_card_lines to authenticated;
grant insert (organization_id, role_title, cost_rate, bill_rate, effective_from) on public.rate_card_lines to authenticated;
create policy rate_card_lines_select on public.rate_card_lines for select to authenticated
  using (public.has_permission(organization_id, 'finance.manage'));
create policy rate_card_lines_insert on public.rate_card_lines for insert to authenticated
  with check (public.has_permission(organization_id, 'finance.manage'));
create policy rate_card_lines_delete on public.rate_card_lines for delete to authenticated
  using (public.has_permission(organization_id, 'finance.manage') and effective_from > private.org_today(organization_id));

grant select, delete on public.member_cost_rates to authenticated;
grant insert (organization_id, membership_id, cost_rate, effective_from) on public.member_cost_rates to authenticated;
create policy member_cost_rates_select on public.member_cost_rates for select to authenticated
  using (public.has_permission(organization_id, 'finance.manage'));
create policy member_cost_rates_insert on public.member_cost_rates for insert to authenticated
  with check (public.has_permission(organization_id, 'finance.manage'));
create policy member_cost_rates_delete on public.member_cost_rates for delete to authenticated
  using (public.has_permission(organization_id, 'finance.manage') and effective_from > private.org_today(organization_id));

-- Budgets: drafts through the RPC start_budget; lines editable while the budget is a draft.
grant select on public.project_budgets to authenticated;
grant update (name, notes) on public.project_budgets to authenticated;
grant delete on public.project_budgets to authenticated;
create policy project_budgets_select on public.project_budgets for select to authenticated
  using (private.can_see_project_finance(project_id, 'finance.read'));
create policy project_budgets_update on public.project_budgets for update to authenticated
  using (status = 'draft' and private.can_see_project_finance(project_id, 'finance.manage'))
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy project_budgets_delete on public.project_budgets for delete to authenticated
  using (status = 'draft' and private.can_see_project_finance(project_id, 'finance.manage'));

grant select, delete on public.budget_lines to authenticated;
grant insert (organization_id, project_id, budget_id, category, amount, note) on public.budget_lines to authenticated;
grant update (amount, note) on public.budget_lines to authenticated;
create policy budget_lines_select on public.budget_lines for select to authenticated
  using (private.can_see_project_finance(project_id, 'finance.read'));
create policy budget_lines_insert on public.budget_lines for insert to authenticated
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy budget_lines_update on public.budget_lines for update to authenticated
  using (private.can_see_project_finance(project_id, 'finance.manage'))
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy budget_lines_delete on public.budget_lines for delete to authenticated
  using (private.can_see_project_finance(project_id, 'finance.manage'));

-- Ledger: append-only (no update or delete grant); forecasts: editable.
grant select on public.cost_entries to authenticated;
grant insert (organization_id, project_id, entry_date, category, amount, description, vendor, reference) on public.cost_entries to authenticated;
create policy cost_entries_select on public.cost_entries for select to authenticated
  using (private.can_see_project_finance(project_id, 'finance.read'));
create policy cost_entries_insert on public.cost_entries for insert to authenticated
  with check (private.can_see_project_finance(project_id, 'finance.manage'));

grant select, delete on public.forecast_entries to authenticated;
grant insert (organization_id, project_id, category, period, amount, note) on public.forecast_entries to authenticated;
grant update (amount, note) on public.forecast_entries to authenticated;
create policy forecast_entries_select on public.forecast_entries for select to authenticated
  using (private.can_see_project_finance(project_id, 'finance.read'));
create policy forecast_entries_insert on public.forecast_entries for insert to authenticated
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy forecast_entries_update on public.forecast_entries for update to authenticated
  using (private.can_see_project_finance(project_id, 'finance.manage'))
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy forecast_entries_delete on public.forecast_entries for delete to authenticated
  using (private.can_see_project_finance(project_id, 'finance.manage'));

-- Contract values follow client visibility; reading needs finance.read and writing finance.manage. Finance
-- doesn't need client.manage to price a contract it can see.
grant select on public.contract_values to authenticated;
grant insert (contract_id, organization_id, total_value, billing_model, notes) on public.contract_values to authenticated;
grant update (total_value, billing_model, notes) on public.contract_values to authenticated;
grant delete on public.contract_values to authenticated;
create policy contract_values_select on public.contract_values for select to authenticated
  using (public.has_permission(organization_id, 'finance.read')
         and exists (select 1 from public.client_contracts c where c.id = contract_id and private.can_see_client(c.client_id)));
create policy contract_values_insert on public.contract_values for insert to authenticated
  with check (public.has_permission(organization_id, 'finance.manage')
              and exists (select 1 from public.client_contracts c where c.id = contract_id and private.can_see_client(c.client_id)));
create policy contract_values_update on public.contract_values for update to authenticated
  using (public.has_permission(organization_id, 'finance.manage')
         and exists (select 1 from public.client_contracts c where c.id = contract_id and private.can_see_client(c.client_id)))
  with check (public.has_permission(organization_id, 'finance.manage'));
create policy contract_values_delete on public.contract_values for delete to authenticated
  using (public.has_permission(organization_id, 'finance.manage')
         and exists (select 1 from public.client_contracts c where c.id = contract_id and private.can_see_client(c.client_id)));

grant select, delete on public.revenue_lines to authenticated;
grant insert (organization_id, project_id, contract_id, description, planned_date, amount) on public.revenue_lines to authenticated;
grant update (contract_id, description, planned_date, amount) on public.revenue_lines to authenticated;
create policy revenue_lines_select on public.revenue_lines for select to authenticated
  using (private.can_see_project_finance(project_id, 'finance.read'));
create policy revenue_lines_insert on public.revenue_lines for insert to authenticated
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy revenue_lines_update on public.revenue_lines for update to authenticated
  using (status = 'planned' and private.can_see_project_finance(project_id, 'finance.manage'))
  with check (private.can_see_project_finance(project_id, 'finance.manage'));
create policy revenue_lines_delete on public.revenue_lines for delete to authenticated
  using (status = 'planned' and private.can_see_project_finance(project_id, 'finance.manage'));

revoke execute on function
  public.start_budget(uuid, text),
  public.approve_budget(uuid),
  public.reverse_cost_entry(uuid, text),
  public.recognise_revenue(uuid, date),
  public.project_financials(uuid, uuid),
  public.project_monthly_actuals(uuid)
from public, anon;
grant execute on function
  public.start_budget(uuid, text),
  public.approve_budget(uuid),
  public.reverse_cost_entry(uuid, text),
  public.recognise_revenue(uuid, date),
  public.project_financials(uuid, uuid),
  public.project_monthly_actuals(uuid)
to authenticated;
