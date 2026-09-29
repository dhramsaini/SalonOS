-- SalonOS step 9 (#3, Attendance): a real "attendance" table, one row per employee per month, kept
-- in sync automatically from the app's per-outlet attendance sheets (kv_store keys
-- salonos_attendance_outlet_<id>, an object keyed "<employee id>_<year>_<month 0-11>").
-- Same pattern as employees (step6/7): saves still go to kv_store and the trigger copies them here
-- in the same transaction; the app rebuilds each sheet from this table on load and compares it
-- byte-for-byte with the kv copy. The sync can never block an app save.
-- Rollback: set ATTENDANCE_FROM_TABLE=false in js/01-foundation.js.

create table if not exists public.attendance (
  outlet_id  bigint      not null,
  rec_key    text        not null,                 -- the app's key, e.g. E001_2026_7
  emp_id     text,
  year       int,
  month      int,                                  -- 1-12
  data       jsonb       not null,                 -- {"days":[...], "adjustment":...} as the app stores it
  raw        text        not null,                 -- the same, exactly as saved (for the app's byte-for-byte check)
  pos        int         not null,                 -- position in the app's sheet
  present    int,                                  -- days marked present
  off_days   int,                                  -- days marked off
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted    boolean     not null default false,
  primary key (outlet_id, rec_key)
);
create index if not exists attendance_outlet_idx on public.attendance (outlet_id) where not deleted;
create index if not exists attendance_emp_month_idx on public.attendance (outlet_id, emp_id, year, month) where not deleted;

alter table public.attendance enable row level security;
drop policy if exists "attendance read by outlet access" on public.attendance;
create policy "attendance read by outlet access" on public.attendance for select to authenticated
  using (public.salonos_key_access('salonos_attendance_outlet_' || outlet_id, false));
-- No insert/update/delete policies: only the sync trigger (security definer) writes.

create or replace function public.salonos_sync_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  oid bigint;
  obj json;
begin
  if new.key !~ '^salonos_attendance_outlet_[0-9]+$' then return new; end if;
  begin
    oid := substring(new.key from '_outlet_([0-9]+)$')::bigint;
    obj := case when new.value is null then '{}'::json else new.value::json end; -- json keeps the exact text
    if json_typeof(obj) <> 'object' then return new; end if;

    insert into attendance (outlet_id, rec_key, emp_id, year, month, data, raw, pos, present, off_days, updated_at, updated_by, deleted)
    select oid, x.k,
           substring(x.k from '^(.*)_[0-9]{4}_[0-9]{1,2}$'),
           substring(x.k from '_([0-9]{4})_[0-9]{1,2}$')::int,
           substring(x.k from '_([0-9]{1,2})$')::int + 1,
           x.v::jsonb, x.v::text, x.ord::int,
           case when json_typeof(x.v) = 'object' and json_typeof(x.v -> 'days') = 'array'
                then (select count(*) from json_array_elements_text(x.v -> 'days') d where d = 'present') end,
           case when json_typeof(x.v) = 'object' and json_typeof(x.v -> 'days') = 'array'
                then (select count(*) from json_array_elements_text(x.v -> 'days') d where d = 'off') end,
           now(), new.updated_by, false
      from json_each(obj) with ordinality as x(k, v, ord)
    on conflict (outlet_id, rec_key) do update
       set emp_id = excluded.emp_id, year = excluded.year, month = excluded.month, data = excluded.data,
           raw = excluded.raw, pos = excluded.pos, present = excluded.present, off_days = excluded.off_days,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = false
     where attendance.raw is distinct from excluded.raw or attendance.pos is distinct from excluded.pos
        or attendance.deleted;

    update attendance set deleted = true, updated_at = now(), updated_by = new.updated_by
     where outlet_id = oid and not deleted
       and rec_key not in (select k from json_object_keys(obj) k);
  exception when others then
    -- Never let the copy break an app save; the app notices a mismatch and uses the kv copy.
    raise warning 'salonos_sync_attendance(%): %', new.key, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists kv_store_sync_attendance on public.kv_store;
create trigger kv_store_sync_attendance after insert or update on public.kv_store
  for each row execute function public.salonos_sync_attendance();

-- First fill: re-run the trigger over the existing sheets (values unchanged, so the app sees nothing).
update public.kv_store set value = value where key ~ '^salonos_attendance_outlet_[0-9]+$';

-- Exact check, the same one the app makes: the sheet rebuilt from the table must equal the kv text.
select 'ATTEXACT ' || coalesce(string_agg('outlet ' || k.outlet_id || ': ' || coalesce(t.n, 0) || ' employee-months, ' ||
         case when k.value = '{' || coalesce(t.obj, '') || '}' then 'identical' else 'DIFFERENT' end, ' | '), 'no attendance') as result
  from (select substring(key from '_outlet_([0-9]+)$')::bigint as outlet_id, value
          from public.kv_store where key ~ '^salonos_attendance_outlet_[0-9]+$' and value is not null) k
  left join (select outlet_id, count(*) as n, string_agg(to_json(rec_key)::text || ':' || raw, ',' order by pos) as obj
               from public.attendance where not deleted group by outlet_id) t on t.outlet_id = k.outlet_id;
