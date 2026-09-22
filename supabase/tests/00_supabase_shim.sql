-- ============================================================================
-- A minimal stand-in for the parts of Supabase the migration depends on, so the
-- schema and its policies can be executed and exercised against a plain
-- PostgreSQL instance.
--
-- This file is for testing only. It is never applied to a real project, where
-- the platform supplies all of it.
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- PostgREST puts the verified JWT payload in this GUC; auth.uid() reads the
-- subject out of it. Tests set the GUC directly to impersonate a caller.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

do $$ begin create role anon          nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role  nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

-- Supabase grants table privileges to these roles and relies on RLS to restrict
-- what they can actually see. Reproduce that, or the tests would pass for the
-- wrong reason (a privilege error rather than a policy decision).
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

/** Impersonate a signed-in user for subsequent statements in this session. */
create or replace function test_as_user(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    false
  );
  execute 'set role authenticated';
end;
$$;

/** Impersonate the service role, as the billing webhook does. */
create or replace function test_as_service()
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role')::text,
    false
  );
  execute 'set role service_role';
end;
$$;

/** Impersonate an anonymous visitor holding only the public anon key. */
create or replace function test_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
  execute 'set role anon';
end;
$$;

/**
 * PostgREST publishes every function in its exposed schemas (by default just
 * `public`) at /rest/v1/rpc/<name>. There is no PostgREST here, so this is the
 * stand-in: it answers "would this function be reachable as an RPC, by this
 * role?" - schema exposed, and EXECUTE granted.
 */
create or replace function test_is_rpc_reachable(fn regprocedure, who text)
returns boolean
language sql
stable
as $$
  select
    (select nspname from pg_namespace n join pg_proc p on p.pronamespace = n.oid
      where p.oid = fn) = 'public'
    and has_function_privilege(who, fn, 'EXECUTE');
$$;

create or replace function test_reset()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Supabase creates this publication; Postgres does not. Migration 0006 adds
-- public.profiles to it, and without this the suite stops there.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
