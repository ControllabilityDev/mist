# EPIC-09: The Paired Refactor (PURE)

## Context

The concept doc names this the strongest possible version of the demonstration:
*"The strongest possible demo is Mist plus a branch: the same weather dashboard
rebuilt with a small pure core (fetch/parse/derive as a kernel, shell owning
I/O), dependency count cut by an order of magnitude, dashboard green. Before/after
on the same domain is the purity-partitioning chapter's working code"*
(`docs/mist-concept-evaluation.md:88`).

Everything before this EPIC demonstrates the thesis by *violation* — Mist shows
what surrendering control costs. This EPIC is the only place in the repository
where the positive case is made on the same domain, with the same features, so
the comparison controls for everything except architecture.

At commit `1e69b61` nothing exists. This EPIC is **🔒 Gated**: it cannot begin
until EPIC-02 has shipped a working dashboard, EPIC-03 is measuring it, EPIC-05
has inventoried its violations, and EPIC-06 can score both sides. Without all
four, the "before" half of before/after has no numbers.

**This EPIC does not modify `main`.** Mist stays rotten; that is its job. The
refactor lives on a long-lived `pure` branch and is never merged.

---

## Status

| Component | Status |
|---|---|
| `pure` branch created from `v1.0.0` | 🔒 Gated |
| `packages/kernel/` — pure, zero-dependency core | 🔒 Gated |
| Shell adapters — I/O at the edges | 🔒 Gated |
| Feature parity with `main` | 🔒 Gated |
| Same scan battery, run on `pure` | 🔒 Gated |
| Side-by-side comparison panel | 🔒 Gated |
| `docs/PAIRED_REFACTOR.md` — the honest comparison | 🔒 Gated |
| Violation elimination table (which `V-*` died) | 🔒 Gated |

---

## Goals

- Rebuild the **same domain, same features** with a small pure core and a shell
  that owns all I/O.
- Cut the dependency count by **roughly an order of magnitude**, and report the
  real figure whatever it is.
- Show which specific `V-*` entries from `VIOLATIONS.md` (EPIC-05) the
  architecture **eliminates**, versus which merely **move**.
- Produce a comparison that is **fair** — same features, same provider, same
  deployment target — because an unfair comparison would discredit the whole
  project.

## Scope

1. **Feature parity is mandatory.** Every user-visible feature on `main` works on
   `pure`. Dropping a feature to win on package count would be cheating, and it
   is the most likely way this EPIC goes wrong.
2. **`main` is untouched.** No fix flows back. The two branches are a matched
   pair, and Mist's decay must continue uninterrupted.
3. **The kernel is genuinely pure**: no I/O, no clock, no environment reads, no
   network, zero runtime dependencies. Inputs in, values out.
4. **The comparison is measured, not asserted.** Both branches run the same
   battery (EPIC-03) and the same index (EPIC-06). Every claimed improvement
   cites a number.
5. **Report what does not improve.** If `pure` has fewer packages but the same
   number of first-party findings, say so. A refactor that only wins on the axis
   it optimised is a weaker but more honest result than a claimed sweep.

---

## Domain map

The same domain as EPIC-02, but note what changes: on `main` the right column
named *call sites*, because the domain had no representation of its own. Here it
names types. That difference **is** the purity partition.

| Domain concept | Code construct (`pure`) | Status |
|---|---|---|
| Location | `kernel::Location` value type | ❌ absent |
| Observation | `kernel::Observation` parsed value | ❌ absent |
| Forecast | `kernel::Forecast` series value | ❌ absent |
| Unit system | `kernel::Units` enum + pure conversion | ❌ absent |
| Comfort rule (`feelsHarsh`) | `kernel::comfort()` pure function | ❌ absent |
| Provider (the weather API) | `ProviderPort` interface; adapter in the shell | ❌ absent |
| Persistence | `PreferenceStore` port; adapter in the shell | ❌ absent |

---

## Design

### Shape

```
packages/
  kernel/          zero dependencies. parse, derive, format-agnostic.
    src/
      types.ts       Location, Observation, Forecast, Units
      parse.ts       providerWireJson -> Observation | ParseError
      derive.ts      comfort(), bucketHourlyToDaily(), convert()
      ports.ts       ProviderPort, PreferenceStore — interfaces only
  shell/           owns ALL I/O: http, db, clock, env, rendering
    src/
      provider-http.ts   implements ProviderPort using the platform fetch
      store-sqlite.ts    implements PreferenceStore
      main.ts            wiring
apps/
  web/             thin UI; calls the shell, never the provider
```

**Rationale for `ports.ts` holding only interfaces.** It is what makes the
kernel fakeable, which is the fakeability doc's claim
(`docs/mist-concept-evaluation.md:29`) demonstrated in the positive direction. On
`main` the only way to test `CurrentConditions` is to mock `axios` — asserting
our belief about the provider. Here a test supplies a `ProviderPort` returning a
known `Observation`, and asserts behavior. The difference is not stylistic; one
can fail when the code is wrong and the other cannot.

### The comparison protocol

`docs/PAIRED_REFACTOR.md`. To be fair the comparison must be like-for-like:

```
Same:  domain, user-visible features, weather provider, deployment target class,
       scan battery version, index anchors version, measurement date
Differ: architecture only
```

Reported table:

| Measure | `main` | `pure` | Δ |
|---|---|---|---|
| Transitive packages | | | |
| Packages with install scripts | | | |
| Packages with network at import | | | |
| Distinct maintainers | | | |
| Mist Index (anchors v1) | | | |
| Second-party findings | | | |
| First-party findings | | | |
| Tests that can fail on a real behavior change | | | |
| Lines of first-party code | | | |
| Build time | | | |

**Rationale for the last three rows.** They are the rows most likely to make
`pure` look worse, and they must be there. "Tests that can fail on a real
behavior change" is the Gold Standard from the methodology applied as a metric —
it is expected to favour `pure` heavily. "Lines of first-party code" is expected
to favour `main`, because writing your own parsing and conversion costs code that
a library would have supplied. Publishing the row that undercuts the argument is
what makes the rest of the table believable.

### Violation elimination table

For every entry in `violations.yaml` (EPIC-05), classify on `pure`:

```
eliminated  — the counter-invariant no longer holds anywhere
moved       — still present, but now confined to the shell and fakeable
remains     — unchanged
new         — introduced by the refactor
```

**Rationale for `moved` as a distinct category.** The honest result for I/O is
usually `moved`, not `eliminated`: the shell still calls the network, still reads
the clock, still touches the database. The kernel pattern does not remove I/O;
it *confines* it. Collapsing `moved` into `eliminated` would overstate the case
in exactly the way that gets an architectural claim dismissed. And the `new`
category must exist because hand-written parsing introduces its own defect class.

### What the refactor is allowed to use

Not zero dependencies overall — that would be its own strawman, and a median
reviewer would rightly say the comparison was rigged. The rule:

```
kernel:  zero runtime dependencies. Non-negotiable.
shell:   dependencies permitted where the platform genuinely lacks a primitive,
         each one recorded in violations.yaml on the `pure` branch with the same
         discipline as main.
apps/web: a UI framework is permitted. React is not the problem; unfakeable
         coupling is.
```

**Rationale.** The claim under test is *"dependency count cut by an order of
magnitude"* (`docs/mist-concept-evaluation.md:88`), not "zero dependencies". An
honest order of magnitude — say 1,700 → 170 — is a far stronger result than a
contrived zero, because it is a target other teams could actually hit.

---

## Work Items

### Phase 0 — Gate

- [ ] **0a.** Confirm EPIC-02 shipped and `v1.0.0` is tagged and deployed.
- [ ] **0b.** Confirm EPIC-03's battery, EPIC-05's inventory, and EPIC-06's index
      all produce numbers for `main`. Record the "before" column **before**
      writing any `pure` code, so it cannot drift.
- [ ] **0c.** Create branch `pure` from `v1.0.0`. Record in
      `docs/PAIRED_REFACTOR.md` that it is long-lived and never merged.
- [ ] **0d.** Freeze the feature list from `main` as the parity checklist.

### Phase 1 — The kernel

- [ ] **1a.** `packages/kernel/src/types.ts` — the value types from the domain
      map. No wire shapes; `feelslike_c` does not appear here.
- [ ] **1b.** `parse.ts` — provider wire JSON → `Observation | ParseError`,
      test-first, driven by real recorded provider payloads.
- [ ] **1c.** `derive.ts` — `comfort()`, `bucketHourlyToDaily()`, `convert()`.
      Each is the pure version of a rule that lives inside a component on `main`;
      cite the `main` `path:line` each one replaces.
- [ ] **1d.** `ports.ts` — `ProviderPort`, `PreferenceStore`. Interfaces only.
- [ ] **1e.** Assert zero runtime dependencies mechanically, as in EPIC-04/06.

### Phase 2 — The shell

- [ ] **2a.** `provider-http.ts` implementing `ProviderPort` with the platform
      fetch. No `axios`.
- [ ] **2b.** `store-sqlite.ts` implementing `PreferenceStore`. No ORM unless one
      earns its place; record the decision either way.
- [ ] **2c.** Clock and environment as explicit inputs, never read from inside
      the kernel.
- [ ] **2d.** `main.ts` wiring. All construction in one readable file.

### Phase 3 — Parity

- [ ] **3a.** Rebuild the UI against the shell. Every feature on the Phase 0d
      checklist works.
- [ ] **3b.** Timezone, i18n, unit conversion via `Intl` — the platform
      primitives that `moment`, the i18n library, and the inline helpers covered
      on `main`.
- [ ] **3c.** Charts: hand-written SVG or one small charting dependency. Record
      which, and why, in `violations.yaml` on the branch.
- [ ] **3d.** Settings modal without a component library.
- [ ] **3e.** Deploy `pure` to a second isolated target under the same EPIC-01
      containment rules.

### Phase 4 — Tests that can fail

- [ ] **4a.** Kernel unit tests with no mocks at all — pure functions need none.
- [ ] **4b.** Port fakes: an in-memory `ProviderPort` and `PreferenceStore`.
- [ ] **4c.** One contract test per adapter, run against the real provider on a
      schedule, so a provider wire change actually breaks a test. This is the
      test class `main` structurally cannot have.
- [ ] **4d.** Compute the "tests that can fail on a real behavior change" metric
      for both branches, with a stated methodology — likely a mutation-testing
      run over first-party code on each branch.

### Phase 5 — The comparison

- [ ] **5a.** Run the identical battery and index against `pure`, same versions,
      same anchors, same day.
- [ ] **5b.** Fill the comparison table, **including the rows where `pure`
      loses**.
- [ ] **5c.** Build the violation elimination table with all four categories.
- [ ] **5d.** Add the side-by-side panel to the dashboard (EPIC-04).
- [ ] **5e.** Write `docs/PAIRED_REFACTOR.md`: protocol, results, and an explicit
      **Threats to validity** section — the second implementation had the benefit
      of hindsight, was written by people who knew the target metric, and did not
      face the same time pressure. Say so.

### Phase 6 — Close

- [ ] **6a.** Flip Status rows; record the real order-of-magnitude figure,
      whatever it is.
- [ ] **6b.** Confirm `main` was not modified: `git diff v1.0.0..main` shows only
      unrelated ongoing work.

---

## Test Plan

- `pure-kernel-zero-deps` — `packages/kernel` has no runtime dependencies.
  **The load-bearing test.**
- `pure-kernel-no-io` — static check: the kernel imports no `node:fs`,
  `node:http`, `fetch`, `Date.now`, or `process.env`. Pins Scope rule 3.
- `pure-parity` — every feature on the Phase 0d checklist has a passing
  end-to-end test on `pure`. Pins Scope rule 1, the cheating risk.
- `pure-fakes-no-mocks` — the kernel test suite contains zero mocking-library
  calls. The contrast with `main`'s suite is the fakeability exhibit.
- `pure-contract-tests-run` — adapter contract tests execute against the real
  provider on a schedule and fail on a wire change. Pins the test class `main`
  cannot have.
- `pure-comparison-complete` — the comparison table has no empty cells, including
  the three rows expected to favour `main`. Guards against quiet omission.
- `pure-violation-categories` — the elimination table uses all four categories
  and does not classify a confined-I/O violation as `eliminated`.
- `main-untouched` — `git diff v1.0.0..main -- apps/ packages/` shows no refactor
  commits.

Gold Standard: this EPIC's own claim is testable — a real behavior change in
`derive.ts` must make a kernel test fail with no mock updates, while the
equivalent change on `main` leaves its suite green. That divergence, demonstrated
concretely, is the strongest single artifact the project can produce.

## Key Files

| File | Role |
|---|---|
| `packages/kernel/` (branch `pure`) | Zero-dependency pure core (new) |
| `packages/shell/` (branch `pure`) | All I/O, at the edges (new) |
| `docs/PAIRED_REFACTOR.md` | Protocol, results, **threats to validity** (new) |
| `violations.yaml` (branch `pure`) | Same discipline, different results (new) |
| `site/build.mjs` | Gains the side-by-side panel (exists, EPIC-04) |
| `VIOLATIONS.md` (branch `main`) | The "before" inventory (exists, EPIC-05) |

## Reuse (do NOT recreate)

- `.github/workflows/scan.yml` (EPIC-03) — run the *identical* battery on `pure`
  via a reusable workflow. A separately-authored battery would make the
  comparison meaningless.
- `tools/mist-index/` with `anchors.json` unchanged (EPIC-06) — same anchors, or
  the Δ column is not a Δ.
- `violations.yaml` schema and generator (EPIC-05) — the branch reuses the
  tooling wholesale.
- `deploy/isolation.md` (EPIC-01) — the second deployment inherits the same
  containment rules; do not write a second policy.
- `docs/EPIC-02_The_Weather_Dashboard.md` feature list — the parity checklist
  comes from there.

## Compatibility

- **Preserves** `main` completely and permanently. Nothing here is merged.
- **Adds** a long-lived `pure` branch, a second isolated deployment, and one
  dashboard panel.
- **Breaks** nothing. Two branches with divergent `package.json` files is the
  intended steady state.

## Dependencies

- **Blocks:** nothing.
- **Built on:** EPIC-02 (the "before"), EPIC-03 (the battery), EPIC-05 (the
  violation inventory to compare against), EPIC-06 (the index and its anchors),
  EPIC-01 (containment for the second deployment).
- **Related:** EPIC-07 — a future variant could freeze `pure` too and compare
  decay curves across architectures. Not in scope here; recorded as a follow-on.

## Verification

```bash
git checkout pure

# The kernel is pure
node -e "…assert packages/kernel imports no node: builtins and no deps…"
test -z "$(node -p "Object.keys(require('./packages/kernel/package.json').dependencies||{}).join('')")" \
  && echo "OK: kernel has zero runtime dependencies"

# Feature parity
npm run test:e2e --workspace apps/web

# Kernel tests use no mocks
grep -rE "jest\.mock|vi\.mock|sinon" packages/kernel && echo "FAIL: mocks in kernel" || echo "OK"

# Same battery, same anchors, same day
gh workflow run scan.yml --ref pure
node tools/mist-index/bin/mist-index.mjs . --json | tee /tmp/pure.json
git checkout main && node tools/mist-index/bin/mist-index.mjs . --json | tee /tmp/main.json
node scripts/compare-branches.mjs /tmp/main.json /tmp/pure.json

# main was not touched
git diff v1.0.0..main -- apps/ packages/ | head
```

Exit criteria:

1. `pure` implements **every** feature on the parity checklist; `pure-parity`
   passes.
2. `packages/kernel` has zero runtime dependencies and performs no I/O.
3. The comparison table is complete — no empty cells — measured with the same
   battery version and index anchors on the same day.
4. The order-of-magnitude claim is reported with the **real** figure, and if it
   was not achieved, that is stated plainly.
5. The violation elimination table uses all four categories, with confined I/O
   classified as `moved`, never `eliminated`.
6. `docs/PAIRED_REFACTOR.md` carries a **Threats to validity** section naming
   hindsight, metric-awareness, and time-pressure asymmetry.
7. A real behavior change in `derive.ts` breaks a kernel test with no mock
   updates; the equivalent change on `main` leaves its suite green. Both
   demonstrated, both recorded.
8. `main` is unmodified by this EPIC.
