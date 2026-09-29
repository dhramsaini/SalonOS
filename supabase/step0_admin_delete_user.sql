-- SalonOS: permanent user delete (run once in Supabase → SQL Editor → New query → Run)
--
-- Lets an ACTIVE Super Admin permanently delete another user's login from the
-- User Management screen. The check happens here in the database, so nobody
-- else can call it successfully, even with the public app key.
-- Data the user entered (kv_store rows) is kept; only the login + profile go.

create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Super Admin' and coalesce(status, 'Active') <> 'Inactive'
  ) then
    raise exception 'Only an active Super Admin can delete users';
  end if;

  if target = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  -- Never delete the last active Super Admin (someone must always be able to manage users).
  if exists (select 1 from public.profiles where id = target and role = 'Super Admin')
     and (select count(*) from public.profiles
          where role = 'Super Admin' and coalesce(status, 'Active') <> 'Inactive' and id <> target) = 0 then
    raise exception 'Cannot delete the last active Super Admin';
  end if;

  -- Rows this user last saved keep their data; re-point "last saved by" to the admin
  -- so a foreign key on updated_by (if there is one) doesn't block the delete.
  update public.kv_store set updated_by = auth.uid() where updated_by = target;
  update public.app_storage set updated_by = auth.uid() where updated_by = target;

  delete from public.profiles where id = target;
  delete from auth.users where id = target;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
