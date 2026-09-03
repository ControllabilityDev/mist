#!/usr/bin/env bash
#
# The containment gate (EPIC-01).
#
# THIS IS THE ONE PLACE IN MIST WHERE CI SAYS NO.
#
# EPIC-03's scanners are deliberately NON-BLOCKING: they measure decay, and
# gating on them would stop the measurement (docs/ROADMAP.md:48). Containment is
# not decay. It is the wall around the experiment. A breach of the wall is not
# data -- it is a defect. So this script blocks merge and those do not.
#
# It asserts the four containment rules from docs/mist-concept-evaluation.md:82,
# in the half that a repository can mechanically check. The account-level
# invariants (isolated cloud account, billing cap, no assumable role, no network
# path) CANNOT be checked from here; they are attested by a human in
# deploy/isolation.md or they are not true.
#
# Run from the repository root:  bash scripts/check-containment.sh
# Exit 0 = the wall holds. Exit 1 = breach; do not merge.
#
# Requires bash, grep, sed and python3. It must NOT require node: this gate has
# to run before EPIC-02 creates a Node toolchain, and it must keep working if
# the dependency tree is too broken to install.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAILED=0

pass() { printf '  ok    %s\n' "$1"; }
skip() { printf '  skip  %s\n        %s\n' "$1" "$2"; }
fail() { printf '  FAIL  %s\n        %s\n' "$1" "$2"; FAILED=1; }

# The canonical safety banner, byte-for-byte. README.md must open with exactly
# these lines. The exactness is deliberate: a banner that can be reworded can be
# quietly softened, and softening it is how "negative control" turns into
# "attractive nuisance" (docs/mist-concept-evaluation.md:82).
read -r -d '' CANONICAL_BANNER <<'BANNER'
> ## ⚠️ This project is deliberately insecure by construction
>
> Mist is a research artifact: a working weather dashboard built with the
> maximum plausible dependency surface, running with no supply-chain
> mitigations, so that security scanners have something true to measure.
>
> **Do not deploy this. Do not depend on it. Do not copy its package.json.**
>
> It contains no exploit and no malicious code of its own. Its exposure is
> second-party: the dependency tree and the way it was assembled.
> See docs/ANTI_KERNEL.md for what it demonstrates and SECURITY.md for
> how to report a finding.
BANNER

# --- containment-scope-allowlist --------------------------------------------
# Rule 2: no dependency from a scope this project has not vetted. A novel scope
# is where a slopsquat lands, so it is a review stop -- add it to
# deploy/scope-allowlist.txt in a PR with its medianness justification.
check_scope_allowlist() {
  local name="containment-scope-allowlist"

  if [ ! -f package.json ]; then
    skip "$name" "no package.json yet (EPIC-02 owns it); nothing to check"
    return
  fi

  local novel
  novel="$(python3 - <<'PY'
import json, re, sys, pathlib

allow = set()
for line in pathlib.Path("deploy/scope-allowlist.txt").read_text().splitlines():
    line = line.split("#", 1)[0].strip()
    if line:
        allow.add(line)

pkg = json.loads(pathlib.Path("package.json").read_text())
deps = set()
for field in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
    deps |= set(pkg.get(field, {}))

novel = sorted({d.split("/", 1)[0] for d in deps if d.startswith("@")} - allow)
print(" ".join(novel))
PY
)" || { fail "$name" "could not parse package.json"; return; }

  if [ -n "$novel" ]; then
    fail "$name" "unvetted scope(s):$novel -- add to deploy/scope-allowlist.txt with a justification, or remove"
    return
  fi

  pass "$name"
}

# --- containment-denylist ---------------------------------------------------
# Rule 1: never KNOWINGLY install a package flagged as malicious today. A
# package that goes bad later is the experiment; one that is bad now is a defect.
check_denylist() {
  local name="containment-denylist"

  if [ ! -f package.json ]; then
    skip "$name" "no package.json yet; nothing to check"
    return
  fi

  local hits
  hits="$(python3 - <<'PY'
import json, pathlib

deny = set()
for line in pathlib.Path("deploy/advisory-denylist.txt").read_text().splitlines():
    line = line.split("#", 1)[0].strip()
    if line:
        deny.add(line)

pkg = json.loads(pathlib.Path("package.json").read_text())
deps = set()
for field in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
    deps |= set(pkg.get(field, {}))

print(" ".join(sorted(deps & deny)))
PY
)" || { fail "$name" "could not parse package.json"; return; }

  if [ -n "$hits" ]; then
    fail "$name" "flagged-malicious package(s) in package.json:$hits -- remove and publish the finding (EPIC-04)"
    return
  fi

  pass "$name"
}

# --- containment-banner-present ---------------------------------------------
# Rule 4: a prominent statement of what this project is. Byte-for-byte, at the
# very top of README.md, above the H1.
check_banner() {
  local name="containment-banner-present"

  if [ ! -f README.md ]; then
    fail "$name" "README.md does not exist"
    return
  fi

  local lines actual
  lines="$(printf '%s\n' "$CANONICAL_BANNER" | wc -l | tr -d ' ')"
  actual="$(head -n "$lines" README.md)"

  if [ "$actual" != "$CANONICAL_BANNER" ]; then
    fail "$name" "README.md does not open with the canonical banner byte-for-byte (see scripts/check-containment.sh:41)"
    return
  fi

  if grep -qF '<!-- EPIC-01: safety banner -->' README.md; then
    fail "$name" "the EPIC-00 placeholder marker is still present alongside the banner -- remove it"
    return
  fi

  pass "$name ($lines lines, exact)"
}

# --- containment-synthetic-data ---------------------------------------------
# Rule 3's data clause: synthetic only. No address at a real mail domain, and no
# coordinate outside the curated allowlist (deploy/synthetic-locations.txt).
check_synthetic_data() {
  local name="containment-synthetic-data"

  local files
  files="$(find fixtures prisma scripts -type f \( -name '*.json' -o -name '*seed*' \) 2>/dev/null \
           | grep -v 'seed-synthetic.ts$' | sort)"

  if [ -z "$files" ]; then
    skip "$name" "no fixture or seed data on disk yet (EPIC-02 owns it)"
    return
  fi

  local problems
  # The file list travels in an env var, not on stdin: stdin is already carrying
  # this heredoc's Python source.
  problems="$(MIST_FIXTURE_FILES="$files" python3 - <<'PY'
import os, pathlib, re

domains = set()
for line in pathlib.Path("deploy/real-mail-domains.txt").read_text().splitlines():
    line = line.split("#", 1)[0].strip()
    if line:
        domains.add(line.lower())

allowed = set()
for line in pathlib.Path("deploy/synthetic-locations.txt").read_text().splitlines():
    line = line.split("#", 1)[0].strip()
    if line:
        lat, lon = line.split(",")
        allowed.add((round(float(lat), 2), round(float(lon), 2)))

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
COORD = re.compile(r'"(?:lat|latitude)"\s*:\s*(-?\d+\.?\d*)\s*,\s*"(?:lon|lng|longitude)"\s*:\s*(-?\d+\.?\d*)')

problems = []
for name in os.environ["MIST_FIXTURE_FILES"].split():
    text = pathlib.Path(name).read_text(errors="replace")
    for dom in {m.lower() for m in EMAIL.findall(text)}:
        if dom in domains:
            problems.append(f"{name}: address at real mail domain {dom}")
    for lat, lon in COORD.findall(text):
        pair = (round(float(lat), 2), round(float(lon), 2))
        if pair not in allowed:
            problems.append(f"{name}: coordinate {pair[0]},{pair[1]} not in deploy/synthetic-locations.txt")

for p in sorted(set(problems)):
    print(p)
PY
)" || { fail "$name" "scan failed"; return; }

  if [ -n "$problems" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && fail "$name" "$line"
    done <<< "$problems"
    return
  fi

  local n
  n="$(printf '%s\n' "$files" | wc -l | tr -d ' ')"
  pass "$name ($n file(s) scanned)"
}

# --- containment-no-hygiene-mitigation --------------------------------------
# The inverse breach. Standing rule 4: adopting a supply-chain mitigation
# silently destroys the measurement (CONTRIBUTING.md). That is a containment
# failure in the other direction, so the same gate catches it.
check_no_hygiene_mitigation() {
  local name="containment-no-hygiene-mitigation"

  if [ -f .npmrc ] && grep -qE '^\s*ignore-scripts\s*=\s*true' .npmrc; then
    fail "$name" ".npmrc sets ignore-scripts=true -- standing rule 4; document an explicit exception or remove"
    return
  fi

  pass "$name"
}

printf 'check-containment (EPIC-01 -- BLOCKING)\n'
check_scope_allowlist
check_denylist
check_banner
check_synthetic_data
check_no_hygiene_mitigation

printf '\nNot checked here (cannot be, from a repository):\n'
printf '  - isolated cloud account, billing cap, no assumable role, no network path\n'
printf '  - see deploy/isolation.md; attested by a human or not true\n'

if [ "$FAILED" -ne 0 ]; then
  printf '\ncheck-containment: BREACH -- do not merge\n'
  exit 1
fi

printf '\ncheck-containment: the wall holds\n'
