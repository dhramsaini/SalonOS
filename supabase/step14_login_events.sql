-- SalonOS step 14 (Automation phase 5, login watch): this project's auth audit table is empty
-- (Supabase keeps auth logs outside the database), so SalonOS records sign-ins itself. Right after a
-- successful sign-in the app calls salonos_record_login(); the database takes the user from the
-- session (auth.uid(), can't be faked) and the IP from the request headers. Only the automation
-- function (service role) reads them, through salonos_login_events() (redefined to read this table).
-- Kept 90 days.

create table if not exists public.login_events (
  id      bigserial   primary key,
  user_id uuid        not null,
  email   text,
  at      timestamptz not null default now(),
  ip      text,
  ua      text
);
create index if not exists login_events_at_idx on public.login_events (at desc);
alter table public.login_events enable row level security; -- no policies: written by the function below, read by the service role
revoke all on public.login_events from anon, authenticated;

create or replace function public.salonos_record_login(p_ua text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare hdr json; fwd text;
begin
  if auth.uid() is null then return; end if;
  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  fwd := coalesce(hdr ->> 'x-forwarded-for', hdr ->> 'x-real-ip', '');
  insert into login_events (user_id, email, ip, ua)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), nullif(trim(split_part(fwd, ',', 1)), ''), left(p_ua, 300));
  delete from login_events where at < now() - interval '90 days';
end $$;
revoke all on function public.salonos_record_login(text) from public, anon;
grant execute on function public.salonos_record_login(text) to authenticated;

create or replace function public.salonos_login_events(since timestamptz)
returns table (user_id uuid, email text, at timestamptz, ip text)
language sql stable security definer set search_path = public, auth as $$
  select l.user_id, l.email, l.at, l.ip from login_events l where l.at >= since
  union all
  select (e.payload ->> 'actor_id')::uuid, e.payload ->> 'actor_username', e.created_at, nullif(e.ip_address, '')
  from auth.audit_log_entries e
  where e.created_at >= since and e.payload ->> 'action' = 'login'
$$;
revoke all on function public.salonos_login_events(timestamptz) from public, anon, authenticated;

select 'STEP14 ok, table=' || (select count(*) from information_schema.tables where table_name = 'login_events') as result;
