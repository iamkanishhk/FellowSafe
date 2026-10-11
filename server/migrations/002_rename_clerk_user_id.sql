-- 002_rename_clerk_user_id.sql
-- The Better Auth era renamed users.clerk_user_id to users.auth_user_id (the
-- auto-generated index/constraint names still read *_clerk_user_id_*). The Clerk
-- migration moved every reader and writer back to clerk_user_id, so realign the
-- column or /auth/sync and /auth/phone fail with "column does not exist".
-- Idempotent: a database created fresh from 001_init.sql already has the right
-- name and this is a no-op.

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'users'
       and column_name = 'auth_user_id'
  ) then
    alter table users rename column auth_user_id to clerk_user_id;
  end if;
end $$;
