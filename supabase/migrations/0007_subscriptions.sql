-- ============================================================================
-- 0007  One row per subscription, instead of one per account
-- ============================================================================
--
-- profiles held a single lemon_subscription_id, so an account could only ever
-- be understood to have one subscription. Lemon Squeezy has no such rule, and
-- the gap produced the same failure four times in one evening:
--
--   * a second purchase overwrote the first, which kept billing untracked
--   * cancelling the tracked one left the untracked one paying for nothing
--   * events for the untracked one matched no row, so they 500'd and retried
--   * a plan switch patched whichever id happened to be recorded at the time
--
-- None of those were separate bugs. They were one modelling mistake seen from
-- four angles, and no amount of care in the webhook could fix it, because the
-- schema could not represent what was true.
--
-- So: subscriptions are their own rows, keyed by Lemon Squeezy's id. The
-- account's tier is DERIVED from whichever of them are live. An account with
-- two subscriptions is now an ordinary thing to say rather than a state the
-- schema has to lose.
-- ============================================================================

create table if not exists public.subscriptions (
  -- Lemon Squeezy's own id, not a surrogate: it is what every webhook
  -- addresses, which makes the upsert below exact and idempotent by
  -- construction rather than by a lookup that can miss.
  lemon_subscription_id text primary key,
  user_id               uuid not null references public.profiles(id) on delete cascade,
  -- Defaulted, not just NOT NULL: a webhook that creates a row without saying
  -- what it grants (a cancellation arriving first, say) must not be able to
  -- send an explicit tier and overwrite one that is already correct. The
  -- default fills a new row; an upsert that omits the column leaves an
  -- existing one alone.
  tier                  public.user_tier not null default 'free',
  status                public.sub_status not null default 'inactive',
  lemon_customer_id     text,
  lemon_variant_id      text,
  lemon_variant_name    text,
  current_period_end    timestamptz,
  renewal_amount_cents  integer,
  renewal_currency      text,
  card_brand            text,
  card_last_four        text,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);

comment on table public.subscriptions is
  'One row per Lemon Squeezy subscription. An account may have several; the tier it gets is derived from whichever are live. Written only by the service role.';

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- What counts as live, and which one wins
-- ---------------------------------------------------------------------------

-- Live means "should be granting access right now". Cancelled counts while the
-- paid period runs: Lemon Squeezy's `cancelled` means it will not renew, and
-- taking access away before ends_at takes away what was already bought.
-- past_due counts too - the card is being retried for days, and a first failed
-- retry is not a reason to lock someone out.
create or replace function private.subscription_is_live(
  status public.sub_status,
  period_end timestamptz
)
returns boolean
language sql
immutable
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
as $$
  select case t when 'team' then 2 when 'pro' then 1 else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- The tier the database enforces
-- ---------------------------------------------------------------------------

-- Reads the subscriptions, not the cached column on profiles. Enforcement has
-- to work from the truth even if the cache is stale; the cache exists for the
-- UI, and is maintained by the trigger below.
--
-- The best live subscription wins, so an account holding both Pro and Team
-- gets Team rather than whichever event arrived last.
create or replace function private.current_tier(uid uuid)
returns public.user_tier
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    (
      select s.tier
        from public.subscriptions s
       where s.user_id = uid
         and private.subscription_is_live(s.status, s.current_period_end)
       order by private.tier_rank(s.tier) desc,
                s.current_period_end desc nulls last
       limit 1
    ),
    'free'::public.user_tier
  );
$$;

grant execute on function private.current_tier(uuid) to anon, authenticated, service_role;
grant execute on function private.subscription_is_live(public.sub_status, timestamptz)
  to anon, authenticated, service_role;
grant execute on function private.tier_rank(public.user_tier) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keeping profiles in step
-- ---------------------------------------------------------------------------

-- profiles keeps its billing columns as a CACHE of the winning subscription,
-- so the client, the realtime channel and the account page need no changes and
-- keep working off one row. The authority is subscriptions; this is a mirror.
create or replace function private.sync_profile_from_subscriptions(uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  best public.subscriptions%rowtype;
begin
  select * into best
    from public.subscriptions s
   where s.user_id = uid
     and private.subscription_is_live(s.status, s.current_period_end)
   order by private.tier_rank(s.tier) desc,
            s.current_period_end desc nulls last
   limit 1;

  if not found then
    -- Nothing live. Fall back to the most recent subscription for the display
    -- columns so the account page can still say what happened, while the tier
    -- itself goes to free.
    select * into best
      from public.subscriptions s
     where s.user_id = uid
     order by s.updated_at desc
     limit 1;
  end if;

  update public.profiles p
     set tier = case
                  when best.lemon_subscription_id is not null
                   and private.subscription_is_live(best.status, best.current_period_end)
                  then best.tier
                  else 'free'::public.user_tier
                end,
         subscription_status   = coalesce(best.status, 'inactive'::public.sub_status),
         lemon_subscription_id = best.lemon_subscription_id,
         lemon_customer_id     = best.lemon_customer_id,
         lemon_variant_id      = best.lemon_variant_id,
         lemon_variant_name    = best.lemon_variant_name,
         current_period_end    = best.current_period_end,
         renewal_amount_cents  = best.renewal_amount_cents,
         renewal_currency      = best.renewal_currency,
         card_brand            = best.card_brand,
         card_last_four        = best.card_last_four
   where p.id = uid;
end;
$$;

revoke all on function private.sync_profile_from_subscriptions(uuid)
  from public, anon, authenticated;

create or replace function public.subscriptions_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.sync_profile_from_subscriptions(
    case when tg_op = 'DELETE' then old.user_id else new.user_id end
  );
  return null;
end;
$$;

revoke all on function public.subscriptions_sync_profile() from public, anon, authenticated;

drop trigger if exists subscriptions_sync on public.subscriptions;
create trigger subscriptions_sync
  after insert or update or delete on public.subscriptions
  for each row execute function public.subscriptions_sync_profile();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.subscriptions enable row level security;

-- Read your own. Nobody writes but the service role, which bypasses RLS: a
-- user who could write these could grant themselves any tier, since this table
-- is now what current_tier() reads.
drop policy if exists "Users read own subscriptions" on public.subscriptions;
create policy "Users read own subscriptions"
  on public.subscriptions for select
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Everything profiles already knew becomes its first subscription row. Only
-- the tracked one can be recovered - any subscription the old model lost is
-- lost, and the reconciliation in supabase/README.md is how those are found.
insert into public.subscriptions (
  lemon_subscription_id, user_id, tier, status, lemon_customer_id,
  lemon_variant_id, lemon_variant_name, current_period_end,
  renewal_amount_cents, renewal_currency, card_brand, card_last_four
)
select p.lemon_subscription_id, p.id, p.tier, p.subscription_status, p.lemon_customer_id,
       p.lemon_variant_id, p.lemon_variant_name, p.current_period_end,
       p.renewal_amount_cents, p.renewal_currency, p.card_brand, p.card_last_four
  from public.profiles p
 where p.lemon_subscription_id is not null
on conflict (lemon_subscription_id) do nothing;

-- The cache is now derived; make sure it agrees with what was just inserted.
do $$
declare
  r record;
begin
  for r in select distinct user_id from public.subscriptions loop
    perform private.sync_profile_from_subscriptions(r.user_id);
  end loop;
end;
$$;

-- Realtime already carries profiles, which is what the client watches.
