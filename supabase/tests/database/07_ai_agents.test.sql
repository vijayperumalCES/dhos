-- Phase 6 AI agents: permissions, seeding, kill switches, the evaluation gate, execution privacy,
-- token cap and rate gates, approvals with separation of duties, and tenant isolation.
-- Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(101);

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
create function pg_temp.rows_affected(q text) returns int language plpgsql as $$
declare n int;
begin execute q; get diagnostics n = row_count; return n; end $$;

-- Fixtures ---------------------------------------------------------------------------------
-- 01 owner (org_admin + delivery_head), 02 project manager on AGA, 03 developer on AGA,
-- 04 AI agent operator; x1 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@ag.test', now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pm@ag.test',  now(), '{"display_name":"PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dev@ag.test', now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'op@ag.test',  now(), '{"display_name":"Operator"}'),
  ('00000000-0000-0000-0000-000000000000', 'a7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@agx.test',  now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Agent Org', 'agent-org', 'a6000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other AG Org', 'other-ag-org', 'a7000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id, job_title)
select (select id from fx where k = 'org'), u.id, u.title
from (values ('a6000000-0000-4000-8000-000000000002'::uuid, 'Project Manager'), ('a6000000-0000-4000-8000-000000000003', 'Engineer'), ('a6000000-0000-4000-8000-000000000004', 'AI Operator')) u(id, title);
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_pm', 'project_manager'), ('m_dev', 'developer'), ('m_op', 'ai_agent_operator')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.projects (organization_id, code, name, created_by) values
  ((select id from fx where k = 'org'), 'AGA', 'Agent A', 'a6000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org'), 'AGB', 'Agent B (unassigned)', 'a6000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org_x'), 'AGX', 'Other tenant', 'a7000000-0000-4000-8000-000000000001');
insert into fx select 'p_' || lower(code), id from public.projects where code in ('AGA', 'AGB', 'AGX');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_aga'), (select id from fx where k = 'm_pm')),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_aga'), (select id from fx where k = 'm_dev'));
insert into fx select 'a_' || d.key, d.id from public.agent_definitions d where d.organization_id = (select id from fx where k = 'org');
insert into fx select 'ax_first', id from public.agent_definitions where organization_id = (select id from fx where k = 'org_x') order by key limit 1;
insert into fx select 'v1_' || d.key, v.id from public.agent_definitions d join public.agent_versions v on v.agent_id = d.id and v.version = 1 where d.organization_id = (select id from fx where k = 'org');

-- Catalogue, templates and seeding --------------------------------------------------------------
select is((select count(*)::int from public.permissions where key in ('agent.read', 'agent.run', 'agent.approve', 'agent.manage')), 4, 'the four agent permissions exist');
select is((select array_agg(rp.permission_key order by rp.permission_key)::text from public.role_permissions rp join public.role_definitions r on r.id = rp.role_id
           where r.organization_id = (select id from fx where k = 'org') and r.key = 'project_manager' and rp.permission_key like 'agent.%'), '{agent.read,agent.run}',
  'a project manager may run agents but not approve or configure them');
select is((select array_agg(rp.permission_key order by rp.permission_key)::text from public.role_permissions rp join public.role_definitions r on r.id = rp.role_id
           where r.organization_id = (select id from fx where k = 'org') and r.key = 'ai_agent_operator' and rp.permission_key like 'agent.%'), '{agent.manage,agent.read}',
  'the operator configures agents but cannot run them or approve their actions');
select is((select count(*)::int from public.role_permissions rp join public.role_definitions r on r.id = rp.role_id
           where r.organization_id = (select id from fx where k = 'org') and r.key in ('developer', 'client_stakeholder', 'finance_manager', 'hr_admin') and rp.permission_key like 'agent.%'), 0,
  'developers, clients, finance and HR get no agent access by default');
select is((select count(*)::int from public.agent_definitions where organization_id = (select id from fx where k = 'org')), 4, 'a new organization gets the four launch agents');
select is((select count(*)::int from public.agent_definitions where organization_id = (select id from fx where k = 'org') and (enabled or active_version_id is not null)), 0, 'every agent starts disabled with no active version');
select is((select count(*)::int from public.agent_versions v where v.organization_id = (select id from fx where k = 'org') and v.version = 1 and v.system_prompt like '%untrusted_data%'), 4, 'each agent starts with a version 1 prompt that carries the data-handling rules');
select is((select enabled from public.agent_org_settings where organization_id = (select id from fx where k = 'org')), false, 'AI is off for the organization by default');
select is((select provider from public.agent_org_settings where organization_id = (select id from fx where k = 'org')), 'builtin', 'and uses the built-in provider by default');
select is((select count(*)::int from public.agent_definitions where organization_id = (select id from fx where k = 'org_x')), 4, 'the other organization is seeded too');

-- Visibility ----------------------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.agent_definitions) + (select count(*)::int from public.agent_org_settings) + (select count(*)::int from public.agent_versions), 0, 'a developer sees no agent configuration');
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.agent_definitions), 4, 'a project manager sees the catalogue');
select is((select count(*)::int from public.agent_versions), 4, 'and the prompt versions through agent.read');
select pg_temp.login('a7000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.agent_definitions where organization_id = (select id from fx where k = 'org')), 0, 'another tenant sees none of this organization''s agents');

-- Nothing runs before it is switched on --------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'agents_disabled: AI agents are switched off for this organization', 'agents cannot run while the organization switch is off');

-- Configuration needs agent.manage, and activation needs a passing evaluation ----------------
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select is(pg_temp.rows_affected(format($q$update public.agent_org_settings set enabled = true where organization_id = %L$q$, (select id from fx where k = 'org'))), 0, 'a project manager cannot change the organization settings');
select throws_ok(format($q$select public.set_agent_enabled(%L, true)$q$, (select id from fx where k = 'a_project_health')), '42501', null, 'or enable an agent');
select throws_ok(format($q$select public.record_agent_eval(%L, true, 5, 5, '[]'::jsonb)$q$, (select id from fx where k = 'v1_project_health')), '42501', null, 'or record an evaluation');
select throws_ok(format($q$insert into public.agent_versions (organization_id, agent_id, system_prompt) values (%L, %L, 'a prompt that is long enough to pass')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'a_project_health')), '42501', null, 'or add a prompt version');

select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is(pg_temp.rows_affected(format($q$update public.agent_org_settings set enabled = true where organization_id = %L$q$, (select id from fx where k = 'org'))), 1, 'the operator turns agents on for the organization');
select throws_ok(format($q$select public.set_agent_enabled(%L, true)$q$, (select id from fx where k = 'a_project_health')), 'P0001', null, 'an agent cannot be enabled before a version is active');
select throws_ok(format($q$select public.activate_agent_version(%L)$q$, (select id from fx where k = 'v1_project_health')), 'P0001', null, 'a version cannot be activated without an evaluation');
select lives_ok(format($q$select public.record_agent_eval(%L, true, 5, 4, '[]'::jsonb)$q$, (select id from fx where k = 'v1_project_health')), 'the operator records an evaluation that missed a case');
select is((select passed from public.agent_eval_runs where version_id = (select id from fx where k = 'v1_project_health')), false, 'one missed case means the run did not pass');
select throws_ok(format($q$select public.activate_agent_version(%L)$q$, (select id from fx where k = 'v1_project_health')), 'P0001', null, 'a failed evaluation does not unlock activation');
select lives_ok(format($q$select public.record_agent_eval(%L, true, 5, 5, '[]'::jsonb)$q$, (select id from fx where k = 'v1_project_health')), 'a clean run is recorded');
select lives_ok(format($q$select public.activate_agent_version(%L)$q$, (select id from fx where k = 'v1_project_health')), 'and unlocks activation');
select lives_ok(format($q$select public.set_agent_enabled(%L, true)$q$, (select id from fx where k = 'a_project_health')), 'the agent is enabled');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  '42501', null, 'the operator still cannot run agents (no data access through configuration)');

-- Prompt history is immutable; a newer failing evaluation blocks reactivation --------------------
select lives_ok(format($q$insert into public.agent_versions (organization_id, agent_id, system_prompt, temperature, max_tokens) values (%L, %L, 'A second prompt, long enough to be valid.', 0.1, 1500)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'a_project_health')), 'the operator adds a new version');
select is((select max(version) from public.agent_versions where agent_id = (select id from fx where k = 'a_project_health')), 2, 'version numbers are assigned by the database');
select is((select active_version_id from public.agent_definitions where id = (select id from fx where k = 'a_project_health')), (select id from fx where k = 'v1_project_health'), 'adding a version does not change the active one');
select throws_ok(format($q$update public.agent_versions set system_prompt = 'tampered tampered tampered' where agent_id = %L$q$, (select id from fx where k = 'a_project_health')), '42501', null, 'versions are never edited');
select throws_ok(format($q$delete from public.agent_versions where agent_id = %L$q$, (select id from fx where k = 'a_project_health')), '42501', null, 'or deleted');
select throws_ok(format($q$insert into public.agent_versions (organization_id, agent_id, system_prompt) values (%L, %L, 'A prompt aimed at another tenant agent.')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'ax_first')), '23503', null, 'a version cannot be attached to another organization''s agent');
select lives_ok(format($q$select public.record_agent_eval(%L, false, 5, 2, '[]'::jsonb)$q$, (select id from fx where k = 'v1_project_health')), 'a later failing evaluation of version 1 is recorded');
select throws_ok(format($q$select public.activate_agent_version(%L)$q$, (select id from fx where k = 'v1_project_health')), 'P0001', null, 'the latest evaluation decides, so version 1 can no longer be re-activated');
select lives_ok(format($q$select public.record_agent_eval(%L, true, 5, 5, '[]'::jsonb)$q$, (select id from fx where k = 'v1_project_health')), 'a re-run that passes is recorded');

-- Make the requirements agent runnable as well, for the approval tests
select lives_ok(format($q$select public.record_agent_eval(%L, true, 5, 5, '[]'::jsonb)$q$, (select id from fx where k = 'v1_requirements')), 'requirements agent evaluated');
select lives_ok(format($q$select public.activate_agent_version(%L)$q$, (select id from fx where k = 'v1_requirements')), 'activated');
select lives_ok(format($q$select public.set_agent_enabled(%L, true)$q$, (select id from fx where k = 'a_requirements')), 'and enabled');

-- Running -----------------------------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000003');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  '42501', null, 'a developer cannot run agents');

select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.start_agent_execution(%L, 'reporting', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'agent_disabled: this agent is not enabled', 'an agent that is not enabled does not run');
select throws_ok(format($q$select public.start_agent_execution(%L, 'no_such_agent', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'unknown_agent: no such agent', 'an unknown agent key is refused');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_agb')),
  '42501', null, 'an agent cannot be pointed at a project the caller cannot read');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_agx')),
  '42501', null, 'or at another organization''s project');
select lives_ok(format($q$insert into fx select 'ex1', (public.start_agent_execution(%L, 'project_health', %L, '{"projectId":"x"}'::jsonb) ->> 'execution_id')::uuid$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')), 'a project manager starts a run on a project they can read');
select is((select status::text from public.agent_executions where id = (select id from fx where k = 'ex1')), 'running', 'the execution is open');
select throws_ok(format($q$update public.agent_executions set output = '{}'::jsonb where id = %L$q$, (select id from fx where k = 'ex1')), '42501', null, 'executions are written only through the RPCs');
select throws_ok(format($q$insert into public.agent_executions (organization_id, agent_id, version_id, requested_by_membership_id) values (%L, %L, %L, %L)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'a_project_health'), (select id from fx where k = 'v1_project_health'), (select id from fx where k = 'm_pm')), '42501', null, 'and cannot be inserted directly');

-- Privacy of execution content ---------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.agent_executions), 0, 'even an owner and delivery head cannot read another person''s run');
select throws_ok(format($q$select public.finish_agent_execution(%L, 'succeeded', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'builtin', 'builtin-rules', 0, 0, null, 5, '[]'::jsonb)$q$, (select id from fx where k = 'ex1')),
  '42501', null, 'and cannot finish it on their behalf');
select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.agent_executions), 0, 'the operator sees no run content either');

-- Finishing and the ledger -----------------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select lives_ok(format($q$select public.finish_agent_execution(%L, 'succeeded', '{"summary":"ok"}'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'builtin', 'builtin-rules', 120, 30, 0.01, 40, '[]'::jsonb)$q$, (select id from fx where k = 'ex1')),
  'the requester finishes the run with its token use');
select is((select input_tokens + output_tokens from public.agent_executions where id = (select id from fx where k = 'ex1')), 150, 'tokens are recorded');
select throws_ok(format($q$select public.finish_agent_execution(%L, 'failed', null, null, null, 'again', 'builtin', null, 0, 0, null, 1, '[]'::jsonb)$q$, (select id from fx where k = 'ex1')),
  'P0001', null, 'a finished execution cannot be rewritten');

-- Requirements proposals become approvals --------------------------------------------------------------------
select lives_ok(format($q$insert into fx select 'ex2', (public.start_agent_execution(%L, 'requirements', %L, '{}'::jsonb) ->> 'execution_id')::uuid$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')), 'a requirements run starts');
select lives_ok(format($q$select public.finish_agent_execution(%L, 'succeeded', '{"summary":"drafted"}'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'builtin', 'builtin-rules', 10, 10, null, 5,
  '[{"action_type":"create_work_item","summary":"Create story: Reset password","payload":{"title":"Reset password"}},{"action_type":"create_work_item","summary":"Create story: Weekly summary","payload":{"title":"Weekly summary"}}]'::jsonb)$q$,
  (select id from fx where k = 'ex2')), 'finishing records proposals');
select is((select count(*)::int from public.agent_approvals where execution_id = (select id from fx where k = 'ex2') and status = 'pending'), 2, 'each proposal is a pending approval');
select lives_ok(format($q$insert into fx select 'ex2b', (public.start_agent_execution(%L, 'requirements', %L, '{}'::jsonb) ->> 'execution_id')::uuid$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')), 'another requirements run starts');
select throws_ok(format($q$select public.finish_agent_execution(%L, 'succeeded', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'builtin', null, 0, 0, null, 1, '[{"action_type":"drop_everything","summary":"no","payload":{}}]'::jsonb)$q$,
  (select id from fx where k = 'ex2b')), '23514', null, 'the action list is closed: an unknown action type is refused');
select throws_ok(format($q$insert into public.agent_approvals (organization_id, execution_id, project_id, action_type, summary, payload, requested_by_membership_id) values (%L, %L, %L, 'create_work_item', 'forged', '{}'::jsonb, %L)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'ex2'), (select id from fx where k = 'p_aga'), (select id from fx where k = 'm_pm')), '42501', null, 'approvals cannot be inserted directly');
select is((select count(*)::int from public.agent_approvals), 2, 'the requester sees their proposals');

select pg_temp.login('a6000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.agent_approvals), 0, 'a developer (not requester, no agent.approve) sees none');
select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.agent_approvals), 0, 'the operator sees none');
select pg_temp.login('a6000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.agent_approvals), 2, 'a delivery head who can read the project sees them');

-- Deciding: separation of duties and ordering ---------------------------------------------------------------------
select pg_temp.as_postgres();
insert into fx select 'ap1', (select id from public.agent_approvals where execution_id = (select id from fx where k = 'ex2') order by created_at, id limit 1);
insert into fx select 'ap2', (select id from public.agent_approvals where execution_id = (select id from fx where k = 'ex2') and id <> (select id from fx where k = 'ap1'));
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.decide_agent_approval(%L, true, null)$q$, (select id from fx where k = 'ap1')), '42501', null, 'the project manager cannot approve (no agent.approve)');
select pg_temp.login('a6000000-0000-4000-8000-000000000001');
select throws_ok(format($q$select public.decide_agent_approval(%L, false, null)$q$, (select id from fx where k = 'ap1')), 'P0001', 'reason_required: say why this proposal is rejected', 'a rejection needs a reason');
select lives_ok(format($q$select public.decide_agent_approval(%L, true, null)$q$, (select id from fx where k = 'ap1')), 'a different person with agent.approve approves');
select throws_ok(format($q$select public.decide_agent_approval(%L, false, 'changed my mind')$q$, (select id from fx where k = 'ap1')), 'P0001', 'approval_state: this proposal has already been decided', 'a decision is final');
select lives_ok(format($q$select public.decide_agent_approval(%L, false, 'out of scope')$q$, (select id from fx where k = 'ap2')), 'the other proposal is rejected with a reason');
select is((select status::text from public.agent_approvals where id = (select id from fx where k = 'ap2')), 'rejected', 'and stays rejected');
select throws_ok(format($q$select public.complete_agent_approval(%L, true, '{}'::jsonb)$q$, (select id from fx where k = 'ap2')), 'P0001', null, 'a rejected proposal cannot be executed');

select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.complete_agent_approval(%L, true, '{}'::jsonb)$q$, (select id from fx where k = 'ap1')), '42501', null, 'only the approver can record the outcome');
select pg_temp.login('a6000000-0000-4000-8000-000000000001');
select lives_ok(format($q$select public.complete_agent_approval(%L, false, '{"error":"no default state"}'::jsonb)$q$, (select id from fx where k = 'ap1')), 'a failed action is recorded');
select lives_ok(format($q$select public.complete_agent_approval(%L, true, '{"key":"AGA-1"}'::jsonb)$q$, (select id from fx where k = 'ap1')), 'and can be retried to success');
select throws_ok(format($q$select public.complete_agent_approval(%L, true, '{}'::jsonb)$q$, (select id from fx where k = 'ap1')), 'P0001', null, 'an executed proposal is complete');

-- Self-approval is refused ------------------------------------------------------------------------------------------
select lives_ok(format($q$insert into fx select 'ex3', (public.start_agent_execution(%L, 'requirements', %L, '{}'::jsonb) ->> 'execution_id')::uuid$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')), 'the delivery head runs an agent');
select lives_ok(format($q$select public.finish_agent_execution(%L, 'succeeded', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'builtin', null, 0, 0, null, 1,
  '[{"action_type":"create_work_item","summary":"Create story: Mine","payload":{"title":"Mine"}}]'::jsonb)$q$, (select id from fx where k = 'ex3')), 'with a proposal');
select pg_temp.as_postgres();
insert into fx select 'ap3', id from public.agent_approvals where execution_id = (select id from fx where k = 'ex3');
select pg_temp.login('a6000000-0000-4000-8000-000000000001');
select throws_ok(format($q$select public.decide_agent_approval(%L, true, null)$q$, (select id from fx where k = 'ap3')),
  'P0001', 'self_review: someone other than the requester must decide this proposal', 'nobody approves what they asked for themselves');

-- Proposals only exist for project-scoped runs --------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into fx select 'ex4', (public.start_agent_execution(%L, 'project_health', null, '{}'::jsonb) ->> 'execution_id')::uuid$q$, (select id from fx where k = 'org')), 'a portfolio-level run starts');
select lives_ok(format($q$select public.finish_agent_execution(%L, 'succeeded', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'builtin', null, 0, 0, null, 1,
  '[{"action_type":"create_work_item","summary":"Create story: Orphan","payload":{"title":"Orphan"}}]'::jsonb)$q$, (select id from fx where k = 'ex4')), 'finishing with a proposal');
select pg_temp.as_postgres();
select is((select count(*)::int from public.agent_approvals where execution_id = (select id from fx where k = 'ex4')), 0, 'a run with no project creates no approvals');

-- Usage is aggregate only -------------------------------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is((select runs::int from public.agent_usage((select id from fx where k = 'org'), current_date) where agent_key = 'project_health'), 2, 'the operator sees run counts per agent');
select is((select input_tokens::int from public.agent_usage((select id from fx where k = 'org'), current_date) where agent_key = 'project_health'), 120, 'and token totals');
select pg_temp.login('a6000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.agent_usage((select id from fx where k = 'org'), current_date)), 0, 'a developer gets no usage rows');
select pg_temp.login('a7000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.agent_usage((select id from fx where k = 'org'), current_date)), 0, 'another tenant gets no usage rows for this organization');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', null, '{}'::jsonb)$q$, (select id from fx where k = 'org')), '42501', null, 'and cannot start a run here');

-- Audit ----------------------------------------------------------------------------------------------------------------------------------
select pg_temp.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'agent_executions.start' and organization_id = (select id from fx where k = 'org')), 5, 'every run start is audited');
select is((select count(*)::int from public.audit_logs where action like 'agent_executions.%' and changes ? 'input'), 0, 'the audit trail never carries what the user supplied');
select cmp_ok((select count(*)::int from public.audit_logs where action = 'agent_approvals.update' and organization_id = (select id from fx where k = 'org')), '>=', 3, 'approval decisions are audited');
select cmp_ok((select count(*)::int from public.audit_logs where action in ('agent_org_settings.update', 'agent_definitions.update') and organization_id = (select id from fx where k = 'org')), '>=', 2, 'configuration changes are audited');

-- Kill switches and the token cap -------------------------------------------------------------------------------------------------
select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is(pg_temp.rows_affected(format($q$update public.agent_org_settings set monthly_token_cap = 0 where organization_id = %L$q$, (select id from fx where k = 'org'))), 1, 'the operator lowers the token cap');
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.start_agent_execution(%L, 'requirements', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'budget_exceeded: the organization''s monthly AI token cap has been reached', 'a run is refused once the cap is reached');
select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is(pg_temp.rows_affected(format($q$update public.agent_org_settings set monthly_token_cap = 500000, enabled = false where organization_id = %L$q$, (select id from fx where k = 'org'))), 1, 'the operator restores the cap and flips the organization switch off');
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.start_agent_execution(%L, 'requirements', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'agents_disabled: AI agents are switched off for this organization', 'the organization switch stops every agent');
select pg_temp.login('a6000000-0000-4000-8000-000000000004');
select is(pg_temp.rows_affected(format($q$update public.agent_org_settings set enabled = true where organization_id = %L$q$, (select id from fx where k = 'org'))), 1, 'switch back on');
select lives_ok(format($q$select public.set_agent_enabled(%L, false)$q$, (select id from fx where k = 'a_requirements')), 'the operator disables one agent');
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.start_agent_execution(%L, 'requirements', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'agent_disabled: this agent is not enabled', 'the per-agent kill switch stops just that agent');
select lives_ok(format($q$insert into fx select 'ex5', (public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb) ->> 'execution_id')::uuid$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'other agents keep running');

-- Rate limit ---------------------------------------------------------------------------------------------------------------------------------
select pg_temp.as_postgres();
insert into public.agent_executions (organization_id, agent_id, version_id, requested_by_membership_id, requested_by, status, completed_at)
select (select id from fx where k = 'org'), (select id from fx where k = 'a_project_health'), (select id from fx where k = 'v1_project_health'),
       (select id from fx where k = 'm_pm'), 'a6000000-0000-4000-8000-000000000002', 'succeeded', now()
from generate_series(1, 30);
select pg_temp.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.start_agent_execution(%L, 'project_health', %L, '{}'::jsonb)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_aga')),
  'P0001', 'rate_limited', 'a person is limited to thirty runs an hour');

select * from finish();
rollback;
