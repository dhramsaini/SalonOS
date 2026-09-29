-- SalonOS step 3: change history, two-step-login enforcement, error log, file cleanup, tidy-up.

-- ── Two-step login: once an account has an authenticator set up, its privileges only apply to
--    sessions that passed the code step (aal2). Accounts without one are unaffected. ──
create or replace function public.salonos_mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;

create or replace function public.is_active_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.salonos_mfa_ok() and exists (select 1 from profiles
                 where id = auth.uid() and role = 'Super Admin' and coalesce(status, 'Active') <> 'Inactive');
$$;

create or replace function public.salonos_key_access(k text, want_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.salonos_mfa_ok() and coalesce((
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

-- ── Change history, recorded by the database on every save ──
create table if not exists public.kv_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  key text not null,
  changed_by uuid,
  changed_by_email text,
  old_value text,
  new_len int,
  edits int not null default 1
);
create index if not exists kv_audit_at_idx on public.kv_audit (at desc);
create index if not exists kv_audit_key_idx on public.kv_audit (key, at desc);
alter table public.kv_audit enable row level security;
drop policy if exists "audit readable by super admins" on public.kv_audit;
create policy "audit readable by super admins" on public.kv_audit
  for select to authenticated using (public.is_active_super_admin());

-- Saves by the same person to the same sheet within 10 minutes are one entry, keeping the
-- version from before that editing session (what "Restore previous version" puts back).
create or replace function public.salonos_audit_kv() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent bigint;
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then return new; end if;
  select id into recent from kv_audit
   where key = new.key and changed_by is not distinct from auth.uid() and at > now() - interval '10 minutes'
   order by at desc limit 1;
  if recent is not null then
    update kv_audit set at = now(), new_len = length(new.value), edits = edits + 1 where id = recent;
  else
    insert into kv_audit (key, changed_by, changed_by_email, old_value, new_len)
    values (new.key, auth.uid(), (select email from profiles where id = auth.uid()),
            case when tg_op = 'UPDATE' then old.value end, length(new.value));
  end if;
  return new;
end $$;
drop trigger if exists kv_store_audit on public.kv_store;
create trigger kv_store_audit after insert or update on public.kv_store
  for each row execute function public.salonos_audit_kv();

create or replace function public.salonos_restore_version(p_audit_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if not public.is_active_super_admin() then raise exception 'Only an active Super Admin can restore'; end if;
  select * into a from kv_audit where id = p_audit_id;
  if not found then raise exception 'Change % not found', p_audit_id; end if;
  update kv_store set value = a.old_value, updated_at = now(), updated_by = auth.uid() where key = a.key;
end $$;
revoke all on function public.salonos_restore_version(bigint) from public, anon;
grant execute on function public.salonos_restore_version(bigint) to authenticated;

-- ── App error log ──
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  email text,
  page text,
  message text,
  stack text,
  ua text
);
create index if not exists client_errors_at_idx on public.client_errors (at desc);
alter table public.client_errors enable row level security;
drop policy if exists "errors insert by signed-in" on public.client_errors;
drop policy if exists "errors readable by super admins" on public.client_errors;
create policy "errors insert by signed-in" on public.client_errors
  for insert to authenticated with check (user_id = auth.uid());
create policy "errors readable by super admins" on public.client_errors
  for select to authenticated using (public.is_active_super_admin());

-- ── Unused-document cleanup (done by a Super Admin's browser through the Storage API) ──
drop policy if exists "salonos files delete by super admin" on storage.objects;
create policy "salonos files delete by super admin" on storage.objects for delete to authenticated
  using (bucket_id = 'salonos-files' and public.is_active_super_admin());

-- ── Nightly purge of old history/errors (02:15 IST) ──
create or replace function public.salonos_nightly_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from kv_audit where at < now() - interval '90 days';
  delete from client_errors where at < now() - interval '60 days';
$$;
revoke all on function public.salonos_nightly_cleanup() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'salonos-nightly-cleanup';
select cron.schedule('salonos-nightly-cleanup', '45 20 * * *', $$select public.salonos_nightly_cleanup()$$);

-- ── Tidy-up: user delete no longer touches app_storage (removed below) ──
create or replace function public.admin_delete_user(target uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_active_super_admin() then
    raise exception 'Only an active Super Admin can delete users';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  if exists (select 1 from public.profiles where id = target and role = 'Super Admin')
     and (select count(*) from public.profiles
          where role = 'Super Admin' and coalesce(status, 'Active') <> 'Inactive' and id <> target) = 0 then
    raise exception 'Cannot delete the last active Super Admin';
  end if;
  update public.kv_store set updated_by = auth.uid() where updated_by = target;
  update public.kv_audit set changed_by = null where changed_by = target;
  delete from public.profiles where id = target;
  delete from auth.users where id = target;
end;
$$;

-- Drop the unused tables from an earlier design — only if they are genuinely empty.
do $$
declare t text; n bigint;
begin
  foreach t in array array['advances','app_storage','app_users','appointments','attendance','audit_log',
    'bank_statement_rows','billing_invoices','clients','daily_sales','due_dates','employees','inventory_items',
    'penalties','recurring_expenses','salary_working','salons','services','user_outlet_access',
    'vendor_invoices','vendors','demo_ip_access']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 and t <> 'demo_ip_access' then raise notice 'kept % (% rows)', t, n; continue; end if;
    execute format('drop table public.%I cascade', t);
  end loop;
end $$;
drop function if exists public.has_salon_access(bigint);

select 'step 3 done' as result;
