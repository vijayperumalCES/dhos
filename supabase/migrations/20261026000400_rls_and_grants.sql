-- DHOS Phase 1 — Row Level Security policies and explicit API privileges.
-- Rule: every table has RLS enabled. anon has no access to anything. Columns that carry
-- governance meaning (project status/health/archive, membership status, roles) are not
-- writable through table privileges at all; they change only through the RPCs that check
-- permissions and write history.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.organizations            enable row level security;
alter table public.organization_settings    enable row level security;
alter table public.user_profiles            enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.permissions              enable row level security;
alter table public.role_definitions         enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.membership_roles         enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.clients                  enable row level security;
alter table public.teams                    enable row level security;
alter table public.team_members             enable row level security;
alter table public.projects                 enable row level security;
alter table public.project_memberships      enable row level security;
alter table public.project_status_history   enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant per table
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

grant select on public.organization_settings to authenticated;
grant update (timezone, currency_code, week_start, health_stale_after_days) on public.organization_settings to authenticated;

grant select on public.user_profiles to authenticated;
grant update (display_name, avatar_url) on public.user_profiles to authenticated;

grant select on public.organization_memberships to authenticated;
grant update (job_title) on public.organization_memberships to authenticated;

grant select on public.permissions, public.role_definitions, public.role_permissions, public.membership_roles to authenticated;
grant select on public.organization_invitations to authenticated;
grant select on public.audit_logs to authenticated;

grant select on public.clients to authenticated;
grant insert (organization_id, name, code, industry, website, account_owner_membership_id, confidentiality, notes) on public.clients to authenticated;
grant update (name, code, industry, website, account_owner_membership_id, confidentiality, notes, archived_at) on public.clients to authenticated;

grant select on public.teams to authenticated;
grant insert (organization_id, name, description, lead_membership_id) on public.teams to authenticated;
grant update (name, description, lead_membership_id, archived_at) on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant update (team_role) on public.team_members to authenticated;

grant select on public.projects to authenticated;
grant insert (organization_id, code, name, description, client_id, sponsor_name, project_manager_id, delivery_owner_id,
              primary_team_id, methodology, planned_start_date, target_end_date, objectives, scope_summary,
              assumptions, project_constraints) on public.projects to authenticated;
grant update (code, name, description, client_id, sponsor_name, project_manager_id, delivery_owner_id, primary_team_id,
              methodology, planned_start_date, target_end_date, actual_end_date, objectives, scope_summary,
              assumptions, project_constraints) on public.projects to authenticated;

grant select, insert, delete on public.project_memberships to authenticated;
grant update (project_role, allocation_percent, start_date, end_date) on public.project_memberships to authenticated;

grant select on public.project_status_history to authenticated;

grant execute on function
  public.is_org_member(uuid),
  public.has_permission(uuid, text),
  public.my_permissions(uuid),
  public.create_organization(text, text),
  public.invite_member(uuid, text, text[]),
  public.revoke_invitation(uuid),
  public.accept_pending_invitations(),
  public.set_member_roles(uuid, text[]),
  public.set_membership_status(uuid, public.membership_status),
  public.is_valid_project_transition(public.project_status, public.project_status),
  public.can_read_project(uuid),
  public.can_act_on_project(uuid, text),
  public.transition_project_status(uuid, public.project_status, text),
  public.set_project_health(uuid, public.project_health, text),
  public.set_project_archived(uuid, boolean)
to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_permission(id, 'org.settings.manage'))
  with check (public.has_permission(id, 'org.settings.manage'));

-- organization_settings
create policy organization_settings_select on public.organization_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy organization_settings_update on public.organization_settings for update to authenticated
  using (public.has_permission(organization_id, 'org.settings.manage'))
  with check (public.has_permission(organization_id, 'org.settings.manage'));

-- user_profiles: yourself, or people in an organization where you may read the directory
create policy user_profiles_select on public.user_profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with_directory_access(id));
create policy user_profiles_update on public.user_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organization_memberships
create policy organization_memberships_select on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission(organization_id, 'org.members.read'));
create policy organization_memberships_update on public.organization_memberships for update to authenticated
  using (public.has_permission(organization_id, 'org.members.manage'))
  with check (public.has_permission(organization_id, 'org.members.manage'));

-- permissions catalogue is global, non-sensitive reference data
create policy permissions_select on public.permissions for select to authenticated using (true);

create policy role_definitions_select on public.role_definitions for select to authenticated
  using (public.is_org_member(organization_id));
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.role_definitions r where r.id = role_id and public.is_org_member(r.organization_id)));
create policy membership_roles_select on public.membership_roles for select to authenticated
  using (
    public.has_permission(organization_id, 'org.members.read')
    or membership_id = private.active_membership_id(organization_id)
  );

create policy organization_invitations_select on public.organization_invitations for select to authenticated
  using (public.has_permission(organization_id, 'org.members.manage'));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission(organization_id, 'audit.read'));

-- clients
create policy clients_select on public.clients for select to authenticated
  using (public.has_permission(organization_id, 'client.read'));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_permission(organization_id, 'client.manage'));
create policy clients_update on public.clients for update to authenticated
  using (public.has_permission(organization_id, 'client.manage'))
  with check (public.has_permission(organization_id, 'client.manage'));

-- teams
create policy teams_select on public.teams for select to authenticated
  using (public.has_permission(organization_id, 'team.read'));
create policy teams_insert on public.teams for insert to authenticated
  with check (public.has_permission(organization_id, 'team.manage'));
create policy teams_update on public.teams for update to authenticated
  using (public.has_permission(organization_id, 'team.manage'))
  with check (public.has_permission(organization_id, 'team.manage'));

create policy team_members_select on public.team_members for select to authenticated
  using (public.has_permission(organization_id, 'team.read'));
create policy team_members_insert on public.team_members for insert to authenticated
  with check (public.has_permission(organization_id, 'team.manage'));
create policy team_members_update on public.team_members for update to authenticated
  using (public.has_permission(organization_id, 'team.manage'))
  with check (public.has_permission(organization_id, 'team.manage'));
create policy team_members_delete on public.team_members for delete to authenticated
  using (public.has_permission(organization_id, 'team.manage'));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (private.can_read_project_row(organization_id, id, project_manager_id, delivery_owner_id, created_by));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.has_permission(organization_id, 'project.create'));
create policy projects_update on public.projects for update to authenticated
  using (
    public.has_permission(organization_id, 'project.update')
    and private.can_read_project_row(organization_id, id, project_manager_id, delivery_owner_id, created_by)
  )
  with check (public.has_permission(organization_id, 'project.update'));

-- project_memberships: the client stakeholder role lacks org.members.read and therefore only
-- sees its own membership row, never the internal team list.
create policy project_memberships_select on public.project_memberships for select to authenticated
  using (
    public.can_read_project(project_id)
    and (public.has_permission(organization_id, 'org.members.read')
         or membership_id = private.active_membership_id(organization_id))
  );
create policy project_memberships_insert on public.project_memberships for insert to authenticated
  with check (public.can_act_on_project(project_id, 'project.members.manage'));
create policy project_memberships_update on public.project_memberships for update to authenticated
  using (public.can_act_on_project(project_id, 'project.members.manage'))
  with check (public.can_act_on_project(project_id, 'project.members.manage'));
create policy project_memberships_delete on public.project_memberships for delete to authenticated
  using (public.can_act_on_project(project_id, 'project.members.manage'));

create policy project_status_history_select on public.project_status_history for select to authenticated
  using (public.can_read_project(project_id));
