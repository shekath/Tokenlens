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
- `migrations/0002_backfill_profile_names.sql` — names for rows created before
  the sign-up trigger read OAuth metadata
- `migrations/0003_profile_details.sql` — the profile fields a user can edit
  (display name, phone, country) and the one they cannot (`public_id`)

The migration records stored in the project carry the same statements with
abbreviated comments; the files in this directory are the canonical version.
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

## Google sign-in

The app offers "Continue with Google" alongside email/password and magic link.
Two pieces of configuration make it work; without them the button appears and
Supabase returns `provider is not enabled`.

**1. Google Cloud Console** — APIs & Services → Credentials → Create OAuth
client ID → Web application. Under *Authorized redirect URIs* add exactly:

```
https://iashboyuhcbhsrvkfsuk.supabase.co/auth/v1/callback
```

That is Supabase's callback, not the app's URL — Google redirects to Supabase,
which then redirects to the app. Copy the client ID and secret.

**2. Supabase dashboard** — Authentication → Providers → Google → enable, paste
the client ID and secret.

**3. Supabase dashboard** — Authentication → URL Configuration. This is a
separate allow list from Google's, and it decides where the user lands *after*
Supabase has signed them in:

| Field | Value |
| --- | --- |
| Site URL | `https://shekath.github.io/Tokenlens/` |
| Redirect URLs | `https://shekath.github.io/Tokenlens/**`, `http://localhost:5173/**` |

The app asks to return to `window.location.origin + BASE_URL`, which is
`https://shekath.github.io/Tokenlens/` in a production build and
`http://localhost:5173/` in dev — one value per deployment, whatever page the
user signed in from.

### When sign-in silently does nothing

Step 3 fails quietly, which makes it worth knowing how to check. Supabase does
not reject an un-allow-listed redirect; it substitutes the Site URL. The
sign-in works, the account is created, and the one-time code is handed to a
page that cannot spend it — on a fresh project, `http://localhost:3000`, which
on a phone is nothing at all.

What that looks like in the database: a user row and an identity row exist, and
`auth.sessions` and `auth.refresh_tokens` are empty. The flow's recorded
destination is the proof:

```sql
select created_at, authentication_method, referrer, auth_code_issued_at
  from auth.flow_state order by created_at desc limit 5;
```

`referrer` is where the browser was actually sent. If it reads
`http://localhost:3000` while the app asked for the Pages URL, the redirect was
not on the allow list — the substitution has already happened, and no amount of
retrying from the app will change it. Fix step 3 and sign in again; the config
reloads within seconds (`auth_logs` records "reloading api with new
configuration").

The app now says so too: landing back with a code that produces no session
raises "Sign-in did not complete" rather than rendering a signed-out page. That
only helps when the browser makes it back, though — a redirect to localhost
never reaches the app at all.

## Lemon Squeezy

Lemon Squeezy is the merchant of record: it takes the payment, charges the
right sales tax in the buyer's country and remits it. Nothing in this repo
touches a card number, and no price lives in the database - `src/lib/
entitlements.ts` is the only place a price is written down, and Lemon Squeezy
is the only place one is charged.

### What grants a tier

```
browser                     Lemon Squeezy                  Edge Function
───────                     ─────────────                  ─────────────
checkout link built from    hosted checkout,               webhook, HMAC-signed
VITE_LEMON_VARIANT_*        card + tax                     LEMON_*_VARIANT_IDS
  + checkout[custom]                                         ↓
    [user_id]  ────────────────────────────────────────►  profiles.tier
```

The two ends use **different identifiers for the same variant**, which is the
easiest thing here to get wrong:

| Where | Which id | Used for |
|---|---|---|
| `VITE_LEMON_VARIANT_*` | the variant's share id, from its checkout link | building the checkout URL |
| `LEMON_PRO_VARIANT_IDS` / `LEMON_TEAM_VARIANT_IDS` | the numeric `variant_id` | deciding which tier a payment grants |

A variant in neither server-side list is refused with a 500 whose body names
it — `variant 481516 is in neither LEMON_PRO_VARIANT_IDS nor
LEMON_TEAM_VARIANT_IDS` — which Lemon Squeezy shows in its own delivery log.
That is the intended way to discover the numeric id if the wrong value was
pasted. It is a 5xx rather than a 4xx on purpose: Lemon Squeezy retries, so
correcting the secret provisions the subscription without anyone re-paying.

The earlier version defaulted anything unrecognised to Pro. A Team purchase
made before `LEMON_TEAM_VARIANT_IDS` was set would have taken $39 and granted
$12 of product, silently.

### Setting it up

**1. Store and product.** lemonsqueezy.com → Stores → create one. Then
Products → New Product, subscription pricing, with three variants matching
`PLANS` in `src/lib/entitlements.ts`:

| Variant | Price | Interval |
|---|---|---|
| Pro Monthly | $12 | monthly |
| Pro Annual | $99 | yearly |
| Team Monthly | $39 | monthly |

A single-variant product hides its variant in the UI; with three there is a
variant list, and each row's "Share" link ends in the id the browser needs.

**2. Webhook.** Settings → Webhooks → add:

| Field | Value |
|---|---|
| URL | `https://iashboyuhcbhsrvkfsuk.supabase.co/functions/v1/lemon-webhook` |
| Signing secret | anything long and random — you set it, then paste the same value into Supabase |
| Events | `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_payment_failed` |

Any other event is acknowledged and ignored, so selecting more is harmless.

**3. Edge Function secrets.** Supabase → Edge Functions → Secrets:

```
LEMON_SQUEEZY_WEBHOOK_SECRET = <the signing secret from step 2>
LEMON_PRO_VARIANT_IDS        = <numeric id of Pro Monthly>,<numeric id of Pro Annual>
LEMON_TEAM_VARIANT_IDS       = <numeric id of Team Monthly>
```

**4. GitHub repository variables** (Settings → Secrets and variables →
Actions → Variables), then re-run the deploy workflow:

```
VITE_LEMON_CHECKOUT_URL         = https://<your-store>.lemonsqueezy.com/checkout/buy
VITE_LEMON_VARIANT_PRO_MONTHLY  = <share id of Pro Monthly>
VITE_LEMON_VARIANT_PRO_ANNUAL   = <share id of Pro Annual>
VITE_LEMON_VARIANT_TEAM_MONTHLY = <share id of Team Monthly>
```

`npm run billing-preflight -- dist` reads the built bundle and reports which of
those actually shipped. It cannot read the function secrets — nothing can, by
design — so it prints them to compare by eye.

**5. Test mode before live mode.** Lemon Squeezy's test mode issues real
webhooks for fake payments; card `4242 4242 4242 4242` with any future expiry.
Buy each of the three variants once and check the result:

```sql
select p.email, p.tier, p.subscription_status, p.current_period_end,
       b.event_name, b.created_at
  from public.profiles p
  left join public.billing_events b on b.payload->'meta'->'custom_data'->>'user_id' = p.id::text
 order by b.created_at desc;
```

A Team purchase showing `tier = 'pro'` means the variant lists are the wrong
way round. Nothing at all means the webhook never arrived — Lemon Squeezy's
delivery log has the response, and 401 means the signing secret does not match.

### What each event does

| Event | Effect |
|---|---|
| `subscription_created`, `subscription_updated`, `subscription_resumed`, `subscription_unpaused` | sets tier from the variant, records customer and subscription ids, records the period end |
| `subscription_cancelled` | marks it cancelled and records `ends_at` — **the tier is left alone** |
| `subscription_expired` | drops to free |
| `subscription_paused` | drops to free |
| `subscription_payment_failed` | marks past due; the tier is left alone while the card is retried |

Cancelling does not remove access, because Lemon Squeezy's `cancelled` means
"will not renew" and the customer has paid to `ends_at`. The tier drops at
`subscription_expired` — or, if that webhook is missed, at `current_period_end`
anyway, because `private.current_tier()` applies the deadline itself (migration
0004). Both halves of that rule are asserted: in SQL in
`supabase/tests/01_rls.sql`, and in the client's mirror of it in
`tests/billing.test.mjs`.

### Testing without charging a card

`tests/lemonWebhook.test.mjs` runs every branch — each event, each status,
unmapped variants, missing `user_id`, forged and truncated signatures — against
the payload shapes Lemon Squeezy sends. The decision logic lives in
`supabase/functions/lemon-webhook/decide.ts` with no Deno or network imports
precisely so it can be imported by a node test. The billing path is the one
part of this product that cannot be checked by using the product.

## The account reference

Every profile carries a `public_id` — `TT-XXXXX-XXXXX`, ten characters over
Crockford's base32 alphabet, which omits I, L, O and U so nothing is misread
aloud or in a screenshot. It is what the profile menu shows and what support
should ask for.

Why not the uuid primary key: that key appears in RLS policies, foreign keys
and the JWT, it is 36 characters to read out, and pasting one into a chat
window hands over the exact value other systems join on. The `public_id` is
short, unambiguous, and worth nothing to whoever sees it.

Three properties make it usable, and all three are enforced by the database
rather than by the form:

| Property | How |
|---|---|
| Generated by us | `private.new_public_id()`, from `gen_random_uuid()`; the column defaults to it and the sign-up trigger sets it |
| Unique | a unique constraint, plus a generate-and-check loop that gives up after eight collisions rather than looping forever |
| Not editable | `lock_profile_managed_columns()` reverts any write to it from a non-service-role session, and the TypeScript `Update` type omits it so the mistake does not compile |

`supabase/tests/01_rls.sql` asserts each of those, including that a signed-in
user updating their own row cannot change it while the editable columns in the
same statement still go through.

### Editable profile columns

`full_name`, `display_name`, `phone` and `country` are writable by the row's
owner under the existing update policy. Check constraints on the table define
what each accepts; `src/lib/profileFields.ts` mirrors them so the form can say
what is wrong before the round trip, and `tests/profileFields.test.mjs` reads
the migration and fails if the two ever drift apart.

`country` is self-declared and nothing bills or taxes off it — Lemon Squeezy is
the merchant of record and collects its own. `phone` is stored, not verified:
Supabase's own phone auth is a separate thing and is not enabled.

### Passwords

The Password tab calls `supabase.auth.updateUser({ password })`. Where the
account already has an email identity, the current password is required first
and checked with `signInWithPassword` — a live session is not proof that the
person at the keyboard is the account holder. An account created through Google
has no password to produce, so the same form sets a first one, which is what
makes the account reachable without Google afterwards.

### Account linking

Supabase links a Google identity to an existing account when the email matches
and the address is verified. Someone who signed up with a password and later
uses Google keeps one account and one profile row. Where that is not the case
the second sign-in creates a separate user, with its own profile and its own
tier — worth knowing before any support ticket about a "missing" subscription.

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
