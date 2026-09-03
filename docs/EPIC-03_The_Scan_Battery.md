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
| `npm audit` job → JSON artifact | **Complete (dormant)** — job built; records `skipped` until EPIC-02 creates a lockfile |
| `osv-scanner` job → JSON artifact | **Complete (dormant)** — same; binary pinned to `1.9.2` |
| Behavioral SCA (Socket or equivalent) | Planned — **Phase 2a needs a real tree.** Job records `skipped` with that reason; not stubbed |
| `semgrep` SAST over first-party code | **Complete (dormant)** — scoped to `apps/**`, `scripts/**`; wakes when `apps/` exists |
| `gitleaks` secret detection over full history | **Complete — RUNNING NOW.** The only live scanner. `fetch-depth: 0`, ruleset generated from `schemas/secret-patterns.json` |
| CycloneDX SBOM generation | **Complete (dormant)** — needs a lockfile |
| SBOM diff on PR | **Complete** — `scripts/sbom-diff.mjs`, tested against `fixtures/sbom/`; posts to the step summary and as a PR comment |
| License scan | **Complete (dormant)** — `scripts/license-inventory.mjs`; obligation classifier tested, needs `node_modules` to run |
| `scan-run.json` normalized envelope | **Complete** — `schemas/scan-run.schema.json`, `scripts/assemble-scan-run.mjs`, 7 normalizers |
| Advisory denylist export for EPIC-01's gate | **Complete, redirected** — refreshes `deploy/advisory-denylist.txt` as a **proposal**; see corrigendum 1 |
| `docs/SCANNERS.md` — coverage and blind spots | **Complete** — one section per scanner, blind spots first |
| Instrument-integrity gate | **Complete** — `scripts/check-scan.mjs` (9 assertions) + `scripts/test-scan.mjs` (40 tests) |

*Every `**Complete**` row above landed 2026-09-03. Commit pin is owed at the
start of the next session, per the convention EPIC-01 and EPIC-08 followed.*

**`Complete (dormant)` means the job is built, wired and tested, and currently
records `status: "skipped"` with a stated reason because there is no dependency
tree yet.** It does not mean it reports zero. `null` in a `surface.*` field means
NOT MEASURED. No edit to `scan.yml` is needed when EPIC-02 lands — the jobs test
for the lockfile themselves.

**This EPIC cannot close until EPIC-02 Phase 1** (a real tree to scan) and its
own Phase 2a (a behavioural SCA tool, characterised honestly).

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
| Scanner (a sensor) | one CI job per class | ✅ 7 jobs in `.github/workflows/scan.yml` |
| Finding (one observation) | normalized record in `scan-run.json` | ✅ `schemas/scan-run.schema.json` `$defs/finding` |
| Scan Run (one full battery pass) | `scan-run.json` envelope | ✅ `scripts/assemble-scan-run.mjs` |
| SBOM (the surface, enumerated) | CycloneDX JSON artifact | ⏸ job built, dormant until EPIC-02 |
| Surface Delta (growth per PR) | SBOM diff output | ✅ `scripts/sbom-diff.mjs` |
| Advisory Denylist (currently-flagged malicious pkgs) | ~~`security/denylist.json`~~ `deploy/advisory-denylist.txt` | ✅ existed already (EPIC-01); refreshed by proposal — corrigendum 1 |
| Scanner Status (ran / skipped / crashed) | `$defs/scanner.status` | ✅ added — corrigendum 2 |

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
| `scripts/assemble-scan-run.mjs` | Normalizer across seven scanners; owns `CI_MAP` (new) |
| `scripts/scan-step.sh` | Runs one scanner and records ran/skipped/crashed honestly (new) |
| `scripts/check-scan.mjs` | Instrument-integrity gate, 9 assertions (new) |
| `scripts/test-scan.mjs` | 40 tests; every assertion proven able to say no (new) |
| `scripts/sbom-diff.mjs` | Surface growth per PR (new) |
| `scripts/gen-gitleaks-config.mjs` | gitleaks ruleset from `schemas/secret-patterns.json` (new) |
| `scripts/license-inventory.mjs` | Obligation classes, not bare SPDX ids (new) |
| `scripts/refresh-denylist.mjs` | Proposes additions to EPIC-01's denylist (new) |
| `scripts/lib/json-schema-subset.mjs` | The one schema validator; extracted from `check-ledger.mjs` |
| `scripts/lib/yaml-jobs.mjs` | Reads job- vs step-level `continue-on-error` (new) |
| `scripts/lib/is-main.mjs` | Realpath-safe entry-point guard (new; see corrigendum 8) |
| ~~`security/denylist.json`~~ | **Not created.** `deploy/advisory-denylist.txt` already exists — corrigendum 1 |
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

These are the real commands. They need Node 24 and nothing else — no `npm
install`, no `npx`, zero dependencies. If `node` reports *"No version is set"*,
see corrigendum 7.

```bash
# The instrument is honest: 9 assertions over scan.yml, the schemas and the
# CI-* mapping table. Exits 1 on a blocking scan job, a suppression file, a
# shallow gitleaks clone, or an unmapped finding type.
node scripts/check-scan.mjs

# 40 tests. Every assertion above is run twice: once against a clean tree and
# once against a tree broken in exactly the way it exists to catch.
node scripts/test-scan.mjs

# A full battery, normalized from fixture output. 7 scanners, 18 findings.
node scripts/assemble-scan-run.mjs --raw fixtures/scanners

# A battery where semgrep crashed and gitleaks was skipped. Still a valid
# envelope; the crash is recorded, not hidden.
node scripts/assemble-scan-run.mjs --raw fixtures/scanners-crash

# Surface growth per PR.
node scripts/sbom-diff.mjs --base fixtures/sbom/base.json --head fixtures/sbom/head.json \
  --base-sca fixtures/sbom/base.sca.json --head-sca fixtures/sbom/head.sca.json

# The gitleaks ruleset, generated from the ONE secret ruleset. Note the path:
# a committed .gitleaks.toml is what the no-suppression assertion forbids.
node scripts/gen-gitleaks-config.mjs --out build/gitleaks.mist.toml

# No suppression anywhere (check-scan asserts this and seven more paths).
test ! -f .semgrepignore && test ! -f .gitleaks.toml && echo "OK: no suppression"

# What this repository actually produces today: seven scanners, every one of
# them 'skipped' with a stated reason, and every surface count null.
# Null means NOT MEASURED. It does not mean zero.
mkdir -p build/raw
for id in npm-audit osv-scanner sca-behavioral semgrep gitleaks sbom licenses; do
  MIST_SKIP_REASON="no dependency tree yet (EPIC-02)" bash scripts/scan-step.sh "$id" build/raw
done
node scripts/assemble-scan-run.mjs --raw build/raw
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

---

## Implementation corrigendum

*Added 2026-09-03. Deltas between the `## Design` section above and what
actually landed, including three places where this EPIC's own text was wrong.*

1. **`security/denylist.json` was not created, and must not be.** The Key Files
   table asks for a new file. `deploy/advisory-denylist.txt` already exists
   (EPIC-01), `scripts/check-containment.sh` reads it as a **blocking** input,
   and its own header says *"Refreshed by the EPIC-03 osv-scanner job, which has
   not been built yet."* A second denylist would split the gate's input and the
   gate would enforce whichever half somebody remembered.
   `scripts/refresh-denylist.mjs` refreshes the existing file instead. This EPIC
   said "do NOT recreate" in its own Reuse block and then asked for a
   recreation; the Reuse block wins.

   It also **proposes rather than writes**. The denylist is an input to a
   blocking gate. A non-blocking scan job able to rewrite what blocks merge is
   exactly backwards, so the job emits
   `build/advisory-denylist.proposed.txt` and a human copies the additions
   across. Slower, and the only version that is actually safe.

2. **The envelope gained a `status` field, and `surface.*` became nullable.**
   The Design's scanner record has `exitCode` and `durationMs` but no way to say
   *"this scanner never ran"*. Without that, a scanner that was skipped is
   indistinguishable from one that ran clean, and `surface: { transitivePackages:
   0 }` reads as "no dependencies" rather than "not measured". With five of the
   seven scanners dormant until EPIC-02, that is not a hypothetical — it is
   every run between now and then. `status: ran | skipped | crashed` plus
   nullable counts fixes it. **EPIC-06 must treat `null` as absent data, never
   as zero.**

3. **`.gitleaks.toml` is generated into `build/`, not committed and not absent.**
   The Verification block asserts `test ! -f .gitleaks.toml`, treating the file
   as suppression. `schemas/secret-patterns.json` requires EPIC-03 to generate
   its gitleaks ruleset from that file rather than fork it. Both are right:
   generating to an uncommitted path means nothing can be quietly allowlisted in
   a PR *and* the ruleset still has one source. `scripts/check-scan.mjs` asserts
   both halves — no committed config, and zero `[allowlist]` sections in the
   generated one. The generated config is additive
   (`[extend] useDefault = true`), so gitleaks' own rules stay on.

4. **The Test Plan's eight tests became 40, and the checks 9.** The extra
   coverage is mostly Gold Standard work: each assertion is run against a tree
   broken in exactly the way it exists to catch. The most valuable addition is
   `scan-jobs-nonblocking (step-level continue-on-error does NOT count)` — a
   naive regex over `scan.yml` is satisfied by a `continue-on-error` on a single
   *step* while the job still blocks merge, which is precisely the mistake the
   assertion is for. Indentation is the only thing separating the two, so
   `scripts/lib/yaml-jobs.mjs` reads indentation rather than matching text.

5. **A shared JSON Schema validator was extracted, not copied.**
   `scripts/check-ledger.mjs` carried one inline. Copying it would repeat the
   hazard EPIC-08 named for the secret regexes, so it moved to
   `scripts/lib/json-schema-subset.mjs` and both gates import it. The ledger's 7
   checks and 17 tests were re-run against the refactor before anything else was
   built.

   The extraction immediately paid: the validator was applying `pattern` to
   `null`, which JSON Schema forbids, so the nullable `counterInvariant` field
   was unrepresentable. That bug had been latent — the ledger schema happens to
   have no nullable patterned field.

6. **`scan-schema-keywords-supported` is new and guards a silent failure.** The
   subset validator ignores keywords it does not implement, so an unsupported
   keyword in a schema is an **unenforced rule that looks enforced**. The check
   walks both schemas and fails on any keyword outside the supported set.

7. **Local Node still is not pinned in the repository, and that is a live
   papercut.** EPIC-01's corrigendum item 4 records that no `.tool-versions`
   exists and that `asdf` reports no version for this repository — which makes
   every `node` command in this EPIC's Verification block fail locally with
   *"No version is set for command node"*. A `.tool-versions` was written during
   this session and is **not** committed: it is excluded by a contributor's
   global `~/.gitignore_global`, so `git add` silently skips it.

   CI is unaffected — `scan.yml` and `ledger.yml` both pin `node-version: '24'`
   in `actions/setup-node`. The gap is local only. A contributor running the
   Verification block needs either `asdf local nodejs 24.14.1` (which produces
   an untracked file) or `git add -f .tool-versions` to track one over the
   global ignore. Committing it is a real decision — it fixes the papercut for
   everyone and overrides a contributor's deliberate personal setting — so it is
   recorded here rather than made quietly.

8. **A silent-success bug was found by the tests, in the scripts' own entry
   point.** Every script guarded `main()` with
   `resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))`. On
   macOS `/tmp` is a symlink to `/private/tmp`, so the two differ, `main()` never
   runs, and the process **exits 0 having done nothing**. The assembler
   "passed" a test by producing no output at all. Fixed in
   `scripts/lib/is-main.mjs` by comparing realpaths. The failure mode — green
   tick, empty file — is exactly what a scan battery must not have.

### Debt this EPIC did not pay

- **The blind spots in `docs/SCANNERS.md` are reasoned, not measured.** Nobody
  has planted a known-bad package and confirmed which scanners miss it. They are
  arguments until someone does.
- **The fixtures are hand-written**, shaped from documented tool output rather
  than captured from a real run. Phase 6b should replace them with captured
  output and record any shape mismatch here.
- **No scanner sees the CI configuration itself.** A workflow leaking a token, or
  an action pinned to a mutable tag, is unmeasured by all seven. That hole
  belongs to no EPIC yet.
- **Mis-numbered `path:line` citations remain unchecked**, now found in 4 of 4
  EPICs. Still the oldest debt in the repository and still nobody's Phase. This
  EPIC's own were verified line by line rather than asserted, so the debt is
  actionable:

  | Cited as | Actually at | The quote |
  |---|---|---|
  | `mist-concept-evaluation.md:25-27` | `:27` | "the scans … are sensors bolted onto a plant" |
  | `mist-concept-evaluation.md:55` | `:54` | "the interesting layer" — behavioural SCA |
  | `mist-concept-evaluation.md:56` | `:55` | "a median project's honest dozen" (`:56` is gitleaks) |
  | `mist-concept-evaluation.md:59` | `:57` | "surface growth over time" (`:59` is blank) |
  | `mist-concept-evaluation.md:60` | `:58` | "obligations nobody read" |

  `:51`, `:53-60` and `:68` are correct. The citations were **not** silently
  fixed in the prose above: the same four wrong numbers appear in three other
  EPICs, and correcting one copy would leave the checker with less to find and
  the reader with no reason to believe the rest. `docs/SCANNERS.md` uses the
  corrected numbers, so the two files disagree on purpose until a checker
  exists.
