-- ============================================================================
-- TokenTicks — initial schema
--
-- This file is the source of truth for a fresh project and matches what is
-- deployed. Applying it to an empty Supabase project reproduces the live state.
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
--     supabase/tests/01_rls.sql.
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
--     non-sensitive columns, reached only by a slug lookup.
--
--  3. Nothing stopped a client from writing its own `tier`. A trigger pins the
--     billing columns unless the caller is the service role, so the webhook
--     remains the only writer.
--
--  4. The blueprint calls the webhook idempotent but stores nothing to make it
--     so. Lemon Squeezy retries on non-2xx, and retries are expected. A
--     processed-event ledger makes replays no-ops.
--
--  5. Added the UPDATE and DELETE policies users need to manage their own
--     estimates, an updated_at trigger, and the indexes the queries imply.
--
-- Three further corrections came out of deploying this to a real Supabase
-- project. None could be caught by the offline suite, because each depends on
-- something the local shim does not have:
--
--  A. Policy helpers live in a `private` schema, not `public`. PostgREST
--     publishes every function in `public` as an RPC endpoint, and both helpers
--     are SECURITY DEFINER, so in `public` they bypassed RLS and let anyone
--     holding the (public) anon key read any user's tier and estimate count:
--         POST /rest/v1/rpc/current_tier  {"uid": "<any user id>"}  ->  "team"
--     `private` is not in PostgREST's exposed schema list, so policies can
--     still call them and the REST API cannot.
--
--  B. The share slug is built from gen_random_uuid(), not pgcrypto. Supabase
--     installs pgcrypto into the `extensions` schema, so gen_random_bytes was
--     unreachable from a function whose search_path is pinned to public, and
--     publishing a share link failed outright. gen_random_uuid(), encode() and
--     decode() are core, so the function now needs no extension and yields 128
--     bits instead of 72.
--
--  C. lock_profile_billing_columns() tolerates an empty claims string.
--     current_setting('request.jwt.claims', true) returns '' -- not NULL --
--     when the GUC is set empty, so the old NULL-only guard reached ''::jsonb
--     and raised, making every UPDATE on profiles in such a session fail.
--
-- auth.uid() is wrapped as (select auth.uid()) throughout: that lets Postgres
-- evaluate it once per query via an InitPlan instead of once per row, which is
-- what Supabase's performance linter asks for on RLS policies.
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
-- Policy helpers — in `private`, which PostgREST does not expose (note A)
-- ============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

-- SECURITY DEFINER so the count runs outside RLS and cannot fail open.
-- search_path is pinned: a definer function resolving names through the
-- caller's search_path can be hijacked by a same-named object in a schema the
-- caller controls.
create or replace function private.saved_estimate_count(uid uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*)::integer from public.saved_estimates where user_id = uid;
$$;

create or replace function private.current_tier(uid uuid)
returns public.user_tier
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select tier from public.profiles where id = uid;
$$;

-- RLS policy expressions are evaluated as the querying role, so those roles
-- need EXECUTE. Safe here: the schema is not exposed, so there is no RPC route.
grant execute on function private.saved_estimate_count(uuid) to anon, authenticated, service_role;
grant execute on function private.current_tier(uuid)          to anon, authenticated, service_role;

-- ============================================================================
-- Triggers
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
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
-- cannot move itself onto a paid tier. See note C for the claims handling.
create or replace function public.lock_profile_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claims     text := nullif(current_setting('request.jwt.claims', true), '');
  claim_role text;
begin
  if claims is null then
    -- No verified JWT: an administrative connection. Leave the row alone.
    return new;
  end if;

  begin
    claim_role := claims::jsonb ->> 'role';
  exception when others then
    -- Unparseable claims are not a service-role claim. Fail closed.
    claim_role := null;
  end;

  if coalesce(claim_role, '') <> 'service_role' then
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

-- A slug is minted only when a row is actually made public. Core functions
-- only, so this does not depend on where pgcrypto happens to live (note B).
create or replace function public.assign_share_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_public and new.share_slug is null then
    -- 16 random bytes -> 22 base64url characters, 128 bits.
    new.share_slug := translate(
      encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
      '+/=', '-_'
    );
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

-- An email sign-up puts the name under `full_name`, because that is the key the
-- sign-up form sends. An OAuth provider sends whatever it sends: Google's OIDC
-- claims carry `name`, and Supabase maps `full_name` alongside it, but not every
-- provider does both. Reading only `full_name` would leave Google accounts with
-- a null name for no reason, so try the common keys in order and fall back to
-- the local part of the email rather than storing nothing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(
      trim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        new.raw_user_meta_data ->> 'preferred_username',
        split_part(coalesce(new.email, ''), '@', 1)
      )),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are invoked by the trigger mechanism, never called by a
-- client. Leaving them executable turns each into a pointless RPC endpoint.
revoke all on function public.handle_new_user()              from public, anon, authenticated;
revoke all on function public.lock_profile_billing_columns() from public, anon, authenticated;
revoke all on function public.set_updated_at()               from public, anon, authenticated;
revoke all on function public.assign_share_slug()            from public, anon, authenticated;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.saved_estimates enable row level security;
alter table public.billing_events  enable row level security;

-- The ledger is service-role only. RLS with no policy already denies everyone
-- else; the table grants were pointless surface area.
revoke all on public.billing_events from anon, authenticated;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using ((select auth.uid()) = id);

-- Display name only; the trigger above reverts anything else.
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users read own estimates" on public.saved_estimates;
create policy "Users read own estimates"
  on public.saved_estimates for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Free tier save cap" on public.saved_estimates;
create policy "Free tier save cap"
  on public.saved_estimates for insert
  with check (
    (select auth.uid()) = user_id
    and (
      private.current_tier((select auth.uid())) in ('pro', 'team')
      or private.saved_estimate_count((select auth.uid())) < 3
    )
  );

drop policy if exists "Users update own estimates" on public.saved_estimates;
create policy "Users update own estimates"
  on public.saved_estimates for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    -- Publishing a share link is a Team entitlement. The client hides the
    -- control, but hiding a button is not enforcement; this is.
    and (is_public = false or private.current_tier((select auth.uid())) = 'team')
  );

drop policy if exists "Users delete own estimates" on public.saved_estimates;
create policy "Users delete own estimates"
  on public.saved_estimates for delete
  using ((select auth.uid()) = user_id);

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

-- A plain `grant select` here would let anyone holding the anon key run
-- `select * from shared_estimates` and dump every shared row. A share link is
-- meant to be unlisted, not public, and a project title is user-supplied text
-- that may name a client. Access requires the slug.
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

-- Intentionally public: this is the share-link lookup, and it returns one row
-- only to a caller that already holds a 128-bit slug. Supabase's linter flags
-- every anon-callable SECURITY DEFINER function; this one is by design.
grant execute on function public.get_shared_estimate(text) to anon, authenticated;
