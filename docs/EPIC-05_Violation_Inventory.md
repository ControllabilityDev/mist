# EPIC-05: Violation Inventory (VIOL)

## Context

The concept doc identifies the inventory as the discipline that makes Mist
*citable rather than merely cautionary*: *"a maintained `VIOLATIONS.md` mapping
each dependency (or class of them) to the kernel invariant it breaks — hidden
input channels (install scripts, env-switched behavior, import-time network),
unfakeable seams (live-API coupling with no port), uncontrolled emission
(libraries that log, telemeter, or phone home on their own initiative), boundary
erosion (format and transport types leaking through every layer). This inventory
is the book's exhibit: each entry is a kernel invariant with a CVE-shaped
shadow"* (`docs/mist-concept-evaluation.md:62`).

At commit `1e69b61` no `VIOLATIONS.md` exists. EPIC-00 will define the
counter-invariant ids `CI-1`..`CI-6` in `docs/ANTI_KERNEL.md`; EPIC-02 will
create the dependency surface; EPIC-03 will produce behavioral SCA findings. This
EPIC is the join between all three.

The word **maintained** in the concept doc is the whole difficulty. An inventory
written once and left to rot would be worse than none — it would misrepresent the
specimen. So the deliverable is not a document; it is a document plus the
mechanism that makes it impossible to drift.

**This EPIC does not score anything** (that is EPIC-06's Mist Index) and does not
fix any violation. Fixing violations is EPIC-09, on a separate branch.

---

## Status

| Component | Status |
|---|---|
| ~~`violations.yaml`~~ `violations.json` — machine-readable source of truth | **Complete** — 47 entries; JSON not YAML, see corrigendum 1 |
| `VIOLATIONS.md` — generated human view | **Complete** — 485 lines, byte-identity enforced |
| Class taxonomy (four classes → `CI-*` ids) | **Complete** — `docs/ANTI_KERNEL.md`, one home |
| `scripts/gen-violations.mjs` generator | **Complete** — zero dependencies |
| Completeness check (every direct dep classified) | **Complete** — `scripts/check-violations.mjs`, 8 assertions, **blocking** |
| Evidence linking (~~SCA findings~~ → violation rows) | **Complete, redirected** — evidence resolves against the tree, not against `scan-run.json`; see corrigendum 2 |
| First-party violation entries (app-level, not dep-level) | **Complete** — 9 first-party violations, counted in the summary |
| `.github/workflows/violations.yml` | **Complete** — Mist's **third** blocking job |
| `scripts/test-violations.mjs` | **Complete** — 10 tests, every assertion proven able to refuse |

*All rows landed 2026-09-04. Commit pin owed next session.*

**The counts, measured not estimated:**

| Class | Entries | Second-party | First-party |
|---|---:|---:|---:|
| hidden-input-channel | 8 | 8 | 0 |
| unfakeable-seam | 6 | 0 | 6 |
| uncontrolled-emission | 2 | 2 | 0 |
| boundary-erosion | 3 | 0 | 3 |
| none | 28 | 28 | 0 |
| **total** | **47** | **38** | **9** |

---

## Goals

- Map **every direct dependency** to the counter-invariant(s) it exhibits, or to
  an explicit `class: none`.
- Record **first-party violations** too — the seamless provider call, the
  module-scope Prisma client, the business rules inside components — because
  those are architectural, not purchased, and the inventory would be dishonest
  without them.
- Make the inventory **impossible to drift** via a CI completeness check.
- Attach **evidence**: each violation cites either a `path:line` in first-party
  code or a scanner finding id from `scan-run.json`.

## Scope

1. **`violations.yaml` is the source of truth**; `VIOLATIONS.md` is generated and
   never hand-edited. A hand edit to the Markdown fails CI.
2. **Every direct dependency has a row.** Absence is not an option; `class: none`
   with a one-line justification is.
3. **Transitive packages are handled by class, not individually.** Enumerating
   1,700 packages by hand is neither possible nor useful; the concept doc
   anticipates this with *"each dependency (or class of them)"*
   (`docs/mist-concept-evaluation.md:62`).
4. **Evidence or nothing.** A violation with no cited `path:line` and no scanner
   finding id is a claim, and claims do not go in the exhibit.
5. **No fixing.** Recording a violation never triggers a fix on `main`.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Violation (one exhibited counter-invariant) | entry in `violations.yaml` | ❌ absent |
| Class (the four families) | `class:` enum | ❌ absent |
| Counter-Invariant | `ci:` field, `CI-1`..`CI-6` | ❌ absent |
| Subject (what violates) | `subject:` — package@range or `path:line` | ❌ absent |
| Evidence | `evidence:` — finding id or `path:line` | ❌ absent |
| Party (first vs second) | `party:` field | ❌ absent |

---

## Design

### The four classes, and their mapping to `CI-*`

Taken verbatim from `docs/mist-concept-evaluation.md:62`, then joined to the
EPIC-00 ids:

| Class | Meaning | Primary `CI-*` |
|---|---|---|
| `hidden-input-channel` | install scripts, env-switched behavior, import-time network, semver drift | CI-1 |
| `unfakeable-seam` | live-API coupling with no port; global client imports | CI-6 |
| `uncontrolled-emission` | libraries that log, telemeter, or phone home on their own initiative | CI-2 |
| `boundary-erosion` | format and transport types leaking through every layer | CI-3 |
| `none` | no counter-invariant exhibited; justification required | — |

**Rationale for `none` being a first-class class rather than an omission.** If a
dependency can simply be missing from the inventory, the completeness check has
nothing to assert and "maintained" becomes unverifiable. Forcing an explicit
`none` also makes the honest cases visible: some median dependencies really are
inert, and saying so strengthens the exhibit rather than weakening it.

### `violations.yaml`

```yaml
schemaVersion: 1
entries:
  - id: V-001
    subject: "moment-timezone@^0.5"
    party: second
    class: hidden-input-channel
    ci: [CI-1]
    evidence:
      - "sca:pkg-network-at-import:moment-timezone"     # scan-run.json finding id
    note: >
      Loads timezone data at import time. The set of zones the app believes in
      is a function of when node_modules was populated, not of any input the
      app supplies.

  - id: V-014
    subject: "apps/web/app/dashboard/CurrentConditions.tsx:7"
    party: first
    class: unfakeable-seam
    ci: [CI-6, CI-3]
    evidence:
      - "apps/web/app/dashboard/CurrentConditions.tsx:7"
    note: >
      The provider is called from the component body. There is no port, so the
      only way to test this is to mock axios — which asserts our belief about
      the provider, never the provider.

  - id: V-031
    subject: "dotenv@^16"
    party: second
    class: none
    ci: []
    note: >
      Reads a file at explicit call time. No install script, no network, no
      import-time effect. Inert.
```

**Rationale for `evidence` accepting scanner finding ids.** It makes the
inventory *self-updating in the direction that matters*: when EPIC-03's SCA
stops reporting a behavior (a package removed an install script in a minor
release), the evidence link dangles and CI flags it. The inventory then tracks
reality rather than a snapshot of 2026.

### The completeness check

`scripts/check-violations.mjs` (new). Blocking? **No** — see below. It asserts:

```
1. every name in every package.json `dependencies`/`devDependencies` appears as
   a `subject` in violations.yaml (matched by package name, ignoring range)
2. every entry has a class from the enum, and a non-empty note
3. every entry with class != none has at least one evidence item
4. every scanner-finding evidence id exists in the latest scan-run.json
5. every path:line evidence anchor exists and the file has at least that many lines
6. VIOLATIONS.md is byte-identical to the generator's output
```

**Rationale for making this check blocking on `main`.** Unlike EPIC-03's
scanners, this is not a measurement of decay — it is a measurement of *whether
the project is doing its own documentation job*. A drifted inventory is a defect
in Mist, not a finding about the ecosystem. So it joins EPIC-01's
`containment.yml` as one of the two blocking gates, and the asymmetry is worth
stating explicitly in `docs/SCANNERS.md`.

Check 5 deserves a caveat: `path:line` anchors drift as files change. The
generator therefore also emits a fingerprint of the anchored line's content, and
a changed fingerprint produces a warning (not a failure) telling the author to
re-verify the anchor. Failing on line drift would make the inventory hostile to
edit and it would be abandoned — which is the actual risk.

### `VIOLATIONS.md` (generated)

Grouped by class, then by party, with a summary header:

```markdown
# VIOLATIONS

Generated from violations.yaml at <sha> on <date>. Do not edit by hand.

| Class | Entries | Second-party | First-party |
|---|---|---|---|
| hidden-input-channel | 23 | 21 | 2 |
| unfakeable-seam      |  9 |  3 | 6 |
| uncontrolled-emission|  7 |  7 | 0 |
| boundary-erosion     | 11 |  4 | 7 |
| none                 | 18 | 18 | 0 |
```

**Rationale for surfacing the first-party column.** The concept doc's argument is
that Mist's defects are second-party and emergent
(`docs/mist-concept-evaluation.md:68`). That claim is only credible if the
inventory also counts the first-party ones honestly and shows they are the
smaller number — and shows *which* ones, so nobody has to take it on faith.

---

## Work Items

### Phase 0 — Prerequisites

- [ ] **0a.** Confirm `docs/ANTI_KERNEL.md` defines `CI-1`..`CI-6` (EPIC-00).
- [ ] **0b.** Confirm at least one `scan-run.json` exists with SCA findings
      (EPIC-03 Phase 2).
- [ ] **0c.** Write `schemas/violations.schema.json` and validate an empty
      `violations.yaml` against it before any entry is written.

### Phase 1 — Taxonomy and generator

- [ ] **1a.** Write the class→`CI-*` mapping table into `docs/ANTI_KERNEL.md` as
      a new section, so the taxonomy has one home.
- [ ] **1b.** Write `scripts/gen-violations.mjs` producing `VIOLATIONS.md` from
      `violations.yaml`. Zero dependencies (a small YAML subset parser, or
      `violations.json` if that proves fiddly — decide and record the choice).
- [ ] **1c.** Write `scripts/check-violations.mjs` implementing the six
      assertions.

### Phase 2 — Second-party entries

- [ ] **2a.** Classify every direct dependency from EPIC-02's slate
      (`docs/EPIC-02_The_Weather_Dashboard.md` Design table).
- [ ] **2b.** Attach SCA evidence ids for install scripts, network-at-install,
      and network-at-import from the latest `scan-run.json`.
- [ ] **2c.** Write the `class: none` entries with real justifications. Do not
      pad the counts by classifying inert packages as violations.

### Phase 3 — Transitive classes

- [ ] **3a.** Add class-level entries covering transitive packages in aggregate:
      one entry per behavior (e.g. "62 packages run install scripts"), citing the
      SCA finding set rather than individual names.
- [ ] **3b.** State the enumeration limit explicitly in `VIOLATIONS.md` — that
      transitive packages are covered by class and why. Silent truncation would
      read as coverage that does not exist.

### Phase 4 — First-party entries

- [ ] **4a.** Enter the seamless provider call
      (`apps/web/app/dashboard/CurrentConditions.tsx`) as `unfakeable-seam`.
- [ ] **4b.** Enter the module-scope Prisma client (`apps/api/src/db.ts`) as
      `unfakeable-seam`.
- [ ] **4c.** Enter the in-view business rules (`feelsHarsh`, unit conversion) as
      `boundary-erosion` / no purity partition.
- [ ] **4d.** Enter the mock-heavy test suite as its own entry: the prophecy
      problem, citing `docs/mist-concept-evaluation.md:29`. This is the entry the
      fakeability chapter cites.

### Phase 5 — The gate

- [ ] **5a.** Add `.github/workflows/violations.yml` running
      `check-violations.mjs`, **blocking**. Document why this blocks and the scan
      jobs do not, in the workflow header and in `docs/SCANNERS.md`.
- [ ] **5b.** Add the line-fingerprint warning path for drifted `path:line`
      anchors.
- [ ] **5c.** Link `VIOLATIONS.md` from `README.md` and from the dashboard
      (EPIC-04 Phase 3b bar links).

### Phase 6 — Close

- [ ] **6a.** Flip Status rows; record the real per-class counts in the
      corrigendum.

---

## Test Plan

- `viol-schema-valid` — `violations.yaml` validates against
  `schemas/violations.schema.json`.
- `viol-completeness` — a fixture `package.json` with an unclassified dependency
  fails `check-violations.mjs`. **The load-bearing test**: it is what makes
  "maintained" true.
- `viol-none-needs-note` — a `class: none` entry with an empty note fails.
- `viol-evidence-required` — a non-`none` entry with no evidence fails.
- `viol-evidence-resolves` — an evidence finding id absent from the fixture
  `scan-run.json` fails.
- `viol-md-is-generated` — hand-editing `VIOLATIONS.md` fails the byte-identity
  check.
- `viol-anchor-drift-warns` — a changed line fingerprint produces a warning and
  exit code 0, not a failure. Pins the deliberate softness of check 5.
- `viol-first-party-counted` — asserts the generated summary table has a
  non-zero first-party column. Guards against the inventory quietly becoming a
  dependency-only document, which would make the second-party claim unfalsifiable.

Gold Standard: adding a dependency to `package.json` without a `violations.yaml`
entry must make `viol-completeness` fail.

## Key Files

| File | Role |
|---|---|
| `violations.yaml` | Machine-readable source of truth (new) |
| `VIOLATIONS.md` | Generated exhibit; never hand-edited (new) |
| `schemas/violations.schema.json` | Entry schema (new) |
| `scripts/gen-violations.mjs` | Generator, zero deps (new) |
| `scripts/check-violations.mjs` | Six-assertion completeness gate (new) |
| `.github/workflows/violations.yml` | The second blocking job (new) |
| `docs/ANTI_KERNEL.md` | Hosts the class→`CI-*` mapping (exists, EPIC-00) |

## Reuse (do NOT recreate)

- `docs/mist-concept-evaluation.md:62` — the four classes are already named and
  defined. Use those exact names; do not invent a fifth.
- `docs/ANTI_KERNEL.md` `CI-1`..`CI-6` (EPIC-00) — the join keys.
- `schemas/scan-run.schema.json` (EPIC-03) — finding ids come from there; do not
  re-run scanners inside the generator.
- `docs/EPIC-02_The_Weather_Dashboard.md` dependency slate — the one-step intents
  are already written; the inventory records the *violation*, not the intent.

## Compatibility

- **Preserves** all code. Nothing is fixed or refactored by this EPIC.
- **Adds** the inventory, its schema, its generator, and the second blocking CI
  job.
- **Breaks** nothing, though it will block any PR adding an undocumented
  dependency — which is the intent.

## Dependencies

- **Blocks:** EPIC-06 (the Index reads violation counts by class), EPIC-09 (the
  refactor is measured by which violations it eliminates).
- **Built on:** EPIC-00 (`CI-*` ids), EPIC-02 (the dependency surface),
  EPIC-03 (SCA evidence).
- **Related:** EPIC-04 — the "findings by counter-invariant" panel and this
  inventory must agree; a divergence between them is a real defect.

## Verification

```bash
# Schema and completeness
node scripts/check-violations.mjs

# The Markdown is generated, not authored
node scripts/gen-violations.mjs > /tmp/VIOLATIONS.gen.md
diff -q /tmp/VIOLATIONS.gen.md VIOLATIONS.md && echo "OK: generated"

# Every direct dependency is classified
node -e "…assert set(deps) subset of set(subjects)…"

# First-party entries exist and are counted
grep -A6 '^| Class' VIOLATIONS.md | awk -F'|' 'NR>2 {s+=$5} END {exit !(s>0)}' \
  && echo "OK: first-party violations recorded"

# The generator has no dependencies
node -e "…assert gen-violations.mjs imports only node: builtins…"
```

Exit criteria:

1. Every direct dependency in every `package.json` has a `violations.yaml` entry
   with a class and a note.
2. Every non-`none` entry carries evidence that resolves — a scanner finding id
   present in `scan-run.json`, or an existing `path:line`.
3. `VIOLATIONS.md` is byte-identical to generator output; hand edits fail CI.
4. First-party violations are recorded and shown in the summary table, including
   the mock-heavy test suite entry.
5. Transitive coverage is by class, and the enumeration limit is stated in the
   document rather than left implicit.
6. `violations.yml` runs blocking on PRs, and the blocking/non-blocking asymmetry
   with EPIC-03 is documented in `docs/SCANNERS.md`.

---

## Implementation corrigendum

*Added 2026-09-04. Deltas between `## Design` and what landed.*

### 1. The source of truth is `violations.json`, not `violations.yaml`

Design permits this explicitly — *"a small YAML subset parser, or
`violations.json` if that proves fiddly — decide and record the choice"* — so
this is the recording of that choice.

Every entry carries a paragraph of prose. A hand-rolled YAML subset handling
block scalars, nested lists and quoting is a **silent-misparse** hazard: it does
not crash, it quietly returns the wrong string. This is the one document in the
repository that exists to be cited, so the format that cannot be subtly misread
beat the format that is nicer to type. The human-facing artifact is the
generated Markdown regardless.

### 2. Evidence resolves against the tree, not against `scan-run.json`

Design has evidence pointing at behavioural-SCA finding ids from EPIC-03.
**Phase 0b could not be satisfied: EPIC-03 Phase 2a never wired an SCA tool, so
there are no finding ids to cite.** Scope rule 4 says a violation with no
evidence is a claim, and claims do not go in the exhibit — so the choice was to
find another evidence source or write no violations.

`scripts/lib/evidence.mjs` resolves five mechanical forms instead:

| Form | Proves |
|---|---|
| `install-script:<pkg>` | `<pkg>/package.json` declares pre/install/postinstall |
| `import-effect:<pkg>:<file>:<n>` | a module-scope effect at a named line of the package's own source |
| `pkg-file:<pkg>:<file>` | the package ships a file that does something (a telemetry poster) |
| `path:<file>:<n>` | a first-party anchor |
| `fanout:<pkg>:<n>` | the package declares at least *n* direct dependencies |

This is a **stronger** source than a finding id, not a weaker one. An install
hook is either declared in a `package.json` on disk or it is not, and anyone can
re-run the check with `node`. A finding id is a tool's opinion, reproducible
only by re-running that tool at that version. All 27 evidence items resolve; the
gate fails if any stops resolving, which is how the inventory tracks reality
rather than a snapshot.

### 3. The gate has eight assertions, not six

Two beyond Design. `viol-schema-valid` runs first so a malformed file fails
legibly. `viol-no-subject-is-both-none-and-a-violation` was added after the first
draft classified `@prisma/client` as both — an inventory that says a package is
simultaneously inert and in breach is not an exhibit, it is a contradiction.

### 4. `uncontrolled-emission` found less than expected, and one thing nobody predicted

Only two entries: `next` ships a telemetry poster that reports to
`https://telemetry.nextjs.org/api/v1/record`, and `prisma`'s CLI contacts
`checkpoint.prisma.io`. Both on by default, both opt-out.

The unpredicted one is filed under `hidden-input-channel` and is worth reading
in full at **V-009**: running `next dev` **writes files into the repository** —
`apps/web/AGENTS.md` and `apps/web/CLAUDE.md`, containing instructions addressed
to AI coding agents. Nobody asked for them. They appeared during EPIC-02 and were
committed in `8a4b444` by a `git add -A` that nobody read line by line.

It is a hidden input channel of an unusually direct kind: not a value flowing
into the program, but instructions flowing into the humans and agents who write
it, placed there by a dependency, on its own initiative, at dev-server startup.
The file even argues its own case for being committed. Whether the advice is
good is beside the point — a package that edits your source tree to tell your
tools what to think is a channel the project never opened and cannot see from
`package.json`.

### 5. The honest numbers, including the ones that undercut the thesis

- **Only 6 of 736 packages run install scripts.** Mist expected more. Reported
  as measured; the class-level entry names all six rather than rounding to a
  scarier aggregate.
- **`boundary-erosion` has zero second-party entries.** The format leakage in
  this application is entirely first-party — our code passes the provider's wire
  shape around. Charging `axios` for that would move the blame to the wrong
  place, so `axios` is `class: none` with the seam recorded against
  `CurrentConditions.tsx:12` instead.
- **28 of 47 entries are `none`.** More than half the inventory says "this
  dependency exhibits nothing". That is the honest result and it strengthens the
  exhibit: an inventory where everything is a violation is a document nobody
  believes.
- **9 first-party violations against 10 second-party ones.** Mist's claim is
  that its defects are second-party and emergent. At this size the two are
  nearly even, and saying so is the only way the claim stays falsifiable. The
  ratio should be re-read when the tree grows.

### 6. The committed API key is deliberately not in the inventory

K1 is a security finding, not a kernel counter-invariant. Stretching the
four-class taxonomy to hold it would weaken the taxonomy for one entry's sake.
Its lifecycle lives in `docs/KEY_ROTATION.md`, which now records it as revoked
and verified dead at `2026-09-04T00:52:20Z`.

### Debt this EPIC did not pay

- **Transitive coverage is thin.** One class-level entry, for install scripts,
  because that is the only transitive behaviour that could be evidenced
  mechanically. Import-time network and maintainer churn across 736 packages
  still need EPIC-03 Phase 2a's SCA tool. The document states this limit rather
  than implying coverage it does not have.
- **`fanout` evidence is defined but unused.** No entry needed it once `express`
  was honestly classified `none`. Left in place because EPIC-06 will want it.
- **The initial `violations.json` was composed by a throwaway script.** From
  here it is hand-edited, which is the design. Nothing regenerates it, so a
  future bulk change has no tooling.
