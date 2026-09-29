-- SalonOS step 5: accounts only get access if their profile has one of SalonOS's real roles.
-- A login created any other way (e.g. public sign-up) gets a profile with no valid role -> no data.
create or replace function public.salonos_key_access(k text, want_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.salonos_mfa_ok() and coalesce((
    select case
      when coalesce(p.status, 'Active') = 'Inactive' then false
      when p.role is null or p.role not in ('Super Admin','Salon Owner','Owner','Salon Manager','ASM','Data Entry User','Accountant','Reviewer') then false
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
