-- Phase 1 gap features: custom roles, confidential clients, departments and reporting lines,
-- time zone validation, invitation email tracking. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Fixtures ---------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@g.test', now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pgm@g.test',   now(), '{"display_name":"Program Mgr"}'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pm@g.test',    now(), '{"display_name":"Project Mgr"}'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dev@g.test',   now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'other@h.test', now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Gap Org', 'gap-org', 'd0000000-0000-4000-8000-000000000001')),
  ('org_h', private.bootstrap_organization('Other Org', 'other-org', 'e0000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id)
select (select id from fx where k = 'org'), u
from unnest(array['d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004']::uuid[]) u;
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_pgm', 'program_manager'), ('m_pm', 'project_manager'), ('m_dev', 'developer')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.clients (organization_id, name, code, confidentiality) values
  ((select id from fx where k = 'org'), 'Open Client',   'OPEN', 'standard'),
  ((select id from fx where k = 'org'), 'Secret Client', 'SECRET', 'confidential'),
  ((select id from fx where k = 'org'), 'Secret Two',    'SECRET2', 'confidential');
insert into fx select 'c_' || lower(code), id from public.clients where code in ('OPEN', 'SECRET', 'SECRET2');
insert into public.projects (organization_id, code, name, client_id, project_manager_id) values
  ((select id from fx where k = 'org'), 'G-ONE', 'Secret project', (select id from fx where k = 'c_secret'), (select id from fx where k = 'm_pm'));

-- Permission backfill -------------------------------------------------------------------------
select ok(public.has_permission((select id from fx where k = 'org'), 'org.roles.manage') is not null, 'helper callable');
select pg_temp.login('d0000000-0000-4000-8000-000000000001');
select ok(public.has_permission((select id from fx where k = 'org'), 'org.roles.manage'), 'org admin can manage roles');
select ok(public.has_permission((select id from fx where k = 'org'), 'client.confidential.read'), 'delivery head can read confidential clients');

-- Confidential clients --------------------------------------------------------------------------
select is((select count(*)::int from public.clients), 3, 'delivery head sees all clients including confidential');
select pg_temp.login('d0000000-0000-4000-8000-000000000002');
select is((select array_agg(code order by code) from public.clients), array['OPEN'], 'program manager without confidential access sees only standard clients');
select pg_temp.login('d0000000-0000-4000-8000-000000000003');
select is((select array_agg(code order by code) from public.clients), array['OPEN', 'SECRET'],
  'project manager sees the confidential client of a project they manage, but not other confidential clients');
select pg_temp.login('d0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.projects where code = 'G-ONE'), 1, 'the program manager still sees the project itself');

-- Custom roles ---------------------------------------------------------------------------------
select pg_temp.login('d0000000-0000-4000-8000-000000000003');
select throws_ok(
  format($q$select public.create_role(%L, 'auditor', 'Auditor', '', array['audit.read'])$q$, (select id from fx where k = 'org')),
  '42501', null, 'only org.roles.manage holders can create roles');

select pg_temp.login('d0000000-0000-4000-8000-000000000001');
select lives_ok(
  format($q$insert into fx values ('r_auditor', public.create_role(%L, 'auditor', 'Auditor', 'Reads the audit log', array['audit.read','team.read']))$q$,
         (select id from fx where k = 'org')),
  'org admin creates a custom role');
select is((select array_agg(permission_key order by permission_key) from public.role_permissions where role_id = (select id from fx where k = 'r_auditor')),
  array['audit.read', 'team.read'], 'custom role gets exactly the chosen permissions');
select throws_ok(
  format($q$select public.create_role(%L, 'developer', 'Dev copy', '', array['team.read'])$q$, (select id from fx where k = 'org')),
  'P0001', null, 'system role keys are reserved');
select throws_ok(
  format($q$select public.create_role(%L, 'bogus', 'Bogus', '', array['not.a.permission'])$q$, (select id from fx where k = 'org')),
  '22023', null, 'unknown permissions are rejected');
select throws_ok(
  format($q$select public.update_role(%L, 'Developer', '', array['project.read_all'])$q$,
         (select id from public.role_definitions where key = 'developer' and organization_id = (select id from fx where k = 'org'))),
  'P0001', null, 'system roles cannot be edited');
select lives_ok(
  format($q$select public.update_role(%L, 'Auditor', 'Reads the audit log', array['audit.read'])$q$, (select id from fx where k = 'r_auditor')),
  'custom role permissions can be changed');
select ok(exists (select 1 from public.audit_logs where action = 'role_permissions.update' and entity_id = (select id from fx where k = 'r_auditor')
                  and changes -> 'removed' ? 'team.read'), 'permission changes are audited with what was removed');
select lives_ok(
  format($q$select public.set_member_roles(%L, array['auditor'])$q$, (select id from fx where k = 'm_dev')),
  'custom role can be assigned');
select throws_ok(format($q$select public.delete_role(%L)$q$, (select id from fx where k = 'r_auditor')),
  'P0001', null, 'a role held by members cannot be deleted');
select pg_temp.login('d0000000-0000-4000-8000-000000000004');
select ok(public.has_permission((select id from fx where k = 'org'), 'audit.read'), 'holder of the custom role gains its permission');

-- Departments and reporting lines ----------------------------------------------------------------
select pg_temp.login('d0000000-0000-4000-8000-000000000001');
select lives_ok(
  format($q$insert into public.departments (organization_id, name) values (%L, 'Engineering')$q$, (select id from fx where k = 'org')),
  'members.manage holder creates a department');
select lives_ok(
  format($q$update public.organization_memberships set manager_membership_id = %L where id = %L$q$,
         (select id from fx where k = 'm_pgm'), (select id from fx where k = 'm_pm')),
  'manager can be set');
select throws_ok(
  format($q$update public.organization_memberships set manager_membership_id = %L where id = %L$q$,
         (select id from fx where k = 'm_pm'), (select id from fx where k = 'm_pgm')),
  'P0001', null, 'reporting cycles are rejected');
select pg_temp.as_postgres(); -- bypass RLS so only the foreign key can stop it
select throws_ok(
  format($q$update public.organization_memberships set manager_membership_id = (select m.id from public.organization_memberships m where m.organization_id = %L limit 1) where id = %L$q$,
         (select id from fx where k = 'org_h'), (select id from fx where k = 'm_pm')),
  '23503', null, 'a manager from another tenant is rejected');
select pg_temp.login('e0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.departments where organization_id = (select id from fx where k = 'org')), 0, 'departments are tenant-isolated');

-- Settings and invitations ---------------------------------------------------------------------
select pg_temp.login('d0000000-0000-4000-8000-000000000001');
select throws_ok(
  format($q$update public.organization_settings set timezone = 'Mars/Olympus' where organization_id = %L$q$, (select id from fx where k = 'org')),
  '22023', null, 'unknown time zones are rejected');
insert into fx values ('inv', public.invite_member((select id from fx where k = 'org'), 'x@g.test', array['developer']));
select pg_temp.login('d0000000-0000-4000-8000-000000000003');
select throws_ok(format($q$select public.record_invitation_email_sent(%L)$q$, (select id from fx where k = 'inv')),
  '42501', null, 'project managers cannot record invitation emails');

select * from finish();
rollback;
