-- Step 18 — keep device-only settings out of the cloud.
-- The in-browser auto-backup (Master Settings → Backup) is a copy of everything the login can see —
-- for a Super Admin every outlet plus the salonos_secret_* settings. Keys without an outlet number
-- are readable by every signed-in user (salonos_key_access), so an uploaded copy would let any
-- login read other outlets' data and the secret settings. The app (v2026.09.30.24+) no longer sends
-- these keys; this removes any copy already saved and refuses them from older app versions still open.
-- Run once in Supabase → SQL Editor.

delete from public.kv_store
 where key in ('salonos_autobackup_snapshot', 'salonos_autobackup_enabled', 'salonos_theme');

drop policy if exists kv_store_no_device_keys on public.kv_store;
create policy kv_store_no_device_keys on public.kv_store
  as restrictive for all to authenticated
  using (key not in ('salonos_autobackup_snapshot', 'salonos_autobackup_enabled', 'salonos_theme'))
  with check (key not in ('salonos_autobackup_snapshot', 'salonos_autobackup_enabled', 'salonos_theme'));

-- Check: should say 0.
select 'DEVICEKEYS ' || count(*) as result from public.kv_store
 where key in ('salonos_autobackup_snapshot', 'salonos_autobackup_enabled', 'salonos_theme');
