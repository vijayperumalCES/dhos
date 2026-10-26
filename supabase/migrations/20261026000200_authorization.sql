-- DHOS Phase 1 — Authorization: permission catalogue, system role templates, helper
-- functions used by RLS, organization bootstrap and membership RPCs.
-- The authoritative human-readable matrix lives in docs/AUTHORIZATION.md; keep them in sync
-- (tests/unit/authorization-matrix.test.ts checks the TypeScript mirror).

-- ---------------------------------------------------------------------------
-- Permission catalogue (Phase 1 scope only; later phases append keys)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('org.settings.manage',      'organization', 'Edit organization name, time zone, currency and delivery thresholds'),
  ('org.members.read',         'organization', 'View the internal member directory (name, email, job title, roles)'),
  ('org.members.manage',       'organization', 'Invite members, suspend or reactivate memberships, assign roles'),
  ('audit.read',               'organization', 'View the organization audit log'),
  ('client.read',              'portfolio',    'View client records'),
  ('client.manage',            'portfolio',    'Create, edit and archive client records'),
  ('project.read_all',         'portfolio',    'View every project in the organization'),
  ('project.read_assigned',    'portfolio',    'View projects the user manages, owns, created or is a member of'),
  ('project.create',           'portfolio',    'Create projects'),
  ('project.update',           'portfolio',    'Edit details of projects the user can view'),
  ('project.change_status',    'portfolio',    'Move visible projects through the lifecycle and set health'),
  ('project.archive',          'portfolio',    'Archive and restore visible projects'),
  ('project.members.manage',   'portfolio',    'Add and remove members on visible projects'),
  ('team.read',                'people',       'View teams and team membership'),
  ('team.manage',              'people',       'Create, edit and archive teams; manage team membership'),
  ('dashboard.portfolio.view', 'dashboard',    'View the Delivery Command Center for projects the user can see');

-- ---------------------------------------------------------------------------
-- System role templates. Copied into each organization on creation so that tenants can
-- later customise their own roles without affecting others.
-- ---------------------------------------------------------------------------
create table private.role_templates (
  key         text primary key,
  name        text not null,
  description text not null,
  sort_order  smallint not null,
  permissions text[] not null
);

insert into private.role_templates (key, name, description, sort_order, permissions) values
  ('org_admin', 'Organization Administrator', 'Configures the organization, members, roles and teams. Does not automatically see project data.', 10,
     array['org.settings.manage','org.members.read','org.members.manage','audit.read','team.read','team.manage']),
  ('delivery_head', 'Delivery Head', 'Accountable for portfolio delivery. Full access to delivery data.', 20,
     array['org.members.read','audit.read','client.read','client.manage','project.read_all','project.create','project.update','project.change_status','project.archive','project.members.manage','team.read','team.manage','dashboard.portfolio.view']),
  ('program_manager', 'Program Manager', 'Coordinates related projects across the portfolio.', 30,
     array['org.members.read','client.read','project.read_all','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view']),
  ('project_manager', 'Project / Delivery Manager', 'Owns execution of assigned projects.', 40,
     array['org.members.read','client.read','project.read_assigned','project.create','project.update','project.change_status','project.members.manage','team.read','dashboard.portfolio.view']),
  ('engineering_manager', 'Engineering Manager / Tech Lead', 'Owns technical execution on assigned projects.', 50,
     array['org.members.read','client.read','project.read_assigned','project.update','team.read','dashboard.portfolio.view']),
  ('product_owner', 'Product Owner / Business Analyst', 'Owns requirements and priorities on assigned projects.', 60,
     array['org.members.read','client.read','project.read_assigned','project.update','team.read']),
  ('scrum_master', 'Scrum Master / Agile Lead', 'Facilitates agile delivery on assigned projects.', 70,
     array['org.members.read','project.read_assigned','team.read']),
  ('developer', 'Developer / Engineer', 'Works on assigned projects.', 80,
     array['org.members.read','project.read_assigned','team.read']),
  ('qa_engineer', 'QA Engineer / Test Lead', 'Owns quality on assigned projects.', 90,
     array['org.members.read','project.read_assigned','team.read']),
  ('resource_manager', 'Resource Manager', 'Maintains capacity and allocations across projects.', 100,
     array['org.members.read','project.read_all','team.read','team.manage']),
  ('hr_admin', 'HR / Attendance Administrator', 'Manages attendance and leave policy (Phase 3).', 110,
     array['org.members.read','team.read']),
  ('finance_manager', 'Finance / Commercial Manager', 'Owns budgets and commercials (Phase 5).', 120,
     array['org.members.read','client.read','project.read_all','dashboard.portfolio.view']),
  ('client_stakeholder', 'Client / External Stakeholder', 'External user. Sees only projects explicitly shared with them; no internal directory.', 130,
     array['project.read_assigned']),
  ('ai_agent_operator', 'AI Agent Operator', 'Configures AI agents (Phase 6). Cannot bypass permissions or approvals.', 140,
     array['org.members.read']);

-- ---------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER so RLS policies can call them without
-- recursive policy evaluation; each one only ever answers about the calling user.
-- ---------------------------------------------------------------------------
create or replace function private.active_membership_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.archived_at is null
  where m.organization_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.active_membership_id(p_org) is not null;
$$;

create or replace function public.has_permission(p_org uuid, p_permission text)
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
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission_key = p_permission
  );
$$;

create or replace function public.my_permissions(p_org uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct rp.permission_key
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.archived_at is null
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.organization_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  order by 1;
$$;

create or replace function private.shares_org_with_directory_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships theirs
    where theirs.user_id = p_user
      and public.has_permission(theirs.organization_id, 'org.members.read')
  );
$$;

-- ---------------------------------------------------------------------------
-- Organization bootstrap (used by create_organization RPC and by seed.sql)
-- ---------------------------------------------------------------------------
create or replace function private.bootstrap_organization(
  p_name text, p_slug text, p_owner uuid, p_is_demo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_membership uuid;
begin
  insert into public.organizations (name, slug, is_demo, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), p_is_demo, p_owner)
  returning id into v_org;

  insert into public.organization_settings (organization_id) values (v_org);

  insert into public.role_definitions (organization_id, key, name, description, is_system)
  select v_org, t.key, t.name, t.description, true from private.role_templates t;

  insert into public.role_permissions (role_id, permission_key)
  select r.id, unnest(t.permissions)
  from public.role_definitions r
  join private.role_templates t on t.key = r.key
  where r.organization_id = v_org;

  insert into public.organization_memberships (organization_id, user_id)
  values (v_org, p_owner)
  returning id into v_membership;

  insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
  select v_org, v_membership, r.id, p_owner
  from public.role_definitions r
  where r.organization_id = v_org and r.key in ('org_admin', 'delivery_head');

  return v_org;
end;
$$;

create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.organizations where created_by = v_user and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited: at most 5 organizations per user per day' using errcode = 'P0001';
  end if;
  return private.bootstrap_organization(p_name, p_slug, v_user, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership administration RPCs
-- ---------------------------------------------------------------------------
create or replace function private.count_active_admins(p_org uuid, p_excluding_membership uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct m.id)::integer
  from public.organization_memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_definitions r on r.id = mr.role_id and r.key = 'org_admin'
  where m.organization_id = p_org
    and m.status = 'active'
    and (p_excluding_membership is null or m.id <> p_excluding_membership);
$$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role_keys text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(p_email));
begin
  if not public.has_permission(p_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_role_keys) k where k not in (select key from public.role_definitions where organization_id = p_org)) then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
    where m.organization_id = p_org and p.email = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if (select count(*) from public.organization_invitations where organization_id = p_org and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'rate_limited: at most 50 invitations per hour' using errcode = 'P0001';
  end if;

  -- Replace any existing pending invitation for the same address.
  update public.organization_invitations set status = 'revoked'
  where organization_id = p_org and email = v_email and status = 'pending';

  insert into public.organization_invitations (organization_id, email, role_keys, invited_by)
  values (p_org, v_email, p_role_keys, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
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
  update public.organization_invitations set status = 'revoked' where id = p_invitation;
end;
$$;

-- Accept every pending, unexpired invitation addressed to the caller's verified email.
create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv record;
  v_membership uuid;
  v_count integer := 0;
begin
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for v_inv in
    select * from public.organization_invitations
    where email = v_email and status = 'pending' and expires_at > now()
    for update
  loop
    insert into public.organization_memberships (organization_id, user_id)
    values (v_inv.organization_id, v_user)
    on conflict (organization_id, user_id) do nothing
    returning id into v_membership;

    if v_membership is not null then
      insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
      select v_inv.organization_id, v_membership, r.id, v_inv.invited_by
      from public.role_definitions r
      where r.organization_id = v_inv.organization_id and r.key = any (v_inv.role_keys);
      v_count := v_count + 1;
    end if;

    update public.organization_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  end loop;
  return v_count;
end;
$$;

create or replace function public.set_member_roles(p_membership uuid, p_role_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_memberships where id = p_membership;
  if v_org is null or not public.has_permission(v_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_role_keys) k where k not in (select key from public.role_definitions where organization_id = v_org)) then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if not ('org_admin' = any (p_role_keys)) and private.count_active_admins(v_org, p_membership) = 0 then
    raise exception 'last_admin: the organization must keep at least one active administrator' using errcode = 'P0001';
  end if;

  delete from public.membership_roles mr
  using public.role_definitions r
  where mr.membership_id = p_membership and r.id = mr.role_id and not (r.key = any (p_role_keys));

  insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
  select v_org, p_membership, r.id, auth.uid()
  from public.role_definitions r
  where r.organization_id = v_org and r.key = any (p_role_keys)
  on conflict do nothing;
end;
$$;

create or replace function public.set_membership_status(p_membership uuid, p_status public.membership_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  select organization_id, user_id into v_org, v_user from public.organization_memberships where id = p_membership;
  if v_org is null or not public.has_permission(v_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status = 'suspended' and v_user = auth.uid() then
    raise exception 'cannot_suspend_self' using errcode = 'P0001';
  end if;
  if p_status = 'suspended' and private.count_active_admins(v_org, p_membership) = 0 then
    raise exception 'last_admin: the organization must keep at least one active administrator' using errcode = 'P0001';
  end if;
  update public.organization_memberships set status = p_status where id = p_membership;
end;
$$;
