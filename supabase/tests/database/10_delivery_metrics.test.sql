-- Delivery metrics: weekly entries, auto values, period aggregation, recipient settings, the report job
-- and the send path. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(93);

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
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- The value of one metric in a project_metrics result.
create function pg_temp.mv(p_metrics jsonb, p_key text) returns numeric language sql as $$
  select (e ->> 'value')::numeric from jsonb_array_elements(p_metrics) e where e ->> 'key' = p_key;
$$;
create function pg_temp.ms(p_metrics jsonb, p_key text) returns text language sql as $$
  select e ->> 'source' from jsonb_array_elements(p_metrics) e where e ->> 'key' = p_key;
$$;

-- Fixtures ---------------------------------------------------------------------------------
-- 01 owner, 02 project manager of MTA, 03 developer on MTA (can read, cannot publish),
-- 04 developer NOT on MTA; x1 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@mt.test', now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pm@mt.test',  now(), '{"display_name":"PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dev@mt.test', now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'aa000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'out@mt.test', now(), '{"display_name":"Outsider"}'),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@mtx.test',  now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated, service_role;
create temporary table dt (k text primary key, d date not null);
grant select on dt to authenticated, service_role;
-- W0 is the last complete week (Monday), W1 and W2 the two before it.
insert into dt values
  ('w0', date_trunc('week', current_date)::date - 7),
  ('w1', date_trunc('week', current_date)::date - 14),
  ('w2', date_trunc('week', current_date)::date - 21),
  ('thisweek', date_trunc('week', current_date)::date),
  ('m0', (date_trunc('month', current_date) - interval '1 month')::date);
insert into fx values
  ('org', private.bootstrap_organization('Metrics Org', 'metrics-org', 'aa000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other MT Org', 'other-mt-org', 'ab000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id, job_title)
select (select id from fx where k = 'org'), u.id, u.title
from (values ('aa000000-0000-4000-8000-000000000002'::uuid, 'PM'), ('aa000000-0000-4000-8000-000000000003', 'Engineer'), ('aa000000-0000-4000-8000-000000000004', 'Engineer 2')) u(id, title);
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_pm', 'project_manager'), ('m_dev', 'developer'), ('m_out', 'developer')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.projects (organization_id, code, name, created_by, project_manager_id) values
  ((select id from fx where k = 'org'), 'MTA', 'Metrics A', 'aa000000-0000-4000-8000-000000000001', (select id from fx where k = 'm_pm')),
  ((select id from fx where k = 'org_x'), 'MTX', 'Other tenant', 'ab000000-0000-4000-8000-000000000001', null);
insert into fx select 'p_' || lower(code), id from public.projects where code in ('MTA', 'MTX');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), (select id from fx where k = 'm_dev'));
insert into fx select 's_default', id from public.workflow_states where organization_id = (select id from fx where k = 'org') and is_default;

-- Catalogue ----------------------------------------------------------------------------------------
select is((select count(*)::int from private.metric_catalogue()), 30, 'the catalogue has 30 metrics');
select is((select count(*)::int from private.metric_catalogue() where agg = 'computed'), 1, 'exactly one metric is computed, never entered');
select is((select count(*)::int from private.metric_catalogue() where auto), 6, 'six metrics can be filled from existing data');
select is((select count(*)::int from private.metric_catalogue() where lo >= hi), 0, 'every range is non-empty');

-- Entering values ----------------------------------------------------------------------------------
select pg_temp.login('aa000000-0000-4000-8000-000000000002');
select is(public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"qa_bugs": 3, "test_pass_rate_pct": 92.5}'), 2, 'a project manager saves two values');
select is((select count(*)::int from public.project_metric_entries), 2, 'the manager reads them back');
select is((select value from public.project_metric_entries where metric_key = 'test_pass_rate_pct'), 92.50, 'decimals are kept');
select is(public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"qa_bugs": 5}'), 1, 'saving again updates');
select is((select value from public.project_metric_entries where metric_key = 'qa_bugs'), 5.00, 'the value was replaced');
select is((select count(*)::int from public.project_metric_entries where metric_key = 'qa_bugs'), 1, 'and not duplicated');
select is(public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"qa_bugs": null}'), 1, 'null clears a value');
select is((select count(*)::int from public.project_metric_entries where metric_key = 'qa_bugs'), 0, 'the cleared value is gone');
select throws_ok(format('insert into public.project_metric_entries (organization_id, project_id, metric_key, period_start, value) values (%L, %L, %L, %L, 1)',
  (select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), 'qa_bugs', (select d from dt where k = 'w0')), '42501', null, 'values cannot be written directly');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0') + 1, '{"qa_bugs": 1}'), 'P0001', null, 'a week must start on a Monday');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'thisweek') + 7, '{"qa_bugs": 1}'), 'P0001', null, 'a week that has not started is refused');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"bogus_metric": 1}'), 'P0001', null, 'an unknown metric is refused');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"metrics_reported_pct": 50}'), 'P0001', null, 'the computed metric cannot be entered');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"test_pass_rate_pct": 101}'), 'P0001', null, 'a percentage above 100 is refused');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"nps_score": -101}'), 'P0001', null, 'an NPS below -100 is refused');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"qa_bugs": "many"}'), 'P0001', null, 'a non-number is refused');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '[1,2]'), 'P0001', null, 'a list instead of an object is refused');
select is(public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"nps_score": -40}'), 1, 'a negative NPS inside the range is accepted');
select pg_temp.as_postgres();
select is((select count(*)::int from public.audit_logs where entity_type = 'project_metric_entries' and organization_id = (select id from fx where k = 'org')) > 0, true, 'entries are audited');
select pg_temp.login('aa000000-0000-4000-8000-000000000002');

-- Who can enter and who can read ----------------------------------------------------------------------
select pg_temp.login('aa000000-0000-4000-8000-000000000003');
select is(public.can_enter_metrics((select id from fx where k = 'p_mta')), true, 'a developer assigned to the project may enter values');
select is(public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"uat_bugs": 2, "uat_coverage_pct": 65}'), 2, 'and does');
select is((select entered_by from public.project_metric_entries where metric_key = 'uat_bugs'), 'aa000000-0000-4000-8000-000000000003'::uuid, 'the entry records who typed it');
select is(public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"uat_bugs": null, "uat_coverage_pct": null}'), 2, 'and can clear their own values');
select throws_ok(format('select public.save_report_settings(%L, true, false, %L)', (select id from fx where k = 'p_mta'), array['dev@mt.test']), '42501', null, 'but cannot change who receives the report');
select ok((select count(*) from public.project_metric_entries) >= 2, 'but can read them');
select ok(jsonb_array_length(public.project_metrics((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), (select d from dt where k = 'w0') + 6)) = 30, 'and can read the report figures');
select pg_temp.login('aa000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.project_metric_entries), 0, 'a developer outside the project sees no values');
select throws_ok(format('select public.project_metrics(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), (select d from dt where k = 'w0') + 6), '42501', null, 'nor the report figures');
select is(public.can_enter_metrics((select id from fx where k = 'p_mta')), false, 'nor enter values');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"qa_bugs": 1}'), '42501', null, 'and the write is refused');
select pg_temp.login('ab000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.project_metric_entries), 0, 'another tenant sees nothing');
select throws_ok(format('select public.save_metric_entries(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"qa_bugs": 1}'), '42501', null, 'and cannot enter values for this project');
select throws_ok(format('select public.project_metrics(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), (select d from dt where k = 'w0') + 6), '42501', null, 'or read its figures');

-- Auto values --------------------------------------------------------------------------------------
select pg_temp.as_postgres();
insert into public.work_items (organization_id, project_id, type, title, state_id)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), 'change_request', 'Add a report', (select id from fx where k = 's_default'));
update public.work_items set created_at = (select d from dt where k = 'w0')::timestamptz + interval '1 day' where title = 'Add a report';
insert into public.work_items (organization_id, project_id, type, title, state_id)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), 'task', 'Do the thing', (select id from fx where k = 's_default'));
insert into public.work_item_links (organization_id, work_item_id, kind, url, created_at)
select (select id from fx where k = 'org'), w.id, 'pull_request', 'https://example.test/pr/' || n, (select d from dt where k = 'w0')::timestamptz + interval '2 days'
from public.work_items w, generate_series(1, 2) n where w.title = 'Do the thing';
insert into public.releases (organization_id, project_id, name) values ((select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), 'R1');
update public.releases set status = 'released', released_on = (select d from dt where k = 'w0') + 2 where name = 'R1';
insert into public.escalations (organization_id, project_id, title, description, severity, escalated_to_membership_id, respond_by, created_at)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), 'Open one', 'Needs a decision', 'high', (select id from fx where k = 'm_pm'), now() + interval '30 days', (select d from dt where k = 'w0')::timestamptz + interval '1 day'),
       ((select id from fx where k = 'org'), (select id from fx where k = 'p_mta'), 'Closed one', 'Was resolved', 'medium', (select id from fx where k = 'm_pm'), now() + interval '30 days', (select d from dt where k = 'w0')::timestamptz + interval '1 day');
update public.escalations set status = 'resolved', resolved_at = (select d from dt where k = 'w0')::timestamptz + interval '2 days', resolution_note = 'Done' where title = 'Closed one';

select pg_temp.login('aa000000-0000-4000-8000-000000000002');
create temporary table w0m (m jsonb);
grant select, insert on w0m to authenticated;
insert into w0m select public.project_metrics((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), (select d from dt where k = 'w0') + 6);
select is(pg_temp.mv((select m from w0m), 'scope_creeps'), 1::numeric, 'a change request counts as a scope creep');
select is(pg_temp.mv((select m from w0m), 'pull_requests'), 2::numeric, 'linked pull requests are counted');
select is(pg_temp.mv((select m from w0m), 'releases_successful'), 1::numeric, 'a release published in the week is counted');
select is(pg_temp.mv((select m from w0m), 'customer_escalations'), 2::numeric, 'escalations raised are counted');
select is(pg_temp.mv((select m from w0m), 'escalations_completed'), 1::numeric, 'escalations resolved are counted');
select is(pg_temp.mv((select m from w0m), 'escalations_pending'), 1::numeric, 'escalations still open at the period end are counted');
select is(pg_temp.ms((select m from w0m), 'pull_requests'), 'auto', 'they are marked as automatic');
select is(pg_temp.mv((select m from w0m), 'test_pass_rate_pct'), 92.5, 'a manual value shows alongside');
select is(pg_temp.ms((select m from w0m), 'test_pass_rate_pct'), 'manual', 'marked as manual');
select is(pg_temp.mv((select m from w0m), 'hotfix_releases'), null, 'a metric nobody entered is empty, not zero');
select public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"scope_creeps": 4}');
select is(pg_temp.mv(public.project_metrics((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), (select d from dt where k = 'w0') + 6), 'scope_creeps'), 4::numeric, 'a manual value overrides the automatic one');
select is(pg_temp.mv((select m from w0m), 'metrics_reported_pct'), round(100.0 * (select count(*) from jsonb_array_elements((select m from w0m)) e where e ->> 'source' in ('auto', 'manual')) / 29), 'the reported share counts metrics that have a value');
select is(pg_temp.mv(public.project_metrics((select id from fx where k = 'p_mta'), (select d from dt where k = 'w2'), (select d from dt where k = 'w2') + 6), 'metrics_reported_pct'), 21::numeric, 'a quiet week reports only the six automatic zeros');

-- Periods ----------------------------------------------------------------------------------------------
select public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w1'), '{"unit_test_coverage_pct": 60, "qa_bugs": 2, "csat_score": 75}');
select public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w2'), '{"csat_score": 50}');
select public.save_metric_entries((select id from fx where k = 'p_mta'), (select d from dt where k = 'w0'), '{"unit_test_coverage_pct": 80, "qa_bugs": 5}');
create temporary table span (m jsonb);
grant select, insert on span to authenticated;
insert into span select public.project_metrics((select id from fx where k = 'p_mta'), (select d from dt where k = 'w2'), (select d from dt where k = 'w0') + 6);
select is(pg_temp.mv((select m from span), 'unit_test_coverage_pct'), 70::numeric, 'percentages average across weeks');
select is(pg_temp.mv((select m from span), 'qa_bugs'), 7::numeric, 'counts add up across weeks');
select is(pg_temp.mv((select m from span), 'csat_score'), 75::numeric, 'a quarterly score takes the latest week');
select throws_ok(format('select public.project_metrics(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0') + 6, (select d from dt where k = 'w0')), 'P0001', null, 'a period that ends before it starts is refused');
select throws_ok(format('select public.project_metrics(%L, %L, %L)', (select id from fx where k = 'p_mta'), (select d from dt where k = 'w0') - 200, (select d from dt where k = 'w0')), 'P0001', null, 'a period longer than 93 days is refused');

-- Recipients ---------------------------------------------------------------------------------------------
select throws_ok(format('select public.save_report_settings(%L, true, false, %L)', (select id from fx where k = 'p_mta'), array[]::text[]), 'P0001', null, 'a report cannot be turned on without a recipient');
select throws_ok(format('select public.save_report_settings(%L, true, false, %L)', (select id from fx where k = 'p_mta'), array['not-an-email']), 'P0001', null, 'a malformed address is refused');
select throws_ok(format('select public.save_report_settings(%L, true, false, %L)', (select id from fx where k = 'p_mta'), (select array_agg('u' || n || '@mt.test') from generate_series(1, 21) n)), 'P0001', null, 'more than 20 addresses are refused');
select lives_ok(format('select public.save_report_settings(%L, true, false, %L)', (select id from fx where k = 'p_mta'), array['Client@Customer.test', ' pm@mt.test ', 'client@customer.test']), 'weekly on with mixed-case duplicates saves');
select is((select recipients from public.project_report_settings), array['client@customer.test', 'pm@mt.test'], 'addresses are trimmed, lowercased and de-duplicated');
select pg_temp.as_postgres();
select is((select count(*)::int from public.audit_logs where entity_type = 'project_report_settings' and changes::text like '%@%'), 0, 'the audit entry holds no addresses');
select is((select (changes ->> 'recipients')::int from public.audit_logs where entity_type = 'project_report_settings' order by occurred_at desc limit 1), 2, 'only their number');
select pg_temp.login('aa000000-0000-4000-8000-000000000002');
select throws_ok(format('update public.project_report_settings set recipients = %L where project_id = %L', array['evil@x.test'], (select id from fx where k = 'p_mta')), '42501', null, 'settings cannot be written directly');
select pg_temp.login('aa000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.project_report_settings), 0, 'a developer cannot see the recipient list');
select throws_ok(format('select public.save_report_settings(%L, false, false, %L)', (select id from fx where k = 'p_mta'), array['x@y.test']), '42501', null, 'nor change it');

-- The job -----------------------------------------------------------------------------------------------------
select pg_temp.as_postgres();
select is((private.job_metrics_reports((select id from fx where k = 'org')) ->> 'weekly')::int, 0, 'a project that has not started gets no report');
update public.projects set status = 'approved' where id = (select id from fx where k = 'p_mta');
update public.projects set status = 'planning' where id = (select id from fx where k = 'p_mta');
update public.projects set status = 'active' where id = (select id from fx where k = 'p_mta');
select is((select (private.job_metrics_reports((select id from fx where k = 'org')) ->> 'weekly')::int), 1, 'the job generates the last complete week');
select is((select (private.job_metrics_reports((select id from fx where k = 'org')) ->> 'weekly')::int), 0, 'a second run generates nothing');
select is((select period_start from public.metric_report_runs where kind = 'weekly'), (select d from dt where k = 'w0'), 'for the previous Monday');
select is((select period_end - period_start from public.metric_report_runs where kind = 'weekly'), 6, 'covering seven days');
select is((select jsonb_array_length(payload -> 'metrics') from public.metric_report_runs where kind = 'weekly'), 30, 'the payload carries all 30 metrics');
select is((select payload -> 'project' ->> 'code' from public.metric_report_runs where kind = 'weekly'), 'MTA', 'and the project');
select is((select count(*)::int from public.metric_report_runs where kind = 'monthly'), 0, 'no monthly report while monthly is off');
select public.save_report_settings((select id from fx where k = 'p_mta'), true, true, array['client@customer.test']) where false;
update public.project_report_settings set monthly_enabled = true;
select is((select (private.job_metrics_reports((select id from fx where k = 'org')) ->> 'monthly')::int), 1, 'turning monthly on generates the previous month');
select is((select period_start from public.metric_report_runs where kind = 'monthly'), (select d from dt where k = 'm0'), 'starting on its first day');
select is((select count(*)::int from public.scheduled_jobs where organization_id = (select id from fx where k = 'org') and key = 'metrics_reports'), 1, 'the scheduler has the job');
select throws_ok(format('insert into public.scheduled_jobs (organization_id, key, interval_minutes) values (%L, %L, 60)', (select id from fx where k = 'org_x'), 'bogus_job'), '23514', null, 'but not unknown jobs');

-- Sending ---------------------------------------------------------------------------------------------------------
select pg_temp.login('aa000000-0000-4000-8000-000000000002');
select throws_ok('select * from public.claim_pending_reports(10)', '42501', null, 'a signed-in user cannot claim reports');
select is((select count(*)::int from public.metric_report_runs), 2, 'a manager sees the report history');
select pg_temp.login('aa000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.metric_report_runs), 0, 'a developer does not');
select pg_temp.as_service();
select is((select count(*)::int from public.claim_pending_reports(10)), 2, 'the worker claims both pending reports');
select is((select count(*)::int from public.claim_pending_reports(10)), 0, 'a second claim straight after finds nothing');
select is((select min(attempts) from public.metric_report_runs), 1, 'each claim counts an attempt');
select public.complete_report_run((select id from public.metric_report_runs where kind = 'weekly'), array['pm@mt.test'], 'sent', 'provider timeout');
select is((select status from public.metric_report_runs where kind = 'weekly'), 'pending', 'a partly delivered report stays pending');
select is((select delivered_to from public.metric_report_runs where kind = 'weekly'), array['pm@mt.test'], 'remembering who already has it');
select public.complete_report_run((select id from public.metric_report_runs where kind = 'weekly'), array['client@customer.test'], 'sent', null);
select is((select status from public.metric_report_runs where kind = 'weekly'), 'sent', 'delivery to the rest completes it');
select isnt((select sent_at from public.metric_report_runs where kind = 'weekly'), null, 'and stamps the time');
select public.complete_report_run((select id from public.metric_report_runs where kind = 'monthly'), array['client@customer.test', 'pm@mt.test'], 'simulated', null);
select is((select status from public.metric_report_runs where kind = 'monthly'), 'simulated', 'without a mail provider the report is marked simulated');
select public.complete_report_run((select id from public.metric_report_runs where kind = 'weekly'), array['other@x.test'], 'sent', null);
select is((select array_length(delivered_to, 1) from public.metric_report_runs where kind = 'weekly'), 2, 'a finished report is not changed again');

select pg_temp.as_postgres();
update public.metric_report_runs set status = 'pending', attempts = 3, delivered_to = '{}' where kind = 'weekly';
select is((select count(*)::int from public.claim_pending_reports(10)), 0, 'a report that used its attempts is not claimed again');
update public.metric_report_runs set claimed_at = now() - interval '1 hour', attempts = 2 where kind = 'weekly';
select pg_temp.as_service();
select is((select count(*)::int from public.claim_pending_reports(10)), 1, 'a stale claim is picked up again');
select public.complete_report_run((select id from public.metric_report_runs where kind = 'weekly'), array[]::text[], 'sent', 'down');
select is((select status from public.metric_report_runs where kind = 'weekly'), 'failed', 'a third failed attempt marks the report failed');

-- Skipped projects ------------------------------------------------------------------------------------------------------
select pg_temp.as_postgres();
delete from public.metric_report_runs;
update public.projects set archived_at = now() where id = (select id from fx where k = 'p_mta');
select is((private.job_metrics_reports((select id from fx where k = 'org')) ->> 'weekly')::int, 0, 'an archived project gets no report');

select * from finish();
rollback;
