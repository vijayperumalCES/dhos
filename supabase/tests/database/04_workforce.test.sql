-- Phase 3 workforce: calendars, leave, attendance, timesheets, allocations and capacity.
-- Covers the HR visibility policy (self, manager, HR), self-approval denial, balances, locks,
-- over-allocation and tenant isolation. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

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
-- e…01 owner (org_admin), 02 manager, 03 developer reporting to 02, 04 developer with no
-- manager, 05 HR, 06 delivery head; e1…01 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@wf.test',  now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'mgr@wf.test',  now(), '{"display_name":"Manager"}'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dev@wf.test',  now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'peer@wf.test', now(), '{"display_name":"Peer"}'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'hr@wf.test',   now(), '{"display_name":"HR"}'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'dh@wf.test',   now(), '{"display_name":"DH"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@wfx.test',   now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Workforce Org', 'workforce-org', 'e0000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other WF Org', 'other-wf-org', 'e1000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id)
select (select id from fx where k = 'org'), u
from unnest(array['e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004',
                  'e0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000006']::uuid[]) u;
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_mgr', 'engineering_manager'), ('m_dev', 'developer'), ('m_peer', 'developer'), ('m_hr', 'hr_admin'), ('m_dh', 'delivery_head')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');
update public.organization_memberships set manager_membership_id = (select id from fx where k = 'm_mgr') where id = (select id from fx where k = 'm_dev');

insert into public.projects (organization_id, code, name, created_by) values
  ((select id from fx where k = 'org'), 'WFA', 'Workforce A', 'e0000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org'), 'WFB', 'Workforce B', 'e0000000-0000-4000-8000-000000000001');
insert into fx select 'p_' || lower(code), id from public.projects where code in ('WFA', 'WFB');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wfa'), (select id from fx where k = 'm_dev')),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_wfa'), (select id from fx where k = 'm_mgr'));

-- Dates: d0 is a Monday early next year, so leave never crosses the year end; wk is this week's Monday.
create temporary table fxd (k text primary key, d date not null);
grant select on fxd to authenticated;
insert into fxd
select 'd0', s + ((8 - extract(isodow from s)::int) % 7)
from (select (date_trunc('year', current_date) + interval '1 year')::date + 7 as s) x;
insert into fxd values ('wk', date_trunc('week', current_date)::date);
create function pg_temp.d(p_offset int) returns date language sql as $$ select (select d from fxd where k = 'd0') + p_offset $$;
create function pg_temp.yr() returns int language sql as $$ select extract(year from (select d from fxd where k = 'd0'))::int $$;

-- Defaults ------------------------------------------------------------------------------------
select is((select count(*)::int from public.work_calendars where organization_id = (select id from fx where k = 'org') and is_default), 1,
  'new organizations get a default work calendar');
select is((select array_agg(code order by position) from public.leave_types where organization_id = (select id from fx where k = 'org')),
  array['ANNUAL', 'SICK', 'UNPAID'], 'new organizations get the default leave types');
insert into fx select 'lt_' || lower(code), id from public.leave_types where organization_id = (select id from fx where k = 'org');

-- Balances --------------------------------------------------------------------------------------
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select throws_ok(format('select public.grant_annual_leave_allowances(%L, %s)', (select id from fx where k = 'org'), pg_temp.yr()),
  '42501', null, 'a developer cannot grant allowances');
select pg_temp.login('e0000000-0000-4000-8000-000000000005');
select ok(public.grant_annual_leave_allowances((select id from fx where k = 'org'), pg_temp.yr()) > 0, 'HR grants allowances for next year');
select is((select granted_days from public.leave_balances where membership_id = (select id from fx where k = 'm_dev')
             and leave_type_id = (select id from fx where k = 'lt_annual') and year = pg_temp.yr()), 20.00::numeric, 'the annual allowance is granted');
select is(public.grant_annual_leave_allowances((select id from fx where k = 'org'), pg_temp.yr()), 0, 'granting again keeps existing balances');
select lives_ok(format($q$insert into public.holidays (organization_id, calendar_id, holiday_date, name)
  select organization_id, id, %L, 'Test holiday' from public.work_calendars where organization_id = %L and is_default$q$,
  pg_temp.d(15), (select id from fx where k = 'org')), 'HR adds a holiday');

-- Leave requests ----------------------------------------------------------------------------------
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select lives_ok(format('select public.request_leave(%L, %L, %L, %L)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_annual'), pg_temp.d(0), pg_temp.d(2)),
  'a developer requests three days');
select pg_temp.as_postgres();
insert into fx select 'lr_a', id from public.leave_requests where membership_id = (select id from fx where k = 'm_dev') and start_date = pg_temp.d(0);
select is((select days from public.leave_requests where id = (select id from fx where k = 'lr_a')), 3.0::numeric, 'Mon–Wed counts three working days');
select is((select status::text from public.leave_requests where id = (select id from fx where k = 'lr_a')), 'pending', 'annual leave waits for approval');

select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select lives_ok(format('select public.request_leave(%L, %L, %L, %L)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_annual'), pg_temp.d(4), pg_temp.d(7)),
  'a request across a weekend');
select is((select days from public.leave_requests where membership_id = (select id from fx where k = 'm_dev') and start_date = pg_temp.d(4)), 2.0::numeric,
  'weekends are not counted');
select lives_ok(format('select public.request_leave(%L, %L, %L, %L)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_annual'), pg_temp.d(14), pg_temp.d(16)),
  'a request spanning a holiday');
select is((select days from public.leave_requests where membership_id = (select id from fx where k = 'm_dev') and start_date = pg_temp.d(14)), 2.0::numeric,
  'holidays are not counted');
select throws_ok(format('select public.request_leave(%L, %L, %L, %L)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_annual'), pg_temp.d(1), pg_temp.d(1)),
  'P0001', null, 'overlapping leave is rejected');
select throws_ok(format('select public.request_leave(%L, %L, %L, %L)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_annual'), pg_temp.d(21), pg_temp.d(70)),
  'P0001', null, 'leave beyond the remaining balance is rejected');
select throws_ok(format('select public.request_leave(%L, %L, %L, %L)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_annual'), pg_temp.d(5), pg_temp.d(6)),
  'P0001', null, 'a weekend-only request has no working days');
select lives_ok(format('select public.request_leave(%L, %L, %L, %L, true)', (select id from fx where k = 'org'), (select id from fx where k = 'lt_sick'), pg_temp.d(28), pg_temp.d(28)),
  'a half day of sick leave');
select is((select status::text || ':' || days from public.leave_requests where membership_id = (select id from fx where k = 'm_dev') and start_date = pg_temp.d(28)),
  'approved:0.5', 'sick leave is approved automatically as half a day');
select throws_ok(format('select public.review_leave_request(%L, true)', (select id from fx where k = 'lr_a')),
  '42501', null, 'nobody approves their own leave');
select throws_ok(format($q$insert into public.leave_requests (organization_id, membership_id, leave_type_id, start_date, end_date)
  values (%L, %L, %L, %L, %L)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), (select id from fx where k = 'lt_annual'), pg_temp.d(35), pg_temp.d(35)),
  '42501', null, 'leave can only be written through the RPCs');

-- Visibility: self, manager, HR; not peers or other tenants
select pg_temp.login('e0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.leave_requests where membership_id = (select id from fx where k = 'm_dev')), 0, 'a peer cannot see leave details');
select is((select count(*)::int from public.leave_balances where membership_id = (select id from fx where k = 'm_dev')), 0, 'a peer cannot see balances');
select is((select label from public.team_availability((select id from fx where k = 'org'), pg_temp.d(28), pg_temp.d(28)) where kind = 'leave'), 'On leave',
  'team availability shows only "On leave"');
select throws_ok(format('select public.review_leave_request(%L, true)', (select id from fx where k = 'lr_a')),
  '42501', null, 'a peer cannot approve leave');
select pg_temp.login('e1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.leave_requests where organization_id = (select id from fx where k = 'org')), 0, 'another tenant sees no leave');
select pg_temp.login('e0000000-0000-4000-8000-000000000005');
select ok((select count(*)::int from public.leave_requests where membership_id = (select id from fx where k = 'm_dev')) >= 4, 'HR sees leave details');
select pg_temp.login('e0000000-0000-4000-8000-000000000002');
select ok((select count(*)::int from public.leave_requests where membership_id = (select id from fx where k = 'm_dev')) >= 4, 'the manager sees their report''s leave');
select throws_ok(format('select public.review_leave_request(%L, false)', (select id from fx where k = 'lr_a')),
  'P0001', null, 'rejecting needs a reason');
select lives_ok(format('select public.review_leave_request(%L, true)', (select id from fx where k = 'lr_a')), 'the manager approves');
select is((select status::text from public.leave_requests where id = (select id from fx where k = 'lr_a')), 'approved', 'the request is approved');

-- Attendance -----------------------------------------------------------------------------------------
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select lives_ok(format($q$select public.check_in(%L, 'remote')$q$, (select id from fx where k = 'org')), 'a developer checks in');
select throws_ok(format('select public.check_in(%L)', (select id from fx where k = 'org')), 'P0001', null, 'checking in twice is rejected');
-- now() is fixed within the test transaction; move the check-in back so check-out comes after it.
select pg_temp.as_postgres();
update public.attendance_records set check_in_at = now() - interval '8 hours' where membership_id = (select id from fx where k = 'm_dev');
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select lives_ok(format('select public.check_out(%L)', (select id from fx where k = 'org')), 'a developer checks out');
select throws_ok(format($q$insert into public.attendance_records (organization_id, membership_id, work_date, check_in_at) values (%L, %L, current_date - 3, now())$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_dev')), '42501', null, 'attendance can only be written through the RPCs');
select throws_ok(format($q$select public.request_attendance_correction(%L, current_date + 1, now(), now() + interval '1 hour', 'office', 'Tomorrow')$q$,
  (select id from fx where k = 'org')), 'P0001', null, 'corrections cannot be in the future');
select lives_ok(format($q$select public.request_attendance_correction(%L, current_date - 1, (current_date - 1) + time '09:00', (current_date - 1) + time '17:00', 'office', 'Forgot')$q$,
  (select id from fx where k = 'org')), 'a developer requests a correction');
select pg_temp.as_postgres();
insert into fx select 'ac', id from public.attendance_corrections where membership_id = (select id from fx where k = 'm_dev');
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select throws_ok(format('select public.review_attendance_correction(%L, true)', (select id from fx where k = 'ac')), '42501', null, 'nobody approves their own correction');
select pg_temp.login('e0000000-0000-4000-8000-000000000002');
select lives_ok(format('select public.review_attendance_correction(%L, true)', (select id from fx where k = 'ac')), 'the manager approves the correction');
select is((select source::text from public.attendance_records where membership_id = (select id from fx where k = 'm_dev') and work_date = current_date - 1), 'correction',
  'an approved correction writes the attendance record');

-- Timesheets ---------------------------------------------------------------------------------------------
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select throws_ok(format('insert into public.timesheets (organization_id, week_start) values (%L, %L)', (select id from fx where k = 'org'), (select d from fxd where k = 'wk') + 1),
  '23514', null, 'a timesheet week starts on a Monday');
select lives_ok(format('insert into public.timesheets (organization_id, week_start) values (%L, %L)', (select id from fx where k = 'org'), (select d from fxd where k = 'wk')),
  'a developer starts this week''s timesheet');
select pg_temp.as_postgres();
insert into fx select 'ts', id from public.timesheets where membership_id = (select id from fx where k = 'm_dev') and week_start = (select d from fxd where k = 'wk');
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select lives_ok(format($q$insert into public.time_entries (organization_id, timesheet_id, entry_date, category, project_id, hours) values (%L, %L, %L, 'delivery', %L, 6)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'ts'), (select d from fxd where k = 'wk'), (select id from fx where k = 'p_wfa')), 'time is logged to an assigned project');
select throws_ok(format($q$insert into public.time_entries (organization_id, timesheet_id, entry_date, category, project_id, hours) values (%L, %L, %L, 'delivery', %L, 2)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'ts'), (select d from fxd where k = 'wk'), (select id from fx where k = 'p_wfb')),
  'P0001', null, 'time cannot be logged to a project the member cannot see');
select lives_ok(format('select public.submit_timesheet(%L)', (select id from fx where k = 'ts')), 'the developer submits');
select throws_ok(format($q$insert into public.time_entries (organization_id, timesheet_id, entry_date, category, hours) values (%L, %L, %L, 'internal', 1)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'ts'), (select d from fxd where k = 'wk')), 'P0001', null, 'a submitted timesheet is locked');
select throws_ok(format('select public.review_timesheet(%L, true)', (select id from fx where k = 'ts')), '42501', null, 'nobody approves their own timesheet');
select pg_temp.login('e0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.timesheets where id = (select id from fx where k = 'ts')), 0, 'a peer cannot see the timesheet');
select pg_temp.login('e0000000-0000-4000-8000-000000000002');
select lives_ok(format($q$select public.review_timesheet(%L, false, 'Split by task please')$q$, (select id from fx where k = 'ts')), 'the manager returns the timesheet');
select pg_temp.login('e0000000-0000-4000-8000-000000000003');
select lives_ok(format('update public.time_entries set hours = 7 where timesheet_id = %L', (select id from fx where k = 'ts')), 'a returned timesheet can be edited');

-- Allocations and capacity ----------------------------------------------------------------------------------
select throws_ok(format($q$insert into public.resource_allocations (organization_id, membership_id, project_id, start_date, end_date, percent) values (%L, %L, %L, %L, %L, 50)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), (select id from fx where k = 'p_wfa'), pg_temp.d(0), pg_temp.d(4)),
  '42501', null, 'a developer cannot allocate people');
select pg_temp.login('e0000000-0000-4000-8000-000000000006');
select lives_ok(format($q$insert into public.resource_allocations (organization_id, membership_id, project_id, start_date, end_date, percent) values
  (%1$L, %2$L, %3$L, %5$L, %6$L, 60), (%1$L, %2$L, %4$L, %5$L, %6$L, 60)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), (select id from fx where k = 'p_wfa'), (select id from fx where k = 'p_wfb'), pg_temp.d(0), pg_temp.d(4)),
  'the delivery head allocates the developer to two projects');
select is((select peak_allocation_percent::int || '/' || leave_days || '/' || capacity_hours
           from public.capacity_overview((select id from fx where k = 'org'), pg_temp.d(0), pg_temp.d(4)) where membership_id = (select id from fx where k = 'm_dev')),
  '120/3/16.00', 'capacity removes approved leave and flags over-allocation');

select * from finish();
rollback;
