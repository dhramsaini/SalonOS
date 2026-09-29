-- SalonOS step 7 (#3 Stage 1b): lets the app load employees from the employees table.
-- Adds each employee's position in the app's list (pos) and the record exactly as the app wrote it
-- (raw), so the app can rebuild each outlet's list from the table byte-for-byte and compare it with
-- the kv_store copy on every load. Saves are unchanged: kv_store, copied here by the trigger in the
-- same transaction. Rollback: set EMPLOYEES_FROM_TABLE=false in js/01-foundation.js.

alter table public.employees add column if not exists pos int;
alter table public.employees add column if not exists raw text;

create or replace function public.salonos_sync_employees() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  oid bigint;
  arr json;
begin
  if new.key !~ '^salonos_master_employees_outlet_[0-9]+$' then return new; end if;
  begin
    oid := substring(new.key from '_outlet_([0-9]+)$')::bigint;
    arr := case when new.value is null then '[]'::json else new.value::json end; -- json (not jsonb) keeps the exact text
    if json_typeof(arr) <> 'array' then return new; end if;

    insert into employees (outlet_id, id, data, raw, pos, updated_at, updated_by, deleted)
    select distinct on (e ->> 'id') oid, e ->> 'id', e::jsonb, e::text, ord::int, now(), new.updated_by, false
      from json_array_elements(arr) with ordinality as x(e, ord)
     where json_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> ''
     order by e ->> 'id', ord
    on conflict (outlet_id, id) do update
       set data = excluded.data, raw = excluded.raw, pos = excluded.pos,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = false
     where employees.data is distinct from excluded.data or employees.raw is distinct from excluded.raw
        or employees.pos is distinct from excluded.pos or employees.deleted;

    update employees set deleted = true, updated_at = now(), updated_by = new.updated_by
     where outlet_id = oid and not deleted
       and id not in (select e ->> 'id' from json_array_elements(arr) e
                       where json_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> '');
  exception when others then
    -- Never let the copy break an app save; the app notices a mismatch and uses the kv copy.
    raise warning 'salonos_sync_employees(%): %', new.key, sqlerrm;
  end;
  return new;
end $$;

-- Refill pos/raw for the existing lists (values unchanged, so the app sees nothing).
update public.kv_store set value = value where key ~ '^salonos_master_employees_outlet_[0-9]+$';

-- Exact check, the same one the app makes: the list rebuilt from the table must equal the kv text.
select 'EMPEXACT ' || coalesce(string_agg('outlet ' || k.outlet_id || ': ' ||
         case when k.value = '[' || coalesce(t.list, '') || ']' then 'identical' else 'DIFFERENT' end, ' | '), 'no employees') as result
  from (select substring(key from '_outlet_([0-9]+)$')::bigint as outlet_id, value
          from public.kv_store where key ~ '^salonos_master_employees_outlet_[0-9]+$' and value is not null) k
  left join (select outlet_id, string_agg(raw, ',' order by pos) as list
               from public.employees where not deleted group by outlet_id) t on t.outlet_id = k.outlet_id;
