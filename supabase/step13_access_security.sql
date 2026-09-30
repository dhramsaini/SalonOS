-- SalonOS step 13 (Automation phase 5): temporary users, login watch, backup file upload.
--
-- • profiles.access_until — last day a temporary user may use SalonOS (IST date). A job just after
--   midnight IST turns expired accounts Inactive (the database already refuses Inactive accounts
--   everywhere) and leaves a Super Admin alert. Super Admins never expire.
-- • salonos_login_events(since) — sign-ins from Supabase's own auth audit log, for the nightly
--   "login watch" in the automation function (service role only).
-- • salonos_import_backup(data) — a Super Admin uploads a downloaded backup file; it becomes an
--   ordinary backup row (kind 'uploaded') that the existing Restore flow can restore from.

alter table public.profiles add column if not exists access_until date;

create or replace function public.salonos_expire_users() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select id, name, email, access_until from profiles
           where access_until is not null and role <> 'Super Admin' and coalesce(status, 'Active') <> 'Inactive'
             and access_until < (now() at time zone 'Asia/Kolkata')::date
  loop
    update profiles set status = 'Inactive' where id = r.id;
    insert into alerts (akey, outlet_id, kind, severity, title, body, auto)
    values ('user_expired:' || r.id || ':' || r.access_until, null, 'login', 'info',
            coalesce(r.name, r.email, 'A user') || '’s temporary access ended',
            'Access was set until ' || to_char(r.access_until, 'DD Mon YYYY') || ' — the account is now Inactive. Reactivate it in User Management if needed.', false)
    on conflict (akey) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.salonos_expire_users() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'salonos-expire-users';
select cron.schedule('salonos-expire-users', '35 18 * * *', $$select public.salonos_expire_users()$$); -- 00:05 IST

create or replace function public.salonos_login_events(since timestamptz)
returns table (user_id uuid, email text, at timestamptz, ip text)
language sql stable security definer set search_path = public, auth as $$
  select (e.payload ->> 'actor_id')::uuid, e.payload ->> 'actor_username', e.created_at, nullif(e.ip_address, '')
  from auth.audit_log_entries e
  where e.created_at >= since and e.payload ->> 'action' = 'login'
$$;
revoke all on function public.salonos_login_events(timestamptz) from public, anon, authenticated;

create or replace function public.salonos_import_backup(p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint; n int;
begin
  if not public.is_active_super_admin() then raise exception 'Only an active Super Admin can upload a backup'; end if;
  if jsonb_typeof(p_data) <> 'array' then raise exception 'Not a SalonOS backup file'; end if;
  select count(*) into n from jsonb_array_elements(p_data) e
   where jsonb_typeof(e) = 'object' and e ? 'key' and e ? 'value' and (e ->> 'key') like 'salonos%';
  if n = 0 or n <> jsonb_array_length(p_data) then raise exception 'Not a SalonOS backup file'; end if;
  insert into kv_backups (kind, taken_by, rows_count, data) values ('uploaded', auth.uid(), n, p_data) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.salonos_import_backup(jsonb) from public, anon;
grant execute on function public.salonos_import_backup(jsonb) to authenticated;

select 'STEP13 ok, access_until=' || (select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'access_until')
       || ', expire_job=' || (select count(*) from cron.job where jobname = 'salonos-expire-users')
       || ', logins_24h=' || (select count(*) from public.salonos_login_events(now() - interval '1 day')) as result;
