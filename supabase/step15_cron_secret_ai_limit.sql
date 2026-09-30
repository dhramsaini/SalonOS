-- SalonOS step 15: lock the scheduled edge-function calls + daily AI limit.
--
-- 1. The "automation" and "salonos-reports" functions run with Verify JWT OFF (pg_cron has no user
--    login), so until now anyone who knew the URL could start them. From this step on, both refuse any
--    call that is neither a signed-in Super Admin nor carries the header x-salonos-cron = the random
--    value created here. Only the database (pg_cron) and the functions (service role) can read it.
-- 2. public.ai_usage counts each person's AI requests per IST day; the "ai" function refuses more than
--    50 a day (Super Admins unlimited).
--
-- ORDER: run this file FIRST, then deploy the updated automation / salonos-reports / ai functions.
-- (The old functions ignore the new header, so running this first never breaks anything.)
-- Safe to run again: the secret is created once and kept.

-- ── 1. Secret for the scheduled calls ─────────────────────────────────────
insert into public.app_secrets (name, value, meta)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),'{"use":"x-salonos-cron header for pg_cron → edge functions"}'::jsonb)
on conflict (name) do nothing;

create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job
 where jobname in ('salonos-automation', 'salonos-report-daily', 'salonos-report-monthly');

-- Nightly checks, 21:00 IST.
select cron.schedule('salonos-automation', '30 15 * * *', $$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/automation',
                       body := '{"kind":"nightly"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$$);
-- Reports: nightly 22:00 IST, monthly on the 1st at 09:00 IST.
select cron.schedule('salonos-report-daily', '30 16 * * *', $$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"daily"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$$);
select cron.schedule('salonos-report-monthly', '30 3 1 * *', $$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"monthly"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$$);

-- ── 2. Daily AI limit ─────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  user_id uuid not null,
  day     date not null,
  calls   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security; -- no policies: service role only
revoke all on public.ai_usage from anon, authenticated;

-- Adds one request for today (IST) and returns today's total; also drops rows older than 60 days.
create or replace function public.salonos_ai_bump(u uuid) returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; n int;
begin
  insert into ai_usage (user_id, day, calls) values (u, d, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into n;
  delete from ai_usage where day < d - 60;
  return n;
end $$;
revoke all on function public.salonos_ai_bump(uuid) from public, anon, authenticated;

select 'STEP15 ok, secret=' || (select count(*) from public.app_secrets where name = 'cron_secret')
       || ', jobs=' || (select count(*) from cron.job where jobname in ('salonos-automation', 'salonos-report-daily', 'salonos-report-monthly'))
       || ', ai_usage rls=' || (select relrowsecurity::text from pg_class where oid = 'public.ai_usage'::regclass) as result;
