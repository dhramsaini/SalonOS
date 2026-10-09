-- SalonOS step 20: the 9 AM morning brief (03:30 UTC = 09:00 IST). The reports function sends it only
-- when "Morning brief" is ticked in Master Settings → Automatic reports, and once per day. Safe to run again.
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'salonos-report-morning';
select cron.schedule('salonos-report-morning', '30 3 * * *', $job$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"morning"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$job$);
select 'STEP20 ok, morning job=' || (select count(*) from cron.job where jobname = 'salonos-report-morning') as result;
