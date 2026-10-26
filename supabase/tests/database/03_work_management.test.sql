-- Phase 2 work management: keys, hierarchy, sprints, workflow rules, burndown stats,
-- dependencies, visibility and tenant isolation. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dh@w.test',     now(), '{"display_name":"DH"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dev@w.test',    now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'client@w.test', now(), '{"display_name":"Client"}'),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'other@x.test',  now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Work Org', 'work-org', 'f0000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other Org', 'other-work-org', 'f1000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id)
select (select id from fx where k = 'org'), u from unnest(array['f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003']::uuid[]) u;
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_dev', 'developer'), ('m_client', 'client_stakeholder')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.projects (organization_id, code, name, created_by) values
  ((select id from fx where k = 'org'), 'WRK', 'Work project', 'f0000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org'), 'OTH', 'Other project', 'f0000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org_x'), 'XRK', 'Foreign project', 'f1000000-0000-4000-8000-000000000001');
insert into fx select 'p_' || lower(code), id from public.projects where code in ('WRK', 'OTH', 'XRK');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), (select id from fx where k = 'm_dev')),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), (select id from fx where k = 'm_client'));

insert into fx select 's_' || lower(replace(name, ' ', '_')), id from public.workflow_states where organization_id = (select id from fx where k = 'org');
insert into public.project_milestones (organization_id, project_id, name, due_date) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), 'Go live', current_date + 10);
insert into public.sprints (organization_id, project_id, name, start_date, end_date) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), 'S1', current_date - 2, current_date + 11),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), 'S2', current_date + 12, current_date + 25),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_oth'), 'O1', current_date, current_date + 13);
insert into fx select 'sp_' || lower(name), id from public.sprints where name in ('S1', 'S2', 'O1');

-- Defaults and keys --------------------------------------------------------------------------
select is((select count(*)::int from public.workflow_states where organization_id = (select id from fx where k = 'org')), 6, 'new organizations get the default workflow');

select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(
  format($q$insert into public.work_items (organization_id, project_id, type, title, state_id) values (%L, %L, 'epic', 'Epic one', %L)$q$,
         (select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), (select id from fx where k = 's_backlog')),
  'developer can create a work item');
select lives_ok(
  format($q$insert into public.work_items (organization_id, project_id, type, title, state_id, story_points) values (%L, %L, 'story', 'Story one', %L, 5)$q$,
         (select id from fx where k = 'org'), (select id from fx where k = 'p_wrk'), (select id from fx where k = 's_backlog')),
  'developer can create a second item');
select is((select array_agg(key order by seq) from public.work_items where project_id = (select id from fx where k = 'p_wrk')), array['WRK-1', 'WRK-2'], 'keys are sequential per project');
select is((select reporter_membership_id from public.work_items where key = 'WRK-1'), (select id from fx where k = 'm_dev'), 'reporter defaults to the creator');
select pg_temp.as_postgres();
insert into fx select 'w_' || lower(replace(key, '-', '_')), id from public.work_items where key in ('WRK-1', 'WRK-2');

-- Hierarchy -------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$update public.work_items set parent_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 'w_wrk_1')), 'a story can sit under an epic');
select throws_ok(format($q$update public.work_items set parent_id = %L where key = 'WRK-1'$q$, (select id from fx where k = 'w_wrk_2')),
  'P0001', null, 'an epic cannot have a parent');
select throws_ok(
  format($q$insert into public.work_items (organization_id, project_id, type, title, state_id) values (%L, %L, 'task', 'Not mine', %L)$q$,
         (select id from fx where k = 'org'), (select id from fx where k = 'p_oth'), (select id from fx where k = 's_backlog')),
  '42501', null, 'developer cannot write to a project they are not on');
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok(
  format($q$insert into public.work_items (organization_id, project_id, type, title, state_id, parent_id) values (%L, %L, 'task', 'Cross', %L, %L)$q$,
         (select id from fx where k = 'org'), (select id from fx where k = 'p_oth'), (select id from fx where k = 's_backlog'), (select id from fx where k = 'w_wrk_2')),
  'P0001', null, 'a parent must be in the same project');
select throws_ok(format($q$update public.work_items set sprint_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 'sp_o1')),
  'P0001', null, 'a sprint must be in the same project');

-- Workflow ---------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$update public.work_items set state_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 's_done')), 'any move is allowed without rules');
select isnt((select completed_at from public.work_items where key = 'WRK-2'), null, 'entering a done state stamps completed_at');
select lives_ok(format($q$update public.work_items set state_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 's_ready')), 'items can leave done');
select is((select completed_at from public.work_items where key = 'WRK-2'), null, 'leaving done clears completed_at');
select ok(exists (select 1 from public.work_item_activity a where a.work_item_id = (select id from fx where k = 'w_wrk_2') and a.field = 'state' and a.to_value = 'Ready'
                  and a.actor_id = 'f0000000-0000-4000-8000-000000000002'), 'state changes are recorded in activity with the actor');

select throws_ok(
  format($q$insert into public.workflow_transitions (organization_id, from_state_id, to_state_id) values (%L, %L, %L)$q$,
         (select id from fx where k = 'org'), (select id from fx where k = 's_ready'), (select id from fx where k = 's_in_progress')),
  '42501', null, 'developers cannot configure the workflow');
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select lives_ok(
  format($q$insert into public.workflow_transitions (organization_id, from_state_id, to_state_id) values (%L, %L, %L)$q$,
         (select id from fx where k = 'org'), (select id from fx where k = 's_ready'), (select id from fx where k = 's_in_progress')),
  'delivery head restricts Ready to In Progress only');
select throws_ok(format($q$update public.work_items set state_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 's_done')),
  'P0001', null, 'a move outside the configured rules is rejected');
select lives_ok(format($q$update public.work_items set state_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 's_in_progress')), 'an allowed move succeeds');
select throws_ok(format($q$update public.workflow_states set archived_at = now() where id = %L$q$, (select id from fx where k = 's_in_progress')),
  'P0001', null, 'a state holding items cannot be archived');

-- Sprints and burndown --------------------------------------------------------------------------
select lives_ok(format($q$update public.work_items set sprint_id = %L where key = 'WRK-2'$q$, (select id from fx where k = 'sp_s1')), 'item added to a planned sprint');
select lives_ok(format($q$select public.start_sprint(%L)$q$, (select id from fx where k = 'sp_s1')), 'sprint starts');
select is((select committed_points from public.sprints where id = (select id from fx where k = 'sp_s1')), 5.0, 'start records the committed points');
select throws_ok(format($q$select public.start_sprint(%L)$q$, (select id from fx where k = 'sp_s2')), 'P0001', null, 'only one active sprint per project');
select is((select scope_points from public.sprint_daily_stats where sprint_id = (select id from fx where k = 'sp_s1')), 5.0, 'daily stats are written for the active sprint');
select lives_ok(format($q$select public.complete_sprint(%L, %L)$q$, (select id from fx where k = 'sp_s1'), (select id from fx where k = 'sp_s2')), 'sprint completes');
select is((select sprint_id from public.work_items where key = 'WRK-2'), (select id from fx where k = 'sp_s2'), 'unfinished work moves to the chosen sprint');
select is((select completed_points from public.sprints where id = (select id from fx where k = 'sp_s1')), 0.0, 'completed points are recorded');

-- Dependencies -----------------------------------------------------------------------------------
select lives_ok(format($q$insert into public.work_item_dependencies (organization_id, predecessor_id, successor_id) values (%L, %L, %L)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'w_wrk_1'), (select id from fx where k = 'w_wrk_2')), 'dependency added');
select throws_ok(format($q$insert into public.work_item_dependencies (organization_id, predecessor_id, successor_id) values (%L, %L, %L)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'w_wrk_2'), (select id from fx where k = 'w_wrk_1')), 'P0001', null, 'circular blocking is rejected');

-- Visibility -------------------------------------------------------------------------------------
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.set_work_item_archived(%L, true)$q$, (select id from fx where k = 'w_wrk_1')), '42501', null, 'developers cannot archive items');
select pg_temp.login('f0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.work_items), 0, 'client stakeholders cannot see internal work items');
select is((select count(*)::int from public.project_milestones), 1, 'client stakeholders can see milestones of shared projects');
select pg_temp.login('f1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.work_items where organization_id = (select id from fx where k = 'org')), 0, 'work items are tenant-isolated');

select * from finish();
rollback;
