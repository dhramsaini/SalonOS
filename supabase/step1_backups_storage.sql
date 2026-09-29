-- SalonOS step 1: cloud backups, access helpers, private document storage.
-- Safe to run on the live app: nothing here changes who can read or write existing data.

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_active_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and role = 'Super Admin' and coalesce(status, 'Active') <> 'Inactive');
$$;

-- Can the signed-in user read (want_write=false) or change (true) this kv_store key?
-- Mirrors the app: Super Admin = everything; Reviewer = reads every outlet; report-only roles
-- never write outlet data; everyone else per outlet from User Management (outlet_access, or
-- outlet_ids = full edit for accounts saved before outlet_access existed). Keys without an
-- _outlet_<id> suffix are shared app settings: everyone active may use them, except the outlet
-- list itself, which only Super Admins may change.
create or replace function public.salonos_key_access(k text, want_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when coalesce(p.status, 'Active') = 'Inactive' then false
      when p.role = 'Super Admin' then true
      when o.oid is null then (not want_write) or k not in ('salonos_salons', 'salonos_next_salon_id')
      when want_write and p.role in ('Reviewer', 'Owner', 'Salon Owner') then false
      when (not want_write) and p.role = 'Reviewer' then true
      else (case
              when coalesce(p.outlet_access, '{}'::jsonb) = '{}'::jsonb
                then case when coalesce(p.outlet_ids, '[]'::jsonb) @> to_jsonb(o.oid::bigint) then 'View and Edit' else 'No Access' end
              else coalesce(p.outlet_access ->> o.oid, 'No Access')
            end) = any (case when want_write then array['View and Edit'] else array['View Only', 'View and Edit'] end)
    end
    from profiles p, (select substring(k from '_outlet_([0-9]+)$') as oid) o
    where p.id = auth.uid()
  ), false);
$$;

-- Storage paths are "<folder>/<file>", folder = outlet_<id> or global → same rules as kv keys.
create or replace function public.salonos_file_key(path text) returns text
language sql immutable as $$
  select case when split_part(path, '/', 1) ~ '^outlet_[0-9]+$'
              then 'salonos_file_' || split_part(path, '/', 1) else 'salonos_file' end;
$$;

-- ── Cloud backups ───────────────────────────────────────────────────────────────────────
create table if not exists public.kv_backups (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  kind text not null default 'auto',
  taken_by uuid,
  rows_count int not null default 0,
  data jsonb not null
);
alter table public.kv_backups enable row level security;
drop policy if exists "backups readable by super admins" on public.kv_backups;
create policy "backups readable by super admins" on public.kv_backups
  for select to authenticated using (public.is_active_super_admin());

create or replace function public.salonos_take_backup(p_kind text default 'manual') returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  -- auth.uid() is null for the nightly job / SQL editor; app users must be an active Super Admin
  if auth.uid() is not null and not public.is_active_super_admin() then
    raise exception 'Only an active Super Admin can take backups';
  end if;
  insert into kv_backups (kind, taken_by, rows_count, data)
  select coalesce(p_kind, 'manual'), auth.uid(), count(*),
         coalesce(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'updated_at', updated_at, 'updated_by', updated_by)), '[]'::jsonb)
  from kv_store where value is not null
  returning id into new_id;
  delete from kv_backups where kind = 'auto' and taken_at < now() - interval '30 days';
  delete from kv_backups where kind <> 'auto' and taken_at < now() - interval '90 days';
  return new_id;
end $$;

-- Restores a backup (everything, or one outlet). Takes a 'pre-restore' backup first so a
-- restore can itself be undone. Keys created after the backup (in scope) are cleared.
create or replace function public.salonos_restore_backup(p_backup_id bigint, p_outlet_id bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare snap jsonb; suffix text; n int := 0; r record;
begin
  if not public.is_active_super_admin() then
    raise exception 'Only an active Super Admin can restore backups';
  end if;
  select data into snap from kv_backups where id = p_backup_id;
  if snap is null then raise exception 'Backup % not found', p_backup_id; end if;
  perform public.salonos_take_backup('pre-restore');
  suffix := case when p_outlet_id is null then null else '_outlet_' || p_outlet_id end;
  for r in select e ->> 'key' as key, e ->> 'value' as value from jsonb_array_elements(snap) e
           where suffix is null or right(e ->> 'key', length(suffix)) = suffix
  loop
    insert into kv_store (key, value, updated_at, updated_by) values (r.key, r.value, now(), auth.uid())
      on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
      where kv_store.value is distinct from excluded.value;
    n := n + 1;
  end loop;
  update kv_store k set value = null, updated_at = now(), updated_by = auth.uid()
   where k.value is not null
     and (suffix is null or right(k.key, length(suffix)) = suffix)
     and not exists (select 1 from jsonb_array_elements(snap) e where e ->> 'key' = k.key);
  return n;
end $$;

revoke all on function public.salonos_take_backup(text) from public, anon;
revoke all on function public.salonos_restore_backup(bigint, bigint) from public, anon;
grant execute on function public.salonos_take_backup(text) to authenticated;
grant execute on function public.salonos_restore_backup(bigint, bigint) to authenticated;

-- Nightly at 02:00 IST (20:30 UTC)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'salonos-nightly-backup';
select cron.schedule('salonos-nightly-backup', '30 20 * * *', $$select public.salonos_take_backup('auto')$$);

-- ── Private document storage ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('salonos-files', 'salonos-files', false, 5242880)
on conflict (id) do nothing;

drop policy if exists "salonos files read" on storage.objects;
drop policy if exists "salonos files upload" on storage.objects;
create policy "salonos files read" on storage.objects for select to authenticated
  using (bucket_id = 'salonos-files' and public.salonos_key_access(public.salonos_file_key(name), false));
create policy "salonos files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'salonos-files' and public.salonos_key_access(public.salonos_file_key(name), true));

-- First backup, right now
select public.salonos_take_backup('manual') as first_backup_id;
