-- Phase 8 security controls: dual approval for privileged role grants, MFA enforcement and legal
-- hold. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

create function pg_temp.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Fixtures: 01 owner (org_admin + delivery_head), 02 second admin, 03 project manager, 04 developer,
-- 05 invitee, x1 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@sc.test',  now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'adm@sc.test',  now(), '{"display_name":"Admin 2"}'),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pm@sc.test',   now(), '{"display_name":"PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dev@sc.test',  now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'inv@sc.test',  now(), '{"display_name":"Invitee"}'),
  ('00000000-0000-0000-0000-000000000000', 'a9200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@scx.test',   now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Sec Org', 'sec-org', 'a9100000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other Sec Org', 'other-sec-org', 'a9200000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id)
select (select id from fx where k = 'org'), u from (values ('a9100000-0000-4000-8000-000000000002'::uuid), ('a9100000-0000-4000-8000-000000000003'), ('a9100000-0000-4000-8000-000000000004')) x(u);
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_pm', 'project_manager'), ('m_dev', 'developer')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');
-- A second administrator, set up while the control is still off.
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select public.set_member_roles((select id from fx where k = 'm_adm'), array['org_admin']);

-- Defaults and direct access ---------------------------------------------------------------------
select is((select require_dual_approval or require_mfa or legal_hold from public.organization_settings where organization_id = (select id from fx where k = 'org')), false, 'all three controls start off');
select throws_ok(format('update public.organization_settings set require_mfa = true where organization_id = %L', (select id from fx where k = 'org')), '42501', null, 'the controls cannot be flipped with a plain UPDATE');
select throws_ok(format('update public.organization_settings set legal_hold = true, legal_hold_reason = %L where organization_id = %L', 'x', (select id from fx where k = 'org')), '42501', null, 'nor can the legal hold');
select throws_ok(format('insert into public.role_grant_requests (organization_id, membership_id, role_id, reason, requested_by) values (%L, %L, gen_random_uuid(), %L, auth.uid())', (select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), 'because'), '42501', null, 'requests are written only by the RPC');

-- Turning dual approval on --------------------------------------------------------------------------
select pg_temp.login('a9100000-0000-4000-8000-000000000003');
select throws_ok(format('select public.set_security_controls(%L, true, false)', (select id from fx where k = 'org')), '42501', null, 'a project manager cannot change security controls');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select pg_temp.as_postgres();
delete from public.membership_roles where membership_id = (select id from fx where k = 'm_adm') and role_id = (select id from public.role_definitions where key = 'org_admin' and organization_id = (select id from fx where k = 'org'));
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select throws_ok(format('select public.set_security_controls(%L, true, false)', (select id from fx where k = 'org')), 'P0001', null, 'refused while only one person can approve');
select pg_temp.as_postgres();
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = 'm_adm'), id from public.role_definitions where key = 'org_admin' and organization_id = (select id from fx where k = 'org');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select lives_ok(format('select public.set_security_controls(%L, true, false)', (select id from fx where k = 'org')), 'allowed once two people can approve');
select is((select require_dual_approval from public.organization_settings where organization_id = (select id from fx where k = 'org')), true, 'the setting is stored');
select ok(exists (select 1 from public.audit_logs where action = 'security_controls.update' and organization_id = (select id from fx where k = 'org')), 'the change is audited');

-- The direct paths are closed ------------------------------------------------------------------------
select throws_ok(format('select public.set_member_roles(%L, array[%L, %L])', (select id from fx where k = 'm_dev'), 'developer', 'org_admin'), 'P0001', null, 'a privileged role cannot be assigned directly');
select throws_ok(format('select public.set_member_roles(%L, array[%L, %L])', (select id from fx where k = 'm_dev'), 'developer', 'finance_manager'), 'P0001', null, 'nor a finance role');
select lives_ok(format('select public.set_member_roles(%L, array[%L, %L])', (select id from fx where k = 'm_dev'), 'developer', 'qa_engineer'), 'a non-privileged role still can');
select lives_ok(format('select public.set_member_roles(%L, array[%L])', (select id from fx where k = 'm_dev'), 'developer'), 'and roles can still be removed');
select throws_ok(format('select public.invite_member(%L, %L, array[%L])', (select id from fx where k = 'org'), 'new1@sc.test', 'org_admin'), 'P0001', null, 'an invitation cannot carry a privileged role');
select lives_ok(format('select public.invite_member(%L, %L, array[%L])', (select id from fx where k = 'org'), 'new2@sc.test', 'developer'), 'an ordinary invitation works');

-- Requests ---------------------------------------------------------------------------------------------
select throws_ok(format('select public.request_role_grant(%L, %L, %L)', (select id from fx where k = 'm_dev'), 'developer', 'not privileged'), 'P0001', null, 'a non-privileged role needs no request');
select throws_ok(format('select public.request_role_grant(%L, %L, %L)', (select id from fx where k = 'm_dev'), 'nope', 'unknown'), '22023', null, 'an unknown role is refused');
select throws_ok(format('select public.request_role_grant(%L, %L, %L)', (select id from fx where k = 'm_dev'), 'org_admin', ' '), 'P0001', null, 'a reason is required');
select lives_ok(format('select public.request_role_grant(%L, %L, %L)', (select id from fx where k = 'm_dev'), 'org_admin', 'Covers admin while Priya is away'), 'an administrator requests a privileged grant');
insert into fx select 'req1', id from public.role_grant_requests where status = 'pending';
select throws_ok(format('select public.request_role_grant(%L, %L, %L)', (select id from fx where k = 'm_dev'), 'org_admin', 'again'), '23505', null, 'only one pending request per member and role');
select is((select count(*)::int from public.role_grant_requests), 1, 'the requester sees it');
select pg_temp.login('a9100000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.role_grant_requests), 0, 'a project manager sees no requests');
select throws_ok(format('select public.decide_role_grant(%L, true, null)', (select id from fx where k = 'req1')), '42501', null, 'and cannot decide one');
select pg_temp.login('a9100000-0000-4000-8000-000000000001', 'aal2');
select throws_ok(format('select public.decide_role_grant(%L, true, null)', (select id from fx where k = 'req1')), 'P0001', null, 'the requester cannot approve their own request, even with MFA');
select pg_temp.login('a9200000-0000-4000-8000-000000000001');
select throws_ok(format('select public.decide_role_grant(%L, true, null)', (select id from fx where k = 'req1')), '42501', null, 'an administrator of another organization cannot decide it');
select pg_temp.login('a9100000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.role_grant_requests), 1, 'the second administrator sees it');
select lives_ok(format('select public.decide_role_grant(%L, true, %L)', (select id from fx where k = 'req1'), 'ok'), 'a different administrator approves');
select ok(exists (select 1 from public.membership_roles mr join public.role_definitions r on r.id = mr.role_id where mr.membership_id = (select id from fx where k = 'm_dev') and r.key = 'org_admin'), 'approval grants the role');
select is((select granted_by from public.membership_roles mr join public.role_definitions r on r.id = mr.role_id where mr.membership_id = (select id from fx where k = 'm_dev') and r.key = 'org_admin'), 'a9100000-0000-4000-8000-000000000002'::uuid, 'granted_by is the approver');
select is((select status from public.role_grant_requests where id = (select id from fx where k = 'req1')), 'approved', 'the request is marked approved');
select ok(exists (select 1 from public.audit_logs where action = 'role_grant.approve' and entity_id = (select id from fx where k = 'req1')), 'approval is audited');
select throws_ok(format('select public.decide_role_grant(%L, false, null)', (select id from fx where k = 'req1')), 'P0001', null, 'a decided request cannot be decided again');

-- Reject, cancel, expire ----------------------------------------------------------------------------
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select public.request_role_grant((select id from fx where k = 'm_pm'), 'finance_manager', 'Month-end close');
insert into fx select 'req2', id from public.role_grant_requests where membership_id = (select id from fx where k = 'm_pm') and status = 'pending';
select pg_temp.login('a9100000-0000-4000-8000-000000000002');
select lives_ok(format('select public.decide_role_grant(%L, false, %L)', (select id from fx where k = 'req2'), 'Not this month'), 'a request can be rejected');
select ok(not exists (select 1 from public.membership_roles mr join public.role_definitions r on r.id = mr.role_id where mr.membership_id = (select id from fx where k = 'm_pm') and r.key = 'finance_manager'), 'rejection grants nothing');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select public.request_role_grant((select id from fx where k = 'm_pm'), 'finance_manager', 'Second try');
insert into fx select 'req3', id from public.role_grant_requests where membership_id = (select id from fx where k = 'm_pm') and status = 'pending';
select pg_temp.login('a9100000-0000-4000-8000-000000000002');
select throws_ok(format('select public.cancel_role_grant(%L)', (select id from fx where k = 'req3')), '42501', null, 'only the requester can cancel');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select lives_ok(format('select public.cancel_role_grant(%L)', (select id from fx where k = 'req3')), 'the requester cancels');
select public.request_role_grant((select id from fx where k = 'm_pm'), 'finance_manager', 'Third try');
insert into fx select 'req4', id from public.role_grant_requests where membership_id = (select id from fx where k = 'm_pm') and status = 'pending';
select pg_temp.as_postgres();
update public.role_grant_requests set expires_at = now() - interval '1 minute' where id = (select id from fx where k = 'req4');
select pg_temp.login('a9100000-0000-4000-8000-000000000002');
select throws_ok(format('select public.decide_role_grant(%L, true, null)', (select id from fx where k = 'req4')), 'P0001', null, 'an expired request cannot be approved');

-- Roles in use and stale invitations ------------------------------------------------------------------
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select public.create_role((select id from fx where k = 'org'), 'ops_lead', 'Ops lead', 'Custom', array['project.read_all']);
select lives_ok(format('select public.update_role((select id from public.role_definitions where key = %L and organization_id = %L), %L, %L, array[%L, %L])', 'ops_lead', (select id from fx where k = 'org'), 'Ops lead', 'Custom', 'project.read_all', 'org.members.manage'), 'a role nobody holds can gain a privileged permission (it still needs an approved grant to reach anyone)');
select public.create_role((select id from fx where k = 'org'), 'ops_lead_two', 'Ops lead 2', 'Custom', array['project.read_all']);
select public.set_member_roles((select id from fx where k = 'm_pm'), array['project_manager', 'ops_lead_two']);
select throws_ok(format('select public.update_role((select id from public.role_definitions where key = %L and organization_id = %L), %L, %L, array[%L, %L])', 'ops_lead_two', (select id from fx where k = 'org'), 'Ops lead 2', 'Custom', 'project.read_all', 'finance.approve'), 'P0001', null, 'a role in use cannot gain a privileged permission');
select lives_ok(format('select public.update_role((select id from public.role_definitions where key = %L and organization_id = %L), %L, %L, array[%L, %L])', 'ops_lead_two', (select id from fx where k = 'org'), 'Ops lead 2', 'Custom', 'project.read_all', 'team.read'), 'but can gain an ordinary one');

select pg_temp.as_postgres();
insert into public.organization_invitations (organization_id, email, role_keys, invited_by)
values ((select id from fx where k = 'org'), 'inv@sc.test', array['developer', 'org_admin'], 'a9100000-0000-4000-8000-000000000001');
select pg_temp.login('a9100000-0000-4000-8000-000000000005');
select is(public.accept_pending_invitations(), 1, 'the invitee joins');
select pg_temp.as_postgres();
select is((select array_agg(r.key order by r.key) from public.membership_roles mr join public.role_definitions r on r.id = mr.role_id join public.organization_memberships m on m.id = mr.membership_id where m.user_id = 'a9100000-0000-4000-8000-000000000005'), array['developer'], 'a stale invitation cannot carry a privileged role past the control');

select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select lives_ok(format('select public.set_security_controls(%L, false, false)', (select id from fx where k = 'org')), 'the control can be turned off (audited)');
select lives_ok(format('select public.set_member_roles(%L, array[%L, %L])', (select id from fx where k = 'm_pm'), 'project_manager', 'org_admin'), 'and then direct assignment works again');
select throws_ok(format('select public.request_role_grant(%L, %L, %L)', (select id from fx where k = 'm_dev'), 'org_admin', 'unneeded'), 'P0001', null, 'requests are refused while the control is off');

-- MFA ------------------------------------------------------------------------------------------------------
select throws_ok(format('select public.set_security_controls(%L, false, true)', (select id from fx where k = 'org')), 'P0001', null, 'requiring MFA needs your own verified second factor');
select pg_temp.login('a9100000-0000-4000-8000-000000000001', 'aal2');
select lives_ok(format('select public.set_security_controls(%L, false, true)', (select id from fx where k = 'org')), 'an aal2 administrator can require MFA');
select is(public.is_org_member((select id from fx where k = 'org')), true, 'an aal2 session is still a member');
select ok((select count(*) from public.my_permissions((select id from fx where k = 'org'))) > 0, 'and keeps its permissions');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select is(public.is_org_member((select id from fx where k = 'org')), false, 'an aal1 session is not a member once MFA is required');
select is(public.has_permission((select id from fx where k = 'org'), 'org.settings.manage'), false, 'and holds no permission');
select is((select count(*)::int from public.my_permissions((select id from fx where k = 'org'))), 0, 'my_permissions is empty');
select is((select count(*)::int from public.organizations where id = (select id from fx where k = 'org')), 0, 'the organization is invisible to it');
select is((select count(*)::int from public.organization_memberships where organization_id = (select id from fx where k = 'org') and user_id <> auth.uid()), 0, 'as are its other members (only the caller''s own row stays readable)');
select is((select count(*)::int from public.mfa_required_organizations()), 1, 'but the app can still learn that MFA is required');
select throws_ok(format('select public.set_security_controls(%L, false, false)', (select id from fx where k = 'org')), '42501', null, 'an aal1 session cannot switch the requirement off');
select pg_temp.login('a9100000-0000-4000-8000-000000000004');
select is(public.is_org_member((select id from fx where k = 'org')), false, 'the requirement applies to every member');
select pg_temp.login('a9200000-0000-4000-8000-000000000001');
select is(public.is_org_member((select id from fx where k = 'org_x')), true, 'another organization is unaffected');
select is((select count(*)::int from public.mfa_required_organizations()), 0, 'and is not told it needs MFA');
select pg_temp.login('a9100000-0000-4000-8000-000000000001', 'aal2');
select lives_ok(format('select public.set_security_controls(%L, false, false)', (select id from fx where k = 'org')), 'an aal2 administrator can switch it off again');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select is(public.is_org_member((select id from fx where k = 'org')), true, 'after which aal1 works');

-- Legal hold ------------------------------------------------------------------------------------------------
select pg_temp.login('a9100000-0000-4000-8000-000000000005');
select throws_ok(format('select public.set_legal_hold(%L, true, %L)', (select id from fx where k = 'org'), 'case 12'), '42501', null, 'a developer cannot place a hold');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select throws_ok(format('select public.set_legal_hold(%L, true, %L)', (select id from fx where k = 'org'), ' '), 'P0001', null, 'a hold needs a reason');
select lives_ok(format('select public.set_legal_hold(%L, true, %L)', (select id from fx where k = 'org'), 'Litigation hold, matter 12'), 'an administrator places a hold');
select is((select legal_hold_reason from public.organization_settings where organization_id = (select id from fx where k = 'org')), 'Litigation hold, matter 12', 'the reason is stored');
select ok(exists (select 1 from public.audit_logs where action = 'legal_hold.on' and organization_id = (select id from fx where k = 'org')), 'and audited');
select pg_temp.as_postgres();
insert into public.outbox_events (organization_id, event_type, entity_type, entity_id, processed_at, created_at)
values ((select id from fx where k = 'org'), 'held.event', 'x', gen_random_uuid(), now() - interval '60 days', now() - interval '60 days');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select lives_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'retention' and organization_id = (select id from fx where k = 'org'))), 'retention runs during a hold');
select pg_temp.as_postgres();
select is((select count(*)::int from public.outbox_events where event_type = 'held.event'), 1, 'but deletes nothing');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select lives_ok(format('select public.set_legal_hold(%L, false, null)', (select id from fx where k = 'org')), 'the hold is lifted');
select is((select legal_hold_reason from public.organization_settings where organization_id = (select id from fx where k = 'org')), null, 'the reason is cleared');
select lives_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'retention' and organization_id = (select id from fx where k = 'org'))), 'retention runs again');
select pg_temp.as_postgres();
select is((select count(*)::int from public.outbox_events where event_type = 'held.event'), 0, 'and purges as before');

-- Retention windows -----------------------------------------------------------------------------------------
select pg_temp.login('a9100000-0000-4000-8000-000000000005');
select throws_ok(format('select public.set_retention_windows(%L, 30, 90, 90)', (select id from fx where k = 'org')), '42501', null, 'a developer cannot change retention windows');
select pg_temp.login('a9100000-0000-4000-8000-000000000001');
select throws_ok(format('select public.set_retention_windows(%L, 1, 90, 90)', (select id from fx where k = 'org')), '22023', null, 'a window under a week is refused');
select throws_ok(format('select public.set_retention_windows(%L, 30, 90, 99999)', (select id from fx where k = 'org')), '22023', null, 'so is one over ten years');
select lives_ok(format('select public.set_retention_windows(%L, 45, 120, 100)', (select id from fx where k = 'org')), 'an administrator sets the windows');
select is((select config from public.scheduled_jobs where key = 'retention' and organization_id = (select id from fx where k = 'org')), '{"outbox_days":45,"notification_days":120,"log_days":100}'::jsonb, 'the retention job uses them');

select * from finish();
rollback;
