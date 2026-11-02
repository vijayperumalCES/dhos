-- Phase 8 security controls:
--   * dual approval for privileged role grants (org setting + request/decide RPCs)
--   * an MFA enforcement option, enforced in the database helpers that every RLS policy uses
--   * a legal hold that suspends the retention job
-- All three are off by default and changed only through audited RPCs; the settings columns are
-- not in the column-level UPDATE grant on organization_settings.

alter table public.organization_settings
  add column require_dual_approval boolean not null default false,
  add column require_mfa           boolean not null default false,
  add column legal_hold            boolean not null default false,
  add column legal_hold_reason     text check (legal_hold_reason is null or char_length(legal_hold_reason) between 3 and 500),
  add column legal_hold_set_at     timestamptz,
  add column legal_hold_set_by     uuid references auth.users (id) on delete set null,
  add constraint legal_hold_has_reason check (not legal_hold or legal_hold_reason is not null);

comment on column public.organization_settings.require_dual_approval is 'When true, granting a role that carries an administrative or finance permission needs a second person to approve.';
comment on column public.organization_settings.require_mfa is 'When true, members of this organization see nothing from it unless their session is at assurance level aal2.';
comment on column public.organization_settings.legal_hold is 'When true, the retention job deletes nothing for this organization.';

-- ---------------------------------------------------------------------------
-- Which permissions make a role privileged
-- ---------------------------------------------------------------------------
create or replace function private.is_privileged_permission(p_key text)
returns boolean language sql immutable set search_path = '' as $$
  select p_key in ('org.settings.manage', 'org.members.manage', 'org.roles.manage', 'finance.manage', 'finance.approve');
$$;

create or replace function private.role_is_privileged(p_role uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.role_permissions rp where rp.role_id = p_role and private.is_privileged_permission(rp.permission_key));
$$;

create or replace function private.dual_approval_on(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.require_dual_approval from public.organization_settings s where s.organization_id = p_org), false);
$$;

-- ---------------------------------------------------------------------------
-- MFA enforcement. The JWT's "aal" claim is aal2 only after a second factor was verified in this
-- session. With the option on, a session at aal1 is simply not a member: every policy that goes
-- through is_org_member / has_permission returns nothing.
-- ---------------------------------------------------------------------------
create or replace function private.session_aal2()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', '') = 'aal2';
$$;

create or replace function private.mfa_ok(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_aal2()
      or not coalesce((select s.require_mfa from public.organization_settings s where s.organization_id = p_org), false);
$$;

create or replace function private.active_membership_id(p_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.archived_at is null
  where m.organization_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and private.mfa_ok(p_org);
$$;

create or replace function public.has_permission(p_org uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id and o.archived_at is null
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission_key = p_permission
      and private.mfa_ok(p_org)
  );
$$;

create or replace function public.my_permissions(p_org uuid)
returns setof text language sql stable security definer set search_path = '' as $$
  select distinct rp.permission_key
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.archived_at is null
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.organization_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and private.mfa_ok(p_org)
  order by 1;
$$;

-- Lets the app tell a signed-in person at aal1 that they must verify a second factor. It does not
-- go through the gated helpers and returns only organizations the caller belongs to.
create or replace function public.mfa_required_organizations()
returns table (organization_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.archived_at is null
  join public.organization_settings s on s.organization_id = o.id
  where m.user_id = (select auth.uid()) and m.status = 'active' and s.require_mfa;
$$;

-- ---------------------------------------------------------------------------
-- Dual approval: requests
-- ---------------------------------------------------------------------------
create table public.role_grant_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  membership_id   uuid not null,
  role_id         uuid not null,
  reason          text not null check (char_length(btrim(reason)) between 3 and 500),
  requested_by    uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text check (decision_note is null or char_length(decision_note) <= 500),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  foreign key (membership_id, organization_id) references public.organization_memberships (id, organization_id) on delete cascade,
  foreign key (role_id, organization_id) references public.role_definitions (id, organization_id) on delete cascade,
  check ((status = 'pending') = (decided_at is null and decided_by is null) or status in ('cancelled', 'expired'))
);
create unique index role_grant_requests_one_pending on public.role_grant_requests (membership_id, role_id) where status = 'pending';
create index role_grant_requests_org_idx on public.role_grant_requests (organization_id, created_at desc);

alter table public.role_grant_requests enable row level security;
revoke all on public.role_grant_requests from anon, authenticated;
grant select on public.role_grant_requests to authenticated;
create policy role_grant_requests_select on public.role_grant_requests for select to authenticated
  using (public.has_permission(organization_id, 'org.members.manage') or requested_by = (select auth.uid()));

create or replace function private.audit_security(p_org uuid, p_action text, p_entity text, p_id uuid, p_changes jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, auth.uid(), p_action, p_entity, p_id, p_changes);
$$;

create or replace function public.request_role_grant(p_membership uuid, p_role_key text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_role uuid;
  v_id uuid;
begin
  select organization_id into v_org from public.organization_memberships where id = p_membership and status = 'active';
  if v_org is null or not public.has_permission(v_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.dual_approval_on(v_org) then
    raise exception 'approval_not_required: dual approval is off, assign the role directly' using errcode = 'P0001';
  end if;
  select id into v_role from public.role_definitions where organization_id = v_org and key = p_role_key;
  if v_role is null then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if not private.role_is_privileged(v_role) then
    raise exception 'approval_not_required: that role is not privileged, assign it directly' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membership_roles where membership_id = p_membership and role_id = v_role) then
    raise exception 'already_has_role' using errcode = '23505';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.role_grant_requests set status = 'expired'
   where membership_id = p_membership and role_id = v_role and status = 'pending' and expires_at <= now();

  insert into public.role_grant_requests (organization_id, membership_id, role_id, reason, requested_by)
  values (v_org, p_membership, v_role, btrim(p_reason), auth.uid())
  returning id into v_id;

  perform private.audit_security(v_org, 'role_grant.request', 'role_grant_requests', v_id,
    jsonb_build_object('membership_id', p_membership, 'role', p_role_key));
  return v_id;
end $$;

create or replace function public.decide_role_grant(p_request uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.role_grant_requests;
  v_key text;
begin
  select * into r from public.role_grant_requests where id = p_request for update;
  if r.id is null or not public.has_permission(r.organization_id, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'not_pending: this request was already decided' using errcode = 'P0001';
  end if;
  if r.requested_by = auth.uid() then
    raise exception 'self_approval: someone else must decide your request' using errcode = 'P0001';
  end if;
  if r.expires_at <= now() then
    update public.role_grant_requests set status = 'expired' where id = r.id;
    raise exception 'expired: this request expired, ask again' using errcode = 'P0001';
  end if;

  select key into v_key from public.role_definitions where id = r.role_id;

  if p_approve then
    if not exists (select 1 from public.organization_memberships where id = r.membership_id and status = 'active') then
      raise exception 'member_inactive: the member is no longer active' using errcode = 'P0001';
    end if;
    insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
    values (r.organization_id, r.membership_id, r.role_id, auth.uid())
    on conflict do nothing;
  end if;

  update public.role_grant_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = r.id;

  perform private.audit_security(r.organization_id, case when p_approve then 'role_grant.approve' else 'role_grant.reject' end,
    'role_grant_requests', r.id, jsonb_build_object('membership_id', r.membership_id, 'role', v_key, 'requested_by', r.requested_by));
end $$;

create or replace function public.cancel_role_grant(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.role_grant_requests;
begin
  select * into r from public.role_grant_requests where id = p_request for update;
  if r.id is null or r.requested_by <> auth.uid() or not public.has_permission(r.organization_id, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'not_pending: this request was already decided' using errcode = 'P0001';
  end if;
  update public.role_grant_requests set status = 'cancelled' where id = r.id;
  perform private.audit_security(r.organization_id, 'role_grant.cancel', 'role_grant_requests', r.id, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Gate the direct paths that could hand out a privileged role
-- ---------------------------------------------------------------------------
create or replace function public.set_member_roles(p_membership uuid, p_role_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_memberships where id = p_membership;
  if v_org is null or not public.has_permission(v_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_role_keys) k where k not in (select key from public.role_definitions where organization_id = v_org)) then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if not ('org_admin' = any (p_role_keys)) and private.count_active_admins(v_org, p_membership) = 0 then
    raise exception 'last_admin: the organization must keep at least one active administrator' using errcode = 'P0001';
  end if;
  if private.dual_approval_on(v_org) and exists (
    select 1 from public.role_definitions r
    where r.organization_id = v_org and r.key = any (p_role_keys) and private.role_is_privileged(r.id)
      and not exists (select 1 from public.membership_roles mr where mr.membership_id = p_membership and mr.role_id = r.id)
  ) then
    raise exception 'approval_required: granting a privileged role needs a second approver, request it instead' using errcode = 'P0001';
  end if;

  delete from public.membership_roles mr
  using public.role_definitions r
  where mr.membership_id = p_membership and r.id = mr.role_id and not (r.key = any (p_role_keys));

  insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
  select v_org, p_membership, r.id, auth.uid()
  from public.role_definitions r
  where r.organization_id = v_org and r.key = any (p_role_keys)
  on conflict do nothing;
end;
$$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role_keys text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_email text := lower(btrim(p_email));
begin
  if not public.has_permission(p_org, 'org.members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_role_keys) k where k not in (select key from public.role_definitions where organization_id = p_org)) then
    raise exception 'unknown_role' using errcode = '22023';
  end if;
  if private.dual_approval_on(p_org) and exists (
    select 1 from public.role_definitions r where r.organization_id = p_org and r.key = any (p_role_keys) and private.role_is_privileged(r.id)
  ) then
    raise exception 'approval_required: invite without the privileged role, then request it' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organization_memberships m join public.user_profiles p on p.id = m.user_id
    where m.organization_id = p_org and p.email = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if (select count(*) from public.organization_invitations where organization_id = p_org and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'rate_limited: at most 50 invitations per hour' using errcode = 'P0001';
  end if;

  update public.organization_invitations set status = 'revoked'
  where organization_id = p_org and email = v_email and status = 'pending';

  insert into public.organization_invitations (organization_id, email, role_keys, invited_by)
  values (p_org, v_email, p_role_keys, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- An invitation written before dual approval was switched on must not smuggle a privileged role in.
create or replace function public.accept_pending_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv record;
  v_membership uuid;
  v_count integer := 0;
begin
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for v_inv in
    select * from public.organization_invitations
    where email = v_email and status = 'pending' and expires_at > now()
    for update
  loop
    v_membership := null;
    insert into public.organization_memberships (organization_id, user_id)
    values (v_inv.organization_id, v_user)
    on conflict (organization_id, user_id) do nothing
    returning id into v_membership;

    if v_membership is not null then
      insert into public.membership_roles (organization_id, membership_id, role_id, granted_by)
      select v_inv.organization_id, v_membership, r.id, v_inv.invited_by
      from public.role_definitions r
      where r.organization_id = v_inv.organization_id and r.key = any (v_inv.role_keys)
        and not (private.dual_approval_on(v_inv.organization_id) and private.role_is_privileged(r.id));
      v_count := v_count + 1;
    end if;

    update public.organization_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  end loop;
  return v_count;
end;
$$;

-- Adding a privileged permission to a role that people already hold would grant it to all of them.
create or replace function public.update_role(p_role uuid, p_name text, p_description text, p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_system boolean;
begin
  select organization_id, is_system into v_org, v_system from public.role_definitions where id = p_role;
  if v_org is null or not public.has_permission(v_org, 'org.roles.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_system then
    raise exception 'system_role: system roles cannot be edited; create a custom role instead' using errcode = 'P0001';
  end if;
  perform private.assert_known_permissions(p_permissions);
  if private.dual_approval_on(v_org)
     and exists (select 1 from public.membership_roles where role_id = p_role)
     and exists (
       select 1 from unnest(p_permissions) k
       where private.is_privileged_permission(k)
         and not exists (select 1 from public.role_permissions rp where rp.role_id = p_role and rp.permission_key = k)
     ) then
    raise exception 'approval_required: this role is held by members, so adding a privileged permission needs a new role and an approved grant' using errcode = 'P0001';
  end if;

  update public.role_definitions
     set name = btrim(p_name), description = coalesce(btrim(p_description), '')
   where id = p_role;
  perform private.write_role_permissions(p_role, v_org, p_permissions);
end;
$$;

-- ---------------------------------------------------------------------------
-- Changing the controls
-- ---------------------------------------------------------------------------
create or replace function public.set_security_controls(p_org uuid, p_dual_approval boolean, p_require_mfa boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.organization_settings;
begin
  if not public.has_permission(p_org, 'org.settings.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from public.organization_settings where organization_id = p_org for update;

  if p_dual_approval and not s.require_dual_approval and (
    select count(distinct m.id)
    from public.organization_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_key = 'org.members.manage'
    where m.organization_id = p_org and m.status = 'active'
  ) < 2 then
    raise exception 'need_second_approver: at least two active members must be able to manage members' using errcode = 'P0001';
  end if;
  if p_require_mfa and not s.require_mfa and not private.session_aal2() then
    raise exception 'mfa_required_to_enable: verify your own second factor before requiring it for everyone' using errcode = 'P0001';
  end if;

  update public.organization_settings set require_dual_approval = p_dual_approval, require_mfa = p_require_mfa
   where organization_id = p_org;
  perform private.audit_security(p_org, 'security_controls.update', 'organization_settings', p_org,
    jsonb_build_object('dual_approval', jsonb_build_array(s.require_dual_approval, p_dual_approval),
                       'require_mfa', jsonb_build_array(s.require_mfa, p_require_mfa)));
end $$;

create or replace function public.set_legal_hold(p_org uuid, p_on boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'org.settings.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_on and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.organization_settings
     set legal_hold = p_on,
         legal_hold_reason = case when p_on then btrim(p_reason) end,
         legal_hold_set_at = case when p_on then now() end,
         legal_hold_set_by = case when p_on then auth.uid() end
   where organization_id = p_org;
  perform private.audit_security(p_org, case when p_on then 'legal_hold.on' else 'legal_hold.off' end, 'organization_settings', p_org,
    jsonb_build_object('reason', case when p_on then btrim(p_reason) end));
end $$;

-- Retention windows, in days. Bounded so a typo can neither wipe history instantly nor keep it forever.
create or replace function public.set_retention_windows(p_org uuid, p_outbox_days integer, p_notification_days integer, p_log_days integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
begin
  if not public.has_permission(p_org, 'org.settings.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_outbox_days not between 7 and 3650 or p_notification_days not between 7 and 3650 or p_log_days not between 7 and 3650 then
    raise exception 'invalid_retention: each window must be between 7 and 3650 days' using errcode = '22023';
  end if;
  select config into v_before from public.scheduled_jobs where organization_id = p_org and key = 'retention';
  update public.scheduled_jobs
     set config = jsonb_build_object('outbox_days', p_outbox_days, 'notification_days', p_notification_days, 'log_days', p_log_days)
   where organization_id = p_org and key = 'retention';
  perform private.audit_security(p_org, 'retention.update', 'scheduled_jobs', p_org,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object('outbox_days', p_outbox_days, 'notification_days', p_notification_days, 'log_days', p_log_days)));
end $$;

-- Retention does nothing while a hold is in force.
create or replace function private.job_retention(p_org uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_outbox integer := coalesce((p_config ->> 'outbox_days')::int, 30);
  v_notif integer := coalesce((p_config ->> 'notification_days')::int, 90);
  v_log integer := coalesce((p_config ->> 'log_days')::int, 90);
  a integer; b integer; c integer; d integer;
begin
  if exists (select 1 from public.organization_settings where organization_id = p_org and legal_hold) then
    return jsonb_build_object('held', true, 'deliveries', 0, 'events', 0, 'notifications', 0, 'logs', 0);
  end if;
  delete from public.webhook_deliveries where organization_id = p_org and status <> 'pending' and created_at < now() - make_interval(days => v_outbox);
  get diagnostics a = row_count;
  delete from public.outbox_events o where o.organization_id = p_org and o.processed_at is not null and o.created_at < now() - make_interval(days => v_outbox)
    and not exists (select 1 from public.webhook_deliveries w where w.event_id = o.id and w.status = 'pending');
  get diagnostics b = row_count;
  delete from public.notifications where organization_id = p_org and read_at is not null and read_at < now() - make_interval(days => v_notif);
  get diagnostics c = row_count;
  delete from public.job_runs where organization_id = p_org and created_at < now() - make_interval(days => v_log);
  delete from public.integration_sync_runs where organization_id = p_org and created_at < now() - make_interval(days => v_log);
  get diagnostics d = row_count;
  return jsonb_build_object('deliveries', a, 'events', b, 'notifications', c, 'logs', d);
end $$;

-- ---------------------------------------------------------------------------
-- Grants: the new RPCs are for signed-in people only
-- ---------------------------------------------------------------------------
revoke all on function
  public.request_role_grant(uuid, text, text), public.decide_role_grant(uuid, boolean, text), public.cancel_role_grant(uuid),
  public.set_security_controls(uuid, boolean, boolean), public.set_legal_hold(uuid, boolean, text),
  public.set_retention_windows(uuid, integer, integer, integer), public.mfa_required_organizations()
  from public, anon;
grant execute on function
  public.request_role_grant(uuid, text, text), public.decide_role_grant(uuid, boolean, text), public.cancel_role_grant(uuid),
  public.set_security_controls(uuid, boolean, boolean), public.set_legal_hold(uuid, boolean, text),
  public.set_retention_windows(uuid, integer, integer, integer), public.mfa_required_organizations()
  to authenticated;
