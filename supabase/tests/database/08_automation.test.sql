-- Phase 7 automation: permissions, outbox triggers, fan-out and recipient gating, notification
-- deduplication and preferences, webhook secrecy and retries, workflow rules, scheduled jobs,
-- integrations, service-only RPCs and tenant isolation. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(107);

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
create function pg_temp.rows_affected(q text) returns int language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;

-- Fixtures ---------------------------------------------------------------------------------
-- 01 owner (org_admin), 02 project manager of AUA, 03 developer on AUA, 04 developer NOT on AUA;
-- x1 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@au.test', now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pm@au.test',  now(), '{"display_name":"PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dev@au.test', now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'out@au.test', now(), '{"display_name":"Outsider"}'),
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@aux.test',  now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated, service_role;
insert into fx values
  ('org', private.bootstrap_organization('Auto Org', 'auto-org', 'a8000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other AU Org', 'other-au-org', 'a9000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id, job_title)
select (select id from fx where k = 'org'), u.id, u.title
from (values ('a8000000-0000-4000-8000-000000000002'::uuid, 'PM'), ('a8000000-0000-4000-8000-000000000003', 'Engineer'), ('a8000000-0000-4000-8000-000000000004', 'Engineer 2')) u(id, title);
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_pm', 'project_manager'), ('m_dev', 'developer'), ('m_out', 'developer')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.projects (organization_id, code, name, created_by, project_manager_id) values
  ((select id from fx where k = 'org'), 'AUA', 'Auto A', 'a8000000-0000-4000-8000-000000000001', (select id from fx where k = 'm_pm')),
  ((select id from fx where k = 'org_x'), 'AUX', 'Other tenant', 'a9000000-0000-4000-8000-000000000001', null);
insert into fx select 'p_' || lower(code), id from public.projects where code in ('AUA', 'AUX');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_aua'), (select id from fx where k = 'm_dev'));
insert into fx select 's_default', id from public.workflow_states where organization_id = (select id from fx where k = 'org') and is_default;

-- Permissions -----------------------------------------------------------------------------
select is((select count(*)::int from public.permissions where key like 'automation.%'), 2, 'two automation permissions exist');
select ok(exists (select 1 from public.role_permissions rp join public.role_definitions rd on rd.id = rp.role_id
                  where rd.organization_id = (select id from fx where k = 'org') and rd.key = 'org_admin' and rp.permission_key = 'automation.manage'),
          'org_admin can manage automation');
select ok(exists (select 1 from public.role_permissions rp join public.role_definitions rd on rd.id = rp.role_id
                  where rd.organization_id = (select id from fx where k = 'org') and rd.key = 'delivery_head' and rp.permission_key = 'automation.read'),
          'delivery_head can read automation');
select ok(not exists (select 1 from public.role_permissions rp join public.role_definitions rd on rd.id = rp.role_id
                  where rd.organization_id = (select id from fx where k = 'org') and rd.key in ('delivery_head', 'project_manager', 'developer') and rp.permission_key = 'automation.manage'),
          'only administrators manage automation');

-- Scheduler seeding -------------------------------------------------------------------------
select is((select count(*)::int from public.scheduled_jobs where organization_id = (select id from fx where k = 'org')), 5, 'every organization gets the five default jobs');
select is((select count(*)::int from public.scheduled_jobs where organization_id = (select id from fx where k = 'org_x')), 5, 'organizations created later are seeded by trigger');

-- Outbox triggers -------------------------------------------------------------------------
select pg_temp.as_postgres();
update public.projects set health = 'red', health_reason = 'Slipping' where id = (select id from fx where k = 'p_aua');
select is((select payload ->> 'to' from public.outbox_events where event_type = 'project.health_changed' and entity_id = (select id from fx where k = 'p_aua')), 'red',
          'a health change writes an outbox event with from/to');
update public.projects set name = 'Auto A renamed' where id = (select id from fx where k = 'p_aua');
select is((select count(*)::int from public.outbox_events where event_type = 'project.health_changed'), 1, 'unrelated edits write no event');

insert into public.work_items (organization_id, project_id, type, title, state_id, assignee_membership_id)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_aua'), 'task', 'Wire the thing', (select id from fx where k = 's_default'), (select id from fx where k = 'm_dev'));
insert into fx select 'wi', id from public.work_items where title = 'Wire the thing';
select is((select count(*)::int from public.outbox_events where event_type = 'work_item.assigned' and entity_id = (select id from fx where k = 'wi')), 1, 'creating an assigned item writes work_item.assigned');
update public.work_items set blocked = true, blocked_reason = 'Waiting on vendor' where id = (select id from fx where k = 'wi');
select is((select count(*)::int from public.outbox_events where event_type = 'work_item.blocked' and entity_id = (select id from fx where k = 'wi')), 1, 'blocking an item writes work_item.blocked');
select ok(not ((select payload::text from public.outbox_events where event_type = 'work_item.blocked' limit 1) like '%vendor%'), 'the blocked reason is not copied into the event');

insert into public.raid_items (organization_id, project_id, type, title, probability, impact, owner_membership_id)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_aua'), 'risk', 'Vendor slips', 5, 4, (select id from fx where k = 'm_pm')),
       ((select id from fx where k = 'org'), (select id from fx where k = 'p_aua'), 'risk', 'Minor wobble', 1, 1, (select id from fx where k = 'm_pm'));
select is((select count(*)::int from public.outbox_events where event_type = 'raid.created'), 2, 'each RAID item writes raid.created');

insert into public.escalations (organization_id, project_id, title, description, severity, escalated_to_membership_id, respond_by)
values ((select id from fx where k = 'org'), (select id from fx where k = 'p_aua'), 'Need budget', 'Please decide', 'high', (select id from fx where k = 'm_pm'), now() + interval '1 day'),
       ((select id from fx where k = 'org'), (select id from fx where k = 'p_aua'), 'Late answer', 'Past due', 'medium', (select id from fx where k = 'm_pm'), now() - interval '2 days');
select is((select count(*)::int from public.outbox_events where event_type = 'escalation.raised'), 2, 'each escalation writes escalation.raised');

insert into public.timesheets (organization_id, membership_id, week_start, status)
values ((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), date '2026-06-01', 'draft');
update public.timesheets set status = 'submitted', submitted_at = now() where membership_id = (select id from fx where k = 'm_dev');
select is((select count(*)::int from public.outbox_events where event_type = 'timesheet.submitted'), 1, 'submitting a timesheet writes timesheet.submitted');

-- Outbox visibility --------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.outbox_events) > 5, 'an administrator can read the event stream');
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.outbox_events), 0, 'a project manager without automation.read sees no events');
select pg_temp.login('a9000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.outbox_events), 0, 'another organization sees none of these events');

-- Service-only functions ------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select throws_ok('select * from public.claim_outbox_events(10)', '42501', null, 'signed-in users cannot claim events');
select throws_ok('select public.fan_out_event(gen_random_uuid())', '42501', null, 'signed-in users cannot fan out');
select throws_ok('select * from public.claim_webhook_deliveries(10)', '42501', null, 'signed-in users cannot claim webhook deliveries (which carry secrets)');
select throws_ok('select * from public.claim_due_jobs(10)', '42501', null, 'signed-in users cannot claim jobs');
select throws_ok('select public.record_heartbeat(''{}'')', '42501', null, 'signed-in users cannot write the heartbeat');

-- Fan-out and notifications -----------------------------------------------------------------------
select pg_temp.as_service();
insert into fx select 'ev_health', id from public.outbox_events where event_type = 'project.health_changed';
select is((select (public.fan_out_event((select id from fx where k = 'ev_health')) ->> 'notifications')::int), 1, 'health change notifies one person (the project manager)');
select pg_temp.as_postgres();
select is((select severity from public.notifications where type = 'project.health_changed'), 'critical', 'going red is critical');
select is((select membership_id from public.notifications where type = 'project.health_changed'), (select id from fx where k = 'm_pm'), 'the project manager is the recipient');
select ok((select processed_at is not null from public.outbox_events where id = (select id from fx where k = 'ev_health')), 'the event is marked processed');
select pg_temp.as_service();
select ok((public.fan_out_event((select id from fx where k = 'ev_health')) ->> 'skipped')::boolean, 'fan-out of a processed event does nothing (idempotent)');

-- assigned: dev gets it
insert into fx select 'ev_assigned', id from public.outbox_events where event_type = 'work_item.assigned';
select public.fan_out_event((select id from fx where k = 'ev_assigned'));
select pg_temp.as_postgres();
select is((select count(*)::int from public.notifications where type = 'work_item.assigned' and membership_id = (select id from fx where k = 'm_dev')), 1, 'the assignee is notified');

-- blocked: pm and dev (assignee) are notified; the outsider is never a candidate
select pg_temp.as_service();
select public.fan_out_event(id) from public.outbox_events where event_type = 'work_item.blocked';
select pg_temp.as_postgres();
select is((select count(*)::int from public.notifications where type = 'work_item.blocked'), 2, 'a blocked item notifies the project manager and the assignee');

-- raid: only the high risk interrupts anyone
select pg_temp.as_service();
select public.fan_out_event(id) from public.outbox_events where event_type = 'raid.created';
select pg_temp.as_postgres();
select is((select count(*)::int from public.notifications where type = 'raid.created'), 1, 'only the high-scoring risk notifies');

-- escalations
select pg_temp.as_service();
select public.fan_out_event(id) from public.outbox_events where event_type = 'escalation.raised';
select pg_temp.as_postgres();
select is((select count(*)::int from public.notifications where type = 'escalation.raised' and membership_id = (select id from fx where k = 'm_pm')), 2, 'the escalation recipient is notified of each');

-- timesheets: dev has no manager, so people with timesheet.approve are told (not the submitter)
select pg_temp.as_service();
select public.fan_out_event(id) from public.outbox_events where event_type = 'timesheet.submitted';
select pg_temp.as_postgres();
select ok(not exists (select 1 from public.notifications where type = 'timesheet.submitted' and membership_id = (select id from fx where k = 'm_dev')), 'the submitter is not told about their own submission');

-- Recipient gating: a member who cannot read the project is never notified about it.
select pg_temp.as_postgres();
select ok(not private.membership_can_read_project((select id from fx where k = 'm_out'), (select id from fx where k = 'p_aua')), 'the outsider cannot read the project');
select ok(private.membership_can_read_project((select id from fx where k = 'm_dev'), (select id from fx where k = 'p_aua')), 'the assigned developer can');
select is(private.notify_member((select id from fx where k = 'org'), (select id from fx where k = 'm_out'), null, 'delivery', 'test', 'Secret', null, '/x', 'info', 'k1', (select id from fx where k = 'p_aua')), false,
          'notify_member refuses a recipient who cannot read the project');
select is(private.notify_member((select id from fx where k = 'org_x'), (select id from fx where k = 'm_dev'), null, 'delivery', 'test', 'Cross', null, '/x', 'info', 'k2', null), false,
          'notify_member refuses a membership from another organization');

-- Actor is not notified of their own change
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select lives_ok(format('update public.raid_items set status = %L where title = %L', 'in_progress', 'Vendor slips'), 'pm updates a RAID item');
select pg_temp.as_postgres();
update public.projects set health = 'green' where id = (select id from fx where k = 'p_aua');
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select public.set_project_health((select id from fx where k = 'p_aua'), 'amber', 'Watching');
select pg_temp.as_postgres();
select is((select actor_membership_id from public.outbox_events where event_type = 'project.health_changed' and payload ->> 'to' = 'amber'), (select id from fx where k = 'm_pm'), 'the actor is recorded on the event');
select pg_temp.as_service();
select public.fan_out_event(id) from public.outbox_events where event_type = 'project.health_changed' and processed_at is null;
select pg_temp.as_postgres();
select is((select count(*)::int from public.notifications where type = 'project.health_changed' and severity = 'warning'), 0, 'the person who changed health is not notified of their own change');

-- Deduplication ------------------------------------------------------------------------------------
select private.notify_member((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), null, 'delivery', 't', 'Same thing', 'one', '/dup', 'info', 'dupe-key', null);
select private.notify_member((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), null, 'delivery', 't', 'Same thing', 'two', '/dup', 'info', 'dupe-key', null);
select is((select count(*)::int from public.notifications where dedupe_key = 'dupe-key'), 1, 'unread repeats collapse into one row');
select is((select occurrences from public.notifications where dedupe_key = 'dupe-key'), 2, 'and count occurrences');
select is((select body from public.notifications where dedupe_key = 'dupe-key'), 'two', 'the row shows the latest text');
select pg_temp.login('a8000000-0000-4000-8000-000000000003');
select is(pg_temp.rows_affected($q$update public.notifications set read_at = now() where dedupe_key = 'dupe-key'$q$), 1, 'a recipient marks their notification read');
select pg_temp.as_postgres();
select private.notify_member((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), null, 'delivery', 't', 'Same thing', 'three', '/dup', 'info', 'dupe-key', null);
select is((select count(*)::int from public.notifications where dedupe_key = 'dupe-key'), 2, 'after reading, the next one is a new notification');

-- Notification privacy ----------------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.notifications where membership_id <> (select id from fx where k = 'm_dev')), 0, 'a person sees only their own notifications');
select throws_ok(format($q$insert into public.notifications (organization_id, membership_id, category, type, title, dedupe_key) values (%L, %L, 'system', 't', 'Forged', 'f')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_dev')), '42501', null, 'nobody can write notifications from a session');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.notifications where membership_id <> (select id from fx where k = 'm_own')), 0, 'administrators do not see other people''s notifications');

-- Preferences ---------------------------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000003');
select lives_ok(format($q$insert into public.notification_preferences (organization_id, membership_id, category, in_app, email) values (%L, %L, 'workforce', false, true)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_dev')), 'a person sets their own preferences');
select throws_ok(format($q$insert into public.notification_preferences (organization_id, membership_id, category, in_app, email) values (%L, %L, 'workforce', false, false)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_pm')), '42501', null, 'but not someone else''s');
select pg_temp.as_postgres();
select private.notify_member((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), null, 'workforce', 't', 'Pref test', null, '/p', 'info', 'pref-1', null);
select is((select read_at is not null and email_status = 'pending' from public.notifications where dedupe_key = 'pref-1'), true, 'in-app off + email on records an email-only notification, never shown as unread');
select private.notify_member((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), null, 'workforce', 't', 'Critical test', null, '/p', 'critical', 'pref-2', null);
select is((select read_at is null from public.notifications where dedupe_key = 'pref-2'), true, 'critical notifications always reach the inbox');

-- Email queue --------------------------------------------------------------------------------------------------
select pg_temp.as_service();
select is((select count(*)::int from public.claim_pending_emails(10) where to_email = 'dev@au.test'), 2, 'pending emails are claimed with the recipient address');
select public.complete_notification_email((select id from public.notifications where dedupe_key = 'pref-1'), 'simulated');
select pg_temp.as_postgres();
select is((select email_status from public.notifications where dedupe_key = 'pref-1'), 'simulated', 'a simulated send is recorded as such');

-- Webhooks -------------------------------------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select throws_ok($q$select public.create_webhook_endpoint((select id from public.organizations where slug = 'auto-org'), 'Nope', 'https://example.com/h', 'generic', '{*}')$q$, '42501', null, 'a project manager cannot create webhooks');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select lives_ok(format($q$insert into fx select 'wh', (public.create_webhook_endpoint(%L, 'Ops hook', 'https://example.com/hook', 'generic', '{project.health_changed}') ->> 'id')::uuid$q$, (select id from fx where k = 'org')), 'an administrator creates a webhook');
select throws_ok(format($q$select public.create_webhook_endpoint(%L, 'Plain', 'http://example.com/h', 'generic', '{*}')$q$, (select id from fx where k = 'org')), '23514', null, 'plain http endpoints are refused');
select is((select count(*)::int from public.webhook_endpoints), 1, 'the administrator sees the endpoint');
select throws_ok('select secret from public.webhook_secrets', '42501', null, 'secrets are not readable by anyone signed in');
select throws_ok('select * from public.webhook_deliveries where payload is not null', '42501', null, 'delivery payload column is not granted either');
select ok(length(public.rotate_webhook_secret((select id from fx where k = 'wh'))) > 20, 'rotating returns a new secret once');
select pg_temp.login('a9000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.webhook_endpoints), 0, 'another organization cannot see the endpoint');

select pg_temp.as_postgres();
update public.projects set health = 'red' where id = (select id from fx where k = 'p_aua');
select pg_temp.as_service();
select public.fan_out_event(id) from public.outbox_events where event_type = 'project.health_changed' and processed_at is null;
select pg_temp.as_postgres();
select is((select count(*)::int from public.webhook_deliveries where endpoint_id = (select id from fx where k = 'wh')), 1, 'a subscribed event queues exactly one delivery');
select pg_temp.as_service();
insert into fx select 'del', id from public.claim_webhook_deliveries(10);
select ok(exists (select 1 from fx where k = 'del'), 'the worker claims the delivery (with url and secret)');
select public.complete_webhook_delivery((select id from fx where k = 'del'), 500, 'boom');
select pg_temp.as_postgres();
select is((select status::text || attempts from public.webhook_deliveries where id = (select id from fx where k = 'del')), 'pending1', 'a failure schedules a retry');
select ok((select next_attempt_at > now() from public.webhook_deliveries where id = (select id from fx where k = 'del')), 'with a delay');
update public.webhook_deliveries set attempts = 7 where id = (select id from fx where k = 'del');
select pg_temp.as_service();
select public.complete_webhook_delivery((select id from fx where k = 'del'), 502, null);
select pg_temp.as_postgres();
select is((select status::text from public.webhook_deliveries where id = (select id from fx where k = 'del')), 'dead', 'delivery goes dead after the retry budget');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select lives_ok(format('select public.redeliver_webhook(%L)', (select id from fx where k = 'del')), 'an administrator can redeliver');
select is((select status::text || attempts from public.webhook_deliveries where id = (select id from fx where k = 'del')), 'pending0', 'redelivery resets the delivery');
select pg_temp.as_service();
select public.complete_webhook_delivery((select id from fx where k = 'del'), 204, null);
select pg_temp.as_postgres();
select is((select status::text from public.webhook_deliveries where id = (select id from fx where k = 'del')), 'succeeded', 'a 2xx marks it delivered');

-- Endpoint auto-disable after repeated failures
update public.webhook_endpoints set consecutive_failures = 9 where id = (select id from fx where k = 'wh');
update public.webhook_deliveries set status = 'pending', attempts = 1 where id = (select id from fx where k = 'del');
select pg_temp.as_service();
select public.complete_webhook_delivery((select id from fx where k = 'del'), 500, 'x');
select pg_temp.as_postgres();
select is((select enabled from public.webhook_endpoints where id = (select id from fx where k = 'wh')), false, 'ten consecutive failures disable the endpoint');

-- Workflow rules --------------------------------------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select throws_ok(format($q$insert into public.workflow_rules (organization_id, name, trigger_event, actions) values (%L, 'Mine', 'raid.created', '[{"type":"notify","to":"assignee"}]')$q$, (select id from fx where k = 'org')), '42501', null, 'a project manager cannot create rules');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select lives_ok(format($q$insert into public.workflow_rules (organization_id, name, trigger_event, enabled, conditions, actions)
  values (%L, 'Red alert', 'project.health_changed', true, '[{"field":"to","op":"eq","value":"red"}]',
          '[{"type":"notify","to":"role","roleKey":"developer","title":"{{code}} went {{to}}","severity":"warning"}]')$q$, (select id from fx where k = 'org')), 'an administrator creates a rule');
select is((select version from public.workflow_rules where name = 'Red alert'), 1, 'a new rule is version 1');
select lives_ok($q$update public.workflow_rules set name = 'Red alert (renamed)' where name = 'Red alert'$q$, 'renaming a rule');
select is((select version from public.workflow_rules where name = 'Red alert (renamed)'), 1, 'renaming does not bump the version');
select lives_ok($q$update public.workflow_rules set actions = '[{"type":"notify","to":"role","roleKey":"developer","title":"{{code}} is {{to}}","severity":"warning"}]' where name = 'Red alert (renamed)'$q$, 'editing actions');
select is((select count(*)::int from public.workflow_rule_versions where rule_id = (select id from public.workflow_rules where name = 'Red alert (renamed)')), 2, 'each definition change keeps an immutable version');
select throws_ok($q$insert into public.workflow_rules (organization_id, name, trigger_event, actions) values ((select id from public.organizations where slug = 'auto-org'), 'Empty', 'raid.created', '[]')$q$, '23514', null, 'a rule needs at least one action');

select pg_temp.as_postgres();
update public.projects set health = 'green' where id = (select id from fx where k = 'p_aua');
update public.projects set health = 'red' where id = (select id from fx where k = 'p_aua');
insert into fx select 'ev_rule', id from public.outbox_events where event_type = 'project.health_changed' and payload ->> 'to' = 'red' and processed_at is null order by created_at desc limit 1;
select pg_temp.as_service();
select is((select count(*)::int from public.rule_candidates((select id from fx where k = 'ev_rule'))), 1, 'the dispatcher gets enabled rules for the event type');
select ok((public.apply_workflow_rule((select id from fx where k = 'ev_rule'), (select id from public.workflow_rules where name = 'Red alert (renamed)')) ->> 'applied')::boolean, 'applying a rule runs its actions');
select ok(not (public.apply_workflow_rule((select id from fx where k = 'ev_rule'), (select id from public.workflow_rules where name = 'Red alert (renamed)')) ->> 'applied')::boolean, 'applying it again is a no-op');
select pg_temp.as_postgres();
select is((select title from public.notifications where type like 'rule:%' and membership_id = (select id from fx where k = 'm_dev')), 'AUA is red', 'the rule notifies by role and renders the template');
select ok(not exists (select 1 from public.notifications where type like 'rule:%' and membership_id = (select id from fx where k = 'm_out')), 'the rule did not reach a developer who cannot read the project');
select is((select status from public.workflow_runs where event_id = (select id from fx where k = 'ev_rule')), 'succeeded', 'the run is recorded');

-- Scheduler ------------------------------------------------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select throws_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'escalation_overdue' and organization_id = (select id from fx where k = 'org'))), '42501', null, 'a project manager cannot run jobs');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select lives_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'escalation_overdue' and organization_id = (select id from fx where k = 'org'))), 'an administrator runs a job now');
select is((select count(*)::int from public.outbox_events where event_type = 'escalation.overdue'), 1, 'the overdue job raises an event for the past-due escalation only');
select lives_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'escalation_overdue' and organization_id = (select id from fx where k = 'org'))), 'running it again');
select is((select count(*)::int from public.outbox_events where event_type = 'escalation.overdue'), 1, 'does not raise the same overdue event twice');
select is((select count(*)::int from public.job_runs where job_key = 'escalation_overdue'), 2, 'each run is logged');
select throws_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'integration_sync' and organization_id = (select id from fx where k = 'org'))), 'P0001', null, 'application-run jobs cannot be run from the database');

select pg_temp.as_service();
update public.scheduled_jobs set next_run_at = now() + interval '1 day' where key <> 'retention';
select is((select count(*)::int from public.claim_due_jobs(10)), 2, 'only due jobs are claimed (retention in both organizations)');
select ok((select next_run_at > now() + interval '23 hours' from public.scheduled_jobs where key = 'retention' and organization_id = (select id from fx where k = 'org')), 'claiming reschedules the job');
select public.record_heartbeat('{"events":1}');
select pg_temp.login('a8000000-0000-4000-8000-000000000003');
select ok((select last_tick_at is not null from public.scheduler_heartbeat), 'any signed-in person can see that the scheduler is alive');
select is((select count(*)::int from public.scheduled_jobs), 0, 'but only operators see jobs');

-- Retention
select pg_temp.as_postgres();
insert into public.outbox_events (organization_id, event_type, entity_type, entity_id, processed_at, created_at)
values ((select id from fx where k = 'org'), 'old.event', 'x', gen_random_uuid(), now() - interval '60 days', now() - interval '60 days');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select lives_ok(format('select public.run_job_now(%L)', (select id from public.scheduled_jobs where key = 'retention' and organization_id = (select id from fx where k = 'org'))), 'retention job runs');
select pg_temp.as_postgres();
select is((select count(*)::int from public.outbox_events where event_type = 'old.event'), 0, 'processed events older than the retention window are purged');

-- Integrations -------------------------------------------------------------------------------------------------------------
select pg_temp.login('a8000000-0000-4000-8000-000000000002');
select throws_ok(format($q$insert into public.integration_connections (organization_id, provider, name) values (%L, 'jira', 'PM jira')$q$, (select id from fx where k = 'org')), '42501', null, 'a project manager cannot create connections');
select pg_temp.login('a8000000-0000-4000-8000-000000000001');
select lives_ok(format($q$insert into public.integration_connections (organization_id, provider, name, config) values (%L, 'github', 'Mock GitHub', '{"repo":"acme/app"}')$q$, (select id from fx where k = 'org')), 'an administrator creates a connection');
select throws_ok(format($q$insert into public.integration_connections (organization_id, provider, name, mode) values (%L, 'jira', 'Live Jira', 'live')$q$, (select id from fx where k = 'org')), '23514', null, 'live mode is refused until a real adapter exists');
insert into fx select 'conn', id from public.integration_connections where name = 'Mock GitHub';
select lives_ok(format($q$insert into public.integration_links (organization_id, connection_id, work_item_id, external_id, external_status) values (%L, %L, %L, 'acme/app#1', 'open')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'conn'), (select id from fx where k = 'wi')), 'an administrator links a work item to an external issue');
select pg_temp.login('a8000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.integration_links), 1, 'a project member sees the link on their item');
select pg_temp.login('a8000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.integration_links), 0, 'someone who cannot read the project does not');
select pg_temp.as_service();
select is((select count(*)::int from public.integration_sync_inputs((select id from fx where k = 'conn'))), 1, 'the worker reads only link ids and the fields notifications need');
select ok((select public.apply_integration_status((select id from public.integration_links limit 1), 'closed')), 'a status change is applied and reported');
select ok(not (select public.apply_integration_status((select id from public.integration_links limit 1), 'closed')), 'the same status again is not a change');
select pg_temp.as_postgres();
select is((select count(*)::int from public.outbox_events where event_type = 'integration.link_status_changed'), 1, 'the change is announced once through the outbox');

select * from finish();
rollback;
