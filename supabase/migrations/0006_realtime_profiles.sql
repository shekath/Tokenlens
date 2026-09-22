-- ============================================================================
-- 0006  Let the browser hear about its own billing changes
-- ============================================================================
--
-- useSubscription subscribes to postgres_changes on public.profiles so the app
-- unlocks the moment the webhook writes the tier, rather than on the next
-- reload. That subscription has never delivered an event: the
-- `supabase_realtime` publication was empty, so Postgres was replicating
-- nothing and the channel sat there connected and silent. The comment in the
-- code claiming the UI updates after checkout was wrong from the day it was
-- written, and the symptom only showed up when there was finally a real
-- subscription to update: a customer who had just paid still saw an active
-- Upgrade button.
--
-- Safety: Realtime applies RLS per subscriber, and the policy on profiles
-- grants SELECT on `id = auth.uid()` only, so adding the table here lets each
-- user hear about their own row and nobody else's. The client also filters on
-- its own id, but that is a convenience - the policy is the boundary.
-- ============================================================================

do $$
begin
  -- Supabase creates this publication; a plain PostgreSQL server does not.
  -- Say so and carry on rather than failing: on such a server there is no
  -- Realtime to publish to, and the rest of the schema is unaffected. On a
  -- Supabase project it always exists, so this never fires there.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'no supabase_realtime publication; skipping (not a Supabase server?)';
    return;
  end if;

  if not exists (
    select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
     where p.pubname = 'supabase_realtime'
       and n.nspname = 'public'
       and c.relname = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
