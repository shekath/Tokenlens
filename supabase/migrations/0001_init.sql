-- ============================================================================
-- TokenTicks — initial schema
--
-- Departures from the blueprint's draft SQL, each for a concrete reason:
--
--  1. The free-tier save cap counts through a SECURITY DEFINER function so it
--     runs outside RLS.
--
--     The draft counted with a plain subquery over saved_estimates inside a
--     policy on saved_estimates. That works, but it fails OPEN: the subquery
--     is evaluated under the table's own SELECT policy, so the count sees only
--     the rows that policy exposes. Tighten or drop the SELECT policy later
--     and the count silently returns 0, the cap stops applying, and a free
--     account saves without limit -- with no error anywhere. Demonstrated in
--     supabase/tests/01_rls.sql, which drops the SELECT policy and shows the
--     draft admitting a fourth row while this version still refuses.
--
--     (An earlier revision of this comment claimed the draft aborts with
--     "infinite recursion detected in policy for relation". That is wrong, and
--     was not checked before it was written. Postgres recurses only when the
--     SELECT policy itself references the table; here it is a plain column
--     comparison, so the draft runs fine.)
--
--  2. `using (auth.uid() = user_id or is_public = true)` on the base table
--     exposes every column of a shared row, including the prompt preview. A
--     shared cost estimate should not publish the prompt it came from. Base
--     table access is owner-only; sharing goes through a view that selects the
--     non-sensitive columns.
--
--  3. Nothing stopped a client from writing its own `tier`. RLS grants no
--     UPDATE on profiles today, but a future policy could, and the mistake
--     would be silent and total. A trigger pins the billing columns unless the
--     caller is the service role, so the webhook remains the only writer.
--
--  4. The blueprint calls the webhook idempotent but stores nothing to make it
--     so. Lemon Squeezy retries on non-2xx, and retries are expected. A
--     processed-event ledger makes replays no-ops.
--
--  5. Added the UPDATE and DELETE policies users need to manage their own
--     estimates, an updated_at trigger, and the indexes the queries imply.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

do $$ begin
  create type user_tier as enum ('free', 'pro', 'team');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sub_status as enum ('inactive', 'active', 'past_due', 'cancelled', 'trialing');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Profiles — mirrors auth.users, holds billing state
-- ============================================================================

create table if not exists public.profiles (
  id                    uuid references auth.users on delete cascade primary key,
  email                 text not null,
  full_name             text,
  tier                  user_tier not null default 'free',
  subscription_status   sub_status not null default 'inactive',
  lemon_customer_id     text unique,
  lemon_subscription_id text unique,
  current_period_end    timestamptz,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

comment on table public.profiles is
  'Billing state per user. The tier column is written only by the Lemon Squeezy webhook via the service role; see lock_profile_billing_columns.';

-- ============================================================================
-- Saved estimates
-- ============================================================================

create table if not exists public.saved_estimates (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  project_title      text not null default 'Untitled estimate',
  model_id           text not null,
  input_tokens       integer not null check (input_tokens >= 0),
  output_tokens      integer not null check (output_tokens >= 0),
  cached_tokens      integer not null default 0 check (cached_tokens >= 0),
  estimated_cost_usd numeric(14, 8) not null check (estimated_cost_usd >= 0),
  prompt_metadata    jsonb not null default '{}'::jsonb,
  -- A short excerpt so a saved row is recognisable. Never exposed by the
  -- sharing view; the full prompt is deliberately not stored at all.
  prompt_preview     text check (prompt_preview is null or length(prompt_preview) <= 280),
  is_public          boolean not null default false,
  share_slug         text unique,
  created_at         timestamptz not null default timezone('utc', now())
);

create index if not exists saved_estimates_user_created_idx
  on public.saved_estimates (user_id, created_at desc);
create index if not exists saved_estimates_share_slug_idx
  on public.saved_estimates (share_slug) where share_slug is not null;

-- ============================================================================
-- Webhook event ledger — the thing that actually makes delivery idempotent
-- ============================================================================

create table if not exists public.billing_events (
  event_id     text primary key,
  event_name   text not null,
  payload      jsonb not null,
  processed_at timestamptz not null default timezone('utc', now())
);

comment on table public.billing_events is
  'One row per Lemon Squeezy event id already applied. Inserted before the profile update so a retry short-circuits.';

-- ============================================================================
-- Helpers
-- ============================================================================

-- Runs outside RLS so it can count rows the caller's own policy would filter.
-- search_path is pinned: a SECURITY DEFINER function that resolves names through
-- the caller's search_path can be hijacked by a same-named object in a schema
-- the caller controls.
create or replace function public.saved_estimate_count(uid uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*)::integer from public.saved_estimates where user_id = uid;
$$;

create or replace function public.current_tier(uid uuid)
returns user_tier
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select tier from public.profiles where id = uid;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Defence in depth: whatever the policies allow, a non-service-role caller
-- cannot move itself onto a paid tier.
create or replace function public.lock_profile_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('request.jwt.claims', true) is not null
     and coalesce(
           (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
           ''
         ) <> 'service_role'
  then
    new.tier                  := old.tier;
    new.subscription_status   := old.subscription_status;
    new.lemon_customer_id     := old.lemon_customer_id;
    new.lemon_subscription_id := old.lemon_subscription_id;
    new.current_period_end    := old.current_period_end;
    new.email                 := old.email;
    new.id                    := old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_billing on public.profiles;
create trigger profiles_lock_billing
  before update on public.profiles
  for each row execute function public.lock_profile_billing_columns();

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.saved_estimates enable row level security;
alter table public.billing_events  enable row level security;
-- No policies on billing_events: only the service role, which bypasses RLS,
-- ever touches it.

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Display name only; the trigger above reverts anything else.
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users read own estimates" on public.saved_estimates;
create policy "Users read own estimates"
  on public.saved_estimates for select
  using (auth.uid() = user_id);

drop policy if exists "Free tier save cap" on public.saved_estimates;
create policy "Free tier save cap"
  on public.saved_estimates for insert
  with check (
    auth.uid() = user_id
    and (
      public.current_tier(auth.uid()) in ('pro', 'team')
      or public.saved_estimate_count(auth.uid()) < 3
    )
  );

drop policy if exists "Users update own estimates" on public.saved_estimates;
create policy "Users update own estimates"
  on public.saved_estimates for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- Publishing a share link is a Team entitlement. The client hides the
    -- control, but hiding a button is not enforcement; this is.
    and (is_public = false or public.current_tier(auth.uid()) = 'team')
  );

drop policy if exists "Users delete own estimates" on public.saved_estimates;
create policy "Users delete own estimates"
  on public.saved_estimates for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- Public sharing — a view, so the column list is the security boundary
-- ============================================================================

create or replace view public.shared_estimates
with (security_invoker = false) as
  select
    share_slug,
    project_title,
    model_id,
    input_tokens,
    output_tokens,
    cached_tokens,
    estimated_cost_usd,
    created_at
  from public.saved_estimates
  where is_public = true and share_slug is not null;

comment on view public.shared_estimates is
  'Read path for shared links. Deliberately omits user_id, prompt_preview and prompt_metadata so sharing a cost figure never publishes the prompt or the owner.';

-- A plain `grant select` on this view would let anyone holding the anon key run
-- `select * from shared_estimates` and dump every shared row. A share link is
-- meant to be unlisted, not public, and a project title is user-supplied text
-- that may name a client. Access goes through a lookup that requires the slug,
-- so knowing the link is the only way in.
revoke all on public.shared_estimates from anon, authenticated;

create or replace function public.get_shared_estimate(slug text)
returns setof public.shared_estimates
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select * from public.shared_estimates where share_slug = slug limit 1;
$$;

grant execute on function public.get_shared_estimate(text) to anon, authenticated;

-- A slug is minted only when a row is actually made public.
create or replace function public.assign_share_slug()
returns trigger
language plpgsql
as $$
begin
  if new.is_public and new.share_slug is null then
    new.share_slug := encode(gen_random_bytes(9), 'base64');
    new.share_slug := replace(replace(replace(new.share_slug, '+', '-'), '/', '_'), '=', '');
  elsif not new.is_public then
    new.share_slug := null;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_estimates_share_slug on public.saved_estimates;
create trigger saved_estimates_share_slug
  before insert or update on public.saved_estimates
  for each row execute function public.assign_share_slug();

-- ============================================================================
-- Profile creation on sign-up
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
