-- SalonOS step 12 (Automation phase 2): the Alerts centre + the nightly automation job.
--
-- • public.alerts — one row per thing that needs someone's attention (sales not entered, a bill
--   falling due, an electricity bill not entered, the month-end checklist, ...). Written only by the
--   "automation" edge function (service role). Each alert has a stable akey, so re-running the job
--   updates the same row instead of adding duplicates, and an alert whose problem is fixed is closed
--   automatically on the next run.
-- • Anyone who can see an outlet sees that outlet's alerts (same rule as the outlet's data); outlet-
--   less alerts are Super Admin only. "Mark done" goes through salonos_resolve_alert(), which needs
--   edit rights on the outlet.
-- • Schedule: every day at 21:00 IST (15:30 UTC). The job is safe to trigger any number of times.

create table if not exists public.alerts (
  id          bigserial   primary key,
  akey        text        not null unique,          -- e.g. sales:5:2026-09-30, due:5:INV-004
  outlet_id   bigint,                               -- null = business-wide (Super Admin only)
  kind        text        not null,                 -- sales | attendance | due | recurring | recurring_bill | month_end | month_lock
  severity    text        not null default 'warn',  -- info | warn | urgent
  title       text        not null,
  body        text        not null default '',
  tab         text,                                 -- the outlet sheet that fixes it (app tab id)
  due_date    date,
  auto        boolean     not null default true,    -- true: closes itself when the problem is fixed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_how text                                 -- 'fixed' (job saw it fixed) | 'done' (a person)
);
create index if not exists alerts_open_idx on public.alerts (outlet_id, created_at desc) where resolved_at is null;

alter table public.alerts enable row level security;
drop policy if exists "alerts read by outlet access" on public.alerts;
create policy "alerts read by outlet access" on public.alerts for select to authenticated
  using (case when outlet_id is null then public.is_active_super_admin()
              else public.salonos_key_access('salonos_vendor_invoices_outlet_' || outlet_id, false) end);
-- No insert/update/delete policies: the automation function (service role) writes, people use the RPC.
revoke insert, update, delete on public.alerts from anon, authenticated;

create or replace function public.salonos_resolve_alert(alert_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a public.alerts;
begin
  select * into a from public.alerts where id = alert_id;
  if not found then raise exception 'Alert not found'; end if;
  if not (case when a.outlet_id is null then public.is_active_super_admin()
               else public.salonos_key_access('salonos_vendor_invoices_outlet_' || a.outlet_id, true) end) then
    raise exception 'You need edit rights on this outlet to close its alerts';
  end if;
  update public.alerts set resolved_at = now(), resolved_by = auth.uid(), resolved_how = 'done', updated_at = now()
   where id = alert_id and resolved_at is null;
end $$;
revoke all on function public.salonos_resolve_alert(bigint) from public, anon;
grant execute on function public.salonos_resolve_alert(bigint) to authenticated;

-- Closed alerts older than 90 days are removed by the job itself; nothing else to clean.

-- Nightly job, 21:00 IST.
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'salonos-automation';
select cron.schedule('salonos-automation', '30 15 * * *', $$
  select net.http_post(url := 'https://cuvcxxjbcmctsajhctju.supabase.co/functions/v1/automation',
                       body := '{"kind":"nightly"}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)
$$);

select 'ALERTS ok, rls=' || (select relrowsecurity::text from pg_class where oid = 'public.alerts'::regclass)
       || ', job=' || (select count(*) from cron.job where jobname = 'salonos-automation') as result;
