-- DHOS Phase 1 — Foundation: tenancy, identity, RBAC catalogue, audit log.
-- Conventions (see docs/DATABASE.md):
--   * UUID primary keys, timestamptz audit columns, organization_id on every tenant-owned row.
--   * Composite (id, organization_id) uniques so child rows can FK on both and can never
--     reference a parent in another tenant.
--   * Privileges are explicit: nothing is granted to anon; authenticated gets only what each
--     table declares. RLS is enabled on every table.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- New objects created by the migration role get no implicit API privileges.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.membership_status as enum ('active', 'suspended');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  slug        extensions.citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46})[a-z0-9]$'),
  is_demo     boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
comment on column public.organizations.is_demo is 'True for seeded demonstration tenants. The UI labels all data in such tenants as demo data.';

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.organization_settings (
  organization_id         uuid primary key references public.organizations (id) on delete cascade,
  timezone                text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  currency_code           char(3) not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  week_start              smallint not null default 1 check (week_start between 0 and 6),
  health_stale_after_days integer not null default 14 check (health_stale_after_days between 1 and 90),
  updated_at              timestamptz not null default now()
);
comment on column public.organization_settings.health_stale_after_days is 'A project health rating older than this many days is reported as stale on the dashboard.';

create trigger organization_settings_updated_at before update on public.organization_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- User profiles (1:1 with auth.users, created by trigger)
-- ---------------------------------------------------------------------------
create table public.user_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        extensions.citext not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'user'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          public.membership_status not null default 'active',
  job_title       text check (job_title is null or char_length(job_title) <= 120),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);
create index organization_memberships_user_idx on public.organization_memberships (user_id) where status = 'active';

create trigger organization_memberships_updated_at before update on public.organization_memberships
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RBAC: global permission catalogue, per-organization roles
-- ---------------------------------------------------------------------------
create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  category    text not null,
  description text not null
);

create table public.role_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key             text not null check (key ~ '^[a-z][a-z_]{1,48}$'),
  name            text not null,
  description     text not null default '',
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);

create table public.role_permissions (
  role_id        uuid not null references public.role_definitions (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.membership_roles (
  organization_id uuid not null,
  membership_id   uuid not null,
  role_id         uuid not null,
  granted_by      uuid references auth.users (id) on delete set null,
  granted_at      timestamptz not null default now(),
  primary key (membership_id, role_id),
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (role_id, organization_id) references public.role_definitions (id, organization_id) on delete cascade
);
create index membership_roles_role_idx on public.membership_roles (role_id);

-- ---------------------------------------------------------------------------
-- Invitations (accepted in-app on sign-in; no email is sent in Phase 1)
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_keys       text[] not null check (cardinality(role_keys) between 1 and 10),
  status          public.invitation_status not null default 'pending',
  invited_by      uuid references auth.users (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '14 days',
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz
);
create unique index organization_invitations_pending_uq
  on public.organization_invitations (organization_id, email) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$'),
  entity_type     text not null,
  entity_id       uuid,
  changes         jsonb not null default '{}'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Deleting an organization cascades to its audit rows; that is the only permitted removal
  -- (tenant offboarding under the retention policy). Direct edits are never allowed.
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations o where o.id = old.organization_id) then
    return old;
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_mutation();

-- Generic row-change audit trigger. Records changed columns only, never secrets.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
begin
  v_org := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
                else (v_row ->> 'organization_id')::uuid end;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at') and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'updated_at' - 'created_at';
  else
    v_changes := v_old - 'updated_at' - 'created_at';
  end if;

  -- A delete that cascades from an organization delete has nowhere to write.
  if not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes, metadata)
  values (
    v_org,
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid
         when v_row ? 'membership_id' then (v_row ->> 'membership_id')::uuid
         else null end,
    v_changes,
    jsonb_strip_nulls(jsonb_build_object('reason', nullif(current_setting('dhos.change_reason', true), '')))
  );
  return null;
end;
$$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function private.audit_row_change();
create trigger organization_settings_audit after insert or update on public.organization_settings
  for each row execute function private.audit_row_change();
create trigger organization_memberships_audit after insert or update or delete on public.organization_memberships
  for each row execute function private.audit_row_change();
create trigger membership_roles_audit after insert or delete on public.membership_roles
  for each row execute function private.audit_row_change();
create trigger organization_invitations_audit after insert or update on public.organization_invitations
  for each row execute function private.audit_row_change();
