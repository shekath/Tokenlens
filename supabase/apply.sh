#!/usr/bin/env bash
# Applies the schema to a live Supabase project and verifies it.
#
#   ./supabase/apply.sh 'postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
#
# The connection string is on the Supabase dashboard under
# Project Settings -> Database -> Connection string -> URI. It contains the
# database password, so pass it as an argument or in DATABASE_URL and do not
# commit it.
#
# Safe to re-run: every statement in the migration is idempotent.
set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 <postgres-connection-uri>" >&2
  echo "   or: DATABASE_URL=... $0" >&2
  exit 2
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Applying migration"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$here/migrations/0001_init.sql"

echo "==> Verifying"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<'SQL'
select 'tables:      ' || string_agg(tablename, ', ' order by tablename)
  from pg_tables
 where schemaname = 'public'
   and tablename in ('profiles', 'saved_estimates', 'billing_events');

select 'rls enabled: ' || string_agg(relname || '=' || relrowsecurity::text, ', ' order by relname)
  from pg_class
 where relname in ('profiles', 'saved_estimates', 'billing_events');

select 'policies:    ' || count(*)::text from pg_policies where schemaname = 'public';

select 'view grants: ' || coalesce(
         nullif(string_agg(distinct grantee, ', '), ''),
         'none (correct - access is via get_shared_estimate)')
  from information_schema.role_table_grants
 where table_name = 'shared_estimates' and grantee in ('anon', 'authenticated');
SQL

cat <<'NOTE'

==> Next
  1. supabase functions deploy lemon-webhook --no-verify-jwt
  2. supabase secrets set LEMON_SQUEEZY_WEBHOOK_SECRET=...
     supabase secrets set LEMON_TEAM_VARIANT_IDS=<team variant ids>
  3. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as GitHub repository
     Variables (Settings -> Secrets and variables -> Actions -> Variables).
     Use the anon key, never the service-role key.

To exercise the policies without touching this project, run the offline suite:
  ./supabase/tests/run.sh
NOTE
