-- Let PostgREST embed a member's profile from a membership row
-- (organization_memberships -> user_profiles). Both already reference auth.users; this adds
-- the direct relationship the API needs. user_profiles RLS still applies to the embed.
alter table public.organization_memberships
  add constraint organization_memberships_user_profile_fkey
  foreign key (user_id) references public.user_profiles (id) on delete cascade;
