# Backend setup

The app runs without any of this — the token counter and cost dashboard are
entirely client-side. Follow these steps only when you want accounts, saved
estimates and paid tiers.

## Deployed

Project **Tokenticks Shk** (`iashboyuhcbhsrvkfsuk`), region `ap-northeast-2`,
PostgreSQL 17. API URL `https://iashboyuhcbhsrvkfsuk.supabase.co`.

Applied and verified against the live project:

- `migrations/0001_init.sql` — three tables, RLS on all of them, six policies,
  the helper and trigger functions
- Edge Function `lemon-webhook`, deployed with `verify_jwt` disabled (Lemon
  Squeezy signs with HMAC, not a Supabase JWT, so the function verifies itself)
- Supabase's security advisor: 6 findings at first apply, now 2, both
  accounted for (see below). Performance advisor: clean.
- All test rows removed afterwards; `auth.users`, `profiles`,
  `saved_estimates` and `billing_events` are all empty.

### Three bugs the live deployment found

None could surface offline, because each depends on something the local shim
does not have.

| Bug | Why it only showed up live |
|---|---|
| `current_tier()` and `saved_estimate_count()` leaked any user's tier and estimate count to anyone holding the public anon key | PostgREST publishes every function in `public` at `/rest/v1/rpc/`, and both were `SECURITY DEFINER`, so they bypassed RLS. There is no PostgREST in the offline shim. Fixed by moving both to a `private` schema PostgREST does not expose. |
| Publishing a share link failed with `function gen_random_bytes does not exist` | Supabase installs pgcrypto into `extensions`, not `public`, and the function's `search_path` is pinned to `public`. Locally pgcrypto lands in `public`, so it resolved. Fixed by building the slug from core `gen_random_uuid()` / `encode` / `decode` — no extension, and 128 bits instead of 72. |
| Every `UPDATE` on `profiles` failed in a session where `request.jwt.claims` was the empty string | `current_setting(..., true)` returns `''`, not `NULL`, so the old NULL-only guard reached `''::jsonb` and raised. The offline suite always set valid claims before touching `profiles`. Fixed, and unparseable claims now fail closed. |

All three are covered by the offline suite now, so they cannot regress.

### The two remaining advisor findings

- `public.get_shared_estimate(text)` is anon-callable **by design** — it is the
  share-link lookup and returns one row only to a caller holding a 128-bit
  slug. Supabase's linter flags every anon-callable `SECURITY DEFINER`
  function; this one is intentional.
- `public.rls_auto_enable()` is **not from this project**. It backs an event
  trigger named `ensure_rls` that auto-enables RLS on newly created tables — a
  useful safety net, left alone deliberately. It returns `event_trigger`, which
  cannot be invoked as an ordinary function, so the RPC exposure is nominal.
- `billing_events` has RLS enabled with no policies (INFO). That is the
  intended configuration: deny-all for everyone except the service role, which
  bypasses RLS.

## Applying to a fresh project

```bash
./supabase/apply.sh 'postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
```

or paste `migrations/0001_init.sql` into the dashboard SQL editor. Every
statement is idempotent, so re-running is safe.

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
