# The Paired Refactor: `main` vs `pure`

**EPIC-09.** Status: Phase 0 and Phase 1 complete. Phases 2-6 not started.

## The branch

`pure` was created from `main` at `22057c0`. It is **long-lived and never
merged**. No fix flows in either direction. `main` must keep rotting on
schedule — that is its job, and EPIC-07's decay experiment is already counting.

**Deviation from the EPIC, recorded rather than quiet.** The EPIC says branch
from the `v1.0.0` tag. `pure` branches from `main` tip instead. The tag points at
`389c63e`, which carries a defect in `assemble-scan-run.mjs` that made the scan
battery exit 1 on a gitleaks finding with an empty title. Phase 5 must run the
*identical* battery on both branches; branching from the tag would have carried a
broken instrument into the comparison. The dependency trees are byte-identical
(`git diff v1.0.0..main -- package-lock.json` is empty), so nothing about the
specimen changed — only the measuring apparatus works now.

## The protocol

A comparison is worth reading only if one variable moved.

```
Same:   domain, user-visible features, weather provider, deployment target class,
        scan battery version, index anchors version, measurement date
Differ: architecture only
```

Both sides are measured by one instrument, `scripts/branch-metrics.mjs`, from one
frozen envelope. `main`'s numbers were recorded **before a line of `pure` code was
written**, so the baseline cannot drift toward a flattering answer.

Baseline artifacts, committed so they cannot expire:

| File | What it is |
|---|---|
| `docs/paired/metrics-main.json` | the measured "before" column |
| `docs/paired/scan-run-main.json` | the exact battery envelope it was measured from |

## The "before" column — `main` at `22057c0`

Measured 2026-09-04.

| Measure | `main` | `pure` | Δ |
|---|---|---|---|
| Lockfile packages | **828** | — | — |
| Distinct `name@version` (index A1) | 794 | — | — |
| Packages with install scripts | 6 | — | — |
| Packages with network at install | 2 | — | — |
| Packages with network at import | 15 | — | — |
| Distinct maintainers | *not measured* | — | — |
| Second-party findings | 48 | — | — |
| First-party findings | 15 | — | — |
| Lines of first-party code | **504** | — | — |
| Mist Index (anchors v1) | `NOT COMPUTABLE` | — | — |
| Tests that can fail on a real behavior change | *Phase 4d* | — | — |
| Build time | *measured at comparison time* | — | — |

**828 packages carry 504 lines.** 1.6 packages per line of code anyone here
wrote. Three quarters of what the battery finds — 48 of 63 — is in code nobody
on this project authored.

### Why the Mist Index cell says NOT COMPUTABLE

It is a **result**, not a blank cell. 80% of the weight is measured; the index
still refuses to publish a composite, because re-normalising three axes to fill
100 would produce a number that looks like a Mist Index and is not one.

| Axis | Weight | State | Unblocks |
|---|---|---|---|
| A1 surface | .30 | measured — 794 → 70.9 | — |
| A2 install-execution | .25 | measured — 6 → 36.7 | — |
| A3 import-time reach | .25 | measured — 15 → 76.7 | wired in Phase 0 |
| A4 churn | .10 | insufficient history — 13 of 90 days | ~2026-11-20, by waiting |
| A5 red-state | .10 | unavailable | needs work; see below |

**A3 was fixed here.** The battery had been measuring `packagesWithNetworkAtImport`
on every run and throwing it away: `importReach()` looked for a `scan-run.json`
in the target tree, and EPIC-03 emits that envelope as a CI *artifact*. A quarter
of the index weight was unmeasured on a repository the battery had already
measured. `mist-index --scan-run FILE` now names an envelope explicitly. A
named-but-missing envelope is an error, never a silent fall back to the root file
— falling back is how a paired comparison reports a Δ between a branch and itself.

**A5 is a known, unfixed defect, recorded not hidden.** `site/build.mjs:76`
computes `red` at render time and never stores it; the record writes
`{sha, ref, startedAt, path}` while `redState()` reads `runs[].red` and
`runs[].at`. The axis reads a shape EPIC-04 never produced. Fixing it changes an
append-only record's shape and belongs to EPIC-04/06, not here. Until it is
fixed, the index cannot compute on **either** branch — so the Δ row stays honest
by being equally absent on both sides, which is the only fair way to leave it.

## Parity checklist — frozen from `main`

Feature parity is mandatory. Dropping a feature to win on package count is the
most likely way this EPIC goes wrong, so the list is frozen here, now, from the
code as it stands — not from memory at review time.

| # | Feature | Where it lives on `main` |
|---|---|---|
| P-01 | Dashboard renders the first stored location | `app/dashboard/page.tsx:29` |
| P-02 | Empty state prompts to add a location | `page.tsx:68` |
| P-03 | Current conditions: description + observed time | `CurrentConditions.tsx:61` |
| P-04 | Observed time in the **provider's** timezone, localised | `CurrentConditions.tsx:45` |
| P-05 | Temperature and feels-like, one decimal | `CurrentConditions.tsx:64,68` |
| P-06 | Harsh-comfort rule: `feels_like > 32 \|\| < -5` (°C) | `CurrentConditions.tsx:36` |
| P-07 | Harsh state tints the card and appends "— dress for it." | `CurrentConditions.tsx:55,70` |
| P-08 | Provider failure distinguishes 401 from unreachable | `CurrentConditions.tsx:21` |
| P-09 | Units preference switches °C/°F everywhere | `CurrentConditions.tsx:40`, `Forecast.tsx:12,82` |
| P-10 | Locale preference switches UI strings | `page.tsx:32`, `lib/translations.ts` |
| P-11 | Forecast: next 12 slots as a line chart | `Forecast.tsx:16` |
| P-12 | Forecast: daily high/low bucketed by day, bar chart | `Forecast.tsx:24` |
| P-13 | Location search by name, debounced, provider geocoder | `LocationSearch.tsx:22` |
| P-14 | "Use my location" via browser geolocation | `LocationSearch.tsx:44` |
| P-15 | Settings modal: units + language, persisted | `SettingsModal.tsx:40` |
| P-16 | API `GET /locations`, `POST /locations` | `apps/api/src/server.ts:12,18` |
| P-17 | API `PUT /locations/:id/preferences` | `server.ts:29` |
| P-18 | API `GET /health` | `server.ts:10` |

`toDisplay` appears **three** times on `main` and `bucketIntoDays` twice — copied
rather than shared, because extracting either would have created the seam EPIC-02
is specified not to have. The kernel does not merely move that logic; the
duplication disappears as a side effect of there being somewhere to put it.

## Phase 1 — the kernel

`packages/kernel`. Four source files, one barrel, 30 tests, **zero dependencies
and zero dev dependencies**.

```
packages/kernel/
  src/types.ts    Location, Observation, Forecast, DailyBucket, Units, ParseError
  src/parse.ts    provider wire JSON -> Observation | ParseError
  src/derive.ts   comfort(), convert(), degreeSymbol(), dayIndex(), bucketHourlyToDaily()
  src/ports.ts    ProviderPort, PreferenceStore, ClockPort -- interfaces only
  src/index.ts    the public surface
  test/           30 tests on `node --test`
```

**The suite adds no packages.** Node runs TypeScript directly, so `node --test`
is the whole harness — no jest, no ts-node, no build step. For a project whose
thesis is package count, a test runner that costs 300 packages would have been an
own goal. `check-pure` asserts `devDependencies` is empty for exactly that
reason.

### What the kernel actually removed

| On `main` | Copies | Why it was copied |
|---|---|---|
| `toDisplay` unit conversion | **3** — `CurrentConditions.tsx:40`, `Forecast.tsx:12`, `Forecast.tsx:82` | extracting it would create the seam EPIC-02 forbids |
| day bucketing | **2** — `Forecast.tsx:24`, `Forecast.tsx:84` | `Forecast.tsx:79-81` says so out loud |

The duplication did not need removing. It disappeared because there was finally
somewhere to put the rule.

### Behavioural differences from `main`, recorded not smuggled

Feature parity is mandatory, so every deviation is listed rather than absorbed.

| # | `main` | `pure` | Category |
|---|---|---|---|
| B-1 | groups days by weekday **name** (`format('ddd')`), so slots 7 days apart collide | integer day index; cannot collide | fixed (latent, unreachable at 5-day range) |
| B-2 | `data.main.temp as number` is a cast; a non-numeric temperature renders `NaN°C` | `parseObservation` returns a `ParseError` naming `main.temp` | fixed |
| B-3 | a missing `timezone` reaches `moment` and renders an invalid time | `parseObservation` refuses; defaulting to 0 would show UTC as local | fixed |
| B-4 | day order follows `groupBy` insertion, i.e. provider arrival order | chronological | fixed |
| B-5 | `data.city?.timezone ?? 0` for the forecast | **kept identical**, though the observation refuses the same absence | parity, deliberate |
| B-6 | `?? 'no description'` misses a present-but-**empty** description | empty and whitespace-only also fall back | fixed |

B-6 is tonight's assembler defect applied forward: `??` falls back on `null` and
`undefined` and not on `""`, and a provider field is foreign text with three
states, not two.

### The Gold Standard — demonstrated, not asserted

EPIC-09 exit criterion 7. Reproduce with `node scripts/mutation-exhibit.mjs`.

One behaviour change, applied to both architectures:

```
const feelsHarsh = feelsLike > 32 || feelsLike < -5;
                ->  feelsLike > 35
```

A reader at 33 °C stops being told to dress for it. No reviewer would approve it.

| Side | Suite | Result |
|---|---|---|
| `main` | jest, 2 suites | **13 passed, 13 total — green** |
| `pure` | `node --test` | **28 passed, 2 failed — caught** |

`main` cannot see it. Its tests open with `jest.mock('axios')` and assert on HTML
rendered from a payload we wrote ourselves, so they test our belief about the
provider rather than the rule — and the rule is a `const` inside a component
body that nothing can reach.

This is the strongest artifact the project can produce, because it is not
arguable. A reviewer can always claim the 828 packages were doing real work. Two
suites and one behaviour change is not a matter of opinion.

**The exhibit had a bug, recorded because it is the more useful half of the
story.** Its first draft anchored on the bare expression `feelsLike > 32 || …`,
which appears twice in `derive.ts` — once in the doc comment citing `main`'s
line, once in the rule. `String.replace` takes the first match, so it edited the
comment, the kernel suite passed, and the exhibit reported that `pure` could not
see the change either. That result was confident and wrong. Reversed, the same
bug would have produced a finding in this project's favour that nobody would
re-check. `applyOnce()` now refuses any anchor that does not occur exactly once,
and three tests pin it.

### Purity, enforced

`node scripts/check-pure.mjs` — 6 assertions, each proven able to fail against a
deliberately broken copy in `scripts/test-paired.mjs`.

| Assertion | Catches |
|---|---|
| `pure-kernel-zero-deps` | a runtime dependency |
| `pure-kernel-zero-dev-deps` | a test runner sneaking packages in |
| `pure-kernel-no-io` | `node:` imports, `fetch`, `Date.now`, `process.env`, `Math.random`, storage |
| `pure-wire-names-confined-to-parse` | the provider's spelling leaking past `parse.ts` |
| `pure-fakes-no-mocks` | any mocking library in the kernel suite |

`pure-wire-names-confined-to-parse` is the one that keeps the rest honest. Types
without it mean the wire shape merely acquired an alias.

### A defect this EPIC uncovered in the repository

`tools/mist-index/bin/mist-index.mjs` — EPIC-06's only entry point — **had never
been committed.** A bare `bin` pattern in `~/.gitignore_global` matches a
directory named `bin` at any depth in any repository. CI ran
`node tools/mist-index/bin/mist-index.mjs` on every push since EPIC-06 and
swallowed `Cannot find module` because the step ends in `|| true`. The tool
worked on one laptop.

Fixed here with a repository-level negation, which outranks `core.excludesFile`
so it does not depend on any contributor's personal configuration. It had to be
fixed here: EPIC-09's own verification block runs that path.

## Threats to validity

Written now, at Phase 0, so it cannot be softened later once the numbers are in.

1. **Hindsight.** `pure` is the second implementation of a domain whose problems
   are already catalogued in `VIOLATIONS.md`. The first implementation had no
   such map.
2. **Metric awareness.** `pure` is written by someone who knows exactly which
   numbers will be published. That is a real bias toward the measured axes and
   away from everything unmeasured.
3. **No time pressure.** `main` is deliberately built the way a team ships under
   a deadline. `pure` is not under one.
4. **Same author.** Both sides share an author, so neither an unfamiliarity
   penalty nor a house-style advantage is controlled for.
5. **Scale.** 504 lines is a small specimen. An order-of-magnitude dependency cut
   on a small app is weaker evidence than the same cut on a large one.

None of these are fixable within this project. They are stated so a reader can
discount the result by the right amount rather than the maximum one.
