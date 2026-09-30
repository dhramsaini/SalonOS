-- SalonOS step 17: switch on the nightly (22:00 IST) and monthly (1st, 09:00 IST) report schedules — they
-- were left off until email was set up (see step4/step15). Each call carries the x-salonos-cron key
-- (step15). The reports function sends nothing until recipients are set and email / WhatsApp is
-- connected, and each can be turned off in Master Settings → Automatic reports. Safe to run again.
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname in ('salonos-report-daily', 'salonos-report-monthly');
select cron.schedule('salonos-report-daily', '30 16 * * *', $job$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"daily"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$job$);
select cron.schedule('salonos-report-monthly', '30 3 1 * *', $job$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/salonos-reports',
                       body := '{"kind":"monthly"}'::jsonb,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                         'x-salonos-cron', (select value from public.app_secrets where name = 'cron_secret')))
$job$);

select 'STEP17 ok, report jobs with secret=' || (select count(*) from cron.job
  where jobname in ('salonos-report-daily', 'salonos-report-monthly', 'salonos-report-weekly') and command like '%x-salonos-cron%') as result;
