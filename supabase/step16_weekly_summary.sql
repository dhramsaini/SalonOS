-- SalonOS step 16: weekly summary every Monday at 09:00 IST (03:30 UTC), sent by the salonos-reports
-- function (kind "weekly") by email and/or WhatsApp to the "Automatic reports" recipients. It sends
-- nothing until recipients are set and email / WhatsApp is connected. Needs step15 (cron_secret).
-- Safe to run again.
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'salonos-report-weekly';
select cron.schedule('salonos-report-weekly', '30 3 * * 1', $job$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"weekly"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$job$);

select 'STEP16 ok, weekly job=' || (select count(*) from cron.job where jobname = 'salonos-report-weekly' and command like '%x-salonos-cron%') as result;
