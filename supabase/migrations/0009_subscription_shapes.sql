-- Give public.subscriptions the same column shapes public.profiles already has.
--
-- 0005 constrained profiles.renewal_currency to ^[A-Z]{3}$ and
-- profiles.card_last_four to ^[0-9]{4}$. 0007 introduced public.subscriptions
-- as the source of truth and synced it into profiles by trigger, but declared
-- those two columns as plain text - so the stricter table is now downstream of
-- the looser one.
--
-- That is the wrong way round. A value Lemon Squeezy sends that profiles will
-- not accept ("" for a PayPal subscription with no card) is taken by
-- subscriptions, then rejected by the trigger writing into profiles, which
-- aborts the webhook transaction. The failure surfaces as a 500 on an event
-- that can never succeed, so Lemon Squeezy retries it indefinitely.
--
-- The webhook normalises these at the boundary now, which is the actual fix.
-- These constraints are the backstop: the contract the sync trigger depends on
-- should be stated on both tables, not just the one further from the data.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_renewal_currency_shape'
  ) then
    alter table public.subscriptions add constraint subscriptions_renewal_currency_shape
      check (renewal_currency is null or renewal_currency ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_card_last_four_shape'
  ) then
    alter table public.subscriptions add constraint subscriptions_card_last_four_shape
      check (card_last_four is null or card_last_four ~ '^[0-9]{4}$');
  end if;
end $$;
