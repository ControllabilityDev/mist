#!/usr/bin/env bash
#
# Tests for the containment gate (EPIC-01 Test Plan).
#
# scripts/check-containment.sh is the gate. This is the thing that proves the
# gate can actually say no. It builds throwaway repositories in a temp dir, each
# breaking exactly one rule, and asserts the gate catches it.
#
# The Gold Standard applies (docs/ROADMAP.md, EPIC-00): a real behavioral change
# must make a previously-passing test fail. gold-standard-scope-allowlist below
# proves the allowlist is load-bearing by relaxing it and watching the gate go
# quiet -- if that ever stops happening, the allowlist has become decoration.
#
# Run from the repository root:  bash scripts/test-containment.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

FAILED=0
PENDING=0

ok()      { printf '  ok       %s\n' "$1"; }
bad()     { printf '  FAIL     %s\n           %s\n' "$1" "$2"; FAILED=1; }
skipped() { printf '  skip     %s\n           %s\n' "$1" "$2"; }
pending() { printf '  PENDING  %s\n           %s\n' "$1" "$2"; PENDING=1; }

# Build a minimal repo copy that the gate can run against.
scaffold() {
  local dir="$TMPROOT/$1"
  mkdir -p "$dir/scripts" "$dir/deploy" "$dir/fixtures"
  cp scripts/check-containment.sh "$dir/scripts/"
  cp deploy/scope-allowlist.txt deploy/advisory-denylist.txt \
     deploy/real-mail-domains.txt deploy/synthetic-locations.txt "$dir/deploy/"
  cp README.md "$dir/"
  printf '%s' "$dir"
}

# Assert the gate FAILS in $1 and its output mentions $2.
expect_breach() {
  local dir="$1" needle="$2" name="$3"
  local out rc
  out="$(bash "$dir/scripts/check-containment.sh" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then
    bad "$name" "gate passed; it should have blocked"
  elif ! printf '%s' "$out" | grep -qF "$needle"; then
    bad "$name" "gate blocked, but not for '$needle'"
  else
    ok "$name"
  fi
}

# Assert the gate PASSES in $1.
expect_hold() {
  local dir="$1" name="$2"
  if bash "$dir/scripts/check-containment.sh" >/dev/null 2>&1; then
    ok "$name"
  else
    bad "$name" "gate blocked a clean tree"
  fi
}

printf 'test-containment (EPIC-01 Test Plan)\n\n'

# --- baseline: a clean tree must pass ---------------------------------------
d="$(scaffold baseline)"
expect_hold "$d" "baseline-clean-tree-passes"

# --- containment-scope-allowlist --------------------------------------------
d="$(scaffold novel-scope)"
cat > "$d/package.json" <<'JSON'
{ "name": "mist", "dependencies": { "@definitely-not-a-real-scope/http-utils": "^1.0.0", "axios": "^1.7.0" } }
JSON
expect_breach "$d" "unvetted scope" "containment-scope-allowlist"

d="$(scaffold known-scope)"
cat > "$d/package.json" <<'JSON'
{ "name": "mist", "dependencies": { "@types/node": "^22.0.0", "axios": "^1.7.0" } }
JSON
expect_hold "$d" "containment-scope-allowlist-permits-vetted-scope"

# --- gold standard ----------------------------------------------------------
# Relax the allowlist to accept the novel scope. The gate must go quiet. If it
# does not, the allowlist is not what is doing the work.
d="$(scaffold gold-standard)"
cat > "$d/package.json" <<'JSON'
{ "name": "mist", "dependencies": { "@definitely-not-a-real-scope/http-utils": "^1.0.0" } }
JSON
echo "@definitely-not-a-real-scope" >> "$d/deploy/scope-allowlist.txt"
expect_hold "$d" "gold-standard-scope-allowlist (relaxing it silences the gate)"

# --- containment-denylist ---------------------------------------------------
d="$(scaffold denylisted)"
echo "totally-compromised-package" >> "$d/deploy/advisory-denylist.txt"
cat > "$d/package.json" <<'JSON'
{ "name": "mist", "dependencies": { "totally-compromised-package": "^0.1.0" } }
JSON
expect_breach "$d" "flagged-malicious" "containment-denylist"

# --- containment-banner-present ---------------------------------------------
d="$(scaffold banner-line-deleted)"
sed -i.bak '4d' "$d/README.md" && rm -f "$d/README.md.bak"
expect_breach "$d" "canonical banner" "containment-banner-present (one line deleted)"

d="$(scaffold banner-softened)"
sed -i.bak 's/Do not deploy this\./Please avoid deploying this./' "$d/README.md" && rm -f "$d/README.md.bak"
expect_breach "$d" "canonical banner" "containment-banner-present (wording softened)"

d="$(scaffold banner-marker-left)"
printf '\n<!-- EPIC-01: safety banner -->\n' >> "$d/README.md"
expect_breach "$d" "placeholder marker" "containment-banner-present (EPIC-00 marker left behind)"

# --- containment-synthetic-data ---------------------------------------------
d="$(scaffold real-email)"
cat > "$d/fixtures/users.seed.json" <<'JSON'
[ { "name": "Ada Lovelace", "email": "ada@gmail.com" } ]
JSON
expect_breach "$d" "real mail domain" "containment-synthetic-data (real mail domain)"

d="$(scaffold real-coordinate)"
cat > "$d/fixtures/places.seed.json" <<'JSON'
[ { "label": "home", "lat": 47.3769, "lon": 8.5417 } ]
JSON
expect_breach "$d" "not in deploy/synthetic-locations.txt" "containment-synthetic-data (uncurated coordinate)"

d="$(scaffold synthetic-clean)"
cat > "$d/fixtures/users.seed.json" <<'JSON'
[ { "name": "Test Subject 1", "email": "subject1@example.invalid", "lat": 64.14, "lon": -21.94 } ]
JSON
expect_hold "$d" "containment-synthetic-data-permits-synthetic-rows"

# --- containment-no-hygiene-mitigation --------------------------------------
d="$(scaffold hygiene-mitigation)"
printf 'ignore-scripts=true\n' > "$d/.npmrc"
expect_breach "$d" "ignore-scripts" "containment-no-hygiene-mitigation"

# --- slopsquat-placeholder-inert --------------------------------------------
# Needs the @mist-demo scope registered and a published placeholder, plus
# network access. Both are EPIC-01 Work Items 3a/3c, and neither is done.
if python3 -c "import json,sys; d=json.load(open('docs/slopsquat.json')); sys.exit(0 if d['placeholders'] else 1)" 2>/dev/null; then
  name="$(python3 -c "import json; print(json.load(open('docs/slopsquat.json'))['placeholders'][0])")"
  if command -v npm >/dev/null 2>&1; then
    if [ -z "$(npm view "@mist-demo/$name" scripts 2>/dev/null)" ]; then
      ok "slopsquat-placeholder-inert (@mist-demo/$name has no scripts)"
    else
      bad "slopsquat-placeholder-inert" "@mist-demo/$name declares scripts; a placeholder must be inert"
    fi
  else
    skipped "slopsquat-placeholder-inert" "npm not on PATH"
  fi
else
  skipped "slopsquat-placeholder-inert" "no placeholders published; @mist-demo not registered (Work Items 3a/3c)"
fi

# --- key-rotation-recorded --------------------------------------------------
# Expected to be unsatisfied until EPIC-02 Phase 2 provisions and burns K1.
# Reported as PENDING, not FAIL: this is a countdown, and a permanently red
# blocking gate teaches people to ignore the gate.
#
# THIS CHECK WAS WRONG UNTIL 2026-09-03 AND FAILED IN THE WORST DIRECTION.
# It matched ANY date anywhere on the K1 row:
#
#     grep -qE '^\| K1 \|.*[0-9]{4}-[0-9]{2}-[0-9]{2}' docs/KEY_ROTATION.md
#
# The row's FIRST date column is "Provisioned". So the moment K1 was created --
# the exact moment a live key became public and the reminder mattered most --
# the countdown reported itself satisfied and went quiet. A reminder that
# switches off when the hazard begins is worse than no reminder, because
# somebody is relying on it.
#
# It now reads the REVOCATION TIMESTAMP column specifically (field 5 of the
# pipe-delimited row), which is the only thing that means the key is dead.
K1_REVOKED="$(awk -F'|' '/^\| K1 \|/ { gsub(/^[ \t]+|[ \t]+$/, "", $6); print $6 }' docs/KEY_ROTATION.md)"
if printf '%s' "$K1_REVOKED" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}'; then
  ok "key-rotation-recorded (K1 revoked at $K1_REVOKED)"
else
  pending "key-rotation-recorded" "K1 revocation timestamp is [${K1_REVOKED:-empty}] -- if K1 is committed and live, REVOKE IT NOW (docs/KEY_ROTATION.md step 4)"
fi

printf '\n'
if [ "$FAILED" -ne 0 ]; then
  printf 'test-containment: FAILED\n'
  exit 1
fi
if [ "$PENDING" -ne 0 ]; then
  printf 'test-containment: all assertions pass (with pending items above)\n'
else
  printf 'test-containment: all assertions pass\n'
fi
