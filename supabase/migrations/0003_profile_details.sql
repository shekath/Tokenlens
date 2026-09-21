-- ============================================================================
-- 0003  Profile details and a stable public reference
-- ============================================================================
--
-- Adds the fields a user can keep about themselves (a display name, a phone
-- number, a country) and one they cannot: `public_id`, the identifier support
-- and chat quote back to them.
--
-- Why a separate identifier at all, when every row already has a uuid primary
-- key: the uuid is an internal join key that appears in RLS policies, foreign
-- keys and the JWT. Reading one aloud is 36 characters of hex, and pasting one
-- into a chat window leaks the exact value that other systems key on. This is a
-- short, unambiguous string that is safe to show, safe to repeat, and useless
-- as a credential.
--
-- Shape: TT-XXXXX-XXXXX over Crockford's base32 alphabet, which drops I, L, O
-- and U so nothing reads as a different character over a phone line or in a
-- screenshot. Ten characters carry 50 bits, so collisions are not a practical
-- concern even before the unique index and the retry below.
--
-- It is immutable by construction: no client-facing path writes it, and the
-- update trigger reverts an attempt anyway. Note that immutability is what
-- makes it usable as a support reference - an identifier the user can change is
-- an identifier support cannot trust.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The generator
-- ---------------------------------------------------------------------------

-- Core functions only. pgcrypto lives in the `extensions` schema on a hosted
-- project and every function here pins search_path, so gen_random_bytes is out
-- of reach; gen_random_uuid() is in core and is the same CSPRNG.
create or replace function private.new_public_id()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  -- Crockford base32: no I, L, O or U.
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  n         bigint;
  body      text;
  i         int;
begin
  for attempt in 1..8 loop
    -- 60 bits of a fresh uuid, of which the low 50 become ten base32 digits.
    n := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint;
    body := '';
    for i in 1..10 loop
      body := substr(alphabet, (n % 32)::int + 1, 1) || body;
      n := n / 32;
    end loop;
    candidate := 'TT-' || substr(body, 1, 5) || '-' || substr(body, 6, 5);
    if not exists (select 1 from public.profiles p where p.public_id = candidate) then
      return candidate;
    end if;
  end loop;
  -- Eight collisions at 50 bits means the random source is broken, not unlucky.
  raise exception 'could not allocate a unique public_id';
end;
$$;

revoke all on function private.new_public_id() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists phone        text;
alter table public.profiles add column if not exists country      text;
alter table public.profiles add column if not exists public_id    text;

-- Backfill before the not-null constraint. Row by row: the generator is
-- volatile and checks the table, so a set-returning update would hand every row
-- the same value.
do $$
declare
  r record;
begin
  for r in select id from public.profiles where public_id is null loop
    update public.profiles set public_id = private.new_public_id() where id = r.id;
  end loop;
end;
$$;

alter table public.profiles alter column public_id set default private.new_public_id();
alter table public.profiles alter column public_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_public_id_key'
  ) then
    alter table public.profiles add constraint profiles_public_id_key unique (public_id);
  end if;
end;
$$;

-- Validation lives here as well as in the form: RLS lets the client write these
-- columns directly, so the form is a convenience and the constraint is the rule.
-- Deliberately loose on phone - E.164 is the only thing close to universal and
-- plenty of people store a number with spaces, brackets or an extension.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_shape') then
    alter table public.profiles add constraint profiles_phone_shape
      check (phone is null or phone ~ '^\+?[0-9][0-9 ()./-]{5,24}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_country_shape') then
    alter table public.profiles add constraint profiles_country_shape
      check (country is null or country ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_lengths') then
    alter table public.profiles add constraint profiles_name_lengths
      check (
        (full_name is null or char_length(full_name) <= 80)
        and (display_name is null or char_length(display_name) <= 40)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_public_id_shape') then
    alter table public.profiles add constraint profiles_public_id_shape
      check (public_id ~ '^TT-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$');
  end if;
end;
$$;

comment on column public.profiles.public_id is
  'Stable, user-visible account reference (TT-XXXXX-XXXXX). Shown to the user for support; never editable by them, and not a credential.';
comment on column public.profiles.display_name is
  'What the user wants to be called. Falls back to full_name, then the email local part.';
comment on column public.profiles.country is
  'ISO 3166-1 alpha-2, uppercase. Self-declared; nothing bills or taxes off it - Lemon Squeezy is the merchant of record and collects its own.';

-- ---------------------------------------------------------------------------
-- What a user may not write
-- ---------------------------------------------------------------------------

-- Supersedes lock_profile_billing_columns: the same defence, now also pinning
-- the identity columns. Renamed because "billing" no longer describes it.
create or replace function public.lock_profile_managed_columns()
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
    -- The support reference. A user who could rotate this could disown a
    -- conversation; a user who could choose it could impersonate another.
    new.public_id             := old.public_id;
    new.created_at            := old.created_at;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_profile_managed_columns() from public, anon, authenticated;

drop trigger if exists profiles_lock_billing on public.profiles;
drop trigger if exists profiles_lock_managed on public.profiles;
create trigger profiles_lock_managed
  before update on public.profiles
  for each row execute function public.lock_profile_managed_columns();

drop function if exists public.lock_profile_billing_columns();

-- 0001's comment points at the function this migration just dropped.
comment on table public.profiles is
  'Per-user account details and billing state. The tier column is written only by the Lemon Squeezy webhook via the service role; see lock_profile_managed_columns.';

-- ---------------------------------------------------------------------------
-- New users
-- ---------------------------------------------------------------------------

-- As 0001, plus the public reference and a display name. The column default
-- would cover an insert that omits public_id; naming it here keeps the row's
-- whole shape in one readable place.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved text := nullif(
    trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(coalesce(new.email, ''), '@', 1)
    )),
    ''
  );
begin
  insert into public.profiles (id, email, full_name, display_name, public_id)
  values (
    new.id,
    new.email,
    resolved,
    -- The name people are addressed by is usually the first word of the name
    -- they gave. Editable afterwards; this only decides the opening value.
    nullif(split_part(coalesce(resolved, ''), ' ', 1), ''),
    private.new_public_id()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Existing rows predate display_name.
update public.profiles
   set display_name = nullif(split_part(coalesce(full_name, ''), ' ', 1), '')
 where display_name is null;
