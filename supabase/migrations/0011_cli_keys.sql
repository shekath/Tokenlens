-- Licence keys for the tokenticks CLI and MCP server.
--
-- The package runs on the customer's machine - their laptop, their CI runner -
-- so it cannot lean on a session or on RLS the way the web app does. It holds
-- a key instead, and asks one question of this database: which plan is the
-- account behind this key on right now?
--
-- Three decisions shape the table:
--
--   * Only a SHA-256 of the key is stored. A key is shown once, at creation,
--     and a leaked copy of this table grants nothing. 244 random bits make the
--     unsalted hash safe: there is no dictionary to precompute.
--   * Keys are minted here, never by the client, so their randomness does not
--     depend on the browser that asked.
--   * The answer is the LIVE tier, from private.current_tier(), not a tier
--     copied onto the key. A cancelled subscription downgrades every key at the
--     next check, and an upgrade needs no new key.
--
-- A deleted account takes its keys with it (cascade from profiles), which also
-- means a key belonging to a deleted account simply stops resolving.

create table if not exists public.cli_keys (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 60),
  -- "tt_" and six hex characters: enough to tell keys apart in a list and in a
  -- CI log, far too little to be the key.
  key_prefix    text not null check (key_prefix ~ '^tt_[0-9a-f]{6}$'),
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default timezone('utc', now()),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists cli_keys_user_idx on public.cli_keys (user_id, created_at desc);

alter table public.cli_keys enable row level security;

drop policy if exists "Users read own keys" on public.cli_keys;
create policy "Users read own keys"
  on public.cli_keys for select
  using ((select auth.uid()) = user_id);

-- Every write goes through the functions below. A client that could insert a
-- row could choose its own key, and one that could update could un-revoke.
revoke insert, update, delete on public.cli_keys from anon, authenticated;

-- Mint a key for the calling user and return it. The only time the key exists
-- in plain text anywhere is in this function's result.
create or replace function public.create_cli_key(p_label text)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  uid  uuid := auth.uid();
  live integer;
  k    text;
begin
  if uid is null then
    raise exception 'Sign in to create a key.' using errcode = '42501';
  end if;

  select count(*) into live
    from public.cli_keys
   where user_id = uid and revoked_at is null;
  if live >= 10 then
    raise exception 'Ten active keys is the limit. Revoke one first.' using errcode = '54000';
  end if;

  -- Two v4 UUIDs: 244 bits from the server's CSPRNG, no extension required.
  k := 'tt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.cli_keys (user_id, label, key_prefix, key_hash)
  values (uid, btrim(coalesce(p_label, '')), left(k, 9), encode(sha256(convert_to(k, 'UTF8')), 'hex'));

  return k;
end;
$$;

-- Revoke one of the caller's own keys. Returns false for a key that is not
-- theirs or is already revoked, so the UI can tell the two apart from success
-- without learning whether somebody else's id exists.
create or replace function public.revoke_cli_key(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.cli_keys
     set revoked_at = timezone('utc', now())
   where id = p_id
     and user_id = auth.uid()
     and revoked_at is null;
  return found;
end;
$$;

-- The CLI's one question. Callable with only the anon key, because the caller
-- is a CI runner with no session; the licence key itself is the credential.
-- An unknown, malformed or revoked key returns no row - never an error that
-- distinguishes the three.
create or replace function public.check_cli_key(p_key text)
returns table (tier public.user_tier, public_id text, key_label text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  kid   uuid;
  uid   uuid;
  klabel text;
begin
  if p_key is null or p_key !~ '^tt_[0-9a-f]{64}$' then
    return;
  end if;

  select k.id, k.user_id, k.label
    into kid, uid, klabel
    from public.cli_keys k
   where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
     and k.revoked_at is null;
  if not found then
    return;
  end if;

  -- At most one write an hour per key: "last used" is for spotting a key that
  -- should be revoked, and a CI matrix of fifty jobs should not be fifty writes.
  update public.cli_keys
     set last_used_at = timezone('utc', now())
   where id = kid
     and (last_used_at is null or last_used_at < timezone('utc', now()) - interval '1 hour');

  return query
    select private.current_tier(uid), p.public_id, klabel
      from public.profiles p
     where p.id = uid;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon by default, so revoking from
-- PUBLIC alone would leave the two account-scoped functions callable without a
-- session. They would refuse (no auth.uid()), but there is no reason to expose them.
revoke all on function public.create_cli_key(text) from public, anon;
revoke all on function public.revoke_cli_key(uuid) from public, anon;
revoke all on function public.check_cli_key(text) from public;
grant execute on function public.create_cli_key(text) to authenticated, service_role;
grant execute on function public.revoke_cli_key(uuid) to authenticated, service_role;
grant execute on function public.check_cli_key(text) to anon, authenticated, service_role;
