-- SalonOS step 11: server-only secrets entered from the app (first use: the AI / Claude API key,
-- Master Settings → AI Assistant). Only edge functions (service role) read or write this table;
-- no signed-in user can read a secret back — the app only ever sees "configured" + the last 4
-- characters, returned by the ai-settings function.

create table if not exists public.app_secrets (
  name       text        primary key,
  value      text        not null,
  meta       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_secrets enable row level security; -- no policies: service role only
revoke all on public.app_secrets from anon, authenticated;

select 'APPSECRETS ok, rows=' || count(*) || ' rls=' || (select relrowsecurity::text from pg_class where oid = 'public.app_secrets'::regclass) as result from public.app_secrets;
