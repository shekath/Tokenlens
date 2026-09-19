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

\echo ''
\echo '== free-tier save cap =='
-- Back to free so the cap applies.
select test_as_service();
update public.profiles set tier = 'free' where id = '11111111-1111-1111-1111-111111111111';
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
update public.profiles set tier = 'pro' where id = '11111111-1111-1111-1111-111111111111';
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
update public.profiles set tier = 'team' where id = '11111111-1111-1111-1111-111111111111';
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
update public.profiles set tier = 'free' where id = '11111111-1111-1111-1111-111111111111';
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
  not test_is_rpc_reachable('public.lock_profile_billing_columns()', 'anon'),
  'the billing-lock trigger function is not callable over REST'
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

select test_reset();
\echo ''
\echo 'All RLS assertions passed.'
