#!/usr/bin/env bash
# Applies the migration to a throwaway PostgreSQL database and runs the
# behavioural security tests against it.
#
#   ./supabase/tests/run.sh
#
# Needs a reachable PostgreSQL 14+ — Supabase itself is not required, because
# 00_supabase_shim.sql supplies the auth schema, auth.uid() and the
# anon / authenticated / service_role roles. Override the connection with
# PGHOST / PGPORT / PGUSER.
set -euo pipefail

export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-5433}"
export PGUSER="${PGUSER:-postgres}"
DB="${DB:-tokenticks_test_$$}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() { psql -q -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql -q -d postgres -c "create database \"$DB\";"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$here/00_supabase_shim.sql" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$here/../migrations/0001_init.sql" >/dev/null

# ON_ERROR_STOP makes psql exit non-zero on a raised assertion, and `set -e`
# turns that into a failed run. Assertions announce themselves via NOTICE on
# stderr, so both streams are kept.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$here/01_rls.sql" 2>&1 |
  grep -E '  ok:|FAILED|ERROR|^==|^All RLS'

echo
echo "PASS — every assertion in 01_rls.sql held."
