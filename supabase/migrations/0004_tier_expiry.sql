-- ============================================================================
-- 0004  A cancelled subscription expires on its own
-- ============================================================================
--
-- Lemon Squeezy's `cancelled` means "will not renew", not "access ends now":
-- ends_at is in the future and the customer has paid for every day up to it.
-- The webhook therefore leaves the tier alone on cancellation and waits for
-- subscription_expired to drop it.
--
-- Which raises the obvious question: what if that event never arrives? A
-- webhook can be missed - an endpoint down for an hour, a delivery Lemon
-- Squeezy gives up on, a secret rotated at the wrong moment - and the failure
-- mode of "wait for an event" is a cancelled account that keeps paid features
-- indefinitely. Nothing about that is visible, because the row looks exactly
-- like a healthy one.
--
-- So the deadline goes in the database instead. current_tier() is the single
-- point both RLS policies consult, which makes it the one place where this has
-- to be true; expressing it here means the entitlement lapses on time whether
-- or not anything tells us to.
--
-- Deliberately narrow: only `cancelled` expires. An `active` subscription whose
-- current_period_end has passed is a renewal webhook we have not processed yet,
-- and taking the product away from a paying customer because of our own missed
-- event would be the worse bug in both directions.
-- ============================================================================

create or replace function private.current_tier(uid uuid)
returns public.user_tier
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when p.subscription_status = 'cancelled'
     and p.current_period_end is not null
     and p.current_period_end <= timezone('utc', now())
    then 'free'::public.user_tier
    else p.tier
  end
  from public.profiles p
  where p.id = uid;
$$;

grant execute on function private.current_tier(uuid) to anon, authenticated, service_role;

comment on function private.current_tier(uuid) is
  'The tier to enforce right now. A cancelled subscription reverts to free at current_period_end without waiting for a webhook.';
