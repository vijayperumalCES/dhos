-- Rename the transaction-local setting that carries change reasons from RPCs to audit and
-- history triggers: dhos.change_reason -> stride_ces.change_reason. The functions below are the
-- current definitions with only that setting name changed.

CREATE OR REPLACE FUNCTION public.set_project_health(p_project uuid, p_health project_health, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_act_on_project(p_project, 'project.change_status') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_health in ('amber', 'red') and v_reason is null then
    raise exception 'reason_required: a reason is required for % health', p_health using errcode = 'P0001';
  end if;
  perform set_config('stride_ces.change_reason', coalesce(v_reason, ''), true);
  -- Re-confirming the same rating refreshes health_updated_at (keeps it from going stale).
  update public.projects
     set health = p_health,
         health_reason = v_reason,
         health_updated_at = now()
   where id = p_project;
  perform set_config('stride_ces.change_reason', '', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_project_status(p_project uuid, p_to project_status, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_act_on_project(p_project, 'project.change_status') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select archived_at from public.projects where id = p_project) is not null then
    raise exception 'archived: restore the project before changing its status' using errcode = 'P0001';
  end if;
  if p_to in ('on_hold', 'cancelled') and v_reason is null then
    raise exception 'reason_required: a reason is required for % ', p_to using errcode = 'P0001';
  end if;
  perform set_config('stride_ces.change_reason', coalesce(v_reason, ''), true);
  update public.projects set status = p_to where id = p_project;
  perform set_config('stride_ces.change_reason', '', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
begin
  v_org := case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
                else (v_row ->> 'organization_id')::uuid end;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at') and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'updated_at' - 'created_at';
  else
    v_changes := v_old - 'updated_at' - 'created_at';
  end if;

  -- A delete that cascades from an organization delete has nowhere to write.
  if not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, changes, metadata)
  values (
    v_org,
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid
         when v_row ? 'membership_id' then (v_row ->> 'membership_id')::uuid
         else null end,
    v_changes,
    jsonb_strip_nulls(jsonb_build_object('reason', nullif(current_setting('stride_ces.change_reason', true), '')))
  );
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.projects_record_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reason text := nullif(current_setting('stride_ces.change_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.project_status_history (organization_id, project_id, change_type, to_status, to_health, reason, changed_by)
    values (new.organization_id, new.id, 'created', new.status, new.health, v_reason, auth.uid());
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.project_status_history (organization_id, project_id, change_type, from_status, to_status, reason, changed_by)
    values (new.organization_id, new.id, 'status', old.status, new.status, v_reason, auth.uid());
  end if;
  if new.health is distinct from old.health then
    insert into public.project_status_history (organization_id, project_id, change_type, from_health, to_health, reason, changed_by)
    values (new.organization_id, new.id, 'health', old.health, new.health, coalesce(v_reason, new.health_reason), auth.uid());
  end if;
  return null;
end;
$function$
;

