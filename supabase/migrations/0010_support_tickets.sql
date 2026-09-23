-- In-app support requests.
--
-- The mailto: link this replaces for signed-in users fails silently on any
-- machine with no mail client configured - a Chromebook, a locked-down work
-- laptop, anyone living in webmail. The click does nothing, and neither side
-- ever learns a request was attempted. A row in a table cannot fail that way.
--
-- Signed-out users keep the mailto, deliberately: an anonymous insert is a
-- spam endpoint needing a captcha, and the case that most needs support -
-- "I cannot sign in" - is exactly the one a form behind sign-in cannot serve.
--
-- Support is not gated by tier. The tier is recorded so the queue can be
-- ordered by it: "priority support" means answered first, not reachable only
-- if you pay.

create table if not exists public.support_tickets (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  subject     text not null check (length(btrim(subject)) between 3 and 200),
  message     text not null check (length(btrim(message)) between 10 and 5000),

  -- Snapshots, not joins. The plan and the account reference at the moment of
  -- asking are what the ticket is about; both will have moved on by the time
  -- anyone reads it, and a ticket that silently re-labels itself as the
  -- customer upgrades is a ticket you cannot reason about.
  tier        public.user_tier not null,
  public_id   text not null,

  -- Build, browser, viewport. Whatever narrows a rendering bug without another
  -- round of email. Shown to the sender before they submit.
  context     jsonb not null default '{}'::jsonb,

  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists support_tickets_user_created_idx
  on public.support_tickets (user_id, created_at desc);

-- Open tickets first, newest first: the queue as it is actually worked.
create index if not exists support_tickets_triage_idx
  on public.support_tickets (status, created_at desc);

-- How many this account has raised in the last day. SECURITY DEFINER so the
-- rate-limit policy can count rows the caller is allowed to see anyway, and
-- pinned search_path for the reason migration 0008 spells out.
create or replace function private.recent_ticket_count(uid uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
    from public.support_tickets t
   where t.user_id = uid
     and t.created_at > timezone('utc', now()) - interval '24 hours';
$$;

-- The policy below is evaluated as the CALLING role, so that role must be able
-- to execute this - revoking it makes every insert fail with "permission denied
-- for function recent_ticket_count" rather than enforcing anything. Same grant
-- as private.saved_estimate_count, which backs the save cap for the same reason.
revoke all on function private.recent_ticket_count(uuid) from public;
grant execute on function private.recent_ticket_count(uuid) to anon, authenticated, service_role;

alter table public.support_tickets enable row level security;

drop policy if exists "Users read own tickets" on public.support_tickets;
create policy "Users read own tickets"
  on public.support_tickets for select
  using ((select auth.uid()) = user_id);

-- The rate limit lives here rather than in a handler, for the same reason the
-- saved-estimate cap does: a policy cannot be forgotten, bypassed by a second
-- caller, or raced. Five a day is generous for a person and useless for a
-- script.
drop policy if exists "Own tickets, five a day" on public.support_tickets;
create policy "Own tickets, five a day"
  on public.support_tickets for insert
  with check (
    (select auth.uid()) = user_id
    and private.recent_ticket_count((select auth.uid())) < 5
  );

-- Nobody edits a ticket from the client. Status is support's to set, and a
-- message the sender can rewrite after the fact is not a record of anything.
revoke update, delete on public.support_tickets from anon, authenticated;
