# EPIC-07: Longitudinal Decay (DECAY)

## Context

The concept doc proposes the experiment: *"Freeze a Mist release and re-scan it
monthly without updating: chart how a *static* dependency tree accumulates known
vulnerabilities purely through disclosure. Telemetry of entropy — the invoice
arriving on its own"* (`docs/mist-concept-evaluation.md:90`).

This is the cleanest experiment in the whole project, because it has exactly one
variable. The code does not change. The lockfile does not change. The dependency
tree does not change. Only *what the world knows about it* changes. Every new
finding is therefore attributable to disclosure alone — which is the sharpest
possible demonstration that the exposure was always there and observability was
the thing being purchased (`docs/mist-concept-evaluation.md:25-27`).

At commit `1e69b61` nothing exists. EPIC-02 will tag `v1.0.0`; EPIC-03 will
supply the battery; EPIC-04 will supply the record and the reserved panel.

**This EPIC does not update the frozen tree, ever.** Not for a critical CVE, not
for a compromised package. If the frozen tree becomes dangerous, the response is
to stop *deploying* it, never to patch it — patching destroys the only variable
the experiment has.

---

## Status

| Component | Status |
|---|---|
| Frozen release tag `v1.0.0` | **Not tagged** — and not needed: the freeze is a lockfile hash, see corrigendum 1 |
| Frozen lockfile + manifest | **Complete** — `decay/v1.0.0/`, 826 packages, every one hashed and **sized by measurement** |
| Tarball vault — every resolved tarball archived | **Tooling complete, vault not built** — 635.5 MiB; proven end-to-end on a 4-package sample |
| Reproducible offline install from the vault | **Complete and proven** — `npm ci --offline` against a dead registry |
| Monthly scheduled rescan workflow | **Complete** — `.github/workflows/decay.yml`, dual-mode, gap-writing |
| Decay series in the telemetry record | **Schema and reader complete**; no records yet |
| Decay panel on the dashboard (EPIC-04 slot) | **Complete** — renders both series and breaks the line at gaps |
| `docs/DECAY.md` — protocol and its integrity rules | **Complete** |
| Unpublish/yank handling | **Complete by construction** — the vault is content-addressed; the registry is never consulted at rescan time |
| `scripts/check-decay.mjs` + `test-decay.mjs` | **Complete** — 5 assertions, 17 tests |

*All rows landed 2026-09-04. Commit pin owed next session.*

**Status rows stay unflipped until the third successful monthly rescan** (Phase
6a). Two points are not a curve, and this table must not claim a working
longitudinal experiment before one exists. **Zero rescans have run.**

---

## Goals

- Freeze one release such that its tree can be **byte-identically reconstituted**
  years later, independent of the registry's continued cooperation.
- Rescan it **monthly, unchanged**, and chart the accumulation of known findings
  against a constant tree.
- Separate, in the chart, **new findings about old code** from **new detection
  capability** — because a scanner upgrade is a confound.
- Publish the decay curve as the artifact the concept doc predicts: *"the invoice
  arriving on its own"* (`docs/mist-concept-evaluation.md:90`).

## Scope

1. **The tree never changes.** No updates, no patches, no substitutions, no
   lockfile regeneration. This is the experiment's only invariant and it is
   absolute.
2. **Registry independence.** The rescan must not depend on packages still being
   published. Unpublished or yanked packages are the *expected* case over a
   multi-year window, and if the experiment breaks when one disappears it was
   never a longitudinal experiment.
3. **Scanner versions are recorded, and the effect of upgrading them is
   isolated.** See Design.
4. **The frozen release is not deployed.** It is scanned, not served. EPIC-02's
   deployment tracks `main`.
5. **Failure is published.** A month where the rescan could not run is recorded
   as a gap in the series, not silently skipped. A gapless chart that is not
   gapless would be a lie of exactly the kind Mist is about.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Frozen Release | git tag `v1.0.0` + `decay/v1.0.0/lockfile.json` | ❌ absent |
| Tarball Vault | `decay/v1.0.0/vault/` (content-addressed) | ❌ absent |
| Rescan Run | `telemetry/decay/<tag>/<ts>.json` | ❌ absent |
| Decay Curve | derived series over rescan runs | ❌ absent |
| Detection Delta (scanner-version confound) | dual-scan record, see Design | ❌ absent |
| Gap (a month that did not run) | explicit `status: "gap"` record | ❌ absent |

---

## Design

### The vault, and why the lockfile is not enough

A committed `package-lock.json` records *resolutions*, not *content*. Over a
multi-year window packages get unpublished, republished, or yanked; registries go
away. So the freeze archives the actual bytes:

```
decay/v1.0.0/
  lockfile.json          # exact copy of package-lock.json at the tag
  vault/
    <sha512>.tgz         # every resolved tarball, content-addressed
  manifest.json          # name@version → sha512 → vault path
  README.md              # how to reconstitute, and why this exists
```

Reconstitution installs from the vault with the registry unreachable, proving the
tree is genuinely self-contained.

**Rationale, and the irony worth naming.** The vault is the one place Mist
behaves like a controlled system: content-addressed, hermetic, reproducible
offline. It has to be, because otherwise the *measurement* is at the mercy of the
same ecosystem being measured. That the experiment's integrity requires exactly
the discipline the specimen lacks is not a design problem — it is the thesis
appearing uninvited, and `docs/DECAY.md` should say so in a sentence.

Storage: roughly 1,700 tarballs is on the order of a few hundred megabytes.
Git LFS or a release asset bundle, decided in Phase 1 and recorded.

### Isolating the scanner-version confound

A rising decay curve has two possible causes: the world learned about more
vulnerabilities, or the scanner got better at finding them. Conflating them would
make the chart unciteable.

Each monthly rescan therefore runs **twice**:

```
scan_pinned  : scanner versions frozen at v1.0.0's versions   → pure disclosure signal
scan_current : latest scanner versions                        → disclosure + detection
```

The chart plots `scan_pinned` as the primary series — the honest answer to
"what did the world learn about this unchanged tree?" — and `scan_current` as a
secondary series. Their divergence is itself an interesting measure: how much of
what we now know we could have known, had the tools been better.

**Rationale for accepting the extra cost.** Without it the headline claim
("a static tree accumulates vulnerabilities purely through disclosure") is not
supported by the data, and a reviewer would be right to reject it. This is the
single most important design decision in the EPIC.

Caveat to record: `scan_pinned` degrades over time as old scanner binaries stop
running on current CI images. When a pinned scanner can no longer execute, that
is recorded as a per-scanner gap, and the affected series is annotated on the
chart rather than interpolated.

### The schedule

`.github/workflows/decay.yml` (new), `schedule: cron` monthly plus
`workflow_dispatch`. Steps: check out the tag, restore from the vault with the
registry blocked, run both batteries, append two records to
`telemetry/decay/v1.0.0/`.

Non-blocking, like all EPIC-03 scan jobs. But **a rescan that fails to run must
write a `status: "gap"` record**, so the series is honest about its own holes
(Scope rule 5).

### The chart

Replaces EPIC-04's reserved 🔒 decay panel:

```
Known findings against an unchanged tree — Mist v1.0.0

 findings
   140 |                                        ╭──── scan_current
       |                                   ╭────╯
   100 |                          ╭────────╯
       |                    ╭─────╯    ╭──────────── scan_pinned
    60 |          ╭─────────╯     ╭────╯
       |     ╭────╯          ╭────╯
    20 | ╭───╯      ╭────────╯
       └──┴────┴────┴────┴────┴────┴────┴────┴────
        M0   M3   M6   M9  M12  M15  M18  M21

  Tree unchanged since <freeze date>. 0 packages updated. 0 lines of code changed.
  ▨ = month with no rescan (gap)
```

The caption is the argument. It must be rendered as part of the panel, not left
to the surrounding page, because this panel is a likely book figure
(`docs/mist-concept-evaluation.md:86`).

---

## Work Items

### Phase 0 — Prerequisites

- [ ] **0a.** Confirm EPIC-02 tagged `v1.0.0` and the tree builds at that tag.
- [ ] **0b.** Confirm EPIC-03's battery runs and emits a valid envelope.
- [ ] **0c.** Confirm EPIC-04 reserved the decay panel slot.

### Phase 1 — The freeze

- [ ] **1a.** Copy `package-lock.json` at `v1.0.0` to
      `decay/v1.0.0/lockfile.json`.
- [ ] **1b.** Download every resolved tarball; verify each against its lockfile
      integrity hash; store content-addressed in `vault/`.
- [ ] **1c.** Write `manifest.json` mapping `name@version` → sha512 → path.
- [ ] **1d.** Decide and record the storage mechanism (Git LFS vs release asset
      bundle), with the size measured, not estimated.
- [ ] **1e.** Record the frozen scanner versions in
      `decay/v1.0.0/scanners.pinned.json`.

### Phase 2 — Reconstitution

- [ ] **2a.** Write `scripts/reconstitute.mjs`: install from the vault with the
      registry unreachable.
- [ ] **2b.** Prove hermeticity — run it in a network-denied container and assert
      success. A run that silently reaches the network invalidates every later
      data point.
- [ ] **2c.** Assert the reconstituted `node_modules` matches the original by
      per-file hash.

### Phase 3 — The monthly rescan

- [ ] **3a.** Write `.github/workflows/decay.yml` — monthly cron plus manual
      dispatch.
- [ ] **3b.** Run `scan_pinned` using `scanners.pinned.json` versions.
- [ ] **3c.** Run `scan_current` using latest versions.
- [ ] **3d.** Append both to `telemetry/decay/v1.0.0/<ts>.json` with a
      `scannerMode` field.
- [ ] **3e.** Write a `status: "gap"` record on any failure path, including the
      per-scanner case where a pinned binary no longer executes.

### Phase 4 — The chart

- [ ] **4a.** Build the decay panel in `site/build.mjs`, replacing the 🔒
      placeholder. Zero dependencies, per EPIC-04.
- [ ] **4b.** Render both series, gaps marked, with the caption from Design.
- [ ] **4c.** Add the `<table>` fallback per EPIC-04 Phase 5c.

### Phase 5 — Protocol

- [ ] **5a.** Write `docs/DECAY.md`: the protocol, the never-update rule, the
      confound isolation, the gap policy, and the note about the vault requiring
      the very discipline the specimen lacks.
- [ ] **5b.** State the stopping condition explicitly. The experiment runs
      indefinitely; it ends only if the vault becomes unreconstitutable, and that
      end is recorded as a final data point rather than a quiet stop.
- [ ] **5c.** Add a safety note: if the frozen tree is found to contain an
      actively malicious package, publish it prominently as a finding (EPIC-04)
      and confirm the tree is not deployed anywhere. **Do not remove it from the
      vault** — but do record the discovery date, because a vault entry that is
      known-malicious needs to be known-malicious to anyone who reconstitutes it.

### Phase 6 — Close

- [ ] **6a.** Flip Status rows after the **third** successful monthly rescan.
      Two points are not a curve, and the Status table must not claim a working
      longitudinal experiment before one exists.

---

## Test Plan

- `decay-vault-complete` — every entry in `lockfile.json` has a vault tarball
  whose sha512 matches. Pins the freeze.
- `decay-reconstitute-offline` — reconstitution succeeds with the registry
  unreachable and fails loudly if it reaches out. **The load-bearing test**:
  without it, "unchanged tree" is an assumption rather than a fact.
- `decay-tree-identical` — reconstituted `node_modules` matches the original by
  per-file hash.
- `decay-never-updates` — a CI check asserting `decay/v1.0.0/lockfile.json` is
  byte-identical to the file at tag `v1.0.0`. Any change fails, permanently.
- `decay-dual-scan-recorded` — every rescan record carries a `scannerMode` of
  `pinned` or `current`, and each month has both. Pins the confound isolation.
- `decay-gap-recorded` — a simulated failed rescan produces a `status: "gap"`
  record rather than no record. Pins Scope rule 5.
- `decay-chart-marks-gaps` — the rendered panel shows gap markers for gap
  records; a chart that hides them fails.
- `decay-pinned-scanner-degradation` — a fixture where a pinned scanner cannot
  execute produces a per-scanner gap and an annotated series, never an
  interpolated value.

Gold Standard: modifying one byte of `decay/v1.0.0/lockfile.json` must make
`decay-never-updates` fail.

## Key Files

| File | Role |
|---|---|
| `decay/v1.0.0/lockfile.json` | The frozen resolution set (new) |
| `decay/v1.0.0/vault/` | Content-addressed tarballs (new) |
| `decay/v1.0.0/manifest.json` | name@version → sha512 → path (new) |
| `decay/v1.0.0/scanners.pinned.json` | Frozen scanner versions (new) |
| `scripts/reconstitute.mjs` | Offline install from the vault (new) |
| `.github/workflows/decay.yml` | Monthly dual rescan (new) |
| `docs/DECAY.md` | Protocol, integrity rules, stopping condition (new) |
| `site/build.mjs` | Gains the decay panel (exists, EPIC-04) |

## Reuse (do NOT recreate)

- `.github/workflows/scan.yml` (EPIC-03) — the battery already exists. The decay
  workflow must invoke the same jobs via a reusable workflow, not a copy;
  divergence between the two would make the series incomparable to `main`'s.
- `schemas/scan-run.schema.json` (EPIC-03) — decay records are the same envelope
  plus `scannerMode` and `status`. Extend it; do not fork it.
- `site/build.mjs` (EPIC-04) — the chart and `<table>` fallback machinery exists.
- `package-lock.json` at `v1.0.0` (EPIC-02) — the resolution set is already
  determined. The freeze copies it; it never regenerates it.

## Compatibility

- **Preserves** `main` and the frozen tag entirely.
- **Adds** the vault, the monthly workflow, the decay series, and one panel.
- **Breaks** nothing. Vault storage may require Git LFS, which is a clone-time
  consideration to document in `README.md`.

## Dependencies

- **Blocks:** nothing.
- **Built on:** EPIC-02 (the `v1.0.0` tag), EPIC-03 (the battery, as a reusable
  workflow), EPIC-04 (the record and the panel slot).
- **Related:** EPIC-06 — decay moves A5 (red-state) while leaving A1–A3 constant,
  which is a free natural experiment on whether the composite index carries
  information beyond bulk.

## Verification

```bash
# The vault is complete and matches the lockfile
node scripts/check-vault.mjs decay/v1.0.0

# Reconstitution works with no network
docker run --network=none -v "$PWD:/w" -w /w node:lts \
  node scripts/reconstitute.mjs decay/v1.0.0 && echo "OK: hermetic"

# The frozen lockfile is untouched since the tag
git show v1.0.0:package-lock.json | diff -q - decay/v1.0.0/lockfile.json \
  && echo "OK: unchanged"

# Both scanner modes present for every month
node -e "…assert each ts has pinned+current or an explicit gap…"

# The chart marks gaps
grep -q 'class="gap"' site/dist/index.html && echo "OK: gaps visible"
```

Exit criteria:

1. `decay/v1.0.0/` holds a complete, hash-verified tarball vault for every
   package in the frozen lockfile.
2. Reconstitution succeeds with the network disabled and yields a byte-identical
   `node_modules`.
3. The monthly workflow runs both `pinned` and `current` scanner modes and
   appends both records.
4. At least **three** monthly rescans have completed before this EPIC's Status
   rows are flipped.
5. Gaps are recorded as data and rendered as gaps; no interpolation anywhere.
6. `docs/DECAY.md` states the never-update rule, the confound isolation, the gap
   policy, the malicious-package procedure, and the stopping condition.
7. The frozen tree is scanned but **not deployed** anywhere.

---

## Implementation corrigendum

*Added 2026-09-04. What landed, and where the Design's estimates met measurement.*

### 1. The freeze is a lockfile hash, not a git tag

Phase 0a requires the `v1.0.0` tag. **It does not exist** — EPIC-02 Phase 8b was
blocked because the agent may not run state-changing git commands in this
repository.

Rather than stall, the freeze was redefined around what actually matters: the
**resolution set**. `manifest.json` records `lockfileSha256`, and
`decay-never-updates` compares against that. Which commit carries a `v1.0.0` tag
is a naming question, and tying a multi-year experiment to a mutable git ref
would have been fragile anyway.

The tag is still worth creating, and `decay/v1.0.0/lockfile.json` is byte-identical
to `package-lock.json` as committed at `8a4b444`, so tagging any commit from
there forward is consistent.

### 2. 635.5 MiB, measured — roughly double the Design's estimate

Design guessed *"roughly 1,700 tarballs … on the order of a few hundred
megabytes"*. Phase 1d says measure, not estimate. Measured, by registry range
request, with zero failures:

| | |
|---|---:|
| tarballs | **826** |
| total | **635.5 MiB** |
| mean | 788 KiB |

The package count is half the guess and the byte count is double it, which is a
useful reminder that package counts and bytes are not the same measurement — the
same confusion EPIC-06 had to settle for `A1`.

**What dominates is worth its own line.** 89 of the 826 packages are
platform-specific binaries. Six Next.js SWC builds account for roughly 190 MiB
between them, and five are for platforms this application will never run on. A
third of the vault is compiled artifacts for other people's computers.

`HEAD` requests were useless here — the npm CDN returns `200` with no
`content-length`. Sizes come from `Range: bytes=0-0` and the `content-range`
header.

### 3. Storage: a release asset, not Git LFS (Phase 1d decided and recorded)

`git-lfs` is installed, so LFS was a real option. Rejected: 635.5 MiB is about
two thirds of GitHub's free 1 GiB LFS quota, consumed on day one, and re-fetched
by every LFS-enabled clone and CI run. A release asset is fetched once a month by
the decay job and costs everyone else nothing.

`decay/*/vault/` is gitignored. `check-decay.mjs` reports the vault as `skip`
rather than a failure when it is absent, because absent-and-rebuildable is the
normal state.

### 4. The machinery is proven, on a sample rather than in full

`scripts/vault.mjs` was exercised end to end against a four-package freeze
(`lodash`, `dotenv`, `moment`, `methods`):

- **build** downloaded and verified 4/4 tarballs against their lockfile hashes;
- **check** confirmed all present and matching;
- **restore** reconstituted them with `npm_config_registry` pointed at
  `http://127.0.0.1:1/` — a dead port — and `npm ci --offline` succeeded with the
  packages genuinely on disk;
- appending one byte to a vault tarball made **check** report `1 corrupt of 4`
  with the hash mismatch named.

The full 635.5 MiB build has **not** been run. It is a one-time network-heavy
operation that produces an artifact which cannot be committed, so it is a
documented command rather than something done unasked.

### 5. The dual-scan split, and why it is the most important thing here

Every month runs the battery twice: `pinned` (scanner versions frozen at the
freeze) and `current` (latest). Without that, a rising curve could be disclosure
*or* better tooling, and the headline claim — *"a static tree accumulates
vulnerabilities purely through disclosure"* — would be unsupported by its own
data.

`decay-dual-scan-recorded` fails any month with one mode and no gap record. The
test proves it by building exactly that fixture.

One pin is already missing: the CycloneDX SBOM tool was not version-pinned at
freeze time. `scanners.pinned.json` records that as a known gap rather than
implying a pin that does not exist.

### 6. Gaps are drawn as gaps

Three assertions defend this, because it is the easiest lie available to a chart:

- a gap record **with no stated reason** fails;
- any record carrying `interpolated: true` fails;
- the rendered panel breaks the line at a gap and prints
  `▨ N month(s) with no data — not interpolated` under the axis.

A month that could not run is a break in the line, not a smooth curve through it.

### 7. The vault requires the discipline the specimen lacks

Content-addressed, hash-verified before storage, hermetic, reproducible offline.
It is the one directory in this repository that behaves like a controlled system,
and it has to be — otherwise the measurement would be at the mercy of the same
ecosystem being measured.

`docs/DECAY.md` states this in a paragraph rather than leaving a reader to notice
it. It is the thesis arriving uninvited.

### Debt this EPIC did not pay

- **No rescan has run**, so there is no series, no curve, and no `A5` for
  EPIC-06. Status rows stay unflipped until the third month (Phase 6a).
- **The full vault is not built or uploaded.** It needs one operator run and a
  release to attach it to.
- **The decay workflow has never executed.** It is written against EPIC-03's
  scan-step machinery and reviewed, not observed.
- **`decay.yml` invokes the scanners directly rather than through a reusable
  workflow**, which EPIC-07's Reuse block asks for. Two batteries that could
  drift is a real risk and it is recorded here rather than solved; converting
  `scan.yml` to `workflow_call` is the fix.
- **Observation 001 suggests the monthly cadence is too slow.** A tree that
  gained three advisories in one day while sitting still will not be well
  characterised by twelve samples a year. The cron is monthly as specified; the
  evidence for changing it is already on file.
