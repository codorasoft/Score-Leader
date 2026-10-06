#!/usr/bin/env bash
# Rehearses the migrations that are not yet applied, plus the database rules tests, on the
# linked (live) Supabase database inside ONE transaction that always ends in ROLLBACK, so
# nothing is kept.
#
# Order: BEGIN; per-table row counts; pending migrations; row counts compared (raises on any
# difference); supabase/tests/tenancy.test.sql; ROLLBACK.
#
# Usage: bash scripts/rehearse.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "${CLAUDE_JOB_DIR:-}" ]; then
  job_dir=$(cygpath -u "$CLAUDE_JOB_DIR" 2>/dev/null || echo "$CLAUDE_JOB_DIR")
  mkdir -p "$job_dir/tmp"
  out="$job_dir/tmp/rehearsal.sql"
else
  out=".rehearsal.sql"
fi

# Versions already applied on the linked project
applied=$(supabase migration list --linked 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const j = JSON.parse(s.slice(s.indexOf("{")))
    process.stdout.write(j.migrations.filter(m => m.remote).map(m => m.remote).join(" "))
  })')
[ -n "$applied" ] || { echo "could not read the applied migration list" >&2; exit 1; }

migrations=()
for f in supabase/migrations/*.sql; do
  [ -e "$f" ] || continue
  version=$(basename "$f" | cut -d_ -f1)
  case " $applied " in *" $version "*) continue ;; esac
  migrations+=("$f")
done
if [ ${#migrations[@]} -eq 0 ]; then
  echo "no pending migrations; running the tests against the current schema" >&2
fi

{
  echo "BEGIN;"
  cat <<'SQL'
CREATE TEMP TABLE _before (tbl text PRIMARY KEY, n bigint NOT NULL);
DO $rehearse$
DECLARE t text; n bigint;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    INSERT INTO _before VALUES (t, n);
  END LOOP;
END $rehearse$;
SQL
  for f in ${migrations[@]+"${migrations[@]}"}; do
    echo "-- ===== $f"
    cat "$f"
    echo
  done
  cat <<'SQL'
-- ===== row counts must be unchanged by the migrations
DO $rehearse$
DECLARE r record; after_n bigint; diffs text := '';
BEGIN
  FOR r IN SELECT tbl, n FROM _before ORDER BY tbl LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO after_n;
    IF after_n <> r.n THEN diffs := diffs || format(' %s: %s -> %s;', r.tbl, r.n, after_n); END IF;
  END LOOP;
  IF diffs <> '' THEN RAISE EXCEPTION 'row counts changed by the migrations:%', diffs; END IF;
END $rehearse$;
SQL
  echo "-- ===== supabase/tests/tenancy.test.sql"
  cat supabase/tests/tenancy.test.sql
  echo
  echo "ROLLBACK;"
} > "$out"

echo "rehearsal SQL: $out (${#migrations[@]} migration file(s))" >&2

set +e
result=$(supabase db query --linked -f "$out" 2>&1)
status=$?
set -e

if [ $status -ne 0 ]; then
  echo "$result" >&2
  echo "REHEARSAL FAILED (exit $status)" >&2
  exit $status
fi
# Exit 0 alone is not enough: the tests must have reached their last line
case "$result" in
  *"TENANCY TESTS PASSED"*) ;;
  *)
    echo "$result" >&2
    echo "REHEARSAL FAILED (no TENANCY TESTS PASSED in the output)" >&2
    exit 1
    ;;
esac

# Print the last result row; fall back to the raw output if it is not the expected JSON
printf '%s' "$result" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const rows = JSON.parse(s.slice(s.indexOf("{"))).rows || [];
      console.log(rows.length ? JSON.stringify(rows[rows.length - 1]) : "(no rows)");
    } catch { console.log(s); }
  });'
