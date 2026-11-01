-- Phase 4 governance: RAID, decisions, actions, escalations, change requests, releases and gates,
-- client contacts and contracts, documents and versions. Covers project-scoped visibility, the
-- immutability rules, separation of duties and tenant isolation. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(98);

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
-- f…01 owner (org_admin + delivery_head, as bootstrap assigns), 08 administrator with no delivery role, 02 project manager on GA, 03 developer on GA,
-- 04 delivery head, 05 client stakeholder on GA, 06 developer on no project, 07 project manager
-- on no project; f1…01 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@gv.test',  now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pm@gv.test',   now(), '{"display_name":"PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dev@gv.test',  now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dh@gv.test',   now(), '{"display_name":"DH"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'cli@gv.test',  now(), '{"display_name":"Client"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'out@gv.test',  now(), '{"display_name":"Outsider"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'pm2@gv.test',  now(), '{"display_name":"PM2"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'adm@gv.test',  now(), '{"display_name":"Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@gvx.test',   now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Governance Org', 'governance-org', 'f0000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other GV Org', 'other-gv-org', 'f1000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id)
select (select id from fx where k = 'org'), u
from unnest(array['f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000004',
                  'f0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000007',
                  'f0000000-0000-4000-8000-000000000008']::uuid[]) u;
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_pm', 'project_manager'), ('m_dev', 'developer'), ('m_dh', 'delivery_head'), ('m_cli', 'client_stakeholder'),
             ('m_out', 'developer'), ('m_pm2', 'project_manager'), ('m_adm', 'org_admin')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.projects (organization_id, code, name, created_by) values
  ((select id from fx where k = 'org'), 'GVA', 'Governance A', 'f0000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org'), 'GVB', 'Governance B', 'f0000000-0000-4000-8000-000000000001');
insert into fx select 'p_' || lower(code), id from public.projects where code in ('GVA', 'GVB');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_pm')),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dev')),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_cli'));
-- A RAID item on the other project, for the cross-project link check.
insert into public.raid_items (organization_id, project_id, type, title)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_gvb'), 'dependency', 'Vendor API on project B');
insert into fx select 'raid_b', id from public.raid_items where title = 'Vendor API on project B';

-- Permission catalogue and role templates -------------------------------------------------------
select is((select count(*)::int from public.permissions where key in
  ('governance.read', 'governance.manage', 'change.approve', 'release.read', 'release.manage', 'release.approve', 'document.read', 'document.manage')), 8,
  'the eight governance permissions exist');
select is((select count(*)::int from public.role_permissions rp join public.role_definitions r on r.id = rp.role_id
           where r.organization_id = (select id from fx where k = 'org') and r.key in ('org_admin', 'client_stakeholder') and rp.permission_key like 'governance.%'), 0,
  'administrators and client stakeholders get no governance access by default');

-- RAID --------------------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into public.raid_items (organization_id, project_id, type, title, probability, impact, owner_membership_id)
  values (%L, %L, 'risk', 'Key engineer may leave', 3, 4, %L)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dev')),
  'a project manager records a risk');
select throws_ok(format($q$insert into public.raid_items (organization_id, project_id, type, title) values (%L, %L, 'risk', 'Unscored risk')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), '23514', null, 'a risk needs probability and impact');
select throws_ok(format($q$insert into public.raid_items (organization_id, project_id, type, title, probability, impact) values (%L, %L, 'issue', 'Scored issue', 2, 2)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), '23514', null, 'only risks carry a probability');
select lives_ok(format($q$insert into public.raid_items (organization_id, project_id, type, title, impact) values (%L, %L, 'issue', 'Build is flaky', 3)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), 'an issue records an impact');
select pg_temp.as_postgres();
insert into fx select 'risk_1', id from public.raid_items where title = 'Key engineer may leave';
insert into fx select 'issue_1', id from public.raid_items where title = 'Build is flaky';
select is((select score::int from public.raid_items where id = (select id from fx where k = 'risk_1')), 12, 'a risk''s score is probability × impact');
select is((select status::text from public.raid_items where id = (select id from fx where k = 'risk_1')), 'open', 'new items start open');

select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.raid_items where project_id = (select id from fx where k = 'p_gva')), 2, 'a project member with governance.read sees the register');
select throws_ok(format($q$insert into public.raid_items (organization_id, project_id, type, title) values (%L, %L, 'issue', 'Dev adds an issue')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), '42501', null, 'a developer cannot add RAID items');
select pg_temp.login('f0000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.raid_items), 0, 'a client stakeholder never sees the internal register');
select pg_temp.login('f0000000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.raid_items where project_id = (select id from fx where k = 'p_gva')), 0, 'a developer outside the project sees nothing');
select pg_temp.login('f0000000-0000-4000-8000-000000000008');
select is((select count(*)::int from public.raid_items), 0, 'an organization administrator sees no governance data');
select pg_temp.login('f1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.raid_items), 0, 'another tenant sees nothing');

select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$update public.raid_items set status = 'closed' where id = %L$q$, (select id from fx where k = 'issue_1')),
  'P0001', null, 'closing needs a resolution note');
select lives_ok(format($q$update public.raid_items set status = 'resolved', resolution_note = 'Pinned the flaky dependency' where id = %L$q$, (select id from fx where k = 'issue_1')),
  'resolving with a note works');
select throws_ok(format($q$update public.raid_items set status = 'accepted', resolution_note = 'Live with it' where id = %L$q$, (select id from fx where k = 'issue_1')),
  '23514', null, 'only a risk can be accepted');
select pg_temp.as_postgres();
select isnt((select resolved_at from public.raid_items where id = (select id from fx where k = 'issue_1')), null, 'resolving stamps resolved_at');

-- Decisions ---------------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into public.decisions (organization_id, project_id, title, context) values (%L, %L, 'Adopt feature flags', 'Releases keep slipping')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), 'a decision is proposed');
select pg_temp.as_postgres();
insert into fx select 'dec_1', id from public.decisions where title = 'Adopt feature flags';
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$update public.decisions set status = 'accepted' where id = %L$q$, (select id from fx where k = 'dec_1')),
  'P0001', null, 'a decision can''t be recorded without stating it');
select lives_ok(format($q$update public.decisions set status = 'accepted', decision = 'Ship behind flags from Q1' where id = %L$q$, (select id from fx where k = 'dec_1')),
  'the decision is accepted');
select pg_temp.as_postgres();
select isnt((select decided_on from public.decisions where id = (select id from fx where k = 'dec_1')), null, 'accepting stamps the decision date');
select isnt((select decided_by_membership_id from public.decisions where id = (select id from fx where k = 'dec_1')), null, 'accepting records who decided');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$update public.decisions set decision = 'Quietly changed' where id = %L$q$, (select id from fx where k = 'dec_1')),
  'P0001', null, 'an accepted decision can''t be edited');
select throws_ok(format($q$update public.decisions set status = 'superseded' where id = %L$q$, (select id from fx where k = 'dec_1')),
  'P0001', null, 'superseding needs the replacing decision');
select lives_ok(format($q$insert into public.decisions (organization_id, project_id, title, decision) values (%L, %L, 'Adopt trunk-based development', 'Short-lived branches only')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), 'a newer decision is proposed');
select pg_temp.as_postgres();
insert into fx select 'dec_2', id from public.decisions where title = 'Adopt trunk-based development';
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$update public.decisions set status = 'accepted' where id = %L$q$, (select id from fx where k = 'dec_2')), 'the newer decision is accepted');
select lives_ok(format($q$update public.decisions set status = 'superseded', superseded_by_id = %L where id = %L$q$, (select id from fx where k = 'dec_2'), (select id from fx where k = 'dec_1')),
  'the first decision is superseded by the second');

-- Actions -----------------------------------------------------------------------------------------------
select lives_ok(format($q$insert into public.project_actions (organization_id, project_id, title, owner_membership_id, due_date, raid_item_id)
  values (%L, %L, 'Draft the retention plan', %L, current_date + 7, %L)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dev'), (select id from fx where k = 'risk_1')),
  'an action is assigned to a developer and linked to a risk');
select throws_ok(format($q$insert into public.project_actions (organization_id, project_id, title, owner_membership_id, due_date, raid_item_id)
  values (%L, %L, 'Cross-project link', %L, current_date + 7, %L)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dev'), (select id from fx where k = 'raid_b')),
  '23503', null, 'an action can''t link to another project''s RAID item');
select pg_temp.as_postgres();
insert into fx select 'act_1', id from public.project_actions where title = 'Draft the retention plan';
select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select lives_ok(format($q$update public.project_actions set status = 'done' where id = %L$q$, (select id from fx where k = 'act_1')), 'the owner closes their own action');
select throws_ok(format($q$update public.project_actions set owner_membership_id = %L where id = %L$q$, (select id from fx where k = 'm_pm'), (select id from fx where k = 'act_1')),
  '42501', null, 'an owner can''t reassign the action');
select pg_temp.as_postgres();
select isnt((select completed_at from public.project_actions where id = (select id from fx where k = 'act_1')), null, 'completing an action stamps completed_at');

-- Escalations ----------------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.raise_escalation(%L, 'Vendor stalled', 'No delivery in 3 weeks', 'high', %L, now() + interval '2 days', null, '[]'::jsonb)$q$,
  (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dh')), 'P0001', null, 'an escalation needs evidence');
select throws_ok(format($q$select public.raise_escalation(%L, 'Vendor stalled', 'No delivery in 3 weeks', 'high', %L, now() - interval '1 hour', null,
  '[{"kind":"note","title":"Status","note":"Missed three milestones"}]'::jsonb)$q$,
  (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dh')), 'P0001', null, 'the response deadline must be in the future');
select throws_ok(format($q$select public.raise_escalation(%L, 'Vendor stalled', 'No delivery in 3 weeks', 'high', %L, now() + interval '2 days', null,
  '[{"kind":"note","title":"Status","note":"Missed three milestones"}]'::jsonb)$q$,
  (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_out')), 'P0001', null, 'it can''t go to someone who can''t open the project');
select throws_ok(format($q$select public.raise_escalation(%L, 'Vendor stalled', 'No delivery in 3 weeks', 'high', %L, now() + interval '2 days', null,
  '[{"kind":"note","title":"Status","note":"Missed three milestones"}]'::jsonb)$q$,
  (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_cli')), 'P0001', null, 'it can''t go to a client stakeholder');
select lives_ok(format($q$select public.raise_escalation(%L, 'Vendor stalled', 'No delivery in 3 weeks', 'high', %L, now() + interval '2 days', %L,
  '[{"kind":"note","title":"Status","note":"Missed three milestones"},{"kind":"link","title":"Tracker","url":"https://example.com/t/1"}]'::jsonb)$q$,
  (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dh'), (select id from fx where k = 'risk_1')),
  'a manager raises an escalation with evidence');
select pg_temp.as_postgres();
insert into fx select 'esc_1', id from public.escalations where title = 'Vendor stalled';
select is((select count(*)::int from public.escalation_evidence where escalation_id = (select id from fx where k = 'esc_1')), 2, 'both pieces of evidence are stored');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$insert into public.escalations (organization_id, project_id, title, description, severity, escalated_to_membership_id, respond_by)
  values (%L, %L, 'Sneaky', 'No evidence', 'high', %L, now() + interval '1 day')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'm_dh')), '42501', null, 'escalations can only be raised through the RPC');
select throws_ok(format('select public.acknowledge_escalation(%L)', (select id from fx where k = 'esc_1')), '42501', null, 'only the recipient acknowledges');
select pg_temp.login('f0000000-0000-4000-8000-000000000004');
select lives_ok(format('select public.acknowledge_escalation(%L)', (select id from fx where k = 'esc_1')), 'the recipient acknowledges');
select throws_ok(format('select public.acknowledge_escalation(%L)', (select id from fx where k = 'esc_1')), 'P0001', null, 'an escalation can only be acknowledged once');
select throws_ok(format($q$select public.resolve_escalation(%L, '  ')$q$, (select id from fx where k = 'esc_1')), 'P0001', null, 'resolving needs a note');
select lives_ok(format($q$select public.resolve_escalation(%L, 'Vendor replaced; new plan agreed')$q$, (select id from fx where k = 'esc_1')), 'the recipient resolves');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$insert into public.escalation_evidence (organization_id, project_id, escalation_id, kind, title, note)
  values (%L, %L, %L, 'note', 'Late addition', 'Too late')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'esc_1')), '42501', null, 'a resolved escalation takes no more evidence');
select throws_ok(format($q$update public.escalations set status = 'open' where id = %L$q$, (select id from fx where k = 'esc_1')), '42501', null, 'status can''t be written directly');

-- Change requests --------------------------------------------------------------------------------------------
select lives_ok(format($q$insert into public.change_requests (organization_id, project_id, title, description, impact_schedule_days, impact_effort_hours)
  values (%L, %L, 'Add SSO', 'Customer asked for SSO', 15, 120)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')),
  'a change request is drafted');
select pg_temp.as_postgres();
insert into fx select 'cr_1', id from public.change_requests where title = 'Add SSO';
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format('select public.submit_change_request(%L)', (select id from fx where k = 'cr_1')), 'P0001', null, 'a change request needs a justification to be submitted');
select lives_ok(format($q$update public.change_requests set justification = 'Contractual commitment' where id = %L$q$, (select id from fx where k = 'cr_1')), 'a draft can be edited');
select lives_ok(format('select public.submit_change_request(%L)', (select id from fx where k = 'cr_1')), 'the draft is submitted');
select throws_ok(format($q$update public.change_requests set impact_schedule_days = 1 where id = %L$q$, (select id from fx where k = 'cr_1')),
  'P0001', null, 'a submitted change can''t be edited');
select throws_ok(format('select public.decide_change_request(%L, true)', (select id from fx where k = 'cr_1')), '42501', null, 'a project manager can''t approve changes');
select pg_temp.login('f0000000-0000-4000-8000-000000000004');
select throws_ok(format('select public.decide_change_request(%L, false)', (select id from fx where k = 'cr_1')), 'P0001', null, 'a rejection needs a reason');
select lives_ok(format($q$select public.decide_change_request(%L, true, 'Approved with the extra two weeks')$q$, (select id from fx where k = 'cr_1')), 'the delivery head approves');
select lives_ok(format($q$insert into public.change_requests (organization_id, project_id, title, justification) values (%L, %L, 'DH change', 'Own idea')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), 'the delivery head drafts a change');
select pg_temp.as_postgres();
insert into fx select 'cr_2', id from public.change_requests where title = 'DH change';
select pg_temp.login('f0000000-0000-4000-8000-000000000004');
select lives_ok(format('select public.submit_change_request(%L)', (select id from fx where k = 'cr_2')), 'and submits it');
select throws_ok(format('select public.decide_change_request(%L, true)', (select id from fx where k = 'cr_2')), 'P0001', null, 'nobody approves their own change request');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format('select public.implement_change_request(%L)', (select id from fx where k = 'cr_1')), 'an approved change is marked implemented');

-- Releases and gates -----------------------------------------------------------------------------------------
select lives_ok(format($q$insert into public.releases (organization_id, project_id, name, version, planned_date) values (%L, %L, 'R1', '1.0.0', current_date + 14)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), 'a release is planned');
select pg_temp.as_postgres();
insert into fx select 'rel_1', id from public.releases where name = 'R1';
select is((select count(*)::int from public.release_gates where release_id = (select id from fx where k = 'rel_1')), 5, 'a new release gets five default gates');
select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.releases), 1, 'a developer can read releases');
select throws_ok(format($q$insert into public.releases (organization_id, project_id, name) values (%L, %L, 'Dev release')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva')), '42501', null, 'a developer can''t plan releases');
select pg_temp.login('f0000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.releases), 0, 'a client stakeholder can''t see releases');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$select public.transition_release(%L, 'in_review')$q$, (select id from fx where k = 'rel_1')), 'the release goes to review');
select throws_ok(format($q$select public.transition_release(%L, 'approved')$q$, (select id from fx where k = 'rel_1')), '42501', null, 'a project manager can''t approve a release');
select pg_temp.login('f0000000-0000-4000-8000-000000000004');
select throws_ok(format($q$select public.transition_release(%L, 'approved')$q$, (select id from fx where k = 'rel_1')), 'P0001', null, 'approval is blocked while required gates are open');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$select public.record_gate_result(id, 'passed') from public.release_gates where release_id = %L and name <> 'Security review'$q$, (select id from fx where k = 'rel_1')),
  'the team passes four gates');
select throws_ok(format($q$select public.record_gate_result(id, 'waived', 'Not applicable') from public.release_gates where release_id = %L and name = 'Security review'$q$, (select id from fx where k = 'rel_1')),
  '42501', null, 'only an approver can waive a gate');
select pg_temp.login('f0000000-0000-4000-8000-000000000004');
select throws_ok(format($q$select public.record_gate_result(id, 'waived') from public.release_gates where release_id = %L and name = 'Security review'$q$, (select id from fx where k = 'rel_1')),
  'P0001', null, 'a waiver needs a reason');
select lives_ok(format($q$select public.record_gate_result(id, 'waived', 'Internal tool, covered by platform review') from public.release_gates where release_id = %L and name = 'Security review'$q$, (select id from fx where k = 'rel_1')),
  'the approver waives the last gate with a reason');
select lives_ok(format($q$select public.transition_release(%L, 'approved')$q$, (select id from fx where k = 'rel_1')), 'the release is approved');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$insert into public.release_gates (organization_id, project_id, release_id, name) values (%L, %L, %L, 'Late gate')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_gva'), (select id from fx where k = 'rel_1')), '42501', null, 'gates can''t be added after approval');
select lives_ok(format($q$select public.record_gate_result(id, 'failed', 'Regression found') from public.release_gates where release_id = %L and name = 'UAT sign-off'$q$, (select id from fx where k = 'rel_1')),
  'a gate fails after approval');
select pg_temp.as_postgres();
select is((select status::text from public.releases where id = (select id from fx where k = 'rel_1')), 'in_review', 'a failed required gate withdraws the approval');
select is((select approved_at from public.releases where id = (select id from fx where k = 'rel_1')), null, 'and clears the approval stamp');

-- Client contacts and contracts ---------------------------------------------------------------------------------
insert into public.clients (organization_id, name, confidentiality, account_owner_membership_id) values
  ((select id from fx where k = 'org'), 'Open Client', 'standard', null),
  ((select id from fx where k = 'org'), 'Secret Client', 'confidential', (select id from fx where k = 'm_dh'));
insert into fx select 'c_open', id from public.clients where name = 'Open Client';
insert into fx select 'c_secret', id from public.clients where name = 'Secret Client';
update public.projects set client_id = (select id from fx where k = 'c_secret') where id = (select id from fx where k = 'p_gva');
select pg_temp.login('f0000000-0000-4000-8000-000000000004');
select lives_ok(format($q$insert into public.client_contacts (organization_id, client_id, name, email, is_primary) values
  (%1$L, %2$L, 'Olivia Open', 'olivia@open.example', true), (%1$L, %3$L, 'Sam Secret', 'sam@secret.example', true)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'c_open'), (select id from fx where k = 'c_secret')), 'the delivery head records contacts');
select throws_ok(format($q$insert into public.client_contacts (organization_id, client_id, name, is_primary) values (%L, %L, 'Second Primary', true)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'c_open')), '23505', null, 'a client has one primary contact');
select lives_ok(format($q$insert into public.client_contracts (organization_id, client_id, title, contract_type, status, start_date, end_date)
  values (%L, %L, 'Master agreement', 'msa', 'active', current_date - 30, current_date + 335)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'c_secret')),
  'and a contract');
select throws_ok(format($q$insert into public.client_contracts (organization_id, client_id, title, start_date, end_date) values (%L, %L, 'Backwards', current_date, current_date - 1)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'c_open')), '23514', null, 'a contract can''t end before it starts');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.client_contacts), 2, 'an assigned project manager sees contacts of the standard and the confidential client');
select throws_ok(format($q$insert into public.client_contacts (organization_id, client_id, name) values (%L, %L, 'PM adds a contact')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'c_open')), '42501', null, 'client.read alone can''t add contacts');
select pg_temp.login('f0000000-0000-4000-8000-000000000007');
select is((select count(*)::int from public.client_contacts), 1, 'an unassigned project manager sees only the standard client''s contact');
select is((select count(*)::int from public.client_contracts), 0, 'and none of the confidential client''s contracts');
select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.client_contacts), 0, 'a developer without client.read sees no contacts');
select pg_temp.login('f1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.client_contacts), 0, 'another tenant sees no contacts');

-- Documents -----------------------------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select throws_ok(format($q$select public.create_document(%L, 'Dev doc', 'other', 'internal', null, 'text', null)$q$, (select id from fx where k = 'p_gva')),
  '42501', null, 'a developer can''t create documents');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into fx select 'doc_1', public.create_document(%L, 'Project charter', 'charter', 'internal', 'Scope and goals', '# Charter\nv1', null)$q$,
  (select id from fx where k = 'p_gva')), 'a project manager creates a document');
select is(public.add_document_version((select id from fx where k = 'doc_1'), '# Charter\nv2', null, 'Added scope'), 2, 'adding a version returns the next number');
select is((select current_version from public.documents where id = (select id from fx where k = 'doc_1')), 2, 'the document points at the latest version');
select throws_ok(format($q$update public.document_versions set content = 'tampered' where document_id = %L$q$, (select id from fx where k = 'doc_1')),
  '42501', null, 'versions can''t be edited');
select pg_temp.as_postgres();
select throws_ok(format($q$delete from public.document_versions where document_id = %L$q$, (select id from fx where k = 'doc_1')),
  'P0001', null, 'versions can''t be deleted, even by an administrator of the database');
select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.document_versions where document_id = (select id from fx where k = 'doc_1')), 2, 'a developer reads internal documents and their versions');
select pg_temp.login('f0000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.documents), 0, 'a client stakeholder can''t see internal documents');
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$update public.documents set visibility = 'client' where id = %L$q$, (select id from fx where k = 'doc_1')), 'the document is shared with the client');
select pg_temp.login('f0000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.documents), 1, 'a client stakeholder reads it once it is client-visible');
select is((select count(*)::int from public.document_versions), 2, 'with its versions');
select pg_temp.login('f1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.documents), 0, 'another tenant sees no documents');

select * from finish();
rollback;
