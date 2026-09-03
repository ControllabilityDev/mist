# EPIC-03: The Scan Battery (SCAN)

## Context

Mist's thesis is that observability you did not design in must be purchased
after the fact: *"the scans (audit, SCA, SAST, secret detection, SBOM) are
sensors bolted onto a plant whose inputs nobody controls… Every scanner in
Mist's CI is a measurement of distance from the purity line"*
(`docs/mist-concept-evaluation.md:25-27`).

The scan battery is therefore not infrastructure supporting the demonstration —
it **is** the demonstration's instrument. The concept doc requires it *"wired
into CI from the first commit"* (`docs/mist-concept-evaluation.md:51`) and names
seven scanner classes (`docs/mist-concept-evaluation.md:53-60`).

At commit `1e69b61` there is no `.github/workflows/` directory. EPIC-01 adds
exactly one workflow — `containment.yml`, the single blocking gate. This EPIC
adds all the rest, and every one of them is **non-blocking** by design.

**This EPIC does not build the public dashboard** (EPIC-04) and does not define
the Mist Index (EPIC-06). It produces machine-readable scan output on a stable
schema; consuming it is downstream work.

---

## Status

| Component | Status |
|---|---|
| `npm audit` job → JSON artifact | Planned |
| `osv-scanner` job → JSON artifact | Planned |
| Behavioral SCA (Socket or equivalent) | Planned |
| `semgrep` SAST over first-party code | Planned |
| `gitleaks` secret detection over full history | Planned |
| CycloneDX SBOM generation | Planned |
| SBOM diff on PR | Planned |
| License scan | Planned |
| `scan-run.json` normalized envelope | Planned |
| Advisory denylist export for EPIC-01's gate | Planned |

---

## Goals

- Wire **seven scanner classes** into CI, each publishing machine-readable
  output on a stable schema.
- Establish that scan jobs are **non-blocking**: a red scan is a measurement,
  not a defect.
- Normalize heterogeneous scanner output into one **`scan-run.json` envelope**,
  so EPIC-04 and EPIC-06 have a single contract to consume.
- Make **surface growth per PR** visible via SBOM diff, so agentic-style feature
  additions can be charted (`docs/mist-concept-evaluation.md:59`).

## Scope

1. **Non-blocking.** Every scan job runs `continue-on-error: true` and always
   uploads its artifact. Nothing here fails a build. The one exception in the
   repository is EPIC-01's `containment.yml`, and its header comment must
   explain the asymmetry.
2. **Full-tree coverage.** Scanners run against the complete transitive tree,
   not direct dependencies only. The boundary is `node_modules`
   (`docs/mist-concept-evaluation.md:21`).
3. **First-party findings are expected and honest.** Semgrep should find *"a
   modest, realistic crop of app-layer findings (not Juice Shop's curated
   hundred — a median project's honest dozen)"*
   (`docs/mist-concept-evaluation.md:56`). Findings are not planted, and they are
   not fixed just to make the dashboard look better.
4. **No suppression files.** No `.semgrepignore` of inconvenient rules, no
   `npm audit` allowlist, no `gitleaks` baseline that hides K1. Suppression is
   mitigation, and mitigation corrupts the measurement (EPIC-00 Scope rule 4).
5. **Behavioral SCA is the interesting layer.** It detects *anti-kernel
   properties* — install scripts, network at install/import, obfuscation,
   maintainer changes — rather than known bugs
   (`docs/mist-concept-evaluation.md:55`). Its output is the primary input to
   the Mist Index (EPIC-06).

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Scanner (a sensor) | one CI job per class | ❌ absent |
| Finding (one observation) | normalized record in `scan-run.json` | ❌ absent |
| Scan Run (one full battery pass) | `scan-run.json` envelope | ❌ absent |
| SBOM (the surface, enumerated) | CycloneDX JSON artifact | ❌ absent |
| Surface Delta (growth per PR) | SBOM diff output | ❌ absent |
| Advisory Denylist (currently-flagged malicious pkgs) | `security/denylist.json` | ❌ absent |

---

## Design

### The `scan-run.json` envelope

`schemas/scan-run.schema.json` (new) — the contract EPIC-04 and EPIC-06 consume.
Every scanner's raw output is also archived unmodified; this is the normalized
join layer.

```json
{
  "schemaVersion": "1",
  "commit": "<sha>",
  "ref": "<branch or tag>",
  "startedAt": "<ISO 8601>",
  "surface": {
    "directDependencies": 0,
    "transitivePackages": 0,
    "packagesWithInstallScripts": 0,
    "packagesWithNetworkAtInstall": 0,
    "packagesWithNetworkAtImport": 0,
    "distinctMaintainers": 0
  },
  "scanners": [
    {
      "id": "npm-audit | osv-scanner | sca-behavioral | semgrep | gitleaks | licenses",
      "version": "<tool version>",
      "exitCode": 0,
      "durationMs": 0,
      "findings": [
        {
          "id": "<stable id>",
          "severity": "critical|high|medium|low|info",
          "party": "first | second",
          "subject": "<package@version or path:line>",
          "counterInvariant": "CI-1 | CI-2 | … | null",
          "title": "<one line>"
        }
      ]
    }
  ]
}
```

**Rationale for `party`.** The first/second-party split is Mist's core
differentiation from Juice Shop, whose flaws are first-party and curated while
Mist's are second-party and emergent (`docs/mist-concept-evaluation.md:68`). If
the envelope cannot express that distinction, the dashboard cannot make the
argument.

**Rationale for `counterInvariant`.** It is the join key back to
`docs/ANTI_KERNEL.md`'s `CI-1`..`CI-6` (EPIC-00 Design). A behavioral SCA finding
of "package runs a postinstall script" is not merely a security note — it is an
instance of CI-1, and the dashboard should say so. Findings with no clean
mapping carry `null`; that is honest, and the proportion of `null`s is itself
worth watching.

### Job layout

`.github/workflows/scan.yml` (new). One workflow, parallel jobs, a final
`assemble` job that emits the envelope.

```yaml
# All scan jobs are continue-on-error. This is deliberate.
# A red scan in Mist is DATA, not a defect. Gating merge on scanner findings
# would stop the project recording its own decay, which is its entire purpose.
# The only blocking job in this repository is containment.yml (EPIC-01):
# containment is the wall around the experiment, not part of the experiment.
on: [push, pull_request, workflow_dispatch]
jobs:
  audit:      # npm audit --json
  osv:        # osv-scanner against package-lock.json
  sca:        # behavioral SCA — install scripts, network, obfuscation, maintainers
  semgrep:    # SAST, first-party paths only: apps/**, scripts/**
  gitleaks:   # full history, fetch-depth: 0
  sbom:       # CycloneDX, plus diff vs base ref on pull_request
  licenses:   # license inventory over the full tree
  assemble:   # needs: all above; normalizes into scan-run.json
```

**Rationale for `fetch-depth: 0` on gitleaks.** K1 lives in history and is never
scrubbed (`docs/KEY_ROTATION.md` step 6, EPIC-01). A shallow clone would miss it
and the scanner would report a false green — the one failure mode that would
actually damage the argument.

**Rationale for scoping semgrep to first-party paths.** Running SAST over
`node_modules` produces noise that swamps the honest dozen and makes the
first/second-party distinction unreadable. Second-party exposure is measured by
the SCA and audit layers, which are the right instruments for it.

### The SBOM diff

`scripts/sbom-diff.mjs` (new). On `pull_request`, generate the SBOM for the head
and the base, and emit:

```
+ 47 packages added   (12 direct-attributable, 35 transitive)
-  2 packages removed
Δ install-script packages: +6
Δ distinct maintainers:   +31
```

This is what charts *surface growth over time as agentic-style feature additions
land* (`docs/mist-concept-evaluation.md:59`). It is posted as a PR comment, which
is the moment it has the most rhetorical force: the reviewer sees the cost of the
convenience in the same view as the convenience.

### The advisory denylist export

`security/denylist.json` (new), refreshed by the `osv` job. EPIC-01's blocking
`check-containment.sh` reads it to enforce Scope rule 1 ("no live malicious
packages"). This is the one place scan output feeds a blocking decision — and
note the direction: it blocks *knowingly installing* something flagged, never
merging because something *became* flagged. Decay is data; adoption is a choice.

---

## Work Items

### Phase 0 — Prerequisites

- [ ] **0a.** Confirm EPIC-01's `.github/workflows/containment.yml` exists and
      blocks. This EPIC's non-blocking policy is defined against it.
- [ ] **0b.** Write `schemas/scan-run.schema.json` per Design and validate it
      parses as JSON Schema.
- [ ] **0c.** Add `scripts/assemble-scan-run.mjs` skeleton that emits a valid
      envelope with zero scanners. Prove the schema before wiring tools to it.

### Phase 1 — Known-CVE baseline

- [ ] **1a.** `audit` job: `npm audit --json`, artifact uploaded, `continue-on-error`.
- [ ] **1b.** `osv` job: osv-scanner against `package-lock.json`, JSON output.
- [ ] **1c.** Normalizers for both into envelope findings, `party: "second"`.
- [ ] **1d.** Export `security/denylist.json` from the osv job for EPIC-01.

### Phase 2 — Behavioral SCA (the interesting layer)

- [ ] **2a.** Wire a behavioral SCA (Socket or equivalent). Record in
      `docs/SCANNERS.md` which tool, its version, and what it can and cannot see.
- [ ] **2b.** Extract the four `surface.*` behavioral counts: install-script
      packages, network-at-install, network-at-import, distinct maintainers.
- [ ] **2c.** Map SCA finding types onto `CI-1`..`CI-6` from
      `docs/ANTI_KERNEL.md`. Record unmapped types explicitly rather than
      guessing.

### Phase 3 — First-party SAST and secrets

- [ ] **3a.** `semgrep` job scoped to `apps/**` and `scripts/**`, default rulesets
      only, no `.semgrepignore`. Findings marked `party: "first"`.
- [ ] **3b.** `gitleaks` job with `fetch-depth: 0`, no baseline file.
- [ ] **3c.** Assert gitleaks reports K1 once EPIC-02 Phase 2e has landed. Until
      then this assertion fails, and that failure is the reminder.

### Phase 4 — Surface accounting

- [ ] **4a.** `sbom` job producing CycloneDX JSON per build, retained as an
      artifact and committed to the telemetry branch for EPIC-04.
- [ ] **4b.** `scripts/sbom-diff.mjs` comparing head vs base on `pull_request`.
- [ ] **4c.** Post the diff as a PR comment.
- [ ] **4d.** `licenses` job: full-tree license inventory. Report obligation
      classes, not just SPDX ids — *"obligations nobody read, accumulating in the
      same tree"* (`docs/mist-concept-evaluation.md:60`).

### Phase 5 — Assembly

- [ ] **5a.** `assemble` job: `needs` all scanners, runs with `if: always()` so a
      crashed scanner still yields an envelope with a recorded non-zero exitCode.
- [ ] **5b.** Validate the emitted envelope against the schema; fail the
      *assemble* job (not the scanners) if it is malformed. A malformed
      instrument is a real defect.
- [ ] **5c.** Publish `scan-run.json` as a build artifact and append to the
      telemetry branch.

### Phase 6 — Close

- [ ] **6a.** Write `docs/SCANNERS.md`: one section per scanner — what it sees,
      what it structurally cannot see, and which counter-invariants it can
      evidence. The blind spots matter as much as the coverage.
- [ ] **6b.** Flip Status rows; write the corrigendum with the first full
      battery's real numbers.

---

## Test Plan

- `scan-envelope-valid` — `scripts/assemble-scan-run.mjs` output validates
  against `schemas/scan-run.schema.json` for a fixture set of raw scanner
  outputs. Pins the contract EPIC-04 and EPIC-06 consume.
- `scan-jobs-nonblocking` — parses `.github/workflows/scan.yml` and asserts every
  job except `assemble` sets `continue-on-error: true`. Pins Scope rule 1.
- `scan-no-suppression` — asserts absence of `.semgrepignore`, gitleaks baseline
  files, and any `audit` allowlist. Pins Scope rule 4.
- `scan-gitleaks-full-history` — asserts the gitleaks job sets `fetch-depth: 0`.
  Pins the K1 true-positive requirement.
- `scan-semgrep-scope` — asserts semgrep paths exclude `node_modules`. Pins the
  first/second-party readability.
- `scan-ci-mapping-complete` — asserts every SCA finding type present in the
  fixture maps to a `CI-*` id or is listed in an explicit `unmapped` array.
  Silent `null`s are not allowed; deliberate ones are.
- `sbom-diff-counts` — given two fixture SBOMs, asserts added/removed and the
  install-script delta are computed correctly.
- `scan-assemble-survives-crash` — a fixture where one scanner produced no output
  still yields a valid envelope with that scanner's `exitCode` recorded.

Gold Standard: flipping any scan job to blocking must make
`scan-jobs-nonblocking` fail.

## Key Files

| File | Role |
|---|---|
| `.github/workflows/scan.yml` | The battery; all jobs non-blocking (new) |
| `schemas/scan-run.schema.json` | The envelope contract (new) |
| `scripts/assemble-scan-run.mjs` | Normalizer across seven scanners (new) |
| `scripts/sbom-diff.mjs` | Surface growth per PR (new) |
| `security/denylist.json` | Advisory export consumed by EPIC-01's gate (new) |
| `docs/SCANNERS.md` | Per-scanner coverage **and blind spots** (new) |
| `docs/ANTI_KERNEL.md` | Source of the `CI-*` join keys (exists, EPIC-00) |

## Reuse (do NOT recreate)

- `docs/ANTI_KERNEL.md` `CI-1`..`CI-6` (EPIC-00 Design) — the counter-invariant
  ids already exist. Join to them; do not invent a parallel taxonomy.
- `docs/mist-concept-evaluation.md:53-60` — the seven scanner classes and the
  rationale for each are already specified. Implement that list.
- `.github/workflows/containment.yml` (EPIC-01 Phase 5b) — the blocking-job
  pattern and its justification comment already exist; reference rather than
  restate.

## Compatibility

- **Preserves** the application entirely. No scanner modifies source, and no
  finding is auto-fixed.
- **Adds** seven CI jobs, one schema, and one denylist export.
- **Breaks** nothing. Scan jobs cannot fail a build by construction.

## Dependencies

- **Blocks:** EPIC-04 (consumes `scan-run.json`), EPIC-06 (consumes
  `surface.*`), EPIC-07 (reruns this battery against a frozen tree).
- **Built on:** EPIC-00 (`CI-*` ids), EPIC-01 (the blocking/non-blocking
  asymmetry is defined against `containment.yml`).
- **Related:** EPIC-02 — wire this battery as early in EPIC-02 as possible, so
  surface growth is observed *during* construction, not only at its end. The
  concept doc asks for it *"from the first commit"*
  (`docs/mist-concept-evaluation.md:51`).

## Verification

```bash
# Envelope validates
node scripts/assemble-scan-run.mjs --fixtures test/fixtures/scanners \
  | npx ajv validate -s schemas/scan-run.schema.json

# Every scan job is non-blocking
node -e "…parse scan.yml, assert continue-on-error on all but assemble…"

# No suppression anywhere
test ! -f .semgrepignore && test ! -f .gitleaks.toml && echo "OK: no suppression"

# gitleaks sees full history and finds K1
grep -q 'fetch-depth: 0' .github/workflows/scan.yml && echo "OK: full history"

# SBOM produced and diffable
npx @cyclonedx/cyclonedx-npm --output-file sbom.json && node scripts/sbom-diff.mjs sbom.json sbom-base.json
```

Exit criteria:

1. All seven scanner classes run in CI and upload artifacts on every push and PR.
2. `scan-run.json` validates against the schema on every run, including runs
   where a scanner crashed.
3. Every scan job is non-blocking; `scan-jobs-nonblocking` passes.
4. No suppression file exists anywhere in the repository.
5. `gitleaks` reports K1 as a true positive from full history (after EPIC-02
   Phase 2e).
6. SBOM diff posts as a PR comment with added/removed and install-script deltas.
7. `security/denylist.json` is refreshed per run and read by EPIC-01's blocking
   gate.
8. `docs/SCANNERS.md` states each scanner's blind spots, not only its coverage.
