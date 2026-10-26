-- Tenant isolation, RBAC and governance-rule tests. Self-contained: builds its own fixtures
-- inside a transaction that is rolled back, so it does not depend on seed.sql.
-- Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dh@a.test',     now(), '{"display_name":"A Delivery Head"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@a.test',  now(), '{"display_name":"A Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pm@a.test',     now(), '{"display_name":"A PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dev@a.test',    now(), '{"display_name":"A Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'client@a.test', now(), '{"display_name":"A Client"}'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@b.test',  now(), '{"display_name":"B Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'invitee@a.test', now(), '{"display_name":"Invitee"}');

create temporary table fx (k text primary key, id uuid not null);
grant select on fx to authenticated;

insert into fx values
  ('org_a', private.bootstrap_organization('Tenant A', 'tenant-a', 'a0000000-0000-4000-8000-000000000001')),
  ('org_b', private.bootstrap_organization('Tenant B', 'tenant-b', 'b0000000-0000-4000-8000-000000000001'));

-- A: dh is bootstrap owner (org_admin + delivery_head). Demote dh to delivery_head only and
-- give the admin user org_admin only, so the two concerns can be tested separately.
insert into public.organization_memberships (organization_id, user_id)
select (select id from fx where k = 'org_a'), u
from unnest(array['a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
                  'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005']::uuid[]) as u;

insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org_a');
insert into fx select 'm_b_owner', m.id from public.organization_memberships m where m.organization_id = (select id from fx where k = 'org_b');

delete from public.membership_roles mr using public.role_definitions r
where mr.role_id = r.id and r.key = 'org_admin' and mr.membership_id = (select id from fx where k = 'm_dh');

insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org_a'), (select id from fx where k = x.m), r.id
from (values ('m_admin', 'org_admin'), ('m_pm', 'project_manager'), ('m_dev', 'developer'), ('m_client', 'client_stakeholder')) as x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org_a');

insert into public.teams (organization_id, name) values ((select id from fx where k = 'org_a'), 'A Team'), ((select id from fx where k = 'org_b'), 'B Team');

insert into public.projects (organization_id, code, name, project_manager_id, created_by) values
  ((select id from fx where k = 'org_a'), 'A-ONE', 'A assigned project',   (select id from fx where k = 'm_pm'), 'a0000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org_a'), 'A-TWO', 'A unassigned project', null,                                 'a0000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org_b'), 'B-ONE', 'B project',            (select id from fx where k = 'm_b_owner'), 'b0000000-0000-4000-8000-000000000001');
insert into fx select 'p_' || lower(replace(code, '-', '_')), id from public.projects where code in ('A-ONE', 'A-TWO', 'B-ONE');

insert into public.project_memberships (organization_id, project_id, membership_id, project_role) values
  ((select id from fx where k = 'org_a'), (select id from fx where k = 'p_a_one'), (select id from fx where k = 'm_dev'),    'Engineer'),
  ((select id from fx where k = 'org_a'), (select id from fx where k = 'p_a_one'), (select id from fx where k = 'm_client'), 'Client PO');

-- ---------------------------------------------------------------------------
-- 1. Lifecycle state machine
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(enum_range(null::public.project_status)) f, unnest(enum_range(null::public.project_status)) t
   where public.is_valid_project_transition(f, t)),
  14, 'exactly 14 lifecycle transitions are valid');
select ok(not public.is_valid_project_transition('completed', 'active'), 'completed is terminal');
select ok(not public.is_valid_project_transition('proposed', 'active'), 'cannot skip approval and planning');

-- ---------------------------------------------------------------------------
-- 2. Anonymous access
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.projects', '42501', null, 'anon cannot read projects');
select throws_ok('select count(*) from public.organizations', '42501', null, 'anon cannot read organizations');
select pg_temp.as_postgres();

-- ---------------------------------------------------------------------------
-- 3. Project visibility by role and tenant
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.projects), 2, 'delivery head sees all projects in own tenant only');
select is((select count(*)::int from public.organizations), 1, 'delivery head sees only own organization');
select is((select count(*)::int from public.teams), 1, 'delivery head sees only own tenant teams');

select pg_temp.login('b0000000-0000-4000-8000-000000000001');
select is((select array_agg(code) from public.projects), array['B-ONE'], 'tenant B sees only its own project');
select is((select count(*)::int from public.audit_logs where organization_id = (select id from fx where k = 'org_a')), 0, 'tenant B cannot read tenant A audit log');
select is((select count(*)::int from public.user_profiles where email like '%@a.test'), 0, 'tenant B cannot read tenant A profiles');
select is((select count(*)::int from public.organization_memberships where organization_id = (select id from fx where k = 'org_a')), 0, 'tenant B cannot read tenant A memberships');

select pg_temp.login('a0000000-0000-4000-8000-000000000003');
select is((select array_agg(code) from public.projects), array['A-ONE'], 'project manager sees only assigned projects');

select pg_temp.login('a0000000-0000-4000-8000-000000000004');
select is((select array_agg(code) from public.projects), array['A-ONE'], 'developer sees only projects they are a member of');
select is((select count(*)::int from public.audit_logs), 0, 'developer cannot read the audit log');

select pg_temp.login('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.projects), 0, 'org admin does not automatically see project data');
select ok((select count(*) from public.audit_logs) > 0, 'org admin can read the audit log');

select pg_temp.login('a0000000-0000-4000-8000-000000000005');
select is((select array_agg(code) from public.projects), array['A-ONE'], 'client stakeholder sees only the shared project');
select is((select count(*)::int from public.project_memberships), 1, 'client stakeholder sees only own project membership row');
select is((select count(*)::int from public.user_profiles), 1, 'client stakeholder cannot browse the internal directory');
select is((select count(*)::int from public.teams), 0, 'client stakeholder cannot see internal teams');

-- ---------------------------------------------------------------------------
-- 4. Writes and permission enforcement
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  format($q$insert into public.projects (organization_id, code, name) values (%L, 'A-DEV', 'Dev project')$q$, (select id from fx where k = 'org_a')),
  '42501', null, 'developer cannot create projects');
select throws_ok(
  format($q$select public.transition_project_status(%L, 'approved')$q$, (select id from fx where k = 'p_a_one')),
  '42501', null, 'developer cannot change project status');

select pg_temp.login('a0000000-0000-4000-8000-000000000003');
select lives_ok(
  format($q$insert into public.projects (organization_id, code, name) values (%L, 'A-PM', 'PM project')$q$, (select id from fx where k = 'org_a')),
  'project manager can create a project in own tenant');
select is((select count(*)::int from public.projects where code = 'A-PM'), 1, 'creator can see the project they created');
select throws_ok(
  format($q$insert into public.projects (organization_id, code, name) values (%L, 'B-PM', 'Cross-tenant')$q$, (select id from fx where k = 'org_b')),
  '42501', null, 'project manager cannot create a project in another tenant');
select throws_ok(
  format($q$update public.projects set status = 'active' where id = %L$q$, (select id from fx where k = 'p_a_one')),
  '42501', null, 'status cannot be changed by a direct table update');
select throws_ok(
  format($q$select public.set_project_archived(%L, true)$q$, (select id from fx where k = 'p_a_one')),
  '42501', null, 'project manager cannot archive projects');
select throws_ok(
  format($q$select public.transition_project_status(%L, 'approved')$q$, (select id from fx where k = 'p_a_two')),
  '42501', null, 'project manager cannot act on an unassigned project');

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  format($q$select public.transition_project_status(%L, 'active')$q$, (select id from fx where k = 'p_a_one')),
  'P0001', null, 'invalid lifecycle transition is rejected');
select lives_ok(
  format($q$select public.transition_project_status(%L, 'approved', 'Board approved')$q$, (select id from fx where k = 'p_a_one')),
  'valid lifecycle transition succeeds');
select is(
  (select reason from public.project_status_history where project_id = (select id from fx where k = 'p_a_one') and change_type = 'status'),
  'Board approved', 'status change is recorded in history with its reason');
select ok(
  exists (select 1 from public.audit_logs where entity_id = (select id from fx where k = 'p_a_one') and action = 'projects.update'
          and actor_id = 'a0000000-0000-4000-8000-000000000001' and changes ? 'status'),
  'status change is audited with the acting user');
select throws_ok(
  format($q$select public.transition_project_status(%L, 'on_hold')$q$, (select id from fx where k = 'p_a_one')),
  'P0001', null, 'on hold requires a reason');
select throws_ok(
  format($q$select public.set_project_health(%L, 'red', '')$q$, (select id from fx where k = 'p_a_one')),
  'P0001', null, 'red health requires a reason');
select throws_ok(
  format($q$insert into public.project_memberships (organization_id, project_id, membership_id) values (%L, %L, %L)$q$,
         (select id from fx where k = 'org_a'), (select id from fx where k = 'p_a_one'), (select id from fx where k = 'm_b_owner')),
  '23503', null, 'a project cannot reference a membership from another tenant');
select throws_ok(
  format($q$select public.invite_member(%L, 'x@a.test', array['developer'])$q$, (select id from fx where k = 'org_a')),
  '42501', null, 'delivery head without members.manage cannot invite');

-- ---------------------------------------------------------------------------
-- 5. Membership administration
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-4000-8000-000000000002');
select lives_ok(
  format($q$select public.invite_member(%L, 'invitee@a.test', array['developer'])$q$, (select id from fx where k = 'org_a')),
  'org admin can invite a member');
select throws_ok(
  format($q$select public.set_member_roles(%L, array['developer'])$q$, (select id from fx where k = 'm_admin')),
  'P0001', null, 'the last org admin cannot be demoted');
select throws_ok(
  format($q$select public.set_membership_status(%L, 'suspended')$q$, (select id from fx where k = 'm_admin')),
  'P0001', null, 'admins cannot suspend themselves');

select pg_temp.login('c0000000-0000-4000-8000-000000000001');
select is(public.accept_pending_invitations(), 1, 'invitee accepts the pending invitation on sign-in');
select ok(public.has_permission((select id from fx where k = 'org_a'), 'project.read_assigned'), 'accepted invitation grants the invited role');

-- ---------------------------------------------------------------------------
-- 6. Suspension and audit immutability
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
update public.organization_memberships set status = 'suspended' where id = (select id from fx where k = 'm_dev');
select pg_temp.login('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.projects), 0, 'suspended member loses all project access');

select pg_temp.login('a0000000-0000-4000-8000-000000000002');
select throws_ok('update public.audit_logs set action = ''tampered''', '42501', null, 'users cannot modify audit records');
select pg_temp.as_postgres();
select throws_ok('delete from public.audit_logs', '42501', null, 'audit records cannot be deleted even by the table owner');

select * from finish();
rollback;
