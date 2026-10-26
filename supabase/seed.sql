-- =============================================================================
-- STRIDE LOCAL DEMO SEED — DEMONSTRATION DATA ONLY
-- =============================================================================
-- Runs on `supabase db reset`. Every organization created here has is_demo = true, which
-- makes the app show a "Demo data" banner on every page. None of these figures describe a
-- real company or real delivery performance.
--
-- All demo users share the password: DemoPass123   (local development only)
-- To start with real data instead, see docs/DEPLOYMENT.md#replacing-demo-data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Demo auth users (local stack only; never run this file against production)
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'priya@northwind.example', 'Priya Raman'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'omar@northwind.example',  'Omar Haddad'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'arjun@northwind.example', 'Arjun Mehta'),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'mei@northwind.example',   'Mei Chen'),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'dev@northwind.example',   'Dev Kumar'),
      ('00000000-0000-4000-a000-000000000006'::uuid, 'lena@northwind.example',  'Lena Fischer'),
      ('00000000-0000-4000-a000-000000000007'::uuid, 'rahul@northwind.example', 'Rahul Nair'),
      ('00000000-0000-4000-a000-000000000008'::uuid, 'sofia@northwind.example', 'Sofia Rossi'),
      ('00000000-0000-4000-a000-000000000009'::uuid, 'tom@northwind.example',   'Tom Becker'),
      ('00000000-0000-4000-a000-000000000010'::uuid, 'claire@contoso.example',  'Claire Dubois'),
      ('00000000-0000-4000-a000-000000000011'::uuid, 'alex@globex.example',     'Alex Morgan')
    ) as t(id, email, display_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('DemoPass123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', u.display_name), now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations, members and roles
-- ---------------------------------------------------------------------------
do $$
declare
  v_nw uuid;
  v_gx uuid;
  m record;
  v_membership uuid;
begin
  v_nw := private.bootstrap_organization('Northwind Delivery (Demo)', 'northwind-demo', '00000000-0000-4000-a000-000000000001', true);
  v_gx := private.bootstrap_organization('Globex Labs (Demo)', 'globex-demo', '00000000-0000-4000-a000-000000000011', true);

  update public.organization_settings set timezone = 'Asia/Kolkata', currency_code = 'INR' where organization_id = v_nw;
  update public.organization_memberships set job_title = 'Delivery Head' where organization_id = v_nw and user_id = '00000000-0000-4000-a000-000000000001';
  update public.organization_memberships set job_title = 'Head of Engineering' where organization_id = v_gx;

  for m in
    select * from (values
      ('00000000-0000-4000-a000-000000000002'::uuid, 'IT Administrator',        array['org_admin']),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'Senior Delivery Manager', array['project_manager']),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'Program Manager',         array['program_manager']),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'Software Engineer',       array['developer']),
      ('00000000-0000-4000-a000-000000000006'::uuid, 'Engineering Manager',     array['engineering_manager']),
      ('00000000-0000-4000-a000-000000000007'::uuid, 'Mobile Tech Lead',        array['developer','scrum_master']),
      ('00000000-0000-4000-a000-000000000008'::uuid, 'Data Engineer',           array['developer']),
      ('00000000-0000-4000-a000-000000000009'::uuid, 'QA Lead',                 array['qa_engineer']),
      ('00000000-0000-4000-a000-000000000010'::uuid, 'Client Product Owner (Contoso)', array['client_stakeholder'])
    ) as t(user_id, job_title, roles)
  loop
    insert into public.organization_memberships (organization_id, user_id, job_title)
    values (v_nw, m.user_id, m.job_title) returning id into v_membership;
    insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
    select v_nw, v_membership, r.id, '00000000-0000-4000-a000-000000000001'
    from public.role_definitions r where r.organization_id = v_nw and r.key = any (m.roles);
  end loop;

  -- A pending invitation, to show the invitation workflow.
  insert into public.organization_invitations (organization_id, email, role_keys, invited_by)
  values (v_nw, 'new.hire@northwind.example', array['developer'], '00000000-0000-4000-a000-000000000002');
end;
$$;

-- The seed runner prepares every top-level statement before running any of them, so
-- everything that depends on rows or helper tables created above runs inside one DO block.
do $seed$
begin

-- Convenience lookups for the rest of the seed.
create table private.seed_m as
  select m.id, m.organization_id, p.email
  from public.organization_memberships m join public.user_profiles p on p.id = m.user_id;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
insert into public.clients (organization_id, name, code, industry, website, account_owner_membership_id, confidentiality, notes, created_by)
select o.id, c.name, c.code, c.industry, c.website,
       (select id from private.seed_m where email = 'priya@northwind.example'), c.conf::public.client_confidentiality, c.notes,
       '00000000-0000-4000-a000-000000000001'
from public.organizations o,
  (values
    ('Contoso Bank',       'CONTOSO',  'Banking',    'https://contoso.example',   'confidential', 'Strategic account. Demo record.'),
    ('Fabrikam Retail',    'FABRIKAM', 'Retail',     'https://fabrikam.example',  'standard',     'Demo record.'),
    ('Tailspin Logistics', 'TAILSPIN', 'Logistics',  'https://tailspin.example',  'standard',     'Demo record.')
  ) as c(name, code, industry, website, conf, notes)
where o.slug = 'northwind-demo';

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
insert into public.teams (organization_id, name, description, lead_membership_id, created_by)
select o.id, t.name, t.description, (select id from private.seed_m where email = t.lead), '00000000-0000-4000-a000-000000000001'
from public.organizations o,
  (values
    ('Platform Engineering', 'Core services, payments and integration platform.', 'lena@northwind.example'),
    ('Mobile Squad',         'iOS and Android banking apps.',                       'rahul@northwind.example'),
    ('Data & Analytics',     'Warehouse, pipelines and reporting.',                 'sofia@northwind.example'),
    ('PMO',                  'Delivery and program management office.',             'priya@northwind.example')
  ) as t(name, description, lead)
where o.slug = 'northwind-demo';

insert into public.teams (organization_id, name, description, lead_membership_id, created_by)
select o.id, 'Globex Core', 'Globex internal engineering team.', (select id from private.seed_m where email = 'alex@globex.example'), '00000000-0000-4000-a000-000000000011'
from public.organizations o where o.slug = 'globex-demo';

insert into public.team_members (organization_id, team_id, membership_id, team_role)
select t.organization_id, t.id, sm.id, x.team_role
from (values
    ('Platform Engineering', 'lena@northwind.example',  'Engineering Manager'),
    ('Platform Engineering', 'dev@northwind.example',   'Backend Engineer'),
    ('Platform Engineering', 'sofia@northwind.example', 'Data Engineer'),
    ('Mobile Squad',         'rahul@northwind.example', 'Tech Lead'),
    ('Mobile Squad',         'dev@northwind.example',   'Engineer'),
    ('Mobile Squad',         'tom@northwind.example',   'QA'),
    ('Data & Analytics',     'sofia@northwind.example', 'Lead'),
    ('Data & Analytics',     'tom@northwind.example',   'QA'),
    ('PMO',                  'priya@northwind.example', 'Delivery Head'),
    ('PMO',                  'arjun@northwind.example', 'Delivery Manager'),
    ('PMO',                  'mei@northwind.example',   'Program Manager'),
    ('Globex Core',          'alex@globex.example',     'Lead')
  ) as x(team, email, team_role)
join public.teams t on t.name = x.team
join private.seed_m sm on sm.email = x.email and sm.organization_id = t.organization_id;

-- ---------------------------------------------------------------------------
-- Projects (dates are relative to the day the seed runs)
-- ---------------------------------------------------------------------------
insert into public.projects (
  organization_id, code, name, description, client_id, sponsor_name, project_manager_id, delivery_owner_id,
  primary_team_id, methodology, status, health, health_reason, health_updated_at, status_changed_at,
  planned_start_date, target_end_date, actual_end_date, objectives, created_by, created_at
)
select o.id, p.code, p.name, p.description,
       (select id from public.clients c where c.organization_id = o.id and c.code = p.client_code),
       p.sponsor,
       (select id from private.seed_m where email = p.pm and organization_id = o.id),
       (select id from private.seed_m where email = 'priya@northwind.example'),
       (select id from public.teams t where t.organization_id = o.id and t.name = p.team),
       p.methodology::public.project_methodology, p.status::public.project_status, p.health::public.project_health,
       p.health_reason,
       case when p.health = 'not_assessed' then null else now() - make_interval(days => p.health_age) end,
       now() - make_interval(days => p.status_age),
       current_date + p.start_offset, current_date + p.end_offset,
       case when p.status = 'completed' then current_date - 15 else null end,
       p.objectives, '00000000-0000-4000-a000-000000000001',
       now() - make_interval(days => greatest(p.status_age, -p.start_offset) + 14)
from public.organizations o,
  (values
    ('NW-PAY',  'Payments Platform Modernization', 'Replace the legacy payment switch with a cloud-native ledger.', 'CONTOSO',  'CFO, Contoso Bank', 'arjun@northwind.example', 'Platform Engineering', 'scrum',     'active',    'red',          'Ledger migration slipped three weeks; vendor API dependency is blocking settlement testing.', 2,  60, -120,   30, 'Cut settlement time from T+2 to T+0.'),
    ('NW-MOB',  'Mobile Banking App v3',           'Next generation retail banking app.',                            'CONTOSO',  'Head of Digital',  'arjun@northwind.example', 'Mobile Squad',         'scrum',     'active',    'amber',        'UAT environment instability is delaying test sign-off.',                                     5,  45,  -90,   60, 'Ship v3 to 100% of retail customers.'),
    ('NW-DWH',  'Data Warehouse Migration',        'Move on-premise warehouse to a managed cloud platform.',         'FABRIKAM', 'CIO, Fabrikam',    'mei@northwind.example',   'Data & Analytics',     'hybrid',    'active',    'green',        null,                                                                                          20, 50,  -60,  120, 'Decommission on-premise warehouse.'),
    ('NW-CRM',  'CRM Consolidation',               'Consolidate three regional CRMs.',                               'FABRIKAM', 'COO, Fabrikam',    'mei@northwind.example',   'Platform Engineering', 'waterfall', 'planning',  'not_assessed', null,                                                                                          0,  12,   10,  200, 'Single customer view across regions.'),
    ('NW-SEC',  'SOC 2 Compliance Uplift',         'Internal programme to reach SOC 2 Type II.',                     null,       'CTO, Northwind',   'arjun@northwind.example', 'Platform Engineering', 'kanban',    'active',    'amber',        'Evidence collection behind plan; target date passed.',                                      3,  30,  -30,   -5, 'Pass SOC 2 Type II audit.'),
    ('NW-POR',  'Partner Portal',                  'Self-service portal for logistics partners.',                    'TAILSPIN', 'VP Partnerships',  'arjun@northwind.example', 'Mobile Squad',         'scrum',     'on_hold',   'amber',        'On hold pending client budget re-approval.',                                                9,  9,   -45,   75, 'Onboard 200 partners.'),
    ('NW-ANL',  'Analytics Self-Service',          'Self-service dashboards for operations.',                        'TAILSPIN', 'Head of Ops',      'mei@northwind.example',   'Data & Analytics',     'kanban',    'proposed',  'not_assessed', null,                                                                                          0,  4,    30,  150, 'Reduce ad-hoc report requests by half.'),
    ('NW-ERP',  'ERP Upgrade Phase 1',             'Upgrade finance modules.',                                       'FABRIKAM', 'CFO, Fabrikam',    'mei@northwind.example',   'Platform Engineering', 'waterfall', 'completed', 'green',        null,                                                                                          16, 15, -200,  -20, 'Upgrade GL and AP modules.'),
    ('NW-BOT',  'Support Chatbot Pilot',           'Pilot conversational support assistant.',                        'CONTOSO',  'Head of Service',  'arjun@northwind.example', 'Mobile Squad',         'scrum',     'cancelled', 'not_assessed', null,                                                                                          0,  40,  -80,   10, 'Deflect 20% of tier-1 tickets.'),
    ('NW-OBA',  'Open Banking APIs',               'Expose account and payment APIs to third parties.',              'CONTOSO',  'CTO, Contoso Bank','mei@northwind.example',   'Platform Engineering', 'scrum',     'approved',  'not_assessed', null,                                                                                          0,  6,    20,  180, 'Regulatory compliance for open banking.')
  ) as p(code, name, description, client_code, sponsor, pm, team, methodology, status, health, health_reason, health_age, status_age, start_offset, end_offset, objectives)
where o.slug = 'northwind-demo';

insert into public.projects (organization_id, code, name, description, project_manager_id, delivery_owner_id, primary_team_id,
                             status, health, health_updated_at, planned_start_date, target_end_date, created_by)
select o.id, 'GX-TOOLS', 'Globex Internal Tooling', 'Belongs to a different tenant; Northwind users must never see it.',
       (select id from private.seed_m where email = 'alex@globex.example'), (select id from private.seed_m where email = 'alex@globex.example'),
       (select id from public.teams t where t.organization_id = o.id), 'active', 'green', now() - interval '1 day',
       current_date - 30, current_date + 90, '00000000-0000-4000-a000-000000000011'
from public.organizations o where o.slug = 'globex-demo';

-- Project memberships
insert into public.project_memberships (organization_id, project_id, membership_id, project_role, allocation_percent)
select p.organization_id, p.id, sm.id, x.role, x.alloc
from (values
    ('NW-PAY', 'dev@northwind.example',    'Backend Engineer',   60),
    ('NW-PAY', 'lena@northwind.example',   'Engineering Manager', 50),
    ('NW-PAY', 'sofia@northwind.example',  'Data Engineer',      30),
    ('NW-MOB', 'dev@northwind.example',    'Engineer',           40),
    ('NW-MOB', 'rahul@northwind.example',  'Tech Lead',          100),
    ('NW-MOB', 'tom@northwind.example',    'QA Lead',            60),
    ('NW-MOB', 'claire@contoso.example',   'Client Product Owner', null),
    ('NW-DWH', 'sofia@northwind.example',  'Lead Data Engineer', 70),
    ('NW-DWH', 'tom@northwind.example',    'QA',                 40),
    ('NW-SEC', 'lena@northwind.example',   'Control Owner',      30)
  ) as x(code, email, role, alloc)
join public.projects p on p.code = x.code
join private.seed_m sm on sm.email = x.email and sm.organization_id = p.organization_id;

-- Backdate the auto-created "created" history rows and add a plausible health trail.
update public.project_status_history h
   set changed_at = p.created_at,
       to_health = case when p.code in ('NW-PAY', 'NW-MOB', 'NW-SEC') then 'not_assessed' else h.to_health end
from public.projects p where p.id = h.project_id and h.change_type = 'created';

insert into public.project_status_history (organization_id, project_id, change_type, from_health, to_health, reason, changed_by, changed_at)
select p.organization_id, p.id, 'health', x.from_h::public.project_health, x.to_h::public.project_health, x.reason,
       '00000000-0000-4000-a000-000000000003', now() - make_interval(days => x.age)
from (values
    ('NW-PAY', 'not_assessed', 'green', 'Baseline agreed.',                                40),
    ('NW-PAY', 'green',        'amber', 'Vendor API sandbox unavailable.',                  21),
    ('NW-PAY', 'amber',        'red',   'Ledger migration slipped three weeks.',             2),
    ('NW-MOB', 'not_assessed', 'green', 'Baseline agreed.',                                 60),
    ('NW-MOB', 'green',        'amber', 'UAT environment instability.',                      5),
    ('NW-SEC', 'not_assessed', 'amber', 'Evidence collection behind plan.',                  3)
  ) as x(code, from_h, to_h, reason, age)
join public.projects p on p.code = x.code;

-- Departments and reporting lines
insert into public.departments (organization_id, name, code, description, head_membership_id, created_by)
select o.id, d.name, d.code, d.description, (select id from private.seed_m where email = d.head), '00000000-0000-4000-a000-000000000001'
from public.organizations o,
  (values
    ('Delivery',    'DEL', 'Delivery and program management.', 'priya@northwind.example'),
    ('Engineering', 'ENG', 'Software and data engineering.',   'lena@northwind.example'),
    ('Quality',     'QA',  'Testing and release quality.',     'tom@northwind.example'),
    ('IT',          'IT',  'Internal IT and administration.',  'omar@northwind.example')
  ) as d(name, code, description, head)
where o.slug = 'northwind-demo';

update public.organization_memberships m
   set department_id = (select id from public.departments d where d.organization_id = m.organization_id and d.code = x.dept),
       manager_membership_id = (select id from private.seed_m where email = x.manager)
from (values
    ('priya@northwind.example', 'DEL', null),
    ('arjun@northwind.example', 'DEL', 'priya@northwind.example'),
    ('mei@northwind.example',   'DEL', 'priya@northwind.example'),
    ('lena@northwind.example',  'ENG', 'priya@northwind.example'),
    ('dev@northwind.example',   'ENG', 'lena@northwind.example'),
    ('rahul@northwind.example', 'ENG', 'lena@northwind.example'),
    ('sofia@northwind.example', 'ENG', 'lena@northwind.example'),
    ('tom@northwind.example',   'QA',  'lena@northwind.example'),
    ('omar@northwind.example',  'IT',  'priya@northwind.example')
  ) as x(email, dept, manager)
join public.user_profiles p on p.email = x.email
where m.user_id = p.id and m.organization_id = (select id from public.organizations where slug = 'northwind-demo');

-- ---------------------------------------------------------------------------
-- Phase 2: programs, milestones, baselines, work items and sprints (demo)
-- ---------------------------------------------------------------------------
insert into public.programs (organization_id, code, name, description, owner_membership_id, created_by)
select o.id, x.code, x.name, x.description, (select id from private.seed_m where email = x.owner), '00000000-0000-4000-a000-000000000001'
from public.organizations o,
  (values
    ('CONTOSO-DX', 'Contoso Digital Transformation', 'Payments, mobile and open banking for Contoso Bank.', 'mei@northwind.example'),
    ('FAB-MOD',    'Fabrikam Modernisation',         'Data platform, CRM and ERP modernisation for Fabrikam.', 'mei@northwind.example')
  ) as x(code, name, description, owner)
where o.slug = 'northwind-demo';

update public.projects p set program_id = g.id
from public.programs g
where g.organization_id = p.organization_id
  and ((g.code = 'CONTOSO-DX' and p.code in ('NW-PAY', 'NW-MOB', 'NW-OBA')) or (g.code = 'FAB-MOD' and p.code in ('NW-DWH', 'NW-CRM', 'NW-ERP')));

-- Milestones: offsets in days from today; baseline taken 45 days ago at the original dates.
insert into public.project_milestones (organization_id, project_id, name, due_date, baseline_due_date, completed_on, owner_membership_id, created_by)
select p.organization_id, p.id, m.name, current_date + m.due, current_date + m.baseline,
       case when m.done is null then null else current_date + m.done end,
       p.project_manager_id, '00000000-0000-4000-a000-000000000001'
from (values
    ('NW-PAY', 'Ledger design sign-off',        -70, -70, -71),
    ('NW-PAY', 'Vendor API integration',        -10, -31, null),
    ('NW-PAY', 'Settlement testing complete',    12,  -9, null),
    ('NW-PAY', 'Production cutover',             30,  10, null),
    ('NW-MOB', 'Design system v3',              -40, -40, -42),
    ('NW-MOB', 'Beta to 5% of customers',        -3,  -3, null),
    ('NW-MOB', 'General availability',           60,  60, null),
    ('NW-DWH', 'Historical data migrated',       20,  20, null),
    ('NW-DWH', 'On-premise decommissioned',     118, 118, null),
    ('NW-SEC', 'Evidence collection complete',   -8, -20, null),
    ('NW-SEC', 'Type II audit',                  25,  10, null)
  ) as m(code, name, due, baseline, done)
join public.projects p on p.code = m.code;

insert into public.project_baselines (organization_id, project_id, name, snapshot, created_by, created_at)
select p.organization_id, p.id, 'Initial plan',
       jsonb_build_object('planned_start_date', p.planned_start_date, 'target_end_date', p.target_end_date,
         'milestones', (select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'due_date', m.baseline_due_date) order by m.baseline_due_date)
                        from public.project_milestones m where m.project_id = p.id)),
       '00000000-0000-4000-a000-000000000001', now() - interval '45 days'
from public.projects p where p.code in ('NW-PAY', 'NW-MOB', 'NW-DWH', 'NW-SEC');

-- Sprints (two-week cadence)
insert into public.sprints (organization_id, project_id, name, goal, start_date, end_date, state, started_at, completed_at,
                            committed_points, committed_count, completed_points, completed_count, created_by)
select p.organization_id, p.id, s.name, s.goal, current_date + s.start_off, current_date + s.start_off + 13, s.state::public.sprint_state,
       case when s.state <> 'planned' then (current_date + s.start_off)::timestamptz end,
       case when s.state = 'completed' then (current_date + s.start_off + 13)::timestamptz end,
       s.committed, s.committed_n, s.completed, s.completed_n, '00000000-0000-4000-a000-000000000001'
from (values
    ('NW-PAY', 'PAY Sprint 7',  'Ledger posting engine',              -34, 'completed', 34, 9, 29, 8),
    ('NW-PAY', 'PAY Sprint 8',  'Reconciliation and reporting',       -20, 'completed', 31, 8, 24, 6),
    ('NW-PAY', 'PAY Sprint 9',  'Vendor API settlement flow',          -6, 'active',    null, null, null, null),
    ('NW-PAY', 'PAY Sprint 10', 'Cutover rehearsal',                    8, 'planned',   null, null, null, null),
    ('NW-MOB', 'MOB Sprint 4',  'Beta feedback fixes',                 -20, 'completed', 21, 7, 21, 7),
    ('NW-MOB', 'MOB Sprint 5',  'Accessibility and performance',        -8, 'active',    null, null, null, null)
  ) as s(code, name, goal, start_off, state, committed, committed_n, completed, completed_n)
join public.projects p on p.code = s.code;

-- Work items. Parents are resolved by title within the project; states by name.
create table private.seed_items (
  code text, title text, type text, parent text, state text, points numeric, priority text,
  assignee text, sprint text, blocked boolean, severity text, ord int
);
insert into private.seed_items values
  ('NW-PAY', 'Real-time ledger',                    'epic',    null,                        'In Progress', null, 'high',     'lena@northwind.example',  null,           false, null, 1),
  ('NW-PAY', 'Settlement with card vendor',         'feature', 'Real-time ledger',          'In Progress', null, 'critical', 'dev@northwind.example',   null,           false, null, 2),
  ('NW-PAY', 'Post settlement files to ledger',     'story',   'Settlement with card vendor','Done',       5,    'high',     'dev@northwind.example',   'PAY Sprint 9', false, null, 3),
  ('NW-PAY', 'Handle vendor API timeouts',          'story',   'Settlement with card vendor','In Review',  3,    'high',     'dev@northwind.example',   'PAY Sprint 9', false, null, 4),
  ('NW-PAY', 'Vendor sandbox credentials',          'task',    'Handle vendor API timeouts','In Progress', 1,    'critical', 'lena@northwind.example',  'PAY Sprint 9', true,  null, 5),
  ('NW-PAY', 'Idempotent settlement retries',       'story',   'Settlement with card vendor','In Progress', 8,   'high',     'sofia@northwind.example', 'PAY Sprint 9', false, null, 6),
  ('NW-PAY', 'Settlement reconciliation report',    'story',   'Settlement with card vendor','Ready',       5,   'medium',   'sofia@northwind.example', 'PAY Sprint 9', false, null, 7),
  ('NW-PAY', 'Duplicate settlement on retry',       'bug',     'Settlement with card vendor','Testing',     2,   'critical', 'dev@northwind.example',   'PAY Sprint 9', false, 's1', 8),
  ('NW-PAY', 'Ledger audit trail export',           'story',   'Real-time ledger',          'Backlog',     5,    'medium',   null,                      null,           false, null, 9),
  ('NW-PAY', 'Cutover runbook',                     'story',   'Real-time ledger',          'Backlog',     3,    'high',     'lena@northwind.example',  'PAY Sprint 10',false, null, 10),
  ('NW-PAY', 'Dry-run cutover in staging',          'task',    'Cutover runbook',           'Backlog',     2,    'high',     null,                      'PAY Sprint 10',false, null, 11),
  ('NW-PAY', 'Change request: add SEPA instant',    'change_request', null,                 'Backlog',     null, 'medium',   null,                      null,           false, null, 12),
  ('NW-MOB', 'Mobile app v3',                       'epic',    null,                        'In Progress', null, 'high',     'rahul@northwind.example', null,           false, null, 1),
  ('NW-MOB', 'Accessibility AA compliance',         'feature', 'Mobile app v3',             'In Progress', null, 'high',     'rahul@northwind.example', null,           false, null, 2),
  ('NW-MOB', 'Screen reader labels on payments',    'story',   'Accessibility AA compliance','Done',       3,    'high',     'dev@northwind.example',   'MOB Sprint 5', false, null, 3),
  ('NW-MOB', 'Dynamic type support',                'story',   'Accessibility AA compliance','In Progress', 5,   'medium',   'rahul@northwind.example', 'MOB Sprint 5', false, null, 4),
  ('NW-MOB', 'Cold start under 2 seconds',          'story',   'Mobile app v3',             'In Review',   8,    'high',     'dev@northwind.example',   'MOB Sprint 5', false, null, 5),
  ('NW-MOB', 'UAT environment crashes on login',    'bug',     'Mobile app v3',             'In Progress', 3,    'critical', 'tom@northwind.example',   'MOB Sprint 5', true,  's2', 6),
  ('NW-MOB', 'Biometric login fallback',            'story',   'Mobile app v3',             'Backlog',     5,    'medium',   null,                      null,           false, null, 7);

insert into public.work_items (organization_id, project_id, type, title, state_id, story_points, priority, assignee_membership_id,
                               sprint_id, blocked, blocked_reason, severity, rank, created_by, created_at)
select p.organization_id, p.id, i.type::public.work_item_type, i.title,
       (select id from public.workflow_states s where s.organization_id = p.organization_id and s.name = 'Backlog'),
       i.points, i.priority::public.work_item_priority,
       (select id from private.seed_m where email = i.assignee and organization_id = p.organization_id),
       null, i.blocked,
       case when i.blocked then 'Waiting on the vendor to issue sandbox credentials.' end,
       i.severity::public.work_item_severity, i.ord * 1024,
       '00000000-0000-4000-a000-000000000003', now() - make_interval(days => 40 - i.ord)
from private.seed_items i join public.projects p on p.code = i.code
order by i.code, i.ord;

-- Parents (seeded parents always precede children), then sprints and final states.
update public.work_items w set parent_id = parent.id
from private.seed_items i
join public.projects p on p.code = i.code
join public.work_items parent on parent.project_id = p.id and parent.title = i.parent
where w.project_id = p.id and w.title = i.title and i.parent is not null;

update public.work_items w
   set sprint_id = (select id from public.sprints s where s.project_id = w.project_id and s.name = i.sprint),
       state_id  = (select id from public.workflow_states st where st.organization_id = w.organization_id and st.name = i.state)
from private.seed_items i
join public.projects p on p.code = i.code
where w.project_id = p.id and w.title = i.title;

insert into public.work_item_dependencies (organization_id, predecessor_id, successor_id, kind)
select a.organization_id, a.id, b.id, 'blocks'
from public.work_items a, public.work_items b
where a.title = 'Vendor sandbox credentials' and b.title = 'Handle vendor API timeouts';

insert into public.work_item_comments (organization_id, work_item_id, author_id, body, created_at)
select w.organization_id, w.id, '00000000-0000-4000-a000-000000000006', 'Escalated to the vendor account manager; promised by Thursday.', now() - interval '2 days'
from public.work_items w where w.title = 'Vendor sandbox credentials';

-- Active-sprint commitment and a believable burndown history (demo values).
update public.sprints s
   set committed_points = t.points, committed_count = t.items
  from (select sprint_id, sum(story_points) as points, count(*) as items from public.work_items where sprint_id is not null group by sprint_id) t
 where s.id = t.sprint_id and s.state = 'active';

delete from public.sprint_daily_stats;
insert into public.sprint_daily_stats (sprint_id, organization_id, day, scope_points, done_points, scope_count, done_count)
select s.id, s.organization_id, s.start_date + d.n, s.committed_points + case when d.n >= 3 then 2 else 0 end,
       least(d.done, s.committed_points), s.committed_count, d.done_n
from public.sprints s
cross join lateral (values (0, 0, 0), (1, 0, 0), (2, 3, 0), (3, 3, 0), (4, 5, 1), (5, 5, 1)) as d(n, done, done_n)
where s.state = 'active' and s.start_date + d.n < current_date;
perform private.refresh_sprint_stats(id) from public.sprints where state = 'active';

drop table private.seed_items;

drop table private.seed_m;

end;
$seed$;

