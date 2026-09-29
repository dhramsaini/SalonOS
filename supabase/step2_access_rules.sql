-- SalonOS step 2: enforce outlet access in the database (uses salonos_key_access from step 1).

-- kv_store: each login reads only outlets it has access to, and changes only where it has
-- "View and Edit". No delete policy on purpose (deletes are stored as NULL values).
drop policy if exists "kv_store is readable by any signed-in user" on public.kv_store;
drop policy if exists "kv_store is writable by any signed-in, active user" on public.kv_store;
drop policy if exists "kv_store rows are updatable by any signed-in, active user" on public.kv_store;
drop policy if exists "kv read by outlet access" on public.kv_store;
drop policy if exists "kv insert by outlet access" on public.kv_store;
drop policy if exists "kv update by outlet access" on public.kv_store;
create policy "kv read by outlet access" on public.kv_store
  for select to authenticated using (public.salonos_key_access(key, false));
create policy "kv insert by outlet access" on public.kv_store
  for insert to authenticated with check (public.salonos_key_access(key, true));
create policy "kv update by outlet access" on public.kv_store
  for update to authenticated using (public.salonos_key_access(key, true)) with check (public.salonos_key_access(key, true));

-- profiles: users could previously edit their OWN profile, including role → Super Admin.
-- Now: everyone reads their own profile; only active Super Admins read or change others.
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "profiles are editable by Super Admins or the owner" on public.profiles;
drop policy if exists "Authenticated users can view all profiles" on public.profiles;
drop policy if exists "profiles are readable by any signed-in user" on public.profiles;
drop policy if exists "profiles readable by self or super admin" on public.profiles;
drop policy if exists "profiles managed by super admins" on public.profiles;
create policy "profiles readable by self or super admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_active_super_admin());
create policy "profiles managed by super admins" on public.profiles
  for all to authenticated using (public.is_active_super_admin()) with check (public.is_active_super_admin());
