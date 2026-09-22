-- ============================================================================
-- Behavioural tests for the schema's security properties.
--
-- Run with:  ./supabase/tests/run.sh
--
-- Each test raises an exception on failure, so a clean run means every
-- assertion held. These are the claims the README makes; this file is what
-- makes them checkable rather than asserted.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

create or replace function assert(condition boolean, what text)
returns void language plpgsql as $$
begin
  if not condition then
    raise exception 'FAILED: %', what;
  end if;
  raise notice '  ok: %', what;
end;
$$;

-- Grants a tier the way the product does: a live subscription row. Writing
-- profiles.tier grants nothing since 0007 - it is a cache, and current_tier()
-- reads the subscriptions. Every test that used to UPDATE the column goes
-- through here instead, which is also what keeps them honest.
create or replace function test_grant_tier(uid uuid, t text)
returns void language plpgsql as $$
begin
  -- One subscription at a time, so a later grant replaces an earlier one
  -- rather than being outranked by it.
  delete from public.subscriptions where user_id = uid;
  if t = 'free' then
    return;
  end if;
  insert into public.subscriptions (
    lemon_subscription_id, user_id, tier, status, current_period_end
  )
  values (
    'test_' || replace(uid::text, '-', '') , uid, t::public.user_tier, 'active',
    timezone('utc', now()) + interval '30 days'
  );
end;
$$;

-- ---------------------------------------------------------------- fixtures --
select test_reset();

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',   '{"full_name":"Bob"}');

\echo ''
\echo '== profile creation trigger =='
select assert(
  (select count(*) from public.profiles) = 2,
  'a profile row is created for each new auth user'
);
select assert(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice',
  'the display name is copied from raw_user_meta_data'
);
select assert(
  (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'free',
  'new accounts start on the free tier'
);

\echo ''
\echo '== tenant isolation =='
select test_as_service();
insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
values ('22222222-2222-2222-2222-222222222222', 'Bob private work', 'gpt-5', 100, 50, 0.001);

select test_as_user('11111111-1111-1111-1111-111111111111');
select assert(
  (select count(*) from public.saved_estimates) = 0,
  'Alice cannot see any of Bob''s estimates'
);
select assert(
  (select count(*) from public.profiles) = 1,
  'Alice can see exactly one profile - her own'
);

\echo ''
\echo '== a client cannot promote itself =='
select test_as_user('11111111-1111-1111-1111-111111111111');
update public.profiles set tier = 'team', subscription_status = 'active' where id = '11111111-1111-1111-1111-111111111111';
select test_reset();
select assert(
  (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'free',
  'the UPDATE is permitted but the billing columns are reverted by the trigger'
);

select test_as_user('11111111-1111-1111-1111-111111111111');
update public.profiles set full_name = 'Alice Smith' where id = '11111111-1111-1111-1111-111111111111';
select test_reset();
select assert(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice Smith',
  'but the display name still updates, so the lock is not a blanket block'
);

\echo ''
\echo '== the webhook (service role) can set the tier =='
select test_as_service();
update public.profiles
   set tier = 'pro', subscription_status = 'active', lemon_subscription_id = 'sub_1'
 where id = '11111111-1111-1111-1111-111111111111';
select test_reset();
select assert(
  (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'pro',
  'the service role is exempt from the billing-column lock'
);
-- But the cache is only a cache. Since 0007 the tier that is ENFORCED comes
-- from the subscriptions, so a profiles.tier nobody paid for grants nothing.
select assert(
  private.current_tier('11111111-1111-1111-1111-111111111111') = 'free',
  'and a tier written straight onto the profile still enforces as free'
);
select test_as_service();
update public.profiles set lemon_subscription_id = null
 where id = '11111111-1111-1111-1111-111111111111';
select test_reset();

\echo ''
\echo '== free-tier save cap =='
-- Back to free so the cap applies.
select test_as_service();
select test_grant_tier('11111111-1111-1111-1111-111111111111', 'free');
select test_reset();

select test_as_user('11111111-1111-1111-1111-111111111111');
insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
values ('11111111-1111-1111-1111-111111111111', 'one',   'gpt-5', 10, 10, 0.1),
       ('11111111-1111-1111-1111-111111111111', 'two',   'gpt-5', 10, 10, 0.1),
       ('11111111-1111-1111-1111-111111111111', 'three', 'gpt-5', 10, 10, 0.1);
select assert(
  (select count(*) from public.saved_estimates) = 3,
  'a free account can save three estimates'
);

do $$
begin
  insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
  values ('11111111-1111-1111-1111-111111111111', 'four', 'gpt-5', 10, 10, 0.1);
  raise exception 'FAILED: the fourth save should have been rejected';
exception
  when insufficient_privilege then
    raise notice '  ok: the fourth save is rejected by the RLS policy';
  -- The subquery inside the policy is what the blueprint''s draft got wrong;
  -- if it recursed, this would surface here instead of a clean denial.
  when others then
    raise exception 'FAILED: expected a policy denial, got % (%)', sqlerrm, sqlstate;
end $$;

select test_reset();
select test_as_service();
select test_grant_tier('11111111-1111-1111-1111-111111111111', 'pro');
select test_reset();
select test_as_user('11111111-1111-1111-1111-111111111111');
insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
values ('11111111-1111-1111-1111-111111111111', 'four', 'gpt-5', 10, 10, 0.1);
select assert(
  (select count(*) from public.saved_estimates) = 4,
  'and a Pro account is not capped'
);

\echo ''
\echo '== sharing is a Team entitlement, enforced in SQL =='
select test_as_user('11111111-1111-1111-1111-111111111111');  -- currently pro
do $$
declare target uuid;
begin
  select id into target from public.saved_estimates where project_title = 'one';
  update public.saved_estimates set is_public = true where id = target;
  raise exception 'FAILED: a Pro account should not be able to publish a share link';
exception
  when insufficient_privilege then
    raise notice '  ok: Pro cannot publish a share link';
  when others then
    raise exception 'FAILED: expected a policy denial, got % (%)', sqlerrm, sqlstate;
end $$;

select test_reset();
select test_as_service();
select test_grant_tier('11111111-1111-1111-1111-111111111111', 'team');
select test_reset();

select test_as_user('11111111-1111-1111-1111-111111111111');
update public.saved_estimates set is_public = true where project_title = 'one';
select assert(
  (select share_slug is not null from public.saved_estimates where project_title = 'one'),
  'Team can publish, and a slug is minted by the trigger'
);
select assert(
  (select length(share_slug) >= 10 from public.saved_estimates where project_title = 'one'),
  'the slug is long enough not to be guessable'
);

\echo ''
\echo '== a share link publishes the cost, not the prompt or the owner =='
select test_reset();
select test_as_service();
update public.saved_estimates set prompt_preview = 'SECRET client prompt text' where project_title = 'one';
select test_reset();

select test_as_anon();
do $$
begin
  perform * from public.shared_estimates;
  raise exception 'FAILED: anon should not be able to read the sharing view directly';
exception
  when insufficient_privilege then
    raise notice '  ok: anon cannot enumerate shared_estimates';
  when others then
    raise exception 'FAILED: expected a privilege error, got % (%)', sqlerrm, sqlstate;
end $$;

select test_reset();
-- Capture the slug into a psql variable: a temp table made as one role is not
-- readable by the next, and the point of this block is to act as a visitor who
-- has nothing but the link.
select share_slug as slug from public.saved_estimates where project_title = 'one' \gset

select test_as_anon();
select assert(
  (select count(*) from public.get_shared_estimate(:'slug')) = 1,
  'anon can fetch one shared estimate when it holds the slug'
);
select assert(
  (select count(*) from public.get_shared_estimate(:'slug')
    where project_title = 'one') = 1,
  'and the row it gets back is the right one'
);
select assert(
  (select count(*) from public.get_shared_estimate('not-a-real-slug')) = 0,
  'and gets nothing for a slug it does not hold'
);
select assert(
  (select count(*) from information_schema.columns
    where table_name = 'shared_estimates'
      and column_name in ('prompt_preview', 'prompt_metadata', 'user_id')) = 0,
  'the shared view exposes no prompt text, metadata or owner id'
);

\echo ''
\echo '== the draft cap fails open; this one does not =='
-- The draft counted with a plain subquery over the table the policy guards.
-- That subquery is evaluated under the table's SELECT policy, so the cap is
-- only as good as that policy. Both halves are demonstrated here.
select test_reset();

create table public.cap_demo (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null,
  is_public boolean not null default false
);
grant select, insert on public.cap_demo to authenticated;
alter table public.cap_demo enable row level security;

create policy "draft read"   on public.cap_demo for select
  using (auth.uid() = user_id or is_public = true);
create policy "draft insert" on public.cap_demo for insert
  with check (
    auth.uid() = user_id
    and (select count(*) from public.cap_demo where user_id = auth.uid()) < 3
  );

select test_as_user('11111111-1111-1111-1111-111111111111');
insert into public.cap_demo (user_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111111');

do $$
begin
  insert into public.cap_demo (user_id) values ('11111111-1111-1111-1111-111111111111');
  raise exception 'FAILED: the draft cap should hold while its SELECT policy is intact';
exception
  when insufficient_privilege then
    raise notice '  ok: with its SELECT policy intact, the draft cap holds at three';
  when others then
    raise exception 'FAILED: unexpected % (%)', sqlerrm, sqlstate;
end $$;

-- Now the failure mode: a plausible later change to how rows are read.
select test_reset();
drop policy "draft read" on public.cap_demo;

select test_as_user('11111111-1111-1111-1111-111111111111');
insert into public.cap_demo (user_id) values ('11111111-1111-1111-1111-111111111111');
select test_reset();
select assert(
  (select count(*) from public.cap_demo) = 4,
  'FAIL-OPEN: dropping the SELECT policy silently disabled the draft cap'
);
drop table public.cap_demo;

-- The shipped cap counts through a SECURITY DEFINER function, outside RLS, so
-- it does not depend on the SELECT policy at all.
select test_as_service();
select test_grant_tier('11111111-1111-1111-1111-111111111111', 'free');
select test_reset();
drop policy "Users read own estimates" on public.saved_estimates;

select test_as_user('11111111-1111-1111-1111-111111111111');
do $$
begin
  insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
  values ('11111111-1111-1111-1111-111111111111', 'five', 'gpt-5', 1, 1, 0.1);
  raise exception 'FAILED: the shipped cap failed open without a SELECT policy';
exception
  when insufficient_privilege then
    raise notice '  ok: the shipped cap still holds with no SELECT policy at all';
  when others then
    raise exception 'FAILED: unexpected % (%)', sqlerrm, sqlstate;
end $$;

\echo ''
\echo '== policy helpers are not reachable as REST RPCs =='
-- Found only by deploying: PostgREST exposes every function in `public`, and
-- both helpers are SECURITY DEFINER, so in `public` they bypassed RLS and let
-- anyone with the anon key read any user's tier and saved-estimate count.
select test_reset();

select assert(
  not test_is_rpc_reachable('private.current_tier(uuid)', 'anon'),
  'current_tier is not callable by anon over REST'
);
select assert(
  not test_is_rpc_reachable('private.saved_estimate_count(uuid)', 'anon'),
  'saved_estimate_count is not callable by anon over REST'
);
select assert(
  not test_is_rpc_reachable('public.handle_new_user()', 'anon'),
  'the sign-up trigger function is not callable over REST'
);
select assert(
  not test_is_rpc_reachable('public.lock_profile_managed_columns()', 'anon'),
  'the column-lock trigger function is not callable over REST'
);
select assert(
  not test_is_rpc_reachable('private.new_public_id()', 'anon'),
  'the public_id generator is not callable over REST'
);
select assert(
  test_is_rpc_reachable('public.get_shared_estimate(text)', 'anon'),
  'the share-link lookup stays callable, which is its job'
);
-- The policies still work, which is the other half of moving them.
select assert(
  has_function_privilege('authenticated', 'private.current_tier(uuid)', 'EXECUTE'),
  'and authenticated can still execute them from inside a policy'
);

\echo ''
\echo '== the public account reference =='
-- A support identifier a user could change is one support cannot trust, and one
-- a user could choose is one they could impersonate another with. Both paths
-- are closed here rather than only in the form.
select test_reset();

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com', '{"full_name":"Carol Danvers"}');

select assert(
  (select count(*) from public.profiles where public_id is null) = 0,
  'every profile has a public_id'
);
select assert(
  (select count(distinct public_id) from public.profiles) = (select count(*) from public.profiles),
  'and no two share one'
);
select assert(
  (select public_id from public.profiles where id = '33333333-3333-3333-3333-333333333333')
    ~ '^TT-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$',
  'it reads as TT-XXXXX-XXXXX over an alphabet with no I, L, O or U'
);
select assert(
  (select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 'Carol',
  'the opening display name is the first word of the full name'
);

select test_as_user('33333333-3333-3333-3333-333333333333');

do $$
declare
  before_id text;
  after_id  text;
begin
  select public_id into before_id from public.profiles
   where id = '33333333-3333-3333-3333-333333333333';

  update public.profiles set public_id = 'TT-00000-00000'
   where id = '33333333-3333-3333-3333-333333333333';

  select public_id into after_id from public.profiles
   where id = '33333333-3333-3333-3333-333333333333';

  perform assert(after_id = before_id, 'a user cannot rewrite their own public_id');
end;
$$;

-- The same write that is reverted above must still carry the editable columns
-- through, or the lock would have made the form useless.
update public.profiles
   set full_name = 'Carol Danvers', display_name = 'Cap', phone = '+44 20 7946 0958', country = 'GB'
 where id = '33333333-3333-3333-3333-333333333333';

select assert(
  (select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 'Cap',
  'but can edit their display name'
);
select assert(
  (select phone || ' ' || country from public.profiles where id = '33333333-3333-3333-3333-333333333333')
    = '+44 20 7946 0958 GB',
  'and their phone and country'
);

do $$
begin
  begin
    update public.profiles set country = 'gb'
     where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAILED: a lowercase country code was accepted';
  exception when check_violation then
    raise notice '  ok: country must be an uppercase ISO 3166-1 alpha-2 code';
  end;

  begin
    update public.profiles set phone = 'call me'
     where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAILED: a non-numeric phone number was accepted';
  exception when check_violation then
    raise notice '  ok: the phone column holds something dialable or nothing';
  end;
end;
$$;

select test_as_service();
select assert(
  (select tier from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 'free',
  'and none of that touched the tier'
);

\echo ''
\echo '== a cancelled subscription expires without waiting for a webhook =='
-- The webhook leaves the tier alone when Lemon Squeezy says "cancelled",
-- because the customer has paid to the end of the period. If the expiry event
-- is then missed, only the database stops the entitlement.
select test_reset();

insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'dana@example.com', '{"full_name":"Dana"}');

select test_as_service();
insert into public.subscriptions (lemon_subscription_id, user_id, tier, status, current_period_end)
values ('sub_dana', '44444444-4444-4444-4444-444444444444', 'pro', 'active', timezone('utc', now()) + interval '10 days');

select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'pro',
  'an active subscription enforces its tier'
);
select assert(
  (select tier from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 'pro',
  'and the profile cache follows it without anyone writing the column'
);

update public.subscriptions set status = 'cancelled' where lemon_subscription_id = 'sub_dana';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'pro',
  'a cancellation keeps the tier until the paid period ends'
);

update public.subscriptions set current_period_end = timezone('utc', now()) - interval '1 minute'
 where lemon_subscription_id = 'sub_dana';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'free',
  'and drops it the moment that period is over, with no event needed'
);

-- The narrow part: a paying customer is not locked out by a renewal webhook we
-- have not processed yet.
update public.subscriptions
   set status = 'active', current_period_end = timezone('utc', now()) - interval '1 day'
 where lemon_subscription_id = 'sub_dana';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'pro',
  'an overdue renewal on an active subscription does not revoke access'
);

-- Dunning: the card is retried for days, and a first failure is not a reason
-- to take the product away.
update public.subscriptions set status = 'past_due' where lemon_subscription_id = 'sub_dana';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'pro',
  'nor does a payment still being retried'
);

-- And both policies read that function, so the free-tier cap comes back with it.
update public.subscriptions
   set status = 'cancelled', current_period_end = timezone('utc', now()) - interval '1 day'
 where lemon_subscription_id = 'sub_dana';

select test_as_user('44444444-4444-4444-4444-444444444444');

insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
select '44444444-4444-4444-4444-444444444444', 'lapsed ' || i, 'gpt-5', 10, 10, 0.001
  from generate_series(1, 3) as i;

do $$
begin
  insert into public.saved_estimates (user_id, project_title, model_id, input_tokens, output_tokens, estimated_cost_usd)
  values ('44444444-4444-4444-4444-444444444444', 'the fourth', 'gpt-5', 10, 10, 0.001);
  raise exception 'FAILED: a lapsed Pro account was still treated as Pro by the save cap';
exception
  when insufficient_privilege then
    raise notice '  ok: the free-tier save cap applies again once the tier lapses';
  when others then
    raise exception 'FAILED: unexpected % (%)', sqlerrm, sqlstate;
end $$;

\echo ''
\echo '== an account with two subscriptions gets the better of them =='
-- The whole point of 0007. Before it, a profile held one subscription id, so
-- the second purchase overwrote the first and whichever event arrived last
-- decided the tier.
select test_as_service();
delete from public.saved_estimates where user_id = '44444444-4444-4444-4444-444444444444';
delete from public.subscriptions where user_id = '44444444-4444-4444-4444-444444444444';

insert into public.subscriptions (lemon_subscription_id, user_id, tier, status, current_period_end) values
  ('sub_dana_pro',  '44444444-4444-4444-4444-444444444444', 'pro',  'active', timezone('utc', now()) + interval '20 days'),
  ('sub_dana_team', '44444444-4444-4444-4444-444444444444', 'team', 'active', timezone('utc', now()) + interval '10 days');

select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'team',
  'holding Pro and Team enforces Team, not whichever was written last'
);
select assert(
  (select tier from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 'team',
  'and the profile cache agrees'
);

-- Cancelling the better one, mid-period, must not demote anybody yet.
update public.subscriptions set status = 'cancelled' where lemon_subscription_id = 'sub_dana_team';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'team',
  'cancelling Team still leaves Team until its period ends'
);

update public.subscriptions set current_period_end = timezone('utc', now()) - interval '1 hour'
 where lemon_subscription_id = 'sub_dana_team';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'pro',
  'and when it does end, the Pro subscription underneath is still theirs'
);
select assert(
  (select lemon_subscription_id from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 'sub_dana_pro',
  'the profile now points at the subscription actually granting the tier'
);

-- An event for a subscription of somebody else's must not move this account.
select assert(
  (select count(*) from public.subscriptions where user_id = '44444444-4444-4444-4444-444444444444') = 2,
  'both subscriptions are still recorded - nothing was overwritten'
);

delete from public.subscriptions where user_id = '44444444-4444-4444-4444-444444444444';
select assert(
  private.current_tier('44444444-4444-4444-4444-444444444444') = 'free'
    and (select tier from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 'free',
  'and with none left the account is free again'
);

\echo ''
\echo '== the billing columns are the webhook's to write, not the user's =='
select test_reset();
select test_as_service();

update public.profiles
   set renewal_amount_cents = 1200, renewal_currency = 'USD',
       card_brand = 'visa', card_last_four = '4242',
       lemon_variant_id = '2152668', lemon_variant_name = 'Pro Monthly'
 where id = '44444444-4444-4444-4444-444444444444';

select test_as_user('44444444-4444-4444-4444-444444444444');

update public.profiles
   set renewal_amount_cents = 1, renewal_currency = 'XXX',
       card_brand = 'mine', card_last_four = '0000',
       lemon_variant_name = 'Free forever',
       display_name = 'Dana'
 where id = '44444444-4444-4444-4444-444444444444';

select assert(
  (select renewal_amount_cents from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 1200,
  'a user cannot rewrite what they are charged'
);
select assert(
  (select card_last_four || ' ' || lemon_variant_name from public.profiles
    where id = '44444444-4444-4444-4444-444444444444') = '4242 Pro Monthly',
  'nor the card on file or the plan name'
);
select assert(
  (select display_name from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 'Dana',
  'while the editable columns in the same statement still go through'
);

select test_as_service();
do $$
begin
  begin
    update public.profiles set renewal_currency = 'usd'
     where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAILED: a lowercase currency was accepted';
  exception when check_violation then
    raise notice '  ok: the currency is ISO 4217, uppercase';
  end;

  begin
    update public.profiles set card_last_four = '4242424242'
     where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAILED: a full card number shape was accepted';
  exception when check_violation then
    raise notice '  ok: only four digits can be stored for the card';
  end;
end;
$$;

\echo ''
\echo '== the browser can hear about its own billing changes =='
-- The channel in useSubscription sat connected and silent because the
-- publication was empty, so a customer who had just paid still saw an active
-- Upgrade button. Realtime applies RLS per subscriber, so publishing the table
-- exposes each user's own row and nothing else - the policy is the boundary,
-- not the client's filter.
select assert(
  exists (
    select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
     where p.pubname = 'supabase_realtime'
       and n.nspname = 'public'
       and c.relname = 'profiles'
  ),
  'profiles is published to supabase_realtime'
);
select assert(
  not exists (
    select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
     where p.pubname = 'supabase_realtime'
       and n.nspname = 'public'
       and c.relname = 'billing_events'
  ),
  'and the billing ledger is not - it has no reader and no policy'
);

\echo ''
\echo '== an empty claims string does not break profile updates =='
-- current_setting(..., true) returns '' rather than NULL when the GUC is set
-- empty. The first version of the guard only tested for NULL, reached
-- ''::jsonb and raised, so every UPDATE on profiles in such a session failed.
select test_reset();
select set_config('request.jwt.claims', '', false);

do $$
begin
  update public.profiles set full_name = 'Still Works'
   where id = '11111111-1111-1111-1111-111111111111';
  raise notice '  ok: an empty claims string is treated as no claims, not an error';
exception when others then
  raise exception 'FAILED: empty claims raised % (%)', sqlerrm, sqlstate;
end $$;

do $$
begin
  perform set_config('request.jwt.claims', 'not json at all', false);
  update public.profiles set tier = 'team'
   where id = '11111111-1111-1111-1111-111111111111';
  if (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'team' then
    raise exception 'FAILED: unparseable claims were treated as service_role';
  end if;
  raise notice '  ok: unparseable claims fail closed - the tier is still locked';
end $$;

\echo ''
\echo '== the profile trigger handles OAuth metadata, not just the sign-up form =='
select test_reset();

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-0000-0000-0000-000000000001', 'form@example.invalid',   '{"full_name":"Form Person"}'),
  ('99999999-0000-0000-0000-000000000002', 'oauth@example.invalid',  '{"name":"OAuth Person","avatar_url":"https://x/y.png"}'),
  ('99999999-0000-0000-0000-000000000003', 'bare@example.invalid',   '{}');

select assert(
  (select full_name from public.profiles where email = 'form@example.invalid') = 'Form Person',
  'an email sign-up keeps the name it submitted'
);
select assert(
  (select full_name from public.profiles where email = 'oauth@example.invalid') = 'OAuth Person',
  'a Google-style provider sending only `name` still gets a name'
);
select assert(
  (select full_name from public.profiles where email = 'bare@example.invalid') = 'bare',
  'and a provider sending no name at all falls back to the email local part'
);

select test_reset();

\echo ''
\echo '== every function we define resolves its names from a fixed path =='

-- Migration 0007 shipped two helpers without SET search_path, and nothing here
-- noticed; the Supabase linter did, later. A function without one resolves its
-- names using whatever path its caller has, and several of these are called
-- from SECURITY DEFINER code, so the resolution happens as the owner. This is
-- the assertion that would have caught it.
select assert(
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prokind = 'f'
       -- Extensions bring their own functions and are not ours to re-declare.
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'
       )
       -- assert() and test_* are this suite's own scaffolding, created by the
       -- shim and by this file. They exist only in the throwaway database and
       -- ship to no environment.
       and p.proname <> 'assert'
       and p.proname not like 'test\_%'
       and (p.proconfig is null or not exists (
         select 1 from unnest(p.proconfig) as c
          where c like 'search_path=%'
       ))
  ),
  'every function in public and private pins its search_path'
);

-- pg_temp is writable by any signed-in user, so a definer function that names
-- it is trusting a schema its callers control. Postgres only searches pg_temp
-- for functions and operators when it is named, so the fix is to leave it out.
select assert(
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prosecdef
       and p.proname in ('subscription_is_live', 'tier_rank')
       and exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) as c
          where c like '%pg_temp%'
       )
  ),
  'the helpers current_tier calls do not search pg_temp'
);

\echo ''
\echo 'All RLS assertions passed.'
