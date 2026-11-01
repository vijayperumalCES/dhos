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
      ('00000000-0000-4000-a000-000000000011'::uuid, 'alex@globex.example',     'Alex Morgan'),
      ('00000000-0000-4000-a000-000000000012'::uuid, 'hana@northwind.example',  'Hana Sato'),
      ('00000000-0000-4000-a000-000000000013'::uuid, 'fiona@northwind.example', 'Fiona Gray')
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
      ('00000000-0000-4000-a000-000000000010'::uuid, 'Client Product Owner (Contoso)', array['client_stakeholder']),
      ('00000000-0000-4000-a000-000000000012'::uuid, 'HR Manager',              array['hr_admin']),
      ('00000000-0000-4000-a000-000000000013'::uuid, 'Finance Manager',        array['finance_manager'])
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

-- ---------------------------------------------------------------------------
-- Workforce (Phase 3): holidays, balances, leave, attendance, timesheets, allocations.
-- Dates are relative to today and land on working days of the member's calendar.
-- ---------------------------------------------------------------------------
update public.organization_memberships m
   set manager_membership_id = (select id from private.seed_m where email = 'priya@northwind.example'),
       department_id = (select id from public.departments d where d.organization_id = m.organization_id and d.code = 'DEL')
 where m.id = (select id from private.seed_m where email = 'hana@northwind.example');

insert into public.holidays (organization_id, calendar_id, holiday_date, name)
select c.organization_id, c.id, h.d, h.name
from public.work_calendars c
join public.organizations o on o.id = c.organization_id and o.slug = 'northwind-demo'
cross join lateral (values
  (make_date(extract(year from current_date)::int, 1, 26),  'Republic Day'),
  (make_date(extract(year from current_date)::int, 8, 15),  'Independence Day'),
  (make_date(extract(year from current_date)::int, 10, 2),  'Gandhi Jayanti'),
  (make_date(extract(year from current_date)::int, 12, 25), 'Christmas Day'),
  ((current_date + 7) - extract(isodow from current_date + 7)::int + 3, 'Company offsite (demo)')
) as h(d, name)
where c.is_default
on conflict do nothing;

insert into public.leave_balances (organization_id, membership_id, leave_type_id, year, granted_days)
select m.organization_id, m.id, t.id, y.year, t.annual_allowance_days
from public.organization_memberships m
join public.leave_types t on t.organization_id = m.organization_id and t.annual_allowance_days is not null
cross join (values (extract(year from current_date)::int), (extract(year from current_date)::int + 1)) as y(year)
where private.membership_has_permission(m.id, 'workforce.self');

insert into public.leave_requests (organization_id, membership_id, leave_type_id, start_date, end_date, half_day, reason, status,
                                   reviewer_id, reviewed_at, created_at)
select sm.organization_id, sm.id, t.id, wd.days[1], wd.days[x.n], x.half, x.reason, x.status::public.request_status,
       case when x.status <> 'pending' and t.requires_approval then mgr.user_id end,
       case when x.status <> 'pending' then now() - interval '1 day' end,
       now() - interval '3 days'
from (values
    ('sofia@northwind.example', 'ANNUAL', 7,   2, false, 'Family wedding',       'approved'),
    ('dev@northwind.example',   'ANNUAL', 14,  3, false, 'Trip home',            'pending'),
    ('rahul@northwind.example', 'ANNUAL', 3,   1, true,  'Personal appointment', 'pending'),
    ('tom@northwind.example',   'SICK',   -6,  1, false, null,                   'approved'),
    ('mei@northwind.example',   'ANNUAL', -12, 1, false, 'Personal day',         'approved')
  ) as x(email, code, offset_days, n, half, reason, status)
join private.seed_m sm on sm.email = x.email
join public.leave_types t on t.organization_id = sm.organization_id and t.code = x.code
join public.organization_memberships me on me.id = sm.id
left join public.organization_memberships mgr on mgr.id = me.manager_membership_id
cross join lateral (
  select array_agg(d order by d) as days
  from private.member_working_days(sm.id, current_date + x.offset_days, current_date + x.offset_days + 10) d
) wd
where extract(year from wd.days[1]) = extract(year from wd.days[x.n]);

-- Two weeks of attendance for internal staff, with one missing day (Dev) and one day never
-- checked out (Rahul) so that the exceptions view has something to show.
insert into public.attendance_records (organization_id, membership_id, work_date, check_in_at, check_out_at, work_mode)
select sm.organization_id, sm.id, d,
       ((d + time '09:00') + make_interval(mins => abs(hashtext(sm.email || d::text)) % 50)) at time zone 'Asia/Kolkata',
       case when sm.email = 'rahul@northwind.example'
                 and d = (select max(x) from private.member_working_days(sm.id, current_date - 7, current_date - 1) x)
            then null
            else ((d + time '17:30') + make_interval(mins => abs(hashtext(d::text || sm.email)) % 90)) at time zone 'Asia/Kolkata' end,
       case when abs(hashtext(sm.email || d::text)) % 3 = 0 then 'remote' else 'office' end::public.work_mode
from private.seed_m sm
join public.organizations o on o.id = sm.organization_id and o.slug = 'northwind-demo'
cross join lateral private.member_working_days(sm.id, current_date - 14, current_date - 1) d
where private.membership_has_permission(sm.id, 'workforce.self')
  and not exists (select 1 from public.leave_requests r
                  where r.membership_id = sm.id and r.status = 'approved' and d between r.start_date and r.end_date)
  and not (sm.email = 'dev@northwind.example'
           and d = (select max(x) from private.member_working_days(sm.id, current_date - 7, current_date - 2) x));

insert into public.attendance_corrections (organization_id, membership_id, work_date, check_in_at, check_out_at, work_mode, reason, created_at)
select sm.organization_id, sm.id, x.d,
       (x.d + time '09:15') at time zone 'Asia/Kolkata', (x.d + time '18:00') at time zone 'Asia/Kolkata',
       'office', 'Forgot to check in — was at the Contoso office all day.', now() - interval '1 day'
from private.seed_m sm
cross join lateral (select max(w) as d from private.member_working_days(sm.id, current_date - 7, current_date - 2) w) x
where sm.email = 'dev@northwind.example';

-- Timesheets for the two previous weeks, split by indicative project allocation.
create table private.seed_ts (email text, week_offset int, status text);
insert into private.seed_ts
select sm.email, w.week_offset,
       case when w.week_offset = -14 then 'approved'
            else case sm.email when 'dev@northwind.example' then 'submitted'
                               when 'sofia@northwind.example' then 'submitted'
                               when 'tom@northwind.example' then 'draft'
                               when 'lena@northwind.example' then 'approved' end end
from private.seed_m sm
cross join (values (-14), (-7)) as w(week_offset)
where sm.email in ('dev@northwind.example', 'sofia@northwind.example', 'tom@northwind.example', 'lena@northwind.example', 'rahul@northwind.example');
delete from private.seed_ts where status is null;

insert into public.timesheets (organization_id, membership_id, week_start)
select sm.organization_id, sm.id, date_trunc('week', current_date)::date + ts.week_offset
from private.seed_ts ts join private.seed_m sm on sm.email = ts.email;

insert into public.time_entries (organization_id, timesheet_id, entry_date, category, project_id, hours)
select t.organization_id, t.id, d, 'delivery', pm.project_id, round(8 * pm.allocation_percent / 100.0 * 2) / 2
from public.timesheets t
join public.project_memberships pm on pm.membership_id = t.membership_id and pm.allocation_percent > 0
cross join lateral private.member_working_days(t.membership_id, t.week_start, t.week_start + 4) d
where round(8 * pm.allocation_percent / 100.0 * 2) / 2 > 0
  and not exists (select 1 from public.leave_requests r
                  where r.membership_id = t.membership_id and r.status = 'approved' and d between r.start_date and r.end_date);

insert into public.time_entries (organization_id, timesheet_id, entry_date, category, hours, note)
select t.organization_id, t.id, t.week_start + 4, 'internal', 1, 'Team retro and guild meeting'
from public.timesheets t
where t.week_start + 4 in (select private.member_working_days(t.membership_id, t.week_start + 4, t.week_start + 4));

update public.timesheets t
   set status = ts.status::public.timesheet_status,
       submitted_at = case when ts.status <> 'draft' then (t.week_start + 5)::timestamptz end,
       reviewer_id = case when ts.status = 'approved' then mgr.user_id end,
       reviewed_at = case when ts.status = 'approved' then (t.week_start + 7)::timestamptz end
  from private.seed_ts ts
  join private.seed_m sm on sm.email = ts.email
  join public.organization_memberships me on me.id = sm.id
  left join public.organization_memberships mgr on mgr.id = me.manager_membership_id
 where t.membership_id = sm.id and t.week_start = date_trunc('week', current_date)::date + ts.week_offset;
drop table private.seed_ts;

-- Dated allocations from the indicative project allocations, plus one deliberate over-allocation.
insert into public.resource_allocations (organization_id, membership_id, project_id, start_date, end_date, percent, role, created_by)
select pm.organization_id, pm.membership_id, pm.project_id,
       coalesce(p.planned_start_date, current_date - 30), greatest(coalesce(p.target_end_date, current_date + 90), current_date + 30),
       pm.allocation_percent, pm.project_role, '00000000-0000-4000-a000-000000000004'
from public.project_memberships pm
join public.projects p on p.id = pm.project_id
where pm.allocation_percent > 0;

insert into public.resource_allocations (organization_id, membership_id, project_id, start_date, end_date, percent, role, notes, created_by)
select p.organization_id, sm.id, p.id, current_date + 7, current_date + 34, 30, 'Backend Engineer',
       'Short-term help with warehouse ingestion. Over-allocates Dev — demo record.', '00000000-0000-4000-a000-000000000004'
from public.projects p join private.seed_m sm on sm.email = 'dev@northwind.example' and sm.organization_id = p.organization_id
where p.code = 'NW-DWH';

-- ---------------------------------------------------------------------------
-- Governance (Phase 4): RAID, decisions, actions, escalations, changes, releases, client records,
-- documents. Written through the same RPCs and triggers the app uses, impersonating the
-- demo users so that "raised by", "decided by" and the audit log carry real people.
-- NW-PAY turns red with nothing recorded since, so the executive report has an open interval.
-- ---------------------------------------------------------------------------
create table private.seed_p as select id, organization_id, code from public.projects;

-- Priya (Delivery Head)
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into public.raid_items (organization_id, project_id, type, title, description, probability, impact, owner_membership_id, due_date, mitigation, contingency)
select p.organization_id, p.id, x.type::public.raid_type, x.title, x.description, x.prob, x.impact,
       (select id from private.seed_m where email = x.owner and organization_id = p.organization_id), current_date + x.due, x.mitigation, x.contingency
from (values
    ('NW-PAY', 'risk',       'Vendor sandbox API is unstable',           'Contoso''s payment-switch sandbox drops connections under load.', 4, 4, 'arjun@northwind.example',  7,  'Agree an SLA and a stub for contract tests.', 'Fall back to recorded fixtures.'),
    ('NW-PAY', 'risk',       'Key ledger engineer may leave',            'One engineer holds most of the ledger design knowledge.',        2, 5, 'lena@northwind.example',   -3, 'Pair a second engineer and document the design.', null),
    ('NW-PAY', 'issue',      'Ledger migration slipped three weeks',     'Reconciliation scripts needed a rewrite.',                       null::int, 4, 'arjun@northwind.example', 5, 'Re-plan the cutover with the client.', null),
    ('NW-PAY', 'dependency', 'Contoso network rule approval',            'Security must open the ports for the new ledger.',               null, null, 'arjun@northwind.example', 14, null, null),
    ('NW-PAY', 'assumption', 'Contoso supplies production-like data',    'Needed from month end for volume testing.',                      null, null, 'arjun@northwind.example', 21, null, null),
    ('NW-MOB', 'risk',       'UAT environment instability',              'Frequent redeploys break test sessions.',                        3, 3, 'rahul@northwind.example',  10, 'Dedicated UAT slot and a smoke test after each deploy.', null),
    ('NW-MOB', 'issue',      'App store submission rejected',            'Privacy manifest was missing.',                                  null, 3, 'tom@northwind.example',  -4, null, null),
    ('NW-DWH', 'risk',       'Source schemas are undocumented',          'Some tables have no owner or documentation.',                    4, 3, 'sofia@northwind.example',  10, 'Interview the data owners and document as we go.', null),
    ('NW-DWH', 'risk',       'Peak-season freeze shrinks the cutover window', 'Retail freezes changes for six weeks.',                     3, 2, 'mei@northwind.example',    30, null, null)
  ) as x(code, type, title, description, prob, impact, owner, due, mitigation, contingency)
join private.seed_p p on p.code = x.code and p.organization_id = (select id from public.organizations where slug = 'northwind-demo');

update public.raid_items set status = 'in_progress' where title = 'Vendor sandbox API is unstable';
update public.raid_items set status = 'resolved', resolution_note = 'Resubmitted with the privacy manifest; approved by the store.' where title = 'App store submission rejected';
update public.raid_items set status = 'accepted', resolution_note = 'Cutover is scheduled before the freeze; the residual risk is accepted by the sponsor.' where title = 'Peak-season freeze shrinks the cutover window';
-- Recorded before NW-PAY turned red two days ago.
update public.raid_items r set created_at = now() - interval '12 days'
from private.seed_p p where p.id = r.project_id and p.code = 'NW-PAY';

insert into public.decisions (organization_id, project_id, title, context, decision, rationale, consequences)
select p.organization_id, p.id, x.title, x.context, x.decision, x.rationale, x.consequences
from (values
    ('NW-PAY', 'Cut over region by region',        'A single cutover carries too much risk for the bank.', 'Migrate one region per weekend.', 'Limits the blast radius of a bad cutover.', 'Longer overall programme; two ledgers run in parallel.'),
    ('NW-PAY', 'Move the full cutover to Q1',      'The migration slipped and the client freeze starts in December.', 'Do a single cutover in the first January weekend.', 'Avoids running two ledgers through the freeze.', 'Adds three weeks to the plan; needs a change request.'),
    ('NW-MOB', 'Ship biometric login in 3.1',      'Customers ask for it and the platform support is ready.', 'Include biometric login in release 3.1.', 'Highest-voted request; low effort.', 'Needs new test devices.'),
    ('NW-DWH', 'Use dbt for transformations',      'Team needs tested, reviewable transformations.', null, null, null)
  ) as x(code, title, context, decision, rationale, consequences)
join private.seed_p p on p.code = x.code and p.organization_id = (select id from public.organizations where slug = 'northwind-demo');
update public.decisions set status = 'accepted' where title in ('Cut over region by region', 'Move the full cutover to Q1', 'Ship biometric login in 3.1');
update public.decisions d set status = 'superseded', superseded_by_id = n.id
from public.decisions n where d.title = 'Cut over region by region' and n.title = 'Move the full cutover to Q1' and n.project_id = d.project_id;

insert into public.project_actions (organization_id, project_id, title, description, owner_membership_id, due_date, raid_item_id)
select p.organization_id, p.id, x.title, x.description, (select id from private.seed_m where email = x.owner and organization_id = p.organization_id),
       current_date + x.due, (select r.id from public.raid_items r where r.project_id = p.id and r.title = x.raid)
from (values
    ('NW-PAY', 'Agree the vendor sandbox SLA',                'Get written uptime and rate-limit commitments.',             'arjun@northwind.example', -2, 'Vendor sandbox API is unstable'),
    ('NW-PAY', 'Draft a retention plan for ledger engineers', 'Pairing, documentation and a knowledge-transfer schedule.',  'lena@northwind.example',  6,  'Key ledger engineer may leave'),
    ('NW-MOB', 'Stabilise the UAT environment',               'Dedicated slot, smoke test after each deploy.',              'rahul@northwind.example', 3,  'UAT environment instability'),
    ('NW-MOB', 'Resubmit 3.0.2 to the store',                 null,                                                         'tom@northwind.example',   -5, 'App store submission rejected'),
    ('NW-DWH', 'Document the source schemas',                 'One page per source system.',                                'sofia@northwind.example', 9,  'Source schemas are undocumented')
  ) as x(code, title, description, owner, due, raid)
join private.seed_p p on p.code = x.code and p.organization_id = (select id from public.organizations where slug = 'northwind-demo');
update public.project_actions set status = 'in_progress' where title = 'Stabilise the UAT environment';
update public.project_actions set status = 'done' where title = 'Resubmit 3.0.2 to the store';

-- Arjun (Project Manager) and Mei (Program Manager): escalations and change requests
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);

perform public.raise_escalation(
  (select id from private.seed_p where code = 'NW-MOB'), 'UAT environment owner is unresponsive',
  'Three requests for a stable UAT slot have gone unanswered; testing is stalled.', 'high',
  (select id from private.seed_m where email = 'mei@northwind.example'), now() + interval '2 days', null,
  '[{"kind":"note","title":"Request history","note":"Requests on the 3rd, 7th and 10th; no reply."},{"kind":"link","title":"UAT booking thread","url":"https://tracker.example/NW-MOB/uat"}]'::jsonb);
perform public.raise_escalation(
  (select id from private.seed_p where code = 'NW-PAY'), 'Vendor sandbox outage blocks ledger migration',
  'The sandbox has been down for three days. Migration rehearsals cannot run.', 'critical',
  (select id from private.seed_m where email = 'priya@northwind.example'), now() + interval '3 days',
  (select r.id from public.raid_items r where r.title = 'Vendor sandbox API is unstable'),
  '[{"kind":"note","title":"Impact","note":"Rehearsal 2 and 3 are blocked; cutover date at risk."},{"kind":"link","title":"Vendor status page","url":"https://status.vendor.example"}]'::jsonb);
-- Mei manages NW-DWH.
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
perform public.raise_escalation(
  (select id from private.seed_p where code = 'NW-DWH'), 'Source system access still not granted',
  'Access to the finance source system was promised for last sprint.', 'medium',
  (select id from private.seed_m where email = 'priya@northwind.example'), now() + interval '5 days', null,
  '[{"kind":"note","title":"Request","note":"Access request raised two weeks ago."}]'::jsonb);
-- One overdue (deadline passed), one acknowledged, one resolved.
update public.escalations set respond_by = now() - interval '1 day' where title = 'UAT environment owner is unresponsive';
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
perform public.acknowledge_escalation((select id from public.escalations where title = 'Vendor sandbox outage blocks ledger migration'));
perform public.acknowledge_escalation((select id from public.escalations where title = 'Source system access still not granted'));
perform public.resolve_escalation((select id from public.escalations where title = 'Source system access still not granted'), 'Access granted by the client CIO on Tuesday.');

perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
insert into public.change_requests (organization_id, project_id, title, description, justification, impact_schedule_days, impact_effort_hours, impact_scope, impact_risk)
select p.organization_id, p.id, x.title, x.description, x.justification, x.days, x.hours, x.scope, x.risk
from (values
    ('NW-PAY', 'Extend ledger scope to FX settlements', 'Include foreign-exchange settlement postings in the new ledger.', 'Contractual commitment in the SOW addendum.', 15, 320.0, 'Adds the FX posting module.', 'Introduces a dependency on the treasury system.'),
    ('NW-MOB', 'Add biometric re-authentication',        'Re-authenticate with biometrics for payments above a limit.', 'Required by the bank''s new security policy.', 5, 80.0, 'One new screen and a policy service.', 'Needs new test devices.'),
    ('NW-DWH', 'Add a quarterly archive tier',           'Move cold data to cheaper storage.', null, null::int, null::numeric, null, null)
  ) as x(code, title, description, justification, days, hours, scope, risk)
join private.seed_p p on p.code = x.code and p.organization_id = (select id from public.organizations where slug = 'northwind-demo');
-- Backdated while still a draft: submitted requests are locked.
update public.change_requests c set created_at = now() - interval '4 days' from private.seed_p p where p.id = c.project_id and p.code = 'NW-PAY';
perform public.submit_change_request(id) from public.change_requests where title in ('Extend ledger scope to FX settlements', 'Add biometric re-authentication');
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
perform public.decide_change_request((select id from public.change_requests where title = 'Extend ledger scope to FX settlements'), true, 'Approved; re-baseline once the cutover decision is confirmed.');

-- Releases: one shipped, one in review, one planned
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
insert into public.releases (organization_id, project_id, name, version, planned_date, notes, release_manager_membership_id)
select p.organization_id, p.id, x.name, x.version, current_date + x.offset_days, x.notes, (select id from private.seed_m where email = x.manager and organization_id = p.organization_id)
from (values
    ('NW-MOB', 'Release 3.0.2',    '3.0.2', -6, 'Hotfix: crash on launch for older devices.', 'rahul@northwind.example'),
    ('NW-MOB', 'Release 3.1',      '3.1.0', 12, 'Biometric login, payments polish.',          'rahul@northwind.example'),
    ('NW-PAY', 'Ledger cutover 1', '1.0.0', 30, 'First production cutover.',                  'arjun@northwind.example')
  ) as x(code, name, version, offset_days, notes, manager)
join private.seed_p p on p.code = x.code and p.organization_id = (select id from public.organizations where slug = 'northwind-demo');

perform public.transition_release((select id from public.releases where name = 'Release 3.0.2'), 'in_review');
perform public.record_gate_result(g.id, 'passed') from public.release_gates g join public.releases r on r.id = g.release_id
 where r.name = 'Release 3.0.2' and g.name <> 'Security review';
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
perform public.record_gate_result(g.id, 'waived', 'Hotfix with no new dependencies; covered by the 3.0 review.') from public.release_gates g join public.releases r on r.id = g.release_id
 where r.name = 'Release 3.0.2' and g.name = 'Security review';
perform public.transition_release((select id from public.releases where name = 'Release 3.0.2'), 'approved');
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
perform public.transition_release((select id from public.releases where name = 'Release 3.0.2'), 'released');
perform public.transition_release((select id from public.releases where name = 'Release 3.1'), 'in_review');
perform public.record_gate_result(g.id, 'passed') from public.release_gates g join public.releases r on r.id = g.release_id
 where r.name = 'Release 3.1' and g.name in ('Automated tests passing', 'No open critical defects');

-- Documents (Arjun for PAY and MOB, Mei for DWH)
perform public.create_document((select id from private.seed_p where code = 'NW-PAY'), 'Project charter', 'charter', 'internal',
  'Scope, goals and governance for the payments platform programme.',
  E'# Payments Platform Modernization — charter\n\n## Goals\n- Replace the legacy payment switch\n- Zero data loss at cutover\n\n## Governance\nWeekly steering with the sponsor.', null, 'Initial version');
perform public.add_document_version((select id from public.documents where title = 'Project charter'),
  E'# Payments Platform Modernization — charter\n\n## Goals\n- Replace the legacy payment switch\n- Zero data loss at cutover\n- Add FX settlement postings (CR approved)\n\n## Governance\nWeekly steering with the sponsor.', null, 'Added FX scope after change approval');
perform public.create_document((select id from private.seed_p where code = 'NW-MOB'), 'Release notes 3.0.2', 'report', 'client',
  'What changed in the 3.0.2 hotfix, for the client product owner.',
  E'# Release 3.0.2\n\n- Fixed a crash on launch for devices older than three years.\n- No new features.', null, 'Published with the release');
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
perform public.create_document((select id from private.seed_p where code = 'NW-DWH'), 'Migration approach', 'plan', 'internal',
  'How the warehouse moves, wave by wave.', null, 'https://docs.example/nw-dwh/migration-approach', 'Linked from the team wiki');

-- Client contacts and contracts (Contoso is confidential; Priya is its account owner)
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into public.client_contacts (organization_id, client_id, name, job_title, email, phone, is_primary)
select c.organization_id, c.id, x.name, x.title, x.email, x.phone, x.is_primary
from (values
    ('CONTOSO',  'Claire Dubois',   'Head of Digital',    'claire@contoso.example',   '+33 1 5555 0101', true),
    ('CONTOSO',  'Marc Lefevre',    'Security Architect', 'marc@contoso.example',     null,              false),
    ('FABRIKAM', 'Nina Alvarez',    'COO',                'nina@fabrikam.example',    '+1 555 0102',     true),
    ('TAILSPIN', 'Oskar Lindqvist', 'VP Partnerships',    'oskar@tailspin.example',   null,              true)
  ) as x(code, name, title, email, phone, is_primary)
join public.clients c on c.code = x.code and c.organization_id = (select id from public.organizations where slug = 'northwind-demo');
insert into public.client_contracts (organization_id, client_id, title, reference, contract_type, status, start_date, end_date, renewal_notice_days, notes)
select c.organization_id, c.id, x.title, x.ref, x.type::public.contract_type, x.status::public.contract_status, current_date + x.start_offset, current_date + x.end_offset, x.notice, x.notes
from (values
    ('CONTOSO',  'Master services agreement',      'MSA-2024-017', 'msa',     'active', -400, 200, 90,         'Governs all Contoso work. Demo record.'),
    ('CONTOSO',  'SOW 4 — Payments modernization', 'SOW-2025-004', 'sow',     'active', -120, 45,  60,         'Ends soon: renewal discussion due. Demo record.'),
    ('FABRIKAM', 'Support agreement',              'SUP-2025-009', 'support', 'active', -60,  400, 30,         'Demo record.'),
    ('TAILSPIN', 'Mutual NDA',                     null,           'nda',     'draft',  0,    365, null::int,  'Awaiting signature. Demo record.')
  ) as x(code, title, ref, type, status, start_offset, end_offset, notice, notes)
join public.clients c on c.code = x.code and c.organization_id = (select id from public.organizations where slug = 'northwind-demo');

-- NW-PAY turned red two days ago. Everything recorded for it is dated before that, so none of it counts
-- as a recovery action and the executive report lists the project as red with nothing recorded since.
update public.escalations e set created_at = now() - interval '4 days' from private.seed_p p where p.id = e.project_id and p.code = 'NW-PAY';
update public.project_actions a set created_at = now() - interval '4 days' from private.seed_p p where p.id = a.project_id and p.code = 'NW-PAY';

perform set_config('request.jwt.claims', '', true);
drop table private.seed_p;

-- ---------------------------------------------------------------------------
-- Finance (Phase 5): rate card, budgets and baselines, ledger, forecasts, contract values, revenue.
-- Amounts are in INR (the demo organization's currency). Fiona (Finance Manager) drafts and Priya
-- (Delivery Head) approves, as the two-person rule requires. "Data Engineer" is left off the rate
-- card on purpose so the report shows hours without a rate. NW-CRM has no budget (no baseline).
-- ---------------------------------------------------------------------------
create table private.seed_p as
  select p.id, p.code, p.organization_id from public.projects p
  where p.organization_id = (select id from public.organizations where slug = 'northwind-demo');

insert into public.rate_card_lines (organization_id, role_title, cost_rate, bill_rate, effective_from, created_by)
select (select id from public.organizations where slug = 'northwind-demo'), x.title, x.cost, x.bill, current_date - 365, '00000000-0000-4000-a000-000000000013'
from (values
    ('Software Engineer', 1800, 3000), ('Mobile Tech Lead', 2800, 4200), ('QA Lead', 1900, 3000), ('Engineering Manager', 3000, 4500),
    ('Senior Delivery Manager', 3200, 4800), ('Program Manager', 3400, 5000), ('Delivery Head', 4500, 6500), ('IT Administrator', 1500, null)
  ) as x(title, cost, bill);
-- A rate change that takes effect next month: forecasts use it, past actuals don't.
insert into public.rate_card_lines (organization_id, role_title, cost_rate, bill_rate, effective_from, created_by)
select (select id from public.organizations where slug = 'northwind-demo'), 'Software Engineer', 1950, 3100,
       (date_trunc('month', current_date) + interval '1 month')::date, '00000000-0000-4000-a000-000000000013';

perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000013","role":"authenticated"}', true);
create table private.seed_b (code text, budget_id uuid);
insert into private.seed_b
select x.code, public.start_budget((select id from private.seed_p where code = x.code), 'Initial budget')
from (values ('NW-PAY'), ('NW-MOB'), ('NW-DWH'), ('NW-POR'), ('NW-SEC')) as x(code);
insert into public.budget_lines (organization_id, project_id, budget_id, category, amount, note)
select p.organization_id, p.id, b.budget_id, x.category::public.cost_category, x.amount, x.note
from (values
    ('NW-PAY', 'labour', 700000, 'Core team for the planned duration'), ('NW-PAY', 'infrastructure', 500000, 'Under-budgeted: the revision below raises it'), ('NW-PAY', 'software', 200000, null),
    ('NW-MOB', 'labour', 1800000, null), ('NW-MOB', 'subcontractor', 700000, 'Design agency'), ('NW-MOB', 'software', 150000, null),
    ('NW-DWH', 'labour', 1500000, null), ('NW-DWH', 'infrastructure', 900000, null),
    ('NW-POR', 'labour', 2600000, null), ('NW-POR', 'software', 120000, null),
    ('NW-SEC', 'labour', 1200000, null), ('NW-SEC', 'other', 300000, 'Audit fees')
  ) as x(code, category, amount, note)
join private.seed_p p on p.code = x.code
join private.seed_b b on b.code = x.code;

perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
perform public.approve_budget(budget_id) from private.seed_b;
-- Backdate the approvals so the baselines predate the actuals.
update public.project_budgets set approved_at = now() - interval '45 days', created_at = now() - interval '46 days' where status = 'approved' and project_id in (select id from private.seed_p);

-- NW-PAY: a revision in review. Fiona raised the infrastructure line; it is still a draft, so the baseline
-- (and the over-budget forecast) stands until Priya approves it.
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000013","role":"authenticated"}', true);
perform public.start_budget((select id from private.seed_p where code = 'NW-PAY'), 'Revision 2 — added hosting for the new region');
update public.budget_lines set amount = 900000
 where category = 'infrastructure' and budget_id = (select id from public.project_budgets where project_id = (select id from private.seed_p where code = 'NW-PAY') and status = 'draft');

insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description, vendor, reference, created_by)
select p.organization_id, p.id, current_date + x.day_offset, x.category::public.cost_category, x.amount, x.description, x.vendor, x.ref, '00000000-0000-4000-a000-000000000013'
from (values
    ('NW-PAY', -40, 'infrastructure', 450000, 'Cloud hosting, setup and first quarter', 'Azure', 'INV-2290'),
    ('NW-PAY', -25, 'software', 180000, 'Observability licences, annual', 'Datadog', 'INV-2311'),
    ('NW-PAY', -10, 'infrastructure', 110000, 'Load-test environment', 'Azure', 'INV-2352'),
    ('NW-MOB', -35, 'subcontractor', 420000, 'Design agency, discovery sprint', 'Pixel & Co', 'PO-0412'),
    ('NW-MOB', -12, 'software', 60000, 'Device farm subscription', 'BrowserStack', 'INV-2340'),
    ('NW-DWH', -30, 'infrastructure', 240000, 'Landing zone and network', 'AWS', 'INV-2301'),
    ('NW-POR', -20, 'software', 45000, 'Identity provider, first year', 'Auth0', 'INV-2330'),
    ('NW-SEC', -15, 'other', 150000, 'Auditor retainer', 'Assure LLP', 'PO-0419')
  ) as x(code, day_offset, category, amount, description, vendor, ref)
join private.seed_p p on p.code = x.code;
-- A mistake, reversed (both lines stay on the ledger).
insert into public.cost_entries (organization_id, project_id, entry_date, category, amount, description, vendor, reference, created_by)
select p.organization_id, p.id, current_date - 8, 'software', 90000, 'Duplicate licence charge', 'Datadog', 'INV-2311-DUP', '00000000-0000-4000-a000-000000000013'
from private.seed_p p where p.code = 'NW-PAY';
perform public.reverse_cost_entry(e.id, 'Charged twice; credited by the vendor')
from public.cost_entries e where e.reference = 'INV-2311-DUP';

insert into public.forecast_entries (organization_id, project_id, category, period, amount, note, created_by)
select p.organization_id, p.id, x.category::public.cost_category, (date_trunc('month', current_date) + make_interval(months => x.month_offset))::date, x.amount, x.note, '00000000-0000-4000-a000-000000000013'
from (values
    ('NW-PAY', 'infrastructure', 0, 120000, 'Production hosting ramps up'), ('NW-PAY', 'infrastructure', 1, 180000, null), ('NW-PAY', 'infrastructure', 2, 180000, null),
    ('NW-MOB', 'subcontractor', 1, 280000, 'Visual design phase'),
    ('NW-DWH', 'infrastructure', 1, 150000, null), ('NW-DWH', 'infrastructure', 2, 150000, null)
  ) as x(code, category, month_offset, amount, note)
join private.seed_p p on p.code = x.code;

-- Contract values and revenue (Contoso is a confidential client; Priya and Fiona can see it)
insert into public.contract_values (contract_id, organization_id, total_value, billing_model, notes, updated_by)
select c.id, c.organization_id, x.value, x.model::public.billing_model, 'Demo figure.', '00000000-0000-4000-a000-000000000013'
from (values ('SOW-2025-004', 2400000, 'fixed_price'), ('SUP-2025-009', 2400000, 'retainer')) as x(ref, value, model)
join public.client_contracts c on c.reference = x.ref;
insert into public.revenue_lines (organization_id, project_id, contract_id, description, planned_date, amount, created_by)
select p.organization_id, p.id, (select id from public.client_contracts where reference = 'SOW-2025-004'), x.description, current_date + x.day_offset, x.amount, '00000000-0000-4000-a000-000000000013'
from (values
    ('Milestone 1 — design sign-off', -60, 800000), ('Milestone 2 — ledger core live', 15, 800000), ('Milestone 3 — cut-over', 80, 800000)
  ) as x(description, day_offset, amount)
join private.seed_p p on p.code = 'NW-PAY';
perform public.recognise_revenue(r.id, r.planned_date) from public.revenue_lines r where r.description like 'Milestone 1%';

-- ---------------------------------------------------------------------------
-- AI agents (Phase 6): on for Northwind with evaluated version-1 prompts on the built-in
-- provider (no cost, no external calls), plus one pending proposal for Priya to decide.
-- Globex keeps the defaults: agents off. The evaluation rows below are demo stand-ins; in the
-- app an operator runs the real golden cases before activating.
-- ---------------------------------------------------------------------------
perform set_config('request.jwt.claims', '', true);
update public.agent_org_settings set enabled = true
 where organization_id = (select id from public.organizations where slug = 'northwind-demo');
insert into public.agent_eval_runs (organization_id, agent_id, version_id, passed, total_cases, passed_cases, results, run_by)
select d.organization_id, d.id, v.id, true, 1, 1, '[{"name":"Seeded for the demo","passed":true,"detail":"ok"}]'::jsonb, '00000000-0000-4000-a000-000000000002'
from public.agent_definitions d
join public.agent_versions v on v.agent_id = d.id and v.version = 1
where d.organization_id = (select id from public.organizations where slug = 'northwind-demo');
update public.agent_definitions d set enabled = true,
       active_version_id = (select v.id from public.agent_versions v where v.agent_id = d.id and v.version = 1)
 where d.organization_id = (select id from public.organizations where slug = 'northwind-demo');

insert into public.agent_executions (id, organization_id, agent_id, version_id, requested_by_membership_id, requested_by, project_id, status, input, output, provider, model, latency_ms, completed_at)
select '00000000-0000-4000-b000-000000000001', p.organization_id, d.id, d.active_version_id,
       (select id from private.seed_m where email = 'arjun@northwind.example' and organization_id = p.organization_id), '00000000-0000-4000-a000-000000000003', p.id, 'succeeded',
       '{"text":"Demo notes"}'::jsonb,
       '{"summary":"Drafted 2 items from the notes. Review each before approving; nothing is created until it is approved.","stories":[{"title":"Cardholders can see pending authorisations","description":"Users must be able to see pending authorisations in the ledger view.","acceptanceCriteria":["Verified: pending items appear within a minute of authorisation"],"type":"story"},{"title":"Export ledger entries to CSV","description":"Finance should be able to export ledger entries to CSV.","acceptanceCriteria":["Verified: the export includes entry date, amount and reference"],"type":"story"}],"openQuestions":[],"limitations":["Demo data produced by the seed, not by an agent run."]}'::jsonb,
       'builtin', 'builtin-rules', 12, now()
from private.seed_p p
join public.agent_definitions d on d.organization_id = p.organization_id and d.key = 'requirements'
where p.code = 'NW-PAY';
insert into public.agent_approvals (organization_id, execution_id, project_id, action_type, summary, payload, requested_by_membership_id)
select e.organization_id, e.id, e.project_id, 'create_work_item', x.summary, x.payload::jsonb, e.requested_by_membership_id
from public.agent_executions e
cross join (values
  ('Create story: Cardholders can see pending authorisations', '{"title":"Cardholders can see pending authorisations","description":"Users must be able to see pending authorisations in the ledger view.","acceptanceCriteria":["Verified: pending items appear within a minute of authorisation"],"type":"story"}'),
  ('Create story: Export ledger entries to CSV', '{"title":"Export ledger entries to CSV","description":"Finance should be able to export ledger entries to CSV.","acceptanceCriteria":["Verified: the export includes entry date, amount and reference"],"type":"story"}')
) as x(summary, payload)
where e.id = '00000000-0000-4000-b000-000000000001';

perform set_config('request.jwt.claims', '', true);
drop table private.seed_b;
drop table private.seed_p;

drop table private.seed_m;

end;
$seed$;
