-- ============================================================================
-- 0005  What the subscription actually costs, and on what card
-- ============================================================================
--
-- "Next renewal: 21 Oct" is not enough to act on. Someone deciding whether to
-- keep paying wants the amount, and someone who cannot remember which card is
-- on file wants the last four digits. None of that was stored.
--
-- Where each value comes from, and why not from our own price list: PLANS in
-- src/lib/entitlements.ts is what we advertise, which is not what a given
-- customer is charged. Lemon Squeezy is the merchant of record - it applies
-- the buyer's local tax, any discount code, and the price that was in force on
-- the day they subscribed. The only honest source for "you will be charged X"
-- is the invoice Lemon Squeezy actually issued, so subscription_payment_success
-- is where the amount comes from: attributes.total, in cents, tax included.
--
-- All of these are written by the webhook through the service role and are
-- reverted for anyone else by lock_profile_managed_columns, same as the tier.
-- ============================================================================

alter table public.profiles add column if not exists lemon_variant_id      text;
alter table public.profiles add column if not exists lemon_variant_name    text;
alter table public.profiles add column if not exists renewal_amount_cents  integer;
alter table public.profiles add column if not exists renewal_currency      text;
alter table public.profiles add column if not exists card_brand            text;
alter table public.profiles add column if not exists card_last_four        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_renewal_amount_sane') then
    alter table public.profiles add constraint profiles_renewal_amount_sane
      check (renewal_amount_cents is null or renewal_amount_cents >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_currency_shape') then
    -- ISO 4217, as Lemon Squeezy reports it.
    alter table public.profiles add constraint profiles_currency_shape
      check (renewal_currency is null or renewal_currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_card_last_four_shape') then
    alter table public.profiles add constraint profiles_card_last_four_shape
      check (card_last_four is null or card_last_four ~ '^[0-9]{4}$');
  end if;
end;
$$;

comment on column public.profiles.renewal_amount_cents is
  'What Lemon Squeezy last actually charged, in minor units, tax included. From the invoice, not from our price list: the customer may hold an older price or a discount.';
comment on column public.profiles.card_last_four is
  'Last four digits only, as Lemon Squeezy reports them. No card data is ever handled here - Lemon Squeezy is the merchant of record.';

-- ---------------------------------------------------------------------------
-- Still not the user's to write
-- ---------------------------------------------------------------------------

-- Same guard as 0003, extended. A user who could set their own renewal amount
-- could not steal anything, but they could make a support conversation start
-- from a false number, and a column the webhook owns should read that way in
-- one place rather than depending on which type happens to be declared in the
-- client.
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
    new.public_id             := old.public_id;
    new.created_at            := old.created_at;
    new.lemon_variant_id      := old.lemon_variant_id;
    new.lemon_variant_name    := old.lemon_variant_name;
    new.renewal_amount_cents  := old.renewal_amount_cents;
    new.renewal_currency      := old.renewal_currency;
    new.card_brand            := old.card_brand;
    new.card_last_four        := old.card_last_four;
  end if;

  return new;
end;
$$;

revoke all on function public.lock_profile_managed_columns() from public, anon, authenticated;
