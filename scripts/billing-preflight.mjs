/**
 * What is and is not configured for billing.
 *
 *   node scripts/billing-preflight.mjs            # checks .env
 *   node scripts/billing-preflight.mjs dist       # checks a built bundle
 *
 * Two halves of the Lemon Squeezy setup live in different places and have to
 * agree: the browser builds a checkout link from VITE_LEMON_VARIANT_*, and the
 * Edge Function decides which tier to grant from LEMON_PRO_VARIANT_IDS and
 * LEMON_TEAM_VARIANT_IDS. Nothing connects them until a real payment does, and
 * by then someone has been charged.
 *
 * This checks the half that is checkable from here - the browser half - and
 * prints the values to compare against the function secrets, which are not
 * readable by design. Exit 1 if the client half is incomplete.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KEYS = [
  'VITE_LEMON_CHECKOUT_URL',
  'VITE_LEMON_VARIANT_PRO_MONTHLY',
  'VITE_LEMON_VARIANT_PRO_ANNUAL',
  'VITE_LEMON_VARIANT_TEAM_MONTHLY',
];

const OPTIONAL = new Set(['VITE_LEMON_VARIANT_PRO_ANNUAL']);

const target = process.argv[2];
const found = {};

if (target) {
  // A built bundle: the values are inlined as string literals, so read them
  // back out of the JavaScript rather than trusting the environment that made
  // it. This is the only way to check what was actually shipped.
  const dir = join(target, 'assets');
  if (!existsSync(dir)) {
    console.error(`No ${dir}. Run npm run build first.`);
    process.exit(1);
  }
  const js = readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

  // The variant ids are read through a computed key (the plan says which one),
  // which Vite cannot resolve statically, so it inlines the whole import.meta
  // .env object instead - names and all. Every VITE_ value is in there, which
  // is what makes a shipped bundle checkable by name at all.
  for (const m of js.matchAll(/(VITE_LEMON_[A-Z_]+)"?\s*:\s*"([^"]*)"/g)) {
    if (m[2]) found[m[1]] = m[2];
  }

  // Fall back to shape for the checkout base. It is also read as a static
  // import.meta.env.X, which Vite replaces with a bare literal, so on a build
  // where the env object did not survive this is the only trace of it. Reading
  // by name first matters: by shape alone, a value that is merely WRONG is
  // indistinguishable from one that is absent, and those need different fixes.
  if (!found.VITE_LEMON_CHECKOUT_URL) {
    const checkout = js.match(/https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\/[\w\/-]*/i);
    found.VITE_LEMON_CHECKOUT_URL = checkout ? checkout[0] : '';
  }
} else {
  const envPath = existsSync('.env') ? '.env' : null;
  if (!envPath) {
    console.error('No .env file. Copy .env.example and fill it in, or pass a built directory.');
    process.exit(1);
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && KEYS.includes(m[1])) found[m[1]] = m[2].trim();
  }
}

let missing = 0;
console.log('Browser half (checkout links)\n');

let wrongKind = 0;

for (const key of KEYS) {
  const value = found[key] ?? '';
  const placeholder = /your-store|your-project|^$/.test(value);
  const ok = !placeholder;
  if (!ok && !OPTIONAL.has(key)) missing += 1;

  // An all-digits variant is the webhook's id pasted into the browser's slot.
  // The checkout link needs the UUID; the number produces a 404 on Lemon
  // Squeezy's own domain, after the customer has decided to pay.
  const numeric = ok && key.startsWith('VITE_LEMON_VARIANT') && /^\d+$/.test(value);
  if (numeric) wrongKind += 1;

  // The app appends /<variant-uuid> to this, so it has to be the checkout base
  // and not the store root or a whole checkout link with a variant already on
  // the end.
  const badBase =
    ok && key === 'VITE_LEMON_CHECKOUT_URL' && !/\/checkout\/buy\/?$/.test(value);
  if (badBase) wrongKind += 1;

  const mark = numeric || badBase ? 'WRONG' : ok ? 'set  ' : OPTIONAL.has(key) ? 'unset' : 'MISSING';
  console.log(`  ${mark.padEnd(8)} ${key}${ok ? ` = ${value}` : ''}`);
  if (numeric) {
    console.log('           ^ that is the numeric webhook id; this slot needs the variant UUID');
  }
  if (badBase) {
    console.log('           ^ must end in /checkout/buy - the app appends /<variant-uuid>');
  }
}

console.log(`
Server half (which tier a purchase grants)

  These are Edge Function secrets and cannot be read from here. Set all three,
  on Supabase -> Edge Functions -> Secrets:

    LEMON_SQUEEZY_WEBHOOK_SECRET   the signing secret from the webhook
    LEMON_PRO_VARIANT_IDS          numeric ids of the Pro variants
    LEMON_TEAM_VARIANT_IDS         numeric ids of the Team variants

  Note the two different identifiers. A checkout link is built from the
  variant's share id above; a webhook reports attributes.variant_id as a
  number. They are not interchangeable, and a variant in neither list is
  refused with a 500 that names it - visible in Lemon Squeezy's own delivery
  log, which is how you find the number if you set the wrong one.
`);

if (wrongKind) {
  console.error(
    `${wrongKind} value${wrongKind === 1 ? ' is' : 's are'} set but wrong (see WRONG above). ` +
      'A checkout link ends in the variant UUID - the last path segment of "Copy checkout URL" ' +
      'in Lemon Squeezy - and the base must end in /checkout/buy. The numeric ids belong in ' +
      'LEMON_PRO_VARIANT_IDS / LEMON_TEAM_VARIANT_IDS instead.',
  );
}
if (missing) {
  console.error(`${missing} required value${missing === 1 ? '' : 's'} missing.`);
}
if (missing || wrongKind) process.exit(1);
console.log('Browser half complete.');
