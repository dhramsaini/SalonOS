-- SalonOS step 6 (#3 Stage 1a): a real "employees" table, one row per employee, kept in sync
-- automatically from the app's existing per-outlet employee lists (kv_store keys
-- salonos_master_employees_outlet_<id>). The app itself is unchanged; the table is a live copy
-- until Stage 1b switches the app to use it. The sync can never block an app save.

create table if not exists public.employees (
  outlet_id  bigint      not null,
  id         text        not null,
  data       jsonb       not null,                 -- the full employee record, exactly as the app stores it
  name       text        generated always as (data ->> 'name') stored,
  status     text        generated always as (data ->> 'status') stored,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted    boolean     not null default false,   -- removed from the app's list (kept for history)
  primary key (outlet_id, id)
);
create index if not exists employees_outlet_idx on public.employees (outlet_id) where not deleted;

alter table public.employees enable row level security;
drop policy if exists "employees read by outlet access" on public.employees;
create policy "employees read by outlet access" on public.employees for select to authenticated
  using (public.salonos_key_access('salonos_master_employees_outlet_' || outlet_id, false));
-- No insert/update/delete policies yet: only the sync trigger (security definer) writes.

create or replace function public.salonos_sync_employees() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  oid bigint;
  arr jsonb;
begin
  if new.key !~ '^salonos_master_employees_outlet_[0-9]+$' then return new; end if;
  begin
    oid := substring(new.key from '_outlet_([0-9]+)$')::bigint;
    arr := case when new.value is null then '[]'::jsonb else new.value::jsonb end;
    if jsonb_typeof(arr) <> 'array' then return new; end if;

    insert into employees (outlet_id, id, data, updated_at, updated_by, deleted)
    select distinct on (e ->> 'id') oid, e ->> 'id', e, now(), new.updated_by, false
      from jsonb_array_elements(arr) e
     where jsonb_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> ''
    on conflict (outlet_id, id) do update
       set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = false
     where employees.data is distinct from excluded.data or employees.deleted;

    update employees set deleted = true, updated_at = now(), updated_by = new.updated_by
     where outlet_id = oid and not deleted
       and id not in (select e ->> 'id' from jsonb_array_elements(arr) e
                       where jsonb_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> '');
  exception when others then
    -- Never let the copy break an app save; the parity check below will show any gap.
    raise warning 'salonos_sync_employees(%): %', new.key, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists kv_store_sync_employees on public.kv_store;
create trigger kv_store_sync_employees after insert or update on public.kv_store
  for each row execute function public.salonos_sync_employees();

-- Parity check: for each outlet, employees in the app's list vs live rows in the table, and
-- how many records differ. All zeros in "mismatched" = the table is an exact copy.
create or replace function public.salonos_employees_parity()
returns table (outlet_id bigint, in_app int, in_table int, mismatched int)
language sql stable security definer set search_path = public as $$
  with app as (
    select substring(k.key from '_outlet_([0-9]+)$')::bigint as outlet_id, e ->> 'id' as id, e as data
      from kv_store k, jsonb_array_elements(case when k.value is null then '[]'::jsonb else k.value::jsonb end) e
     where k.key ~ '^salonos_master_employees_outlet_[0-9]+$' and coalesce(e ->> 'id', '') <> ''
  ), tbl as (
    select outlet_id, id, data from employees where not deleted
  )
  select coalesce(a.outlet_id, t.outlet_id),
         count(a.id)::int,
         count(t.id)::int,
         count(*) filter (where a.id is null or t.id is null or a.data is distinct from t.data)::int
    from app a full join tbl t on a.outlet_id = t.outlet_id and a.id = t.id
   where public.is_active_super_admin() or auth.uid() is null
   group by 1 order by 1;
$$;
revoke all on function public.salonos_employees_parity() from public, anon;
grant execute on function public.salonos_employees_parity() to authenticated;

-- First fill: re-run the trigger over the existing lists (values unchanged, so the app sees nothing).
update public.kv_store set value = value where key ~ '^salonos_master_employees_outlet_[0-9]+$';

select 'EMPPARITY ' || coalesce(string_agg('outlet ' || outlet_id || ': app=' || in_app || ' table=' || in_table || ' mismatched=' || mismatched, ' | '), 'no employees') as result
  from public.salonos_employees_parity();
