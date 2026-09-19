# Backend setup

The app runs without any of this — the token counter and cost dashboard are
entirely client-side. Follow these steps only when you want accounts, saved
estimates and paid tiers.

## 1. Database

Create a Supabase project, then run `migrations/0001_init.sql` in the SQL editor
(or `supabase db push` if you use the CLI).

It creates `profiles`, `saved_estimates` and `billing_events`, enables row level
security on all three, and installs the triggers described below.

### What the schema does that the draft SQL in the blueprint did not

| Change | Why |
|---|---|
| Free-tier save cap moved into a `SECURITY DEFINER` function | A subquery over `saved_estimates` inside a policy *on* `saved_estimates` makes Postgres re-apply that table's policies to the subquery and abort with `infinite recursion detected in policy for relation`. |
| Sharing goes through the `shared_estimates` view | `using (auth.uid() = user_id or is_public = true)` on the base table exposes every column of a shared row, prompt excerpt included. Sharing a cost figure should not publish the prompt. |
| `lock_profile_billing_columns` trigger | Nothing otherwise stops a client writing its own `tier`. RLS grants no such UPDATE today, but a future policy could, and the mistake would be silent and total. |
| `billing_events` ledger | The blueprint's webhook called itself idempotent while storing nothing. Lemon Squeezy retries on any non-2xx, so retries are expected. |
| UPDATE and DELETE policies on `saved_estimates` | Users could otherwise create estimates but never remove them. |
| `shared_estimates` is not granted to `anon`; access goes through `get_shared_estimate(slug)` | A blanket `grant select` lets anyone holding the anon key run `select * from shared_estimates` and dump every shared row. A share link is meant to be unlisted, and a project title is user-supplied text that may name a client. |
| `is_public` gated on the Team tier in the UPDATE policy | Sharing is a paid entitlement; hiding the button is not enforcement. |

### Verifying RLS

After running the migration, confirm the isolation holds:

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
