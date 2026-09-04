# EPIC-06: The Mist Index (MI)

## Context

The concept doc proposes a formula and then, honestly, marks it as unproven:
*"This gives the book a formula worth testing: **scan spend is a proxy metric for
surrendered controllability**"* (`docs/mist-concept-evaluation.md:27`). In the
open threads it is stated as an open question with candidate axes: *"Can 'scan
spend as proxy for surrendered controllability' be made quantitative? Candidate
axes: transitive package count, install-script count, packages with network
access at import, SBOM churn rate, mean time between red dashboard states. A
'Mist index' for arbitrary repos would be a genuinely useful spinoff tool"*
(`docs/mist-concept-evaluation.md:87`).

At commit `1e69b61` nothing exists. EPIC-03 will emit the `surface.*` block that
supplies four of the five axes; EPIC-04 supplies the fifth (mean time between red
states); EPIC-05 supplies violation counts by class.

**This EPIC treats the formula as a hypothesis, not a result.** The deliverable
is an index that is *defensible and falsifiable*, plus honest documentation of
what it cannot measure. An index that is merely plausible would be worse than
none: it would let the book assert a number it cannot defend, which is exactly
the failure mode Mist exists to criticise.

**This EPIC does not** score other people's repositories at scale, publish a
leaderboard, or make normative claims about specific projects. See Scope rule 5.

---

## Status

| Component | Status |
|---|---|
| `docs/MIST_INDEX.md` — definition, formula, and limits | **Complete** — limits and falsification written **first**, per Phase 0c |
| Axis definitions with measurement procedures | **Complete** — 5 axes, each with a stated procedure |
| Normalization & weighting, with the weights justified | **Complete** — anchors `v1`, published and versioned |
| `tools/mist-index/` CLI, near-zero dependency | **Complete** — **zero** runtime dependencies, asserted mechanically |
| Self-scoring in CI; panel published to EPIC-04 | **Partial** — CI step added to `scan.yml`; the EPIC-04 panel waits on EPIC-04 |
| Calibration set — kernel repos vs Mist | **Not done** — one scored point is not a calibration; see corrigendum 4 |
| Falsification section: what would disprove the index | **Complete** — three named disconfirming observations, none yet tested |
| `scripts/test-mist-index.mjs` | **Complete** — 23 tests |

*All rows landed 2026-09-04. Commit pin owed next session.*

### The headline result: the index cannot be computed here

**Two of five axes have an instrument. `MI` is reported as `null`.**

| Axis | State | Raw | Score | Weight |
|---|---|---:|---:|---:|
| `A1` surface | measured | 794 distinct `name@version` | 70.9 | .30 |
| `A2` install-execution | measured | 6 packages | 36.7 | .25 |
| `A3` import-time reach | **not-measured** | — | — | .25 |
| `A4` churn | **insufficient-history** (12 days of 90) | — | — | .10 |
| `A5` red-state | **unavailable** (no EPIC-04) | — | — | .10 |

45% of the weight is unmeasured. No partial score is published: re-normalising
the measured axes to fill 100 would produce a number that looks like a Mist Index
and is not one, and it would be quoted as one.

---

## Goals

- Turn *"scan spend as a proxy for surrendered controllability"* into a
  **computable, documented, falsifiable** number.
- Ship a **CLI that scores any npm repository**, so the metric is testable
  outside Mist rather than tuned to it.
- **Calibrate** against the kernel repos named in the framework
  (cardpack.rs, pkcore, gfcore) and against Mist, and publish the spread.
- Document, prominently, **what the index cannot see** — because a metric whose
  blind spots are undocumented becomes a target.

## Scope

1. **Axes come from the concept doc's candidate list**
   (`docs/mist-concept-evaluation.md:87`). Adding an axis requires a written
   argument in `docs/MIST_INDEX.md`; removing one likewise.
2. **The index must be falsifiable.** `docs/MIST_INDEX.md` states, up front, the
   observations that would show the index is measuring nothing.
3. **The tool is near-zero-dependency.** Same reasoning as EPIC-04's dashboard:
   an instrument built from the specimen cannot be trusted, and a tool that
   measures dependency surface must not have one. If the tool scored badly on its
   own metric, the metric would be a joke.
4. **Language-scope is stated.** v1 is npm-only. Saying so is a limit; implying
   generality would be a lie.
5. **No leaderboard, no naming.** The tool scores repositories the user points it
   at. Mist does not publish scores for third-party projects it does not own.
   Turning a research metric into a public shaming instrument would be a
   different project, and a worse one.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Axis (one measurable dimension) | `Axis` definition in `tools/mist-index/axes/` | ❌ absent |
| Raw Measure | integer/float read from SBOM, SCA, or history | ❌ absent |
| Normalized Score (0–100 per axis) | anchor-based mapping | ❌ absent |
| Weight | declared constant with a written justification | ❌ absent |
| Mist Index (composite) | weighted sum | ❌ absent |
| Calibration Point | a scored reference repository | ❌ absent |

---

## Design

### The five axes

Each axis needs a *measurement procedure*, not just a name — otherwise two people
compute different numbers and the index is worthless.

| Axis | Raw measure | Source | Notes |
|---|---|---|---|
| `A1` surface | count of distinct transitive packages | SBOM (EPIC-03 Phase 4a) | The headline number; also the most gameable |
| `A2` install-execution | packages with `preinstall`/`install`/`postinstall` | SCA (EPIC-03 Phase 2b) | Install scripts are RCE you scheduled (`docs/mist-concept-evaluation.md:43`) |
| `A3` import-time reach | packages performing network or filesystem access at import | SCA | The purest hidden-input-channel measure (CI-1) |
| `A4` churn | mean packages added+removed per merged PR, trailing 90 days | SBOM diffs + git history | Rate of surface change, not its size |
| `A5` red-state | mean time between red battery states, trailing 180 days | `telemetry/index.json` (EPIC-04) | The only axis measuring *observed* consequence rather than exposure |

**Rationale for keeping A4 and A5 despite their cost.** A1–A3 are static
properties of a tree; a repo could hold them constant while behaving terribly.
A4 measures how fast the trust surface turns over, and A5 is the only axis that
touches outcomes. They are also the two axes that need history, which means the
index is weaker on a fresh repository — a limitation that must be stated, not
smoothed over.

### Normalization: anchors, not percentiles

Each axis maps its raw measure to 0–100 through **fixed anchors**, not a
percentile against a corpus.

```
A1 surface:  0 pkgs → 0    50 → 25    250 → 50    900 → 75    2500+ → 100
A2 install:  0      → 0     1 → 20     10 → 50     50 → 80      150+ → 100
A3 import:   0      → 0     1 → 30      5 → 60     20 → 85       60+ → 100
```

**Rationale for fixed anchors over percentiles.** A percentile index says "you
are more entangled than 60% of npm projects", which is a statement about npm, not
about the repository — and it would drift as the ecosystem drifts, making
year-over-year comparison meaningless. Fixed anchors say "you execute install
scripts from 62 packages", which stays true. The anchors are a judgement, they
are published, and disagreeing with them is a well-formed argument rather than a
dispute about a hidden corpus.

**The anchors are v1 and explicitly provisional.** `docs/MIST_INDEX.md` must
carry a changelog, and changing an anchor requires re-publishing every historical
score computed under the old anchors, clearly labelled. Silently re-anchoring
would be the metric equivalent of rewriting history.

### Weighting

```
MI = 0.30·A1 + 0.25·A2 + 0.25·A3 + 0.10·A4 + 0.10·A5
```

**Rationale.** A2 and A3 are weighted near A1 despite being smaller numbers
because they measure *hidden input channels* — the thing the framework actually
cares about — whereas A1 measures bulk, which correlates with but does not
constitute surrendered control. A vendored 2,000-file dependency with no install
script and no import-time reach is a different animal from twelve packages that
phone home, and a surface-only index would score them backwards. A4 and A5 carry
low weight because they are noisy on short histories.

**This weighting is the most contestable thing in the EPIC and must be labelled
as such** in `docs/MIST_INDEX.md`, with the sensitivity analysis from Phase 4c
published beside it.

### `tools/mist-index/`

```
tools/mist-index/
  bin/mist-index.mjs        # CLI entry; node stdlib only
  axes/{a1..a5}.mjs         # one module per axis, each pure: measures → score
  anchors.json              # the published anchors, versioned
  report.mjs                # human + JSON output
```

Usage:

```
$ npx mist-index .
Mist Index: 78 / 100   (anchors v1)

  A1 surface          1743 pkgs      → 82   (weight .30)
  A2 install-exec       62 pkgs      → 83   (weight .25)
  A3 import-reach       11 pkgs      → 72   (weight .25)
  A4 churn            18.4 pkgs/PR   → 61   (weight .10)
  A5 red-state         12.1 days     → 74   (weight .10)

  Not measured: runtime egress, transitive maintainer trust, CI/CD supply chain,
  build-tool plugins, non-npm dependencies. See docs/MIST_INDEX.md#limits.
```

**Rationale for printing the "Not measured" block on every run.** It is not a
footnote; it is part of the result. A number without its blind spots is the kind
of compensatory observability Mist exists to criticise, and shipping one would be
a self-own.

### Calibration

Score, and publish in `docs/MIST_INDEX.md`:

- **Mist** (`v1.0.0`) — the high anchor of the study.
- **The kernel repos** — cardpack.rs, pkcore, gfcore. Not npm projects, so v1
  cannot score them directly; the doc must either define a cargo adapter or state
  plainly that the comparison is qualitative in v1. **Do not fabricate a
  cross-ecosystem number.**
- **A small set of ordinary npm projects the project owns or has permission to
  name**, to show the index discriminates in the middle of the range and is not
  just a bulk detector.
- **EPIC-09's `pure` branch**, once it exists — the same domain, the same
  features, a different index. That pair is the strongest evidence the index
  measures architecture and not project size.

---

## Work Items

### Phase 0 — Prerequisites

- [ ] **0a.** Confirm EPIC-03 emits `surface.*` with A1–A3 raw measures.
- [ ] **0b.** Confirm EPIC-04's `telemetry/index.json` has enough history for A5;
      if not, ship A5 as `insufficient-history` rather than as a guess.
- [ ] **0c.** Write `docs/MIST_INDEX.md` skeleton with the **Limits** and
      **Falsification** sections *first*, before any code. Writing the caveats
      last is how metrics become overclaimed.

### Phase 1 — Axes

- [ ] **1a.** Implement `a1.mjs`..`a3.mjs` reading the EPIC-03 envelope.
- [ ] **1b.** Implement `a4.mjs` over SBOM diffs and git history, trailing 90d.
- [ ] **1c.** Implement `a5.mjs` over `telemetry/index.json`, trailing 180d, with
      an explicit `insufficient-history` return when the window is not covered.
- [ ] **1d.** Each axis module is pure: `(measures) => score`. Unit-test each
      against its anchor table, including the exact anchor points.

### Phase 2 — Composite and CLI

- [ ] **2a.** Write `anchors.json` v1 with the tables from Design.
- [ ] **2b.** Implement the weighted composite and the report, including the
      mandatory "Not measured" block.
- [ ] **2c.** Add `--json` output for programmatic use, on a documented schema.
- [ ] **2d.** Assert zero runtime dependencies mechanically.

### Phase 3 — Self-scoring

- [ ] **3a.** Add a CI step scoring Mist on every run and appending the result to
      the telemetry record.
- [ ] **3b.** Build the EPIC-04 Mist Index panel, replacing its 🔒 placeholder.
- [ ] **3c.** Chart the index over time alongside A1 alone, so a reader can see
      whether the composite adds information over raw package count. If it does
      not, that is a finding to publish, not to hide.

### Phase 4 — Calibration and honesty

- [ ] **4a.** Score the calibration set; publish the table in
      `docs/MIST_INDEX.md`.
- [ ] **4b.** For the kernel repos: either implement a cargo adapter or state the
      comparison is qualitative in v1. Do not invent a number.
- [ ] **4c.** Sensitivity analysis: recompute the calibration set under three
      alternative weightings and publish how much the ordering moves. If the
      ordering is stable, the weights matter less than they appear; if it swings,
      say so loudly.
- [ ] **4d.** Write the **Falsification** section: name at least three concrete
      observations that would show the index measures nothing useful. Candidates:
      a repo scoring high with no seams-related incident class over a long window;
      the index tracking A1 so closely that the other four axes are decoration;
      two functionally identical apps scoring far apart for reasons unrelated to
      control.

### Phase 5 — Close

- [ ] **5a.** Decide and record whether `mist-index` is published to npm as a
      spinoff (`docs/mist-concept-evaluation.md:87` calls it *"a genuinely useful
      spinoff tool"*). If published, it goes under the owned `@mist-demo` scope
      per EPIC-01.
- [ ] **5b.** Flip Status rows; record Mist's real v1 score in the corrigendum.

---

## Test Plan

- `mi-axis-anchors` — each axis module returns exactly the anchor value at each
  anchor point, and interpolates monotonically between them. Pins the published
  anchors.
- `mi-composite-weights` — the weighted sum matches a hand-computed fixture.
- `mi-zero-deps` — the CLI imports only Node builtins. **The load-bearing test**:
  a dependency-surface metric with a dependency surface is not credible.
- `mi-insufficient-history` — a repo with two weeks of telemetry returns
  `insufficient-history` for A5 and a composite flagged as partial, never a
  silently-imputed value.
- `mi-not-measured-block` — asserts the "Not measured" block appears in both
  human and `--json` output. Pins the honesty requirement into the artifact.
- `mi-scores-external-repo` — the CLI runs against a fixture repo that is not
  Mist and produces a score. Pins Scope rule 3's testability claim.
- `mi-anchor-version-recorded` — output always names the anchors version; a score
  without one fails.
- `mi-discriminates` — two fixture repos with identical package counts but
  different install-script counts must score differently. Guards against the
  index collapsing into A1.

Gold Standard: changing any anchor in `anchors.json` must make `mi-axis-anchors`
fail. Adding a runtime dependency must make `mi-zero-deps` fail.

## Key Files

| File | Role |
|---|---|
| `docs/MIST_INDEX.md` | Definition, anchors, weights, **limits, falsification** (new) |
| `tools/mist-index/bin/mist-index.mjs` | CLI, zero deps (new) |
| `tools/mist-index/axes/a1..a5.mjs` | Pure axis scorers (new) |
| `tools/mist-index/anchors.json` | Published, versioned anchors (new) |
| `schemas/scan-run.schema.json` | Source of A1–A3 raw measures (exists, EPIC-03) |
| `telemetry/index.json` | Source of A5 (exists, EPIC-04) |

## Reuse (do NOT recreate)

- `docs/mist-concept-evaluation.md:87` — the five candidate axes are already
  proposed. Start from that list.
- `schemas/scan-run.schema.json` `surface.*` (EPIC-03) — the raw measures are
  already collected. The index must not re-scan; a metric that re-derives its own
  inputs cannot be reconciled with the dashboard.
- EPIC-04's zero-dependency build pattern and its `dash-zero-deps` test — the
  same technique applies here; extract it into a shared check rather than writing
  it twice.
- `violations.yaml` class counts (EPIC-05) — a candidate sixth axis. Explicitly
  *not* in v1, because it is authored by Mist rather than measured, and an index
  that reads its own documentation is circular. Record this decision.

## Compatibility

- **Preserves** everything; the index is read-only over existing artifacts.
- **Adds** a CLI tool, a docs page, one CI step, and one dashboard panel.
- **Breaks** nothing.

## Dependencies

- **Blocks:** EPIC-09 (the before/after comparison is stated in index terms).
- **Built on:** EPIC-03 (`surface.*`), EPIC-04 (telemetry history and the panel
  slot), EPIC-05 (context, though not an input in v1).
- **Related:** EPIC-07 — decay changes A5 without changing A1–A3, which is a
  useful natural experiment on whether the composite carries information.

## Verification

```bash
# Scores itself
node tools/mist-index/bin/mist-index.mjs .

# Scores something that is not itself
node tools/mist-index/bin/mist-index.mjs ./test/fixtures/repos/ordinary-app

# Zero dependencies
node -e "…assert tools/mist-index/**.mjs import only node: builtins…"
test ! -d tools/mist-index/node_modules && echo "OK: instrument is clean"

# Anchors are versioned in every output
node tools/mist-index/bin/mist-index.mjs . --json | node -e "…assert .anchorsVersion…"

# Honesty block present in both output modes
node tools/mist-index/bin/mist-index.mjs . | grep -q 'Not measured' && echo "OK"

# Axis unit tests
npm test --workspace tools/mist-index
```

Exit criteria:

1. `docs/MIST_INDEX.md` exists with axes, anchors, weights, a **Limits** section,
   and a **Falsification** section naming at least three disconfirming
   observations.
2. The CLI scores Mist and at least one non-Mist repository, and prints the
   anchors version and the "Not measured" block every time.
3. The tool has zero runtime dependencies.
4. A5 returns `insufficient-history` rather than an imputed value when history is
   short, and the composite is flagged partial.
5. The calibration table is published; any cross-ecosystem comparison is either
   implemented or stated as qualitative — never fabricated.
6. The sensitivity analysis under three alternative weightings is published,
   including the case where it undermines the chosen weights.
7. The Mist Index panel is live on the EPIC-04 dashboard, charted beside raw A1.

---

## Implementation corrigendum

*Added 2026-09-04. What landed, and the three places this EPIC's plan met
reality.*

### 1. The headline finding is that the index cannot be computed

Not a shortfall to be closed later — the primary result of the EPIC. Three of
five axes have **no instrument in this repository**, and each is reported with a
distinct state rather than collapsed into one:

- `A3` is **`not-measured`**: detecting import-time network reach needs the
  behavioural SCA that EPIC-03 Phase 2a never wired. Scoring it `0` would assert
  *"this tree performs no import-time network access"* — something nobody has
  checked and which is probably false. It is the sharpest case of the general
  rule and the reason the rule exists.
- `A4` is **`insufficient-history`**: the instrument works, the window does not.
  12 days of history against a 90-day requirement.
- `A5` is **`unavailable`**: the data source does not exist at all.

"We cannot see this", "we could see it but not yet" and "there is nothing to see
it with" are three different claims. Collapsing them would let a reader assume
the most flattering one.

**No re-normalisation.** The obvious move is to scale the measured 55% of the
weight up to 100 and publish that. It is refused in code
(`composite()` returns `null`) and asserted in `mi-no-partial-score`, because the
result would look exactly like a Mist Index, would be quoted as one, and would be
15 points of pure invention.

### 2. `A1` is 794, and the definition is now settled

EPIC-02's corrigendum recorded four defensible counts of the same tree differing
by 141 packages, and said the Index must pick one. It picks **distinct
`name@version` from `package-lock.json`, excluding workspace links**.

Two reasons, both in `docs/MIST_INDEX.md`: a package present at two versions is
two artifacts from two publish events that you trust, not one; and the lockfile
is committed, so the measure is reproducible by anyone without installing.

Note the consequence — 794 is the **largest** of the four candidates. The
definition that is most defensible is also the least flattering to Mist, and it
is the one that gets published.

`A1` needing only the lockfile while `A2` needs an installed tree is a real
asymmetry. It means the tool scores an uninstalled repository partially, which is
reported rather than smoothed over.

### 3. The axes live in one file, not five

Design's Key Files asks for `axes/a1.mjs` .. `a5.mjs`. They are in
`axes/index.mjs` instead. Five modules that each re-export the same interpolation
against a different table is more surface for no benefit, and this tool of all
tools should not carry surface it does not need. The property the EPIC actually
wants — each axis pure, `(raw, anchors) => score`, independently testable against
its anchor table — holds, and `mi-axis-anchors` tests every anchor point of every
axis.

### 4. Calibration was not done, and one row is not a table

Phase 4a asks for a calibration table. It is **not** published, because the only
scored point is Mist itself and a one-row table implies a spread that has not
been demonstrated.

The kernel repositories named in the framework are Rust; v1 is npm-only. Phase 4b
allows either a cargo adapter or an explicit statement that the comparison is
qualitative. **The statement is made; no cross-ecosystem number is fabricated.**

The sensitivity analysis (Phase 4c) is owed for the same reason: it needs a
calibration set to be sensitive *about*. Until then `docs/MIST_INDEX.md` labels
the weighting as an assertion rather than a finding.

The two fixture repositories in `fixtures/repos/` are not calibration. They exist
to prove the index discriminates — identical package counts, different
install-script counts, different scores — which is the minimum guard against
falsification criterion 1, not evidence about real projects.

### 5. Two bugs worth recording, both silent

**`git log --reverse --max-count=1` returns the newest commit, not the oldest.**
Git applies `max-count` before `reverse`. The repository therefore looked 0 days
old, `A4` reported `insufficient-history` forever, and nothing looked wrong —
because "insufficient history" was the expected answer. A wrong answer that
matches your expectation is the hardest kind to see.

**`"test-mist-index.mjs".endsWith("mist-index.mjs")` is `true`.** The CLI's entry
guard used `endsWith`, so importing the module from its own test suite executed
the CLI and printed a full report before the tests ran. Now uses the shared
realpath-comparing `isMain` helper — the same helper written in EPIC-03 after a
different silent-success bug in the same position.

### Debt this EPIC did not pay

- **Calibration, sensitivity analysis, and the EPIC-04 panel** all wait on other
  work. Named above rather than left implied.
- **Publishing `mist-index` to npm** (Phase 5a) is not decided. It would need the
  `@mist-demo` scope, which EPIC-01 still records as unregistered.
- **`A4` approximates PR churn with lockfile-touching commits**, because this
  repository has no merged-PR history. The approximation is printed in the axis
  detail line rather than hidden behind the axis name.
- **None of the three falsification criteria has been tested.** The document says
  so. The strongest test — EPIC-09's `pure` branch scored against `main` — does
  not exist yet.
