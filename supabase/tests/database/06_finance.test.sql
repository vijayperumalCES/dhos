-- Phase 5 finance: rates, budgets and baselines, the actuals ledger, forecasts, contract values,
-- revenue and the project financial report. Covers finance-only access, separation of duties,
-- immutability, client confidentiality and tenant isolation. Self-contained and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

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
-- 01 owner (org_admin + delivery_head, as bootstrap assigns), 02 finance manager, 03 project manager
-- on FNA, 04 developer (job title Engineer) on FNA, 05 custom role with finance.read but no
-- confidential-client access; x1 owns another organization.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'own@fn.test', now(), '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fin@fn.test', now(), '{"display_name":"Finance"}'),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pm@fn.test',  now(), '{"display_name":"PM"}'),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dev@fn.test', now(), '{"display_name":"Dev"}'),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'ro@fn.test',  now(), '{"display_name":"Read only"}'),
  ('00000000-0000-0000-0000-000000000000', 'f3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'x@fnx.test',  now(), '{"display_name":"Other"}');

create temporary table fx (k text primary key, id uuid not null);
grant select, insert on fx to authenticated;
insert into fx values
  ('org', private.bootstrap_organization('Finance Org', 'finance-org', 'f2000000-0000-4000-8000-000000000001')),
  ('org_x', private.bootstrap_organization('Other FN Org', 'other-fn-org', 'f3000000-0000-4000-8000-000000000001'));

insert into public.organization_memberships (organization_id, user_id, job_title)
select (select id from fx where k = 'org'), u.id, u.title
from (values ('f2000000-0000-4000-8000-000000000002'::uuid, 'Finance Lead'), ('f2000000-0000-4000-8000-000000000003', 'Project Manager'),
             ('f2000000-0000-4000-8000-000000000004', 'Engineer'), ('f2000000-0000-4000-8000-000000000005', 'Analyst')) u(id, title);
insert into fx select 'm_' || split_part(p.email, '@', 1), m.id
from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
where m.organization_id = (select id from fx where k = 'org');
insert into public.role_definitions (organization_id, key, name) values ((select id from fx where k = 'org'), 'fin_readonly', 'Finance read-only');
insert into public.role_permissions (role_id, permission_key)
select r.id, p from public.role_definitions r, unnest(array['finance.read', 'project.read_all', 'client.read', 'org.members.read']) p
where r.organization_id = (select id from fx where k = 'org') and r.key = 'fin_readonly';
insert into public.membership_roles (organization_id, membership_id, role_id)
select (select id from fx where k = 'org'), (select id from fx where k = x.m), r.id
from (values ('m_fin', 'finance_manager'), ('m_pm', 'project_manager'), ('m_dev', 'developer'), ('m_ro', 'fin_readonly')) x(m, role)
join public.role_definitions r on r.key = x.role and r.organization_id = (select id from fx where k = 'org');

insert into public.clients (organization_id, name, confidentiality) values
  ((select id from fx where k = 'org'), 'Open Client', 'standard'),
  ((select id from fx where k = 'org'), 'Secret Client', 'confidential');
insert into fx select 'c_open', id from public.clients where name = 'Open Client';
insert into fx select 'c_secret', id from public.clients where name = 'Secret Client';
insert into public.projects (organization_id, code, name, client_id, created_by) values
  ((select id from fx where k = 'org'), 'FNA', 'Finance A', (select id from fx where k = 'c_open'), 'f2000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org'), 'FNB', 'Finance B', null, 'f2000000-0000-4000-8000-000000000001'),
  ((select id from fx where k = 'org'), 'FNC', 'Finance C (secret)', (select id from fx where k = 'c_secret'), 'f2000000-0000-4000-8000-000000000001');
insert into fx select 'p_' || lower(code), id from public.projects where code in ('FNA', 'FNB', 'FNC');
insert into public.project_memberships (organization_id, project_id, membership_id) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_fna'), (select id from fx where k = 'm_pm')),
  ((select id from fx where k = 'org'), (select id from fx where k = 'p_fna'), (select id from fx where k = 'm_dev'));
insert into public.client_contracts (organization_id, client_id, title, status) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'c_open'), 'Open SOW', 'active'),
  ((select id from fx where k = 'org'), (select id from fx where k = 'c_secret'), 'Secret SOW', 'active');
insert into fx select 'k_open', id from public.client_contracts where title = 'Open SOW';
insert into fx select 'k_secret', id from public.client_contracts where title = 'Secret SOW';

-- Permission catalogue and role templates -------------------------------------------------------
select is((select count(*)::int from public.permissions where key in ('finance.read', 'finance.manage', 'finance.approve')), 3, 'the three finance permissions exist');
select is((select count(*)::int from public.role_permissions rp join public.role_definitions r on r.id = rp.role_id
           where r.organization_id = (select id from fx where k = 'org') and r.key in ('org_admin', 'project_manager', 'program_manager', 'developer', 'client_stakeholder') and rp.permission_key like 'finance.%'), 0,
  'administrators, managers, developers and clients get no finance access by default');
select is((select array_agg(rp.permission_key order by rp.permission_key)::text from public.role_permissions rp join public.role_definitions r on r.id = rp.role_id
           where r.organization_id = (select id from fx where k = 'org') and r.key = 'delivery_head' and rp.permission_key like 'finance.%'), '{finance.approve,finance.read}',
  'a delivery head reads and approves but does not manage rates or entries');

-- Rates -----------------------------------------------------------------------------------------------
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into public.rate_card_lines (organization_id, role_title, cost_rate, bill_rate, effective_from) values (%L, 'Engineer', 100, 160, current_date - 400)$q$,
  (select id from fx where k = 'org')), 'finance adds a rate card line');
select throws_ok(format($q$insert into public.rate_card_lines (organization_id, role_title, cost_rate, effective_from) values (%L, ' engineer ', 120, current_date - 400)$q$,
  (select id from fx where k = 'org')), '23505', null, 'a role has one line per effective date, ignoring case and spacing');
select lives_ok(format($q$insert into public.rate_card_lines (organization_id, role_title, cost_rate, effective_from) values (%L, 'Engineer', 140, current_date + 30)$q$,
  (select id from fx where k = 'org')), 'a later effective date adds a future rate');
select throws_ok(format($q$update public.rate_card_lines set cost_rate = 1 where organization_id = %L$q$, (select id from fx where k = 'org')),
  '42501', null, 'rate card lines are never edited');
select is(pg_temp.rows_affected('delete from public.rate_card_lines where effective_from < current_date'), 0, 'a rate already in force can''t be deleted');
select lives_ok(format($q$insert into public.member_cost_rates (organization_id, membership_id, cost_rate, effective_from) values (%L, %L, 90, current_date + 10)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'm_dev')), 'finance sets a person''s rate');
select is((select count(*)::int from public.rate_card_lines), 2, 'finance reads the rate card');
select pg_temp.as_postgres();
select is((select changes ->> 'cost_rate' from public.audit_logs where entity_type = 'rate_card_lines' and action = 'rate_card_lines.insert' order by occurred_at limit 1), 'redacted',
  'the audit log records a rate change without the amount');
select is((select cost_rate from private.cost_rate_for(null, current_date) as cost_rate), null, 'no member means no rate');
select is(private.cost_rate_for((select id from fx where k = 'm_dev'), current_date), 100::numeric, 'the rate card applies by job title');
select is(private.cost_rate_for((select id from fx where k = 'm_dev'), current_date + 10), 90::numeric, 'a person''s own rate overrides the card from its date');
select is(private.cost_rate_for((select id from fx where k = 'm_pm'), current_date), null, 'someone with no matching rate is unrated, not zero');

select pg_temp.login('f2000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.rate_card_lines) + (select count(*)::int from public.member_cost_rates), 0, 'a project manager can''t read rates');
select throws_ok(format($q$insert into public.rate_card_lines (organization_id, role_title, cost_rate, effective_from) values (%L, 'Hacker', 1, current_date)$q$,
  (select id from fx where k = 'org')), '42501', null, 'a project manager can''t add rates');
select pg_temp.login('f2000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.rate_card_lines) + (select count(*)::int from public.member_cost_rates), 0, 'even a delivery head, who reads finance, can''t read rates');

-- Budgets and baselines ---------------------------------------------------------------------
select pg_temp.login('f2000000-0000-4000-8000-000000000003');
select throws_ok(format($q$select public.start_budget(%L, 'PM budget')$q$, (select id from fx where k = 'p_fna')), '42501', null, 'a project manager can''t start a budget');
select is((select count(*)::int from public.project_budgets), 0, 'and can''t read budgets');
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into fx select 'b1', public.start_budget(%L, 'Initial budget')$q$, (select id from fx where k = 'p_fna')), 'finance drafts a budget');
select throws_ok(format($q$select public.start_budget(%L, 'Second draft')$q$, (select id from fx where k = 'p_fna')), 'P0001', null, 'a project has one draft at a time');
select lives_ok(format($q$insert into public.budget_lines (organization_id, project_id, budget_id, category, amount) values
  (%1$L, %2$L, %3$L, 'labour', 20000), (%1$L, %2$L, %3$L, 'software', 3000)$q$, (select id from fx where k = 'org'), (select id from fx where k = 'p_fna'), (select id from fx where k = 'b1')), 'lines are added to the draft');
select throws_ok(format($q$insert into public.budget_lines (organization_id, project_id, budget_id, category, amount) values (%L, %L, %L, 'labour', 1)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna'), (select id from fx where k = 'b1')), '23505', null, 'one line per category');
select throws_ok(format($q$select public.approve_budget(%L)$q$, (select id from fx where k = 'b1')), 'P0001', null, 'you can''t approve a budget you drafted');
select pg_temp.login('f2000000-0000-4000-8000-000000000001');
select is(pg_temp.rows_affected(format($q$update public.project_budgets set name = 'Renamed' where id = %L$q$, (select id from fx where k = 'b1'))), 0, 'a delivery head can''t edit a budget');
select lives_ok(format($q$select public.approve_budget(%L)$q$, (select id from fx where k = 'b1')), 'someone else approves it as the baseline');
select is((select status::text from public.project_budgets where id = (select id from fx where k = 'b1')), 'approved', 'the budget is now the baseline');
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select throws_ok(format($q$update public.budget_lines set amount = 1 where budget_id = %L$q$, (select id from fx where k = 'b1')), 'P0001', null, 'an approved budget''s lines are frozen');
select throws_ok(format($q$delete from public.budget_lines where budget_id = %L$q$, (select id from fx where k = 'b1')), 'P0001', null, 'and can''t be removed');
select lives_ok(format($q$insert into fx select 'b2', public.start_budget(%L, 'Revision 2')$q$, (select id from fx where k = 'p_fna')), 'finance starts a revision');
select is((select count(*)::int from public.budget_lines where budget_id = (select id from fx where k = 'b2')), 2, 'the revision starts from the baseline''s lines');
select lives_ok(format($q$update public.budget_lines set amount = 25000 where budget_id = %L and category = 'labour'$q$, (select id from fx where k = 'b2')), 'the revision is editable');
select pg_temp.login('f2000000-0000-4000-8000-000000000001');
select lives_ok(format($q$select public.approve_budget(%L)$q$, (select id from fx where k = 'b2')), 'the revision is approved');
select is((select string_agg(status::text, ',' order by version) from public.project_budgets where project_id = (select id from fx where k = 'p_fna')), 'superseded,approved',
  'the earlier baseline is kept as superseded');
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into fx select 'b_empty', public.start_budget(%L, 'Empty')$q$, (select id from fx where k = 'p_fnb')), 'finance drafts a budget with no lines');
select pg_temp.login('f2000000-0000-4000-8000-000000000001');
select throws_ok(format($q$select public.approve_budget(%L)$q$, (select id from fx where k = 'b_empty')), 'P0001', null, 'a budget with no amounts can''t be approved');

-- Ledger and forecasts ---------------------------------------------------------------------------
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description, vendor) values (%L, %L, current_date - 3, 'software', 1500, 'Licences', 'Acme')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), 'finance records a cost');
select throws_ok(format($q$insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description) values (%L, %L, current_date + 1, 'travel', 10, 'Tomorrow')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), 'P0001', null, 'costs can''t be dated in the future');
select throws_ok(format($q$insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description) values (%L, %L, current_date, 'labour', 10, 'Labour by hand')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), '23514', null, 'labour comes from timesheets, not the ledger');
select throws_ok(format($q$update public.cost_entries set amount = 1 where project_id = %L$q$, (select id from fx where k = 'p_fna')), '42501', null, 'ledger entries are never edited');
select throws_ok(format($q$delete from public.cost_entries where project_id = %L$q$, (select id from fx where k = 'p_fna')), '42501', null, 'or deleted');
select pg_temp.as_postgres();
insert into fx select 'ce1', id from public.cost_entries where description = 'Licences';
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.reverse_cost_entry(%L, '  ')$q$, (select id from fx where k = 'ce1')), 'P0001', null, 'a reversal needs a reason');
select lives_ok(format($q$select public.reverse_cost_entry(%L, 'Wrong project')$q$, (select id from fx where k = 'ce1')), 'finance reverses an entry');
select throws_ok(format($q$select public.reverse_cost_entry(%L, 'Again')$q$, (select id from fx where k = 'ce1')), 'P0001', null, 'an entry is reversed once');
select is((select sum(amount) from public.cost_entries where project_id = (select id from fx where k = 'p_fna')), 0.00, 'the ledger nets to zero and keeps both lines');
select lives_ok(format($q$insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description) values (%L, %L, current_date - 1, 'infrastructure', 700, 'Hosting')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), 'a correct cost follows');
select throws_ok(format($q$insert into public.forecast_entries (organization_id, project_id, category, period, amount) values (%L, %L, 'travel', current_date + 3, 100)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), '23514', null, 'a forecast is for a whole month');
select lives_ok(format($q$insert into public.forecast_entries (organization_id, project_id, category, period, amount) values (%L, %L, 'travel', (date_trunc('month', current_date) + interval '1 month')::date, 400)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), 'finance forecasts next month''s travel');
select lives_ok(format($q$update public.forecast_entries set amount = 450 where project_id = %L$q$, (select id from fx where k = 'p_fna')), 'a forecast can be revised');
select pg_temp.login('f2000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.cost_entries), 3, 'a delivery head reads the ledger');
select throws_ok(format($q$insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description) values (%L, %L, current_date, 'other', 5, 'Nope')$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna')), '42501', null, 'but can''t write to it');
select pg_temp.login('f2000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.cost_entries) + (select count(*)::int from public.forecast_entries), 0, 'a project manager can''t read the ledger or forecasts');

-- Contract values and revenue ------------------------------------------------------------------
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into public.contract_values (contract_id, organization_id, total_value, billing_model) values (%L, %L, 90000, 'fixed_price')$q$,
  (select id from fx where k = 'k_open'), (select id from fx where k = 'org')), 'finance prices a contract');
select lives_ok(format($q$insert into public.contract_values (contract_id, organization_id, total_value) values (%L, %L, 500000)$q$,
  (select id from fx where k = 'k_secret'), (select id from fx where k = 'org')), 'and one for a confidential client it can see');
select pg_temp.login('f2000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.contract_values), 1, 'finance.read without confidential access sees only the open client''s value');
select pg_temp.login('f2000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.contract_values), 0, 'a project manager sees no contract values');
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select lives_ok(format($q$insert into public.revenue_lines (organization_id, project_id, contract_id, description, planned_date, amount) values
  (%1$L, %2$L, %3$L, 'Milestone 1', current_date - 5, 30000), (%1$L, %2$L, %3$L, 'Milestone 2', current_date + 60, 60000)$q$,
  (select id from fx where k = 'org'), (select id from fx where k = 'p_fna'), (select id from fx where k = 'k_open')), 'finance plans revenue');
select pg_temp.as_postgres();
insert into fx select 'rv1', id from public.revenue_lines where description = 'Milestone 1';
insert into fx select 'rv2', id from public.revenue_lines where description = 'Milestone 2';
select pg_temp.login('f2000000-0000-4000-8000-000000000002');
select throws_ok(format($q$select public.recognise_revenue(%L, current_date + 1)$q$, (select id from fx where k = 'rv1')), 'P0001', null, 'revenue can''t be recognised in the future');
select lives_ok(format($q$select public.recognise_revenue(%L, current_date - 2)$q$, (select id from fx where k = 'rv1')), 'finance recognises the first milestone');
select is(pg_temp.rows_affected(format($q$update public.revenue_lines set amount = 1 where id = %L$q$, (select id from fx where k = 'rv1'))), 0, 'recognised revenue is locked');
select is(pg_temp.rows_affected(format('delete from public.revenue_lines where id = %L', (select id from fx where k = 'rv1'))), 0, 'and can''t be deleted');
select throws_ok(format($q$select public.recognise_revenue(%L, current_date)$q$, (select id from fx where k = 'rv1')), 'P0001', null, 'it is recognised once');

-- The report -------------------------------------------------------------------------------------
select pg_temp.as_postgres();
-- Approved: the dev logged 8 h and 4 h in a past week at the card rate (100); the PM logged 5 h with no rate.
-- Submitted but unapproved time must not count.
insert into public.timesheets (organization_id, membership_id, week_start, status) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), date_trunc('week', current_date - 14)::date, 'draft'),
  ((select id from fx where k = 'org'), (select id from fx where k = 'm_pm'),  date_trunc('week', current_date - 14)::date, 'draft'),
  ((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), date_trunc('week', current_date - 7)::date,  'draft');
insert into public.time_entries (organization_id, timesheet_id, entry_date, category, project_id, hours)
select (select id from fx where k = 'org'), t.id, t.week_start + e.off, 'delivery', (select id from fx where k = 'p_fna'), e.h
from public.timesheets t
join (values ('m_dev', 0, 8), ('m_dev', 1, 4), ('m_pm', 0, 5)) e(who, off, h) on t.membership_id = (select id from fx where k = e.who) and t.week_start = date_trunc('week', current_date - 14)::date;
insert into public.time_entries (organization_id, timesheet_id, entry_date, category, project_id, hours)
select (select id from fx where k = 'org'), t.id, t.week_start, 'delivery', (select id from fx where k = 'p_fna'), 6
from public.timesheets t where t.week_start = date_trunc('week', current_date - 7)::date;
update public.timesheets set status = 'approved' where week_start = date_trunc('week', current_date - 14)::date;
update public.timesheets set status = 'submitted' where week_start = date_trunc('week', current_date - 7)::date;
-- Planned: the dev at 50% on FNA for Monday–Friday three weeks out, by when their own rate (90) applies (5 days × 8 h × 50% × 90 = 1800).
insert into public.resource_allocations (organization_id, membership_id, project_id, start_date, end_date, percent) values
  ((select id from fx where k = 'org'), (select id from fx where k = 'm_dev'), (select id from fx where k = 'p_fna'),
   (date_trunc('week', current_date) + interval '3 weeks')::date, (date_trunc('week', current_date) + interval '3 weeks' + interval '4 days')::date, 50);

select pg_temp.login('f2000000-0000-4000-8000-000000000001');
select is((select row(budget_version, budget_total, budget_labour, round(labour_actual, 2), other_actual, approved_hours, unrated_hours, round(labour_forecast, 2), other_forecast, revenue_recognised, revenue_planned, has_revenue)::text
           from public.project_financials((select id from fx where k = 'org'), (select id from fx where k = 'p_fna'))),
  '(2,28000.00,25000.00,1200.00,700.00,17.00,5.00,1800.00,450.00,30000.00,60000.00,t)',
  'the report separates approved-hour labour, the net ledger, unrated hours, forecasts and revenue');
select is((select count(*)::int from public.project_financials((select id from fx where k = 'org'))), 3, 'a delivery head gets a row for every project');
select is((select budget_total from public.project_financials((select id from fx where k = 'org'), (select id from fx where k = 'p_fnb'))), null, 'a project with no baseline has no budget, not zero');
select is((select sum(labour + other)::numeric from public.project_monthly_actuals((select id from fx where k = 'p_fna'))), 1900.00, 'monthly actuals add up to the same actuals');
select pg_temp.login('f2000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.project_financials((select id from fx where k = 'org'))), 2, 'a client''s confidentiality hides its projects from finance.read without access');
select pg_temp.login('f2000000-0000-4000-8000-000000000003');
select throws_ok(format($q$select * from public.project_financials(%L)$q$, (select id from fx where k = 'org')), '42501', null, 'a project manager can''t run the report');
select throws_ok(format($q$select * from public.project_monthly_actuals(%L)$q$, (select id from fx where k = 'p_fna')), '42501', null, 'or the monthly breakdown');
select pg_temp.login('f3000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.project_budgets) + (select count(*)::int from public.cost_entries) + (select count(*)::int from public.revenue_lines) + (select count(*)::int from public.contract_values), 0, 'another tenant sees no finance data');
select throws_ok(format($q$select * from public.project_financials(%L)$q$, (select id from fx where k = 'org')), '42501', null, 'and can''t run the report on this organization');

select * from finish();
rollback;
