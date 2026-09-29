-- SalonOS step 4: Super-Admin-only "secret" records + schedules for automatic reports.

-- salonos_secret_* records (government-portal logins, report recipients/state) are readable and
-- writable by active Super Admins only — everything else about the rules is unchanged.
create or replace function public.salonos_key_access(k text, want_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.salonos_mfa_ok() and coalesce((
    select case
      when coalesce(p.status, 'Active') = 'Inactive' then false
      when p.role = 'Super Admin' then true
      when k like 'salonos\_secret\_%' then false
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

-- Schedules: nightly 22:00 IST (16:30 UTC), monthly on the 1st at 09:00 IST (03:30 UTC).
-- The function itself sends each report once only and only to the configured recipients.
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname in ('salonos-report-daily', 'salonos-report-monthly');
select cron.schedule('salonos-report-daily', '30 16 * * *', $$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"daily"}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)
$$);
select cron.schedule('salonos-report-monthly', '30 3 1 * *', $$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"monthly"}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)
$$);

select 'step 4 done' as result;
