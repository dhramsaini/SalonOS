-- STEP 21: file references kept per backup, so the daily unused-file cleanup doesn't time out.
-- The cleanup (js/01-foundation.js cleanupUnusedFiles) must not delete an attachment that any backup
-- still points to. It used to read every backup's full data (34 backups, 18 MB) in one request,
-- which hit the statement timeout every day, so unused files were never removed.
-- Now each backup carries the list of files it references (file_refs), filled in when it is saved.
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table public.kv_backups add column if not exists file_refs text[];

create or replace function public.salonos_backup_set_file_refs() returns trigger
language plpgsql set search_path = public as $$
begin
  new.file_refs := array(select distinct m[1] from regexp_matches(new.data::text, 'sbfile:([^"\\]+)', 'g') as m);
  return new;
end $$;

drop trigger if exists kv_backups_file_refs on public.kv_backups;
create trigger kv_backups_file_refs before insert or update of data on public.kv_backups
  for each row execute function public.salonos_backup_set_file_refs();

-- Existing backups
update public.kv_backups
   set file_refs = array(select distinct m[1] from regexp_matches(data::text, 'sbfile:([^"\\]+)', 'g') as m)
 where file_refs is null;

select 'STEP21 ok, backups=' || count(*) || ', without refs=' || count(*) filter (where file_refs is null)
       || ', files referenced=' || (select count(distinct r) from public.kv_backups, unnest(file_refs) r) as result
  from public.kv_backups;
