-- SalonOS step 19: "Salon Owner" follows the outlet and sheet access set in User Management (View Only /
-- View and Edit per outlet, Edit per sheet) — like Salon Manager. Before, Salon Owner was read-only
-- everywhere whatever was set. "Owner" and "Reviewer" stay read-only. Same function as step8 with
-- 'Salon Owner' taken out of the "never write" line. Run once in Supabase → SQL Editor. Safe to run again.

create or replace function public.salonos_key_access(k text, want_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.salonos_mfa_ok() and coalesce((
    select case
      when coalesce(p.status, 'Active') = 'Inactive' then false
      when p.role is null or p.role not in ('Super Admin','Salon Owner','Owner','Salon Manager','ASM','Data Entry User','Accountant','Reviewer') then false
      when p.role = 'Super Admin' then true
      when k like 'salonos\_secret\_%' then false
      when o.oid is null then (not want_write) or k not in ('salonos_salons', 'salonos_next_salon_id')
      when want_write and p.role in ('Reviewer', 'Owner') then false
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

-- Check: should say 0 (Salon Owner no longer in the never-write list).
select 'STEP19 ok, salon owner blocked=' ||
  (position('''Salon Owner'') then false' in pg_get_functiondef('public.salonos_key_access(text,boolean)'::regprocedure)) > 0)::int as result;
