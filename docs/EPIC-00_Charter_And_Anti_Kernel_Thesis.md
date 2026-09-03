# EPIC-00: Charter & Anti-Kernel Thesis (CHARTER)

## Context

The repository contains no code. At commit `83e6af8` (2026-09-02) it tracks
fourteen files, all of them documentation: `.gitignore`, `README.md` (a one-line
description, `README.md:1-2`), `docs/ROADMAP.md`, the ten `EPIC-*.md` design
docs, and `docs/mist-concept-evaluation.md` — the 91-line concept doc that frames
Mist as the negative control of the Controllability framework
(`docs/mist-concept-evaluation.md:5-9`). There is no `package.json`, no
`node_modules`, and no CI workflow: the dependency surface is still zero.

That concept doc is an *evaluation*: it argues Mist is worth building. It is not
a working charter. It does not say what a contributor is allowed to do, how a
proposed dependency is judged, or what makes a commit in this repo legitimate.
Without those rules the project degrades in a specific and fatal way: it becomes
a strawman. The concept doc names this risk directly — *"the moment Mist takes a
step no ordinary team would take, it becomes a strawman and the demonstration
collapses"* (`docs/mist-concept-evaluation.md:82`).

**This EPIC does not build the application, install any dependency, or wire any
scanner.** It produces the governing documents and the one PR-time gate that
every later EPIC is judged against. Nothing in `package.json` is created here —
that is EPIC-02, and it is deliberately blocked until this lands.

---

## Status

| Component | Status |
|---|---|
| `docs/ANTI_KERNEL.md` — thesis + counter-invariant table | **Complete** — written 2026-09-02, pending commit |
| `docs/MEDIANNESS.md` — the Medianness Test rubric | **Complete** — written 2026-09-02, pending commit |
| `README.md` — rewritten as the front door of the argument | **Complete** — written 2026-09-02, pending commit |
| `.github/pull_request_template.md` — medianness + violation prompts | **Complete** — written 2026-09-02, pending commit |
| `docs/ROADMAP.md` — numbering policy & build order | **Complete** — committed `a14609b`, 2026-08-23 |
| `CONTRIBUTING.md` — the four standing rules | **Complete** — written 2026-09-02, pending commit |
| `scripts/check-docs.sh` — structural assertions over the above | **Complete** — written 2026-09-02, pending commit; 5/5 assertions pass |

*"Pending commit" rows are written and passing in the working tree but not yet
pinned to a hash. Replace with the landing commit when this EPIC is committed.*

---

## Goals

- State the **anti-kernel thesis** in the repository itself, so Mist is legible
  without the book.
- Publish the **counter-invariant table** — every domain-kernel invariant paired
  with its Mist inversion — as a maintained artifact, not a one-off table in a
  concept doc.
- Define the **Medianness Test**: the single question every dependency, every
  file, and every commit must survive.
- Establish that the deliverable is **evidence**, and therefore that *honesty
  about what was done* outranks *making the demo look worse*.

## Scope

The rules this EPIC establishes, which all later EPICs inherit:

1. **Medianness.** Every choice must survive: *"would an agent, or a hurried
   developer, plausibly have done this?"* (`docs/mist-concept-evaluation.md:82`).
   A choice that fails is removed, no matter how well it illustrates the thesis.
2. **Exposure, not exploitation.** Mist demonstrates surrendered control. It
   never ships a working attack. Enforced in detail by EPIC-01.
3. **Workability is load-bearing.** Mist must build, deploy, and actually show
   the weather (`docs/mist-concept-evaluation.md:49`). A broken demo demonstrates
   nothing.
4. **No mitigation by accident.** Adopting a supply-chain hygiene measure
   (`--ignore-scripts`, pinned versions, cooldown policies, provenance checks)
   silently destroys the measurement. Any such measure requires an explicit,
   documented exception.

Explicitly **out of scope** here: the app, the scanners, the dashboard, the
violation inventory. This EPIC only writes the rules they are judged by.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| The Anti-Kernel | `docs/ANTI_KERNEL.md` | ✅ `docs/ANTI_KERNEL.md:1` |
| Counter-Invariant (a kernel rule and its inversion) | table row in `ANTI_KERNEL.md` | ✅ `docs/ANTI_KERNEL.md:34-39` (`CI-1`..`CI-6`) |
| The Medianness Test | `docs/MEDIANNESS.md` + PR template checkbox | ✅ `docs/MEDIANNESS.md:25` + `.github/pull_request_template.md:14-15` |
| Negative Control (the experimental role) | `README.md` framing section | ✅ `README.md:15-32` |
| The Ledger of decisions not made | `package-lock.json` | ❌ absent (EPIC-02) |

---

## Design

### `docs/ANTI_KERNEL.md`

The thesis document. Structure:

```markdown
# The Anti-Kernel

## The claim
Control the inputs totally and observability is free.
Surrender control of the inputs and observability must be purchased —
continuously, after the fact, at market rates.

## The counter-invariant table
| # | Domain kernel invariant | Mist counter-invariant | Where Mist exhibits it |
|---|---|---|---|
| CI-1 | No hidden input channels | postinstall scripts, env switches, import-time network, semver drift | VIOLATIONS.md#hidden-input-channels |
| CI-2 | Telemetry is the return value | Telemetry is a bill: scan reports, SBOM diffs, audit findings | EPIC-03, EPIC-04 |
| CI-3 | Narrow, stable, language-neutral boundary | The boundary is node_modules | EPIC-06 (surface metric) |
| CI-4 | Pure by default; convenience opt-in | Impure by default; every feature someone else's decision | VIOLATIONS.md |
| CI-5 | Input log is a sufficient statistic for state | No input log; package-lock.json reproduces only the *exposure* | EPIC-07 |
| CI-6 | Every dependency reached through a seam | Unfakeable: live APIs called from component bodies | VIOLATIONS.md#unfakeable-seams |
```

Rows CI-1 through CI-5 are transcribed from
`docs/mist-concept-evaluation.md:17-23`. CI-6 is added from the fakeability
paragraph at `docs/mist-concept-evaluation.md:29`.

**Rationale for the ID scheme.** Each counter-invariant gets a stable id
(`CI-1`…`CI-6`) because EPIC-05's `VIOLATIONS.md` and EPIC-06's Mist Index both
need to *reference* invariants machine-readably. A prose table with no ids
cannot be joined against a dependency list. The ids are the join key.

### `docs/MEDIANNESS.md`

The rubric. A proposed dependency or pattern passes only if a reviewer can
answer yes to all four:

```markdown
1. Plausible origin — can you name the user intent that leads here in one step?
   ("I need a date picker" → a component library. Yes.)
   ("I need to demonstrate a postinstall script" → no. That is authoring the
   finding, not observing it.)
2. Non-adversarial — chosen for convenience, never for its vulnerability.
3. Individually defensible — a competent reviewer looking at this one line of
   package.json in isolation would not object.
4. Indefensible only in aggregate — the surface is damning as a sum, never as
   a term.
```

**Rationale.** Criterion 4 is the load-bearing one and is stated as a
*requirement*, not an observation. It is what separates Mist from Juice Shop:
Juice Shop's flaws are first-party and curated; Mist's are second-party and
emergent (`docs/mist-concept-evaluation.md:68`). If any single dependency is
individually damning, the project has drifted into the wrong genre.

### `README.md` (rewrite)

Currently one line: *"Anti Demo - Project Designed to Maximize Technical Flaws
from an Architecture Perspetive"* (`README.md:2`, typo present). It must become
the front door: what Mist is, what it is **not**, the safety statement required
by `docs/mist-concept-evaluation.md:82`, and links to `ANTI_KERNEL.md`, the
telemetry dashboard, and `VIOLATIONS.md`.

The full safety banner is designed in EPIC-01; this EPIC only reserves the slot
and writes the framing prose around it.

### `.github/pull_request_template.md`

The gate. Three required prompts:

```markdown
- [ ] **Medianness.** For each dependency added, state the one-step user intent
      that leads to it. (See docs/MEDIANNESS.md)
- [ ] **Violation entry.** Every new direct dependency has a row in
      VIOLATIONS.md, or an explicit `class: none` classification. (EPIC-05)
- [ ] **Ledger entry.** Every `npm install` in this PR is recorded in the
      construction log with the prompt that produced it. (EPIC-08)
```

**Rationale for making this a template rather than a CI check.** Medianness is a
judgement, not a predicate — it cannot be automated without becoming a rule that
gets gamed. The two *mechanical* halves (violation row present, ledger entry
present) do get CI checks, in EPIC-05 and EPIC-08 respectively.

---

## Work Items

### Phase 0 — Repository scaffolding

- [ ] **0a.** Confirm `docs/ROADMAP.md` exists and its EPIC map matches the files
      on disk (`docs/ROADMAP.md:44-56`).
- [ ] **0b.** Create `.github/` directory. No workflows yet — EPIC-03 owns those.

### Phase 1 — The thesis

- [ ] **1a.** Write `docs/ANTI_KERNEL.md` with the six-row counter-invariant
      table, transcribing rows CI-1..CI-5 from
      `docs/mist-concept-evaluation.md:17-23` and deriving CI-6 from
      `docs/mist-concept-evaluation.md:29`.
- [ ] **1b.** Add the *"scan spend is a proxy metric for surrendered
      controllability"* formula (`docs/mist-concept-evaluation.md:27`) as a named
      open hypothesis, with a forward link to EPIC-06.
- [ ] **1c.** Add the prior-art differentiation section (Juice Shop, DVWA,
      WebGoat), sourced from `docs/mist-concept-evaluation.md:66-74`, so a reader
      arriving cold understands why this is not another vulnerable-app clone.

### Phase 2 — The discipline

- [ ] **2a.** Write `docs/MEDIANNESS.md` with the four-criterion rubric and at
      least three worked examples: one clear pass (`axios` over `fetch`), one
      clear fail (a package chosen because it has a postinstall script), and one
      genuinely borderline case argued in both directions.
- [ ] **2b.** Write `CONTRIBUTING.md` stating the four standing rules from
      `## Scope` above, each linked to the EPIC that enforces it.

### Phase 3 — The front door

- [ ] **3a.** Rewrite `README.md`. Fix the `Perspetive` typo at `README.md:2`.
      Reserve the safety-banner slot for EPIC-01 with an explicit
      `<!-- EPIC-01: safety banner -->` marker.
- [ ] **3b.** Add `.github/pull_request_template.md` with the three checkbox
      prompts.

### Phase 4 — Close

- [ ] **4a.** Flip this EPIC's Status rows and record the landing commit here.

---

## Test Plan

This EPIC produces prose, so the tests are structural rather than behavioral. All
are shell assertions, added as a `scripts/check-docs.sh` invoked by the docs CI
job that EPIC-03 will create:

- `docs-anti-kernel-ids` — asserts `docs/ANTI_KERNEL.md` contains exactly the ids
  `CI-1`..`CI-6`, each on its own table row. Pins the join key that EPIC-05 and
  EPIC-06 depend on.
- `docs-roadmap-links-resolve` — asserts every `EPIC-NN_*.md` linked from
  `docs/ROADMAP.md:44-56` exists on disk. Catches a renamed or missing EPIC.
- `docs-readme-has-safety-slot` — asserts `README.md` contains the
  `<!-- EPIC-01: safety banner -->` marker. Fails once EPIC-01 lands and replaces
  it, which is the intended handoff signal.
- `docs-medianness-examples` — asserts `docs/MEDIANNESS.md` contains at least
  three `### Example` headings.

The Gold Standard applies even here: renaming a counter-invariant id must make
`docs-anti-kernel-ids` fail.

## Key Files

| File | Role |
|---|---|
| `docs/ANTI_KERNEL.md` | The thesis and the six counter-invariants (new) |
| `docs/MEDIANNESS.md` | The four-criterion rubric (new) |
| `docs/ROADMAP.md` | Numbering policy, build order, toolchain decisions (exists) |
| `CONTRIBUTING.md` | The four standing rules (new) |
| `README.md` | Front door; safety-banner slot reserved (rewrite of `README.md:1-2`) |
| `.github/pull_request_template.md` | The medianness / violation / ledger gate (new) |
| `scripts/check-docs.sh` | Structural assertions over the above (new) |

## Reuse (do NOT recreate)

- `docs/mist-concept-evaluation.md:17-23` — the counter-invariant table already
  exists in prose. Transcribe and assign ids; do not re-derive it.
- `docs/mist-concept-evaluation.md:66-74` — the prior-art landscape is already
  written and dated (checked 2026-08). Cite it; do not re-research it.
- `docs/mist-concept-evaluation.md:82` — the medianness and safety-scoping
  paragraphs are the normative source for `MEDIANNESS.md` and EPIC-01.

## Compatibility

- **Preserves** nothing — the repository has no consumers. `README.md:1-2` is
  rewritten wholesale.
- **Adds** the governing documents and the PR gate.
- **Breaks** nothing.

## Dependencies

- **Blocks:** EPIC-01, EPIC-02, EPIC-03, EPIC-04, EPIC-05, EPIC-06, EPIC-07,
  EPIC-08, EPIC-09. No dependency may be installed before this lands.
- **Built on:** `docs/mist-concept-evaluation.md` (the concept evaluation).
- **Related:** the companion concept docs named at
  `docs/mist-concept-evaluation.md:3` — `controllability-concept-evaluation.md`,
  `domain-kernel-intersection.md`, `fakeability-concept-evaluation.md`. These
  live outside this repository.

## Verification

```bash
# Structural assertions over the charter documents
bash scripts/check-docs.sh

# No dependency surface has been created by this EPIC
test ! -f package.json && echo "OK: no package.json yet (EPIC-02 owns it)"
test ! -d node_modules && echo "OK: nothing installed"

# Every EPIC referenced by the roadmap exists
grep -o 'EPIC-[0-9][0-9a-z]*_[A-Za-z_]*\.md' docs/ROADMAP.md \
  | sort -u | while read -r f; do test -f "docs/$f" || echo "MISSING: $f"; done
```

Exit criteria:

1. `docs/ANTI_KERNEL.md` exists and defines ids `CI-1`..`CI-6`; `check-docs.sh`
   passes.
2. `docs/MEDIANNESS.md` exists with three worked examples, one of which is
   argued in both directions.
3. `README.md` states what Mist is, what it is not, and carries the
   `<!-- EPIC-01: safety banner -->` marker.
4. `.github/pull_request_template.md` carries all three prompts.
5. No `package.json`, no `node_modules`, no CI workflow exists yet — the
   dependency surface is still zero, and the charter is what gates its creation.


---

## Implementation corrigendum

*Added 2026-09-02, after the charter documents were written. Working tree state;
not yet pinned to a landing commit. Deltas between the `## Design` section above
and what actually landed.*

1. **`scripts/check-docs.sh` carries five assertions, not four.** The Test Plan
   named four; the script adds `docs-no-dependency-surface-yet`
   (`scripts/check-docs.sh:134-142`), which absorbs the `package.json` /
   `node_modules` checks from this EPIC's own `## Verification` block so they run
   in CI rather than only by hand. The assertion is self-deleting by design: its
   failure message tells EPIC-02 to remove it.

2. **`docs-anti-kernel-ids` matches table rows only, not prose.** The Test Plan
   said "each on its own table row"; the implementation anchors on
   `^\| CI-N \|` (`scripts/check-docs.sh:40,49`), so `CI-3` mentioned in a sentence
   does not satisfy or break the assertion. It also asserts a row count of six,
   catching a duplicated id that a `sort -u` would hide.

3. **`.github/pull_request_template.md` grew a second section.** The design
   specified three prompts; the template adds a *Standing rules check* block
   (`.github/pull_request_template.md:37-47`) for rules 2-4 from `## Scope`, plus
   a table slot for the per-dependency medianness justifications. Rationale: the
   three original prompts cover rule 1 and the two mechanical gates, but nothing
   asked a contributor to confirm they had not silently adopted a mitigation --
   the failure mode rule 4 exists to catch.

4. **Phase 0b created `.github/` with the PR template in it,** rather than as an
   empty directory. Git does not track empty directories, so the two work items
   collapsed into one commit. No workflows were added; EPIC-03 still owns those.

5. **`MEDIANNESS.md`'s borderline example defers to EPIC-01.** Work item 2a asked
   for a case "argued in both directions". The case chosen -- committing a live
   weather-API key (`docs/MEDIANNESS.md:103`) -- is argued both ways and then left
   **unresolved**, handing the decision to EPIC-01 as an exposure/exploitation
   call. This is a new, small dependency edge: EPIC-01 now inherits a named open
   question from this EPIC.

6. **`README.md` gained two sections beyond the designed framing:** a *Where to
   look* table (`README.md:61-71`) and a *Current state* section
   (`README.md:73-80`). Both carry forward references to artifacts that do not
   exist yet (`VIOLATIONS.md`, the telemetry dashboard); each is marked **not yet
   written** inline rather than linked, so the front door never claims evidence
   the project has not produced.

7. **The `Where Mist exhibits it` column contains dangling anchors.**
   `VIOLATIONS.md#hidden-input-channels` and `VIOLATIONS.md#unfakeable-seams`
   (`docs/ANTI_KERNEL.md:34,39`) do not resolve until EPIC-05 lands. This is
   stated in the document itself (`docs/ANTI_KERNEL.md:45-48`) rather than
   silently tolerated. `check-docs.sh` does **not** assert these resolve -- doing
   so would fail every build until EPIC-05, which is noise, not signal.

8. **The `## Context` section and the `docs/ROADMAP.md` Status row were
   re-grounded** before the work started: the Context described the repository at
   `1e69b61` (three tracked files) when it in fact held fourteen at `83e6af8`, and
   the ROADMAP row still read "not yet committed" after landing at `a14609b`
   (2026-08-23).

### Phase status summary

| Phase | Scope | Status |
|---|---|---|
| 0 — Repository scaffolding | ROADMAP map matches disk; `.github/` created | **Complete** — 10/10 EPIC links resolve |
| 1 — The thesis | `ANTI_KERNEL.md`: `CI-1`..`CI-6`, scan-spend hypothesis, prior art | **Complete** |
| 2 — The discipline | `MEDIANNESS.md` (3 worked examples), `CONTRIBUTING.md` | **Complete** |
| 3 — The front door | `README.md` rewrite + safety slot, PR template | **Complete** |
| 4 — Close | Status rows flipped; commit hash pending | **Partial** — hashes to be pinned on commit |

### Inherited debt

- **`docs-readme-has-safety-slot` is a time bomb, on purpose.** It passes today
  and **must fail** when EPIC-01 replaces the `<!-- EPIC-01: safety banner -->`
  marker with the real banner. EPIC-01 owns updating that assertion; a green
  build after EPIC-01 lands means the banner was added without removing the
  marker, which is the bug.
- **No CI runs `check-docs.sh` yet.** It is hand-run until EPIC-03 wires the docs
  job. Until then the Gold Standard holds only for whoever remembers to run it.
- **The typo fix is total.** `README.md` was rewritten wholesale, so the
  `Perspetive` typo at the old `README.md:2` is gone along with the rest of the
  original line. There is no diff showing the typo being corrected in place.
