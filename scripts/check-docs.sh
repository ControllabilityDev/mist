#!/usr/bin/env bash
#
# Structural assertions over Mist's charter documents (EPIC-00).
#
# This EPIC produces prose, so its tests are structural rather than behavioral.
# The Gold Standard still applies: a real change to these documents must make a
# previously-passing assertion fail. Renaming a counter-invariant id breaks
# docs-anti-kernel-ids, which is the point -- those ids are the join key that
# EPIC-05 (VIOLATIONS.md) and EPIC-06 (the Mist Index) depend on.
#
# Run from the repository root:  bash scripts/check-docs.sh
# Exit 0 = all assertions pass. Exit 1 = at least one failed.
#
# EPIC-03 wires this into a docs CI job. It has no dependencies: bash, grep,
# sed, sort. Nothing here may require npm.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAILED=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n       %s\n' "$1" "$2"; FAILED=1; }

# --- docs-anti-kernel-ids ---------------------------------------------------
# Asserts docs/ANTI_KERNEL.md contains exactly the ids CI-1..CI-6, each on its
# own table row. Pins the join key EPIC-05 and EPIC-06 depend on.
check_anti_kernel_ids() {
  local name="docs-anti-kernel-ids"
  local file="docs/ANTI_KERNEL.md"

  if [ ! -f "$file" ]; then
    fail "$name" "$file does not exist"
    return
  fi

  local found expected
  found="$(grep -oE '^\| CI-[0-9]+ \|' "$file" | sed 's/^| //; s/ |$//' | sort -u | paste -sd, -)"
  expected="CI-1,CI-2,CI-3,CI-4,CI-5,CI-6"

  if [ "$found" != "$expected" ]; then
    fail "$name" "table row ids are [$found], expected [$expected]"
    return
  fi

  local rows
  rows="$(grep -cE '^\| CI-[0-9]+ \|' "$file")"
  if [ "$rows" -ne 6 ]; then
    fail "$name" "expected 6 counter-invariant rows, found $rows (duplicate id?)"
    return
  fi

  pass "$name"
}

# --- docs-roadmap-links-resolve ---------------------------------------------
# Asserts every EPIC-NN_*.md linked from docs/ROADMAP.md exists on disk.
# Catches a renamed or missing EPIC.
check_roadmap_links() {
  local name="docs-roadmap-links-resolve"
  local file="docs/ROADMAP.md"

  if [ ! -f "$file" ]; then
    fail "$name" "$file does not exist"
    return
  fi

  local missing=""
  local count=0
  local f
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    count=$((count + 1))
    [ -f "docs/$f" ] || missing="$missing docs/$f"
  done < <(grep -oE 'EPIC-[0-9]{2}[a-z]?_[A-Za-z0-9_]+\.md' "$file" | sort -u)

  if [ "$count" -eq 0 ]; then
    fail "$name" "no EPIC links found in $file -- the map is empty or the pattern drifted"
    return
  fi

  if [ -n "$missing" ]; then
    fail "$name" "linked but missing:$missing"
    return
  fi

  pass "$name ($count linked EPICs resolve)"
}

# --- docs-readme-has-safety-slot --------------------------------------------
# Asserts README.md carries the EPIC-01 safety-banner marker. This assertion is
# DESIGNED TO FAIL once EPIC-01 lands and replaces the marker with the real
# banner -- that failure is the intended handoff signal, not a regression.
check_readme_safety_slot() {
  local name="docs-readme-has-safety-slot"

  if [ ! -f README.md ]; then
    fail "$name" "README.md does not exist"
    return
  fi

  if grep -qF '<!-- EPIC-01: safety banner -->' README.md; then
    pass "$name"
  else
    fail "$name" "marker '<!-- EPIC-01: safety banner -->' not found in README.md (expected until EPIC-01 replaces it)"
  fi
}

# --- docs-medianness-examples -----------------------------------------------
# Asserts docs/MEDIANNESS.md carries at least three worked examples.
check_medianness_examples() {
  local name="docs-medianness-examples"
  local file="docs/MEDIANNESS.md"

  if [ ! -f "$file" ]; then
    fail "$name" "$file does not exist"
    return
  fi

  local n
  n="$(grep -cE '^### Example' "$file")"
  if [ "$n" -ge 3 ]; then
    pass "$name ($n examples)"
  else
    fail "$name" "found $n '### Example' headings, expected at least 3"
  fi
}

# --- no dependency surface --------------------------------------------------
# EPIC-00 must not create one. EPIC-02 owns package.json; delete this assertion
# when EPIC-02 lands.
check_no_dependency_surface() {
  local name="docs-no-dependency-surface-yet"

  if [ -f package.json ] || [ -d node_modules ]; then
    fail "$name" "package.json or node_modules exists -- if EPIC-02 has landed, remove this assertion"
  else
    pass "$name"
  fi
}

printf 'check-docs (EPIC-00 charter assertions)\n'
check_anti_kernel_ids
check_roadmap_links
check_readme_safety_slot
check_medianness_examples
check_no_dependency_surface

if [ "$FAILED" -ne 0 ]; then
  printf '\ncheck-docs: FAILED\n'
  exit 1
fi

printf '\ncheck-docs: all assertions pass\n'
