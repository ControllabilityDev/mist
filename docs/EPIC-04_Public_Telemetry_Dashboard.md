# EPIC-04: Public Telemetry Dashboard (DASH)

## Context

The concept doc names the dashboard as the project's primary artifact and states
its ontological status plainly: *"The dashboard is Mist's telemetry, and its
ontological status is the point: it is observability *about the inputs*,
purchased because the inputs were never controlled"*
(`docs/mist-concept-evaluation.md:62`). It is required to be permanent and public
(`docs/mist-concept-evaluation.md:51`), and the doc predicts what it will show:
*"Given the incident cadence of the last two years, it will not stay green — the
ecosystem performs the demonstration on a schedule"*
(`docs/mist-concept-evaluation.md:62`).

It is also, per the open threads, the likely source of the book's best figure:
*"The dashboard screenshot on the day of the next ecosystem incident may be the
book's best figure"* (`docs/mist-concept-evaluation.md:86`).

At commit `1e69b61` nothing exists. EPIC-03 produces `scan-run.json` on a stable
schema; this EPIC turns a series of those into a public, permanent, legible
artifact.

**This EPIC does not compute the Mist Index** (EPIC-06) and does not run any
scanner (EPIC-03). It renders. It also does not chart the frozen-tree decay
curve (EPIC-07), though it reserves the panel slot for it.

---

## Status

| Component | Status |
|---|---|
| `telemetry` orphan branch — append-only run history | Planned |
| Static site build (`site/`) | Planned |
| Panel: current battery status | Planned |
| Panel: surface growth over time | Planned |
| Panel: findings by counter-invariant (`CI-1`..`CI-6`) | Planned |
| Panel: first-party vs second-party split | Planned |
| Panel: decay curve (slot reserved, EPIC-07) | 🔒 Gated |
| Panel: Mist Index (slot reserved, EPIC-06) | 🔒 Gated |
| GitHub Pages publication | Planned |
| Permanent-URL policy | Planned |

---

## Goals

- Publish a **permanent, public** dashboard that anyone can cite without running
  anything.
- Chart **surface growth over time**, so agentic-style feature additions show
  their cost (`docs/mist-concept-evaluation.md:59`).
- Make the **first-party / second-party split** the headline distinction, since
  it is what separates Mist from the vulnerable-app genre
  (`docs/mist-concept-evaluation.md:68`).
- Make the dashboard's own status legible: it is a **bill**, not a return value
  (counter-invariant CI-2), and the page should say so in plain words.
- Ensure the dashboard is **screenshot-legible** — one view, no scrolling
  required to read the headline state, because that view is a book figure.

## Scope

1. **Append-only history.** Scan runs are never deleted or edited. A run that
   was red stays red in the record, including runs that were red because of a
   Mist bug.
2. **No green-washing.** No severity filters, no "acknowledged" state, no
   snoozing. If the dashboard can be made to look better without the exposure
   changing, it is not an instrument.
3. **Permanent URL.** The dashboard URL is quoted in the book and must not move.
   Recorded in `docs/DASHBOARD.md` as a stability commitment.
4. **The dashboard is exempt from medianness.** See Design.
5. **Static only.** No server, no runtime data fetch. The page must render
   correctly from the archive alone, years later, with the deployment long gone.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Scan Run (one battery pass) | `telemetry/runs/<sha>.json` | ❌ absent |
| Time Series (a metric over runs) | derived at build time in `site/build.mjs` | ❌ absent |
| Panel (one readable claim) | a section in `site/index.html` | ❌ absent |
| Surface Metric | `surface.*` from the EPIC-03 envelope | ❌ absent |
| The Bill (findings as purchased telemetry) | headline framing block | ❌ absent |

---

## Design

### The medianness exemption — and why it matters

Every other artifact in Mist must survive the Medianness Test (`docs/MEDIANNESS.md`,
EPIC-00). **The dashboard is explicitly exempt, and is built with near-zero
dependencies:** plain HTML, hand-written CSS, and inline SVG charts generated at
build time by a single Node script using only the standard library.

**Rationale.** This is the sharpest design decision in the EPIC and it needs
stating out loud. The dashboard is the *instrument*, not the *specimen*. An
instrument built out of the thing it measures cannot be trusted: if the
dashboard pulled in a charting library and 400 transitive packages, then (a) its
own supply chain would be a confound in every reading, and (b) a compromise of
the instrument would corrupt the record it is supposed to preserve. A thermometer
is not made of fever.

The exemption is recorded in `CONTRIBUTING.md` (EPIC-00 Phase 2b) alongside the
containment exemption, so it is a stated rule rather than an inconsistency a
reader has to notice and forgive. The contrast is also, conveniently, the
thesis in miniature: the one component built kernel-style needs no scanner.

### The `telemetry` orphan branch

```
telemetry/
  runs/
    2026-09-01T08-14-22Z_<sha>.json     # the EPIC-03 envelope, verbatim
  sboms/
    <sha>.cdx.json                      # CycloneDX, verbatim
  index.json                            # append-only manifest: sha, ref, ts, path
```

**Rationale for an orphan branch rather than `main`.** Scan output would
otherwise churn `main`'s history on every push and pollute the SBOM diff that
EPIC-03 computes against `main`. An orphan branch keeps the record permanent and
the specimen clean. `index.json` is append-only; a build that rewrites an
existing entry fails CI.

### Panels

`site/index.html` (generated). Above the fold, in this order:

```
┌─ Mist — telemetry ─────────────────────────────────────────┐
│  THIS IS A BILL, NOT A RETURN VALUE.                       │
│  Every number below was purchased after the fact, because  │
│  Mist does not control its inputs.  (counter-invariant CI-2)│
├────────────────────────────────────────────────────────────┤
│  Last run <ts> @ <sha>          ● RED / ● GREEN            │
│  Transitive packages   1,743    ▲ +47 this month           │
│  Install scripts          62    ▲ +6                       │
│  Network at import        11    ▬                          │
│  Distinct maintainers  1,208    ▲ +31                      │
│  Findings   second-party 84  ·  first-party 11             │
└────────────────────────────────────────────────────────────┘
   [ surface growth ]  [ findings by CI-* ]  [ decay 🔒 ]  [ index 🔒 ]
```

**Rationale for the headline block.** Without it the page reads as an ordinary
security dashboard and the argument is invisible. The framing sentence is what
makes a screenshot self-explanatory when it appears in the book without its
surrounding chapter (`docs/mist-concept-evaluation.md:86`).

**Rationale for showing first-party findings prominently rather than hiding
them.** Mist's app-layer findings are real and expected — *"a median project's
honest dozen"* (`docs/mist-concept-evaluation.md:56`). Showing 11 first-party
next to 84 second-party is the whole point: the number a code review would catch,
beside the number it never could.

### `site/build.mjs`

Zero-dependency Node script. Reads `telemetry/index.json`, loads each run,
derives the series, emits `site/index.html` with inline SVG. Chart generation is
a few dozen lines of `<polyline points="...">` — deliberately small enough to
audit in one sitting.

Accessibility and theme: the page must render legibly in both light and dark
(book figures get printed), and every chart carries a `<table>` fallback with the
same numbers, so the data survives even if the SVG does not.

---

## Work Items

### Phase 0 — Prerequisites

- [ ] **0a.** Confirm EPIC-03 emits `scan-run.json` validating against
      `schemas/scan-run.schema.json`.
- [ ] **0b.** Create the `telemetry` orphan branch with an empty `index.json`.
- [ ] **0c.** Record the medianness exemption for `site/` in `CONTRIBUTING.md`.

### Phase 1 — The record

- [ ] **1a.** Extend EPIC-03's `assemble` job to append the envelope and the
      SBOM to the `telemetry` branch, updating `index.json`.
- [ ] **1b.** Add an append-only guard: a CI check that fails if any existing
      entry in `index.json` changed or any `runs/*.json` was modified.
- [ ] **1c.** Backfill nothing. The record starts when it starts, and
      `docs/DASHBOARD.md` states the start date.

### Phase 2 — The static site

- [ ] **2a.** Write `site/build.mjs` — zero dependencies, Node stdlib only.
- [ ] **2b.** Assert zero dependencies mechanically: the site build must run with
      `node --experimental-permission` or an equivalent check that `site/` imports
      nothing from `node_modules`.
- [ ] **2c.** Render the headline block with the CI-2 framing sentence.
- [ ] **2d.** Render the current-status panel with the six surface metrics and
      their month-over-month deltas.

### Phase 3 — Series panels

- [ ] **3a.** Surface growth over time — transitive packages, install scripts,
      network-at-import, maintainers. Inline SVG plus `<table>` fallback.
- [ ] **3b.** Findings by counter-invariant, `CI-1`..`CI-6` plus `unmapped`.
      Link each bar to the matching section of `docs/ANTI_KERNEL.md`.
- [ ] **3c.** First-party vs second-party split over time.
- [ ] **3d.** Reserve, but do not build, the decay panel (EPIC-07) and the Mist
      Index panel (EPIC-06). Render them as visible 🔒 placeholders naming the
      owning EPIC, so the page is honest about what it does not yet measure.

### Phase 4 — Publication

- [ ] **4a.** Publish to GitHub Pages from the `telemetry` branch on every
      successful assemble.
- [ ] **4b.** Write `docs/DASHBOARD.md`: the permanent URL, the stability
      commitment, the record start date, and what each panel means.
- [ ] **4c.** Link the dashboard from `README.md` above the fold, below the
      EPIC-01 safety banner.

### Phase 5 — Legibility

- [ ] **5a.** Verify the headline block is fully readable at 1280×720 with no
      scrolling. This is the book-figure constraint.
- [ ] **5b.** Verify light and dark rendering, and print rendering.
- [ ] **5c.** Add `<table>` fallbacks for every chart.

### Phase 6 — Close

- [ ] **6a.** Flip Status rows; record the permanent URL and the first run's
      real numbers in the corrigendum.

---

## Test Plan

- `dash-builds-from-fixtures` — `site/build.mjs` against a fixture `telemetry/`
  produces valid HTML. Pins the render path.
- `dash-zero-deps` — asserts `site/build.mjs` and everything it imports resolve
  only to Node builtins. **This is the load-bearing test of this EPIC**: it is
  what keeps the instrument out of the specimen.
- `dash-append-only` — modifying an existing `runs/*.json` in a fixture makes the
  guard fail. Pins Scope rule 1.
- `dash-no-filters` — asserts the generated HTML contains no severity filter,
  acknowledge control, or snooze affordance. Pins Scope rule 2 against future
  well-meaning additions.
- `dash-headline-framing` — asserts the CI-2 framing sentence is present
  verbatim. Prevents the page quietly becoming an ordinary security dashboard.
- `dash-chart-fallbacks` — asserts every `<svg>` chart has a sibling `<table>`
  with matching values.
- `dash-gated-panels-visible` — asserts the decay and index placeholders render
  and name their owning EPICs. Honesty about absence.
- `dash-url-stable` — asserts the URL in `docs/DASHBOARD.md` matches the
  published Pages URL.

Gold Standard: adding a single import from `node_modules` to `site/build.mjs`
must make `dash-zero-deps` fail.

## Key Files

| File | Role |
|---|---|
| `site/build.mjs` | Zero-dependency static site generator (new) |
| `site/style.css` | Hand-written; light, dark, print (new) |
| `docs/DASHBOARD.md` | Permanent URL + panel semantics + start date (new) |
| `telemetry` branch `index.json` | Append-only run manifest (new) |
| `.github/workflows/publish-telemetry.yml` | Pages publication (new) |
| `schemas/scan-run.schema.json` | The consumed contract (exists, EPIC-03) |
| `CONTRIBUTING.md` | Records the `site/` medianness exemption (exists, EPIC-00) |

## Reuse (do NOT recreate)

- `schemas/scan-run.schema.json` (EPIC-03) — the envelope is the contract. Do not
  re-parse raw scanner output here.
- `docs/ANTI_KERNEL.md` `CI-1`..`CI-6` (EPIC-00) — panel labels and links come
  from there.
- EPIC-03's `scripts/sbom-diff.mjs` delta logic — the same computation as the
  month-over-month arrows; extract it into a shared module rather than writing it
  twice.

## Compatibility

- **Preserves** `main` entirely — no scan output is committed to it.
- **Adds** an orphan `telemetry` branch, a static site, and a Pages deployment.
- **Breaks** nothing. The dashboard is read-only over the record.

## Dependencies

- **Blocks:** nothing hard, but EPIC-06 and EPIC-07 each land a panel here.
- **Built on:** EPIC-03 (the envelope), EPIC-01 (the deployment isolation policy
  covers the Pages site too), EPIC-00 (the `CI-*` ids and the exemption rule).
- **Related:** EPIC-02 — the dashboard becomes interesting only once the app has
  a real surface to report.

## Verification

```bash
# Builds from the real record
node site/build.mjs --telemetry ./telemetry --out ./site/dist

# Zero dependencies — the load-bearing check
node -e "…assert every import in site/**.mjs resolves to a node: builtin…"
test ! -d site/node_modules && echo "OK: instrument is not made of specimen"

# Append-only holds
bash scripts/check-telemetry-append-only.sh

# The framing sentence survives
grep -q 'BILL, NOT A RETURN VALUE' site/dist/index.html && echo "OK: framing"

# Every chart has a data fallback
node -e "…assert svg count == table.chart-fallback count…"

# The published URL matches the documented one
grep -o 'https://[^ ]*' docs/DASHBOARD.md | head -1 | xargs curl -sfI >/dev/null \
  && echo "OK: permanent URL live"
```

Exit criteria:

1. The dashboard is live at a permanent public URL, documented in
   `docs/DASHBOARD.md`, and linked from `README.md`.
2. `site/` has **zero** npm dependencies; `dash-zero-deps` passes.
3. The record is append-only and the guard proves it.
4. The headline block states the CI-2 framing and is readable at 1280×720
   without scrolling.
5. Panels render surface growth, findings by counter-invariant, and the
   first/second-party split; decay and index render as labelled 🔒 placeholders.
6. Every chart has a `<table>` fallback carrying the same numbers.
7. No filter, acknowledge, or snooze control exists anywhere on the page.
