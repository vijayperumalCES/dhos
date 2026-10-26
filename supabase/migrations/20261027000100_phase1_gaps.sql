-- Stride Phase 1 gap closure:
--   * custom roles (org.roles.manage) with audited permission changes
--   * confidential clients (client.confidential.read)
--   * invitation email tracking
--   * time zone validation for organization settings
--   * departments and reporting lines on memberships

-- ---------------------------------------------------------------------------
-- New permissions and role-template updates (existing organizations are backfilled)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('org.roles.manage',          'organization', 'Create, edit and delete custom roles and their permissions'),
  ('client.confidential.read',  'portfolio',    'View clients marked confidential (otherwise visible only to their account owner and project teams)');

update private.role_templates set permissions = array['org.settings.manage','org.members.read','org.members.manage','org.roles.manage','audit.read','team.read','team.manage'] where key = 'org_admin';
update private.role_templates set permissions = array['org.members.read','audit.read','client.read','client.confidential.read','client.manage','project.read_all','project.create','project.update','project.change_status','project.archive','project.members.manage','team.read','team.manage','dashboard.portfolio.view'] where key = 'delivery_head';
update private.role_templates set permissions = array['org.members.read','client.read','client.confidential.read','project.read_all','dashboard.portfolio.view'] where key = 'finance_manager';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.role_definitions r
join (values ('org_admin', 'org.roles.manage'),
             ('delivery_head', 'client.confidential.read'),
             ('finance_manager', 'client.confidential.read')) as p(role_key, permission_key)
  on p.role_key = r.key
where r.is_system
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Organization settings: reject unknown time zones at the database
-- ---------------------------------------------------------------------------
create or replace function private.validate_organization_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone: % is not a recognised IANA time zone', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger organization_settings_validate before insert or update of timezone on public.organization_settings
  for each row execute function private.validate_organization_settings();

-- ---------------------------------------------------------------------------
-- Custom roles
-- ---------------------------------------------------------------------------
alter table public.role_definitions
  add column updated_at timestamptz not null default now();

create trigger role_definitions_updated_at before update on public.role_definitions
  for each row execute function private.set_updated_at();
create trigger role_definitions_audit after insert or update or delete on public.role_definitions
  for each row execute function private.audit_row_change();

create or replace function private.assert_known_permissions(p_permissions text[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if cardinality(p_permissions) = 0 then
    raise exception 'permissions_required: a role needs at least one permission' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_permissions) k where k not in (select key from public.permissions)) then
    raise exception 'unknown_permission' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.write_role_permissions(p_role uuid, p_org uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text[];
  v_after text[] := (select array_agg(distinct k order by k) from unnest(p_permissions) k);
begin
  select coalesce(array_agg(permission_key order by permission_key), '{}') into v_before
  from public.role_permissions where role_id = p_role;

  delete from public.role_permissions where role_id = p_role and not (permission_key = any (v_after));
  insert into public.role_permissions (role_id, permission_key)
  select p_role, k from unnest(v_after) k
  on conflict do nothing;

  if v_before is distinct from v_after then
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes)
    values (
      p_org, auth.uid(), 'role_permissions.update', 'role_definitions', p_role,
      jsonb_build_object(
        'added',   to_jsonb(array(select unnest(v_after) except select unnest(v_before))),
        'removed', to_jsonb(array(select unnest(v_before) except select unnest(v_after)))
      )
    );
  end if;
end;
$$;

create or replace function public.create_role(
  p_org uuid, p_key text, p_name text, p_description text, p_permissions text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  if not public.has_permission(p_org, 'org.roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.assert_known_permissions(p_permissions);
  if exists (select 1 from private.role_templates where key = lower(btrim(p_key))) then
    raise exception 'reserved_role_key: that key is used by a system role' using errcode = 'P0001';
  end if;

  insert into public.role_definitions (organization_id, key, name, description, is_system)
  values (p_org, lower(btrim(p_key)), btrim(p_name), coalesce(btrim(p_description), ''), false)
  returning id into v_role;

  perform private.write_role_permissions(v_role, p_org, p_permissions);
  return v_role;
end;
$$;

create or replace function public.update_role(p_role uuid, p_name text, p_description text, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_system boolean;
begin
  select organization_id, is_system into v_org, v_system from public.role_definitions where id = p_role;
  if v_org is null or not public.has_permission(v_org, 'org.roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_system then
    raise exception 'system_role: system roles cannot be edited; create a custom role instead' using errcode = 'P0001';
  end if;
  perform private.assert_known_permissions(p_permissions);

  update public.role_definitions
     set name = btrim(p_name), description = coalesce(btrim(p_description), '')
   where id = p_role;
  perform private.write_role_permissions(p_role, v_org, p_permissions);
end;
$$;

create or replace function public.delete_role(p_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_system boolean;
begin
  select organization_id, is_system into v_org, v_system from public.role_definitions where id = p_role;
  if v_org is null or not public.has_permission(v_org, 'org.roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_system then
    raise exception 'system_role: system roles cannot be deleted' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membership_roles where role_id = p_role) then
    raise exception 'role_in_use: remove this role from all members before deleting it' using errcode = 'P0001';
  end if;
  delete from public.role_definitions where id = p_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confidential clients
-- ---------------------------------------------------------------------------
drop policy clients_select on public.clients;
drop policy clients_update on public.clients;

-- True when the caller is assigned to a project of this client: project manager, delivery owner,
-- creator or project member. Portfolio-wide project visibility alone does not count.
create or replace function private.is_assigned_to_client_project(p_client uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.client_id = p_client
      and (
        private.active_membership_id(p_org) in (p.project_manager_id, p.delivery_owner_id)
        or p.created_by = (select auth.uid())
        or exists (select 1 from public.project_memberships pm
                   where pm.project_id = p.id and pm.membership_id = private.active_membership_id(p_org))
      )
  );
$$;

-- Visible to holders of client.read when standard; when confidential, additionally requires
-- client.confidential.read, being the account owner, or being assigned to one of its projects.
create policy clients_select on public.clients for select to authenticated
  using (
    public.has_permission(organization_id, 'client.read')
    and (
      confidentiality = 'standard'
      or public.has_permission(organization_id, 'client.confidential.read')
      or account_owner_membership_id = private.active_membership_id(organization_id)
      or private.is_assigned_to_client_project(id, organization_id)
    )
  );

create policy clients_update on public.clients for update to authenticated
  using (
    public.has_permission(organization_id, 'client.manage')
    and (
      confidentiality = 'standard'
      or public.has_permission(organization_id, 'client.confidential.read')
      or account_owner_membership_id = private.active_membership_id(organization_id)
    )
  )
  with check (public.has_permission(organization_id, 'client.manage'));

-- ---------------------------------------------------------------------------
-- Invitation email tracking
-- ---------------------------------------------------------------------------
alter table public.organization_invitations
  add column email_sent_count integer not null default 0,
  add column email_last_sent_at timestamptz;

create or replace function public.record_invitation_email_sent(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_invitations where id = p_invitation and status = 'pending';
  if v_org is null or not public.has_permission(v_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.organization_invitations
     set email_sent_count = email_sent_count + 1, email_last_sent_at = now()
   where id = p_invitation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Departments and reporting lines
-- ---------------------------------------------------------------------------
create table public.departments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 2 and 120),
  code               text check (code is null or code ~ '^[A-Z0-9-]{2,20}$'),
  description        text check (description is null or char_length(description) <= 2000),
  head_membership_id uuid,
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz,
  unique (id, organization_id),
  foreign key (head_membership_id, organization_id)
    references public.organization_memberships (id, organization_id) on delete set null (head_membership_id)
);
create unique index departments_org_name_uq on public.departments (organization_id, lower(name)) where archived_at is null;
create unique index departments_org_code_uq on public.departments (organization_id, code) where code is not null;

create trigger departments_updated_at before update on public.departments
  for each row execute function private.set_updated_at();
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function private.audit_row_change();

alter table public.organization_memberships
  add column department_id uuid,
  add column manager_membership_id uuid,
  add constraint organization_memberships_not_own_manager check (manager_membership_id is null or manager_membership_id <> id),
  add constraint organization_memberships_department_fkey
    foreign key (department_id, organization_id) references public.departments (id, organization_id),
  add constraint organization_memberships_manager_fkey
    foreign key (manager_membership_id, organization_id)
    references public.organization_memberships (id, organization_id) on delete set null (manager_membership_id);
create index organization_memberships_manager_idx on public.organization_memberships (manager_membership_id);
create index organization_memberships_department_idx on public.organization_memberships (department_id);

-- Reporting lines must form a tree: walking up from the new manager must never reach this member.
create or replace function private.prevent_reporting_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.manager_membership_id is not null and exists (
    with recursive chain(id, depth) as (
      select new.manager_membership_id, 1
      union all
      select m.manager_membership_id, c.depth + 1
      from chain c
      join public.organization_memberships m on m.id = c.id
      where m.manager_membership_id is not null and c.depth < 100
    )
    select 1 from chain where id = new.id
  ) then
    raise exception 'reporting_cycle: that change would make someone report to themselves' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger organization_memberships_reporting_cycle before update of manager_membership_id on public.organization_memberships
  for each row execute function private.prevent_reporting_cycle();

-- ---------------------------------------------------------------------------
-- RLS and privileges for the new objects
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;

grant select on public.departments to authenticated;
grant insert (organization_id, name, code, description, head_membership_id) on public.departments to authenticated;
grant update (name, code, description, head_membership_id, archived_at) on public.departments to authenticated;

create policy departments_select on public.departments for select to authenticated
  using (public.has_permission(organization_id, 'org.members.read'));
create policy departments_insert on public.departments for insert to authenticated
  with check (public.has_permission(organization_id, 'org.members.manage'));
create policy departments_update on public.departments for update to authenticated
  using (public.has_permission(organization_id, 'org.members.manage'))
  with check (public.has_permission(organization_id, 'org.members.manage'));

grant update (job_title, department_id, manager_membership_id) on public.organization_memberships to authenticated;

revoke execute on function
  public.create_role(uuid, text, text, text, text[]),
  public.update_role(uuid, text, text, text[]),
  public.delete_role(uuid),
  public.record_invitation_email_sent(uuid)
from public, anon;
grant execute on function
  public.create_role(uuid, text, text, text, text[]),
  public.update_role(uuid, text, text, text[]),
  public.delete_role(uuid),
  public.record_invitation_email_sent(uuid)
to authenticated;
