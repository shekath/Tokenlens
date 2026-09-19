# Backend setup

The app runs without any of this — the token counter and cost dashboard are
entirely client-side. Follow these steps only when you want accounts, saved
estimates and paid tiers.

## 1. Database

Project `iashboyuhcbhsrvkfsuk`. Apply the schema either way:

```bash
# From a machine that can reach Supabase:
./supabase/apply.sh 'postgresql://postgres:<password>@db.iashboyuhcbhsrvkfsuk.supabase.co:5432/postgres'
```

or paste `migrations/0001_init.sql` into the dashboard's SQL editor. Every
statement is idempotent, so re-running is safe.

`apply.sh` then verifies: the three tables exist, RLS is on for each, the
policies are present, and `shared_estimates` carries no direct grant to `anon`
or `authenticated` (access goes through `get_shared_estimate`).

### The MCP server

`.mcp.json` in the repository root registers Supabase's hosted MCP server for
this project, so a local Claude Code session picks it up and can drive the
project directly after authenticating.

Note that it cannot be used from a Claude Code **web/cloud** session: that
sandbox's egress policy denies `mcp.supabase.com`, `supabase.com`,
`api.supabase.com` and `*.supabase.co` alike, and the Postgres ports (5432,
6543) are not reachable either. The offline suite below exists precisely so the
schema can still be exercised there.

It creates `profiles`, `saved_estimates` and `billing_events`, enables row level
security on all three, and installs the triggers described below.

### What the schema does that the draft SQL in the blueprint did not

| Change | Why |
|---|---|
| Free-tier save cap counts through a `SECURITY DEFINER` function | The draft's plain subquery works, but **fails open**: it runs under the table's own SELECT policy, so tightening or dropping that policy silently returns a count of 0 and the cap stops applying — a free account then saves without limit and nothing errors. Counting outside RLS makes the cap independent of how rows are read. |
| Sharing goes through the `shared_estimates` view | `using (auth.uid() = user_id or is_public = true)` on the base table exposes every column of a shared row, prompt excerpt included. Sharing a cost figure should not publish the prompt. |
| `lock_profile_billing_columns` trigger | Nothing otherwise stops a client writing its own `tier`. RLS grants no such UPDATE today, but a future policy could, and the mistake would be silent and total. |
| `billing_events` ledger | The blueprint's webhook called itself idempotent while storing nothing. Lemon Squeezy retries on any non-2xx, so retries are expected. |
| UPDATE and DELETE policies on `saved_estimates` | Users could otherwise create estimates but never remove them. |
| `shared_estimates` is not granted to `anon`; access goes through `get_shared_estimate(slug)` | A blanket `grant select` lets anyone holding the anon key run `select * from shared_estimates` and dump every shared row. A share link is meant to be unlisted, and a project title is user-supplied text that may name a client. |
| `is_public` gated on the Team tier in the UPDATE policy | Sharing is a paid entitlement; hiding the button is not enforcement. |

### Running the tests

```bash
./supabase/tests/run.sh          # needs any PostgreSQL 14+, not Supabase itself
```

`tests/00_supabase_shim.sql` supplies the pieces the migration leans on — the
`auth` schema, `auth.uid()`, and the `anon` / `authenticated` / `service_role`
roles — so the schema can be applied and exercised against a plain PostgreSQL
instance. `tests/01_rls.sql` then asserts the security properties:

- a profile row is created on sign-up, on the free tier;
- one user cannot read another's estimates or profile;
- a client's `UPDATE ... SET tier` is accepted but reverted by the trigger,
  while a display-name change still lands;
- the service role is exempt, as the webhook needs;
- the free cap admits three saves and refuses the fourth; Pro is uncapped;
- Pro cannot publish a share link; Team can, and a slug is minted;
- `anon` cannot enumerate `shared_estimates`, can fetch exactly one row when it
  holds the slug, and the view exposes no prompt text, metadata or owner id;
- the draft cap fails open when the SELECT policy is dropped; this one does not.

### Verifying against a live project

After running the migration on a real project, the same checks by hand:

```sql
-- As user A, with user B's id substituted:
select * from public.saved_estimates where user_id = '<user-b-id>';  -- expect 0 rows
update public.profiles set tier = 'team' where id = auth.uid();       -- succeeds, but
select tier from public.profiles where id = auth.uid();               -- still 'free'
```

The second pair is the important one: the UPDATE is permitted (users may change
their display name) and the trigger silently reverts the billing columns.

## 2. Edge function

```bash
supabase functions deploy lemon-webhook --no-verify-jwt
supabase secrets set LEMON_SQUEEZY_WEBHOOK_SECRET=...
supabase secrets set LEMON_TEAM_VARIANT_IDS=123456          # your Team variant ids
```

`--no-verify-jwt` is required: Lemon Squeezy signs with HMAC and does not carry a
Supabase JWT, so the platform's own auth must be off and the function verifies
the signature itself.

## 3. Lemon Squeezy

1. Create a product with variants `Pro Monthly` ($12), `Pro Annual` ($99) and
   `Team Monthly` ($39).
2. Point a webhook at
   `https://<project>.supabase.co/functions/v1/lemon-webhook`, subscribed to the
   `subscription_*` events, and copy the signing secret into the secret above.
3. Put the variant ids into the `VITE_LEMON_VARIANT_*` variables.

The checkout URL is built with `checkout[custom][user_id]`. That field is how the
webhook finds the account to upgrade — without it a payment succeeds and nobody
is provisioned, which is why the function returns 400 rather than 200 when it is
missing.

## 4. Test the loop

In Lemon Squeezy test mode, complete a checkout and confirm:

- a row appears in `billing_events` (the id is `event:subscription:<body hash>`,
  so a redelivery matches and a genuinely new event never does);
- `profiles.tier` for that user becomes `pro` (or `team`);
- the UI unlocks without a reload — the app subscribes to changes on its own
  profile row;
- replaying the same webhook delivery returns `{"received":true,"duplicate":true}`
  and changes nothing.
