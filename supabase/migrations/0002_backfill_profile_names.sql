-- ============================================================================
-- Backfill profile names for accounts created before handle_new_user() learned
-- to read OAuth metadata.
--
-- That function originally read only `full_name`, the key the sign-up form
-- sends. It now tries full_name, name and preferred_username in turn and falls
-- back to the email's local part. Rows created before the change kept a null
-- name, so the same account would display differently depending on when it
-- signed up.
--
-- Only rows with no name are touched, so this is idempotent and cannot
-- overwrite a name a user chose. On a fresh project it is a no-op.
-- ============================================================================

update public.profiles p
   set full_name = nullif(
         trim(coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           u.raw_user_meta_data ->> 'preferred_username',
           split_part(coalesce(u.email, ''), '@', 1)
         )),
         ''
       )
  from auth.users u
 where u.id = p.id
   and p.full_name is null;
