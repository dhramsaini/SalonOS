-- SalonOS step 10: bank accounts linked through the Account Aggregator (RBI AA framework, via
-- Setu) for automatic bank-statement fetch — any bank, any account type. One row per linked
-- account consent per outlet. Only the "bank-aa" edge function (service role) reads or writes
-- this table; the app goes through that function, which checks the caller's outlet access.
-- No bank passwords are ever stored: the customer approves each link on the AA's own page (OTP).

create table if not exists public.bank_aa_links (
  id           uuid        primary key default gen_random_uuid(),
  outlet_id    bigint      not null,
  label        text        not null,                 -- e.g. "HDFC Current – Outlet 5"
  mobile_last4 text,                                 -- only the last 4 digits are kept
  consent_id   text        not null,                 -- Setu consent id
  status       text        not null default 'PENDING', -- PENDING / ACTIVE / REJECTED / REVOKED / EXPIRED / PAUSED
  accounts     jsonb,                                -- accounts the customer shared: [{masked, type, fip}]
  data_from    timestamptz,
  data_to      timestamptz,
  last_fetch_at timestamptz,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists bank_aa_links_outlet_idx on public.bank_aa_links (outlet_id);
alter table public.bank_aa_links enable row level security; -- no policies: service role only
revoke all on public.bank_aa_links from anon, authenticated;

-- The edge function asks the database, as the signed-in user, whether they may edit this
-- outlet's Bank Statement — the same rule every save uses.
grant execute on function public.salonos_key_access(text, boolean) to authenticated;

select 'BANKAA ok, links=' || count(*) as result from public.bank_aa_links;
