#!/usr/bin/env bash
#
# Runs one scanner and records what actually happened (EPIC-03 Phase 5a).
#
# WHY A WRAPPER AND NOT SEVEN COPIES OF THE SAME YAML
#
# Every scanner has to answer the same three questions -- did you run, what
# version were you, and what was your exit code -- and get them right even when
# the tool crashes. Seven hand-written copies of that logic in scan.yml would
# drift, and the one that drifted would report a false green. So it lives here,
# once.
#
# WHAT "STATUS" MEANS, PRECISELY
#
#   ran      the command produced parseable JSON. A NON-ZERO EXIT IS STILL
#            "ran": npm audit exits 1 when it finds vulnerabilities, and that is
#            the tool working, not failing. A red scan is data.
#   crashed  the command ran and produced no usable output. Not clean. Recorded
#            with its exit code so the dashboard can show an absent instrument
#            rather than an empty one.
#   skipped  the command never ran, and MIST_SKIP_REASON says why. Before EPIC-02
#            lands there is no dependency tree and five of the seven scanners
#            have nothing to look at.
#
# Usage:
#   MIST_SKIP_REASON="no package.json yet" scripts/scan-step.sh <id> <outdir>
#   MIST_TOOL_VERSION="$(tool --version)" scripts/scan-step.sh <id> <outdir> -- tool --json
#
# The command's stdout becomes <outdir>/<id>.json. Always exits 0: this wrapper
# must never be the thing that fails a scan job.

set -uo pipefail

ID="${1:?scanner id required}"
OUTDIR="${2:?output directory required}"
shift 2
[ "${1:-}" = "--" ] && shift

mkdir -p "$OUTDIR"
OUT="$OUTDIR/$ID.json"
META="$OUTDIR/$ID.meta.json"

write_meta() {
  # $1 status  $2 exitCode-or-null  $3 durationMs-or-null  $4 skipReason-or-empty
  local reason="null"
  [ -n "${4:-}" ] && reason="$(printf '%s' "$4" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
  local version="null"
  [ -n "${MIST_TOOL_VERSION:-}" ] && version="$(printf '%s' "$MIST_TOOL_VERSION" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')"
  cat > "$META" <<EOF
{ "status": "$1", "version": $version, "exitCode": $2, "durationMs": $3, "skipReason": $reason }
EOF
  printf 'scan-step %s: %s\n' "$ID" "$1"
}

if [ -n "${MIST_SKIP_REASON:-}" ]; then
  write_meta skipped null null "$MIST_SKIP_REASON"
  exit 0
fi

if [ "$#" -eq 0 ]; then
  write_meta skipped null null "scan-step called with no command"
  exit 0
fi

START="$(python3 -c 'import time; print(int(time.time()*1000))')"
"$@" > "$OUT" 2> "$OUTDIR/$ID.stderr"
CODE=$?
END="$(python3 -c 'import time; print(int(time.time()*1000))')"
DUR=$((END - START))

# Parseable JSON is the only thing that separates "ran" from "crashed".
if [ -s "$OUT" ] && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$OUT" 2>/dev/null; then
  write_meta ran "$CODE" "$DUR" ""
else
  write_meta crashed "$CODE" "$DUR" ""
  printf 'scan-step %s: no parseable output (exit %s). stderr tail:\n' "$ID" "$CODE"
  tail -20 "$OUTDIR/$ID.stderr" 2>/dev/null || true
fi

exit 0
