-- Pin search_path on the two helpers migration 0007 left unpinned.
--
-- Both are SECURITY INVOKER and do nothing but compare their arguments, so
-- neither is exploitable as it stands. The reason to pin them anyway is where
-- they are called from: private.current_tier() is SECURITY DEFINER, so the
-- name resolution inside these two happens with the owner's privileges, using
-- whatever search_path the caller happens to have. Today that is
-- "public, pg_temp", and because pg_catalog is still searched first by default
-- timezone() cannot actually be shadowed - the exposure is latent, not live.
-- It stops being latent the day someone adds a schema to a caller's path, or
-- calls these from a definer function that pins a different one.
--
-- Pinning costs nothing and removes the question. pg_temp is only searched for
-- functions and operators when it is named explicitly, so leaving it off the
-- path closes the shadowing route for good; public stays on for the two enum
-- types in the signatures.

create or replace function private.subscription_is_live(
  status public.sub_status,
  period_end timestamptz
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when status in ('active', 'trialing', 'past_due') then true
    when status = 'cancelled'
      then period_end is null or period_end > timezone('utc', now())
    else false
  end;
$$;

create or replace function private.tier_rank(t public.user_tier)
returns integer
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case t when 'team' then 2 when 'pro' then 1 else 0 end;
$$;
