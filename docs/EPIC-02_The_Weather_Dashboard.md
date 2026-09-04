# EPIC-02: The Weather Dashboard (WX)

## Context

Mist has no application. At commit `1e69b61` there is no `package.json`, no
source tree, and nothing installed. EPIC-00 established the charter and EPIC-01
drew the containment boundary specifically so that this EPIC — the first one
that installs anything — happens inside known rules.

The concept doc fixes the shape: *"A weather dashboard. The domain justifies the
surface honestly — geolocation, third-party weather APIs, charting,
timezone/date handling, i18n, user preferences in a two-table database — and
every feature is a legitimate excuse for a heavyweight dependency. Target stack:
Next.js + Express (yes, both — the median project has both for historical reasons
nobody remembers) + Prisma + a charting library + a component library. Target
transitive count: 1,200–2,000 packages, reached without a single unreasonable
individual decision"* (`docs/mist-concept-evaluation.md:47`).

And it fixes the hardest constraint: *"'Workable' is load-bearing. Mist must
build, deploy, and actually show the weather. A broken demo demonstrates
nothing; the argument requires that this is what *functioning* software looks
like in the ecosystem's default mode"* (`docs/mist-concept-evaluation.md:49`).

**This EPIC does not add scanners, the dashboard, or `VIOLATIONS.md`.** Those are
EPIC-03, EPIC-04, and EPIC-05. It also does not attempt to hit a package count —
the count is an *outcome* to be measured, never a target to be gamed. If honest
median construction lands at 900 packages, the finding is 900 packages.

---

## Status

| Component | Status |
|---|---|
| Monorepo scaffold (`apps/web` Next.js, `apps/api` Express) | **Complete** — npm workspaces; Express first, Next.js after (log 001) |
| Prisma schema — two tables (`Location`, `Preference`) | **Complete** — migrated; `prisma/migrations/20260903230921_init` |
| Weather provider integration (deliberately seamless) | **Complete** — `axios.get` in the component body, no port |
| Charting — hourly + 7-day | **Complete** — recharts; `lodash.groupBy` buckets the 3-hourly slots |
| Date/time & timezone handling | **Complete** — `moment-timezone`, computed inside the component |
| i18n | **Complete, and smaller than it looks** — see corrigendum 7 |
| Component library + the one modal | **Complete** — MUI, 69 packages, one Dialog |
| Geolocation | **Complete** — browser geolocation + debounced provider geocoding |
| Thin, mock-heavy test suite | **Complete** — 20 tests, every provider and database call mocked |
| Deployment to the isolated target | 🔒 **Blocked** — needs the cloud account gated in EPIC-01 (payment method) |
| K1 credential committed, then revoked (EPIC-01 Phase 4) | **Committed, NOT revoked** — `apps/web/next.config.js`; step 4 is the one open item |
| Install ledger for every dependency | **Complete** — 35 install records, 11 corrections, contemporaneous |
| Structural gate (`scripts/check-wx.mjs`) | **Complete** — 6 assertions |

*Every `**Complete**` row landed 2026-09-03. Commit pin owed next session.*

**It builds, it tests, and it shows live weather.** `npm run build --workspaces`
is green, 20/20 tests pass, and `GET /dashboard` returns HTTP 200 rendering real
observations — Reykjavík, 9.9 °C, overcast clouds, timestamped in the location's
own timezone. Exit criterion 1 is met **locally**; it is not yet met on a
deployed target, which stays blocked on the cloud account.

⚠️ **K1 is live and public.** It is committed at `apps/web/next.config.js` and
has not been revoked. `docs/KEY_ROTATION.md` step 4 is the single most urgent
open item in this repository, and `test-containment`'s `key-rotation-recorded`
stays PENDING until the revocation timestamp is recorded.

**This EPIC cannot close until K1 is revoked and the deploy target exists.**

---

## Goals

- Ship a weather dashboard that **actually works** — builds, deploys, and shows
  real weather for a real location.
- Reach a large transitive surface **as a consequence** of ordinary choices, not
  as an objective. Medianness (`docs/MEDIANNESS.md`) governs every install.
- Make every anti-kernel property in the app **real and load-bearing**, never
  decorative: the unfakeable seams must be the actual way the code is written,
  not a demonstration bolted on.
- Produce a test suite that exhibits the **prophecy problem** honestly:
  *"thin and mock-heavy, London-school without the discipline"*
  (`docs/mist-concept-evaluation.md:29`) — mocks verifying conversations with
  dependencies whose real behavior nobody has read.

## Scope

The rules this application must obey:

1. **Every dependency passes the Medianness Test** (`docs/MEDIANNESS.md`), and
   its justification is recorded in the construction ledger (EPIC-08).
2. **No seams.** Third-party APIs are called from component bodies. The database
   client is imported globally. There is no port, no adapter, no injection.
   This is not laziness dressed as design — it is the median, and it is what
   makes the app unfakeable (`docs/mist-concept-evaluation.md:29`).
3. **No purity partition.** Fetch, parse, derive, format, and render are not
   separated. Business rules live inside React components.
4. **Wide semver ranges, install scripts enabled, no `.npmrc` hygiene.** Per
   `docs/ROADMAP.md:31-37`.
5. **It must work.** A feature that does not function is removed, not shipped
   broken.
6. **Synthetic data only** in every fixture and seed (EPIC-01 Scope rule 3).

Explicitly out of scope: performance, accessibility beyond what the component
library provides by default, and any refactor toward a kernel — that is EPIC-09,
on a separate branch.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Location (a place to show weather for) | `Location` Prisma model | ❌ absent |
| Observation (current conditions) | inline type in the fetch call site | ❌ absent |
| Forecast (hourly + daily series) | inline type in the fetch call site | ❌ absent |
| Unit system (metric / imperial) | `Preference.units` column | ❌ absent |
| Locale | `Preference.locale` column | ❌ absent |
| Timezone offset | derived at render, inside the component | ❌ absent |
| The Provider (the weather API) | direct `axios` call, no port | ❌ absent |

**Note on this table.** In a kernel repo the right column would name pure types.
Here it names *call sites*, because the domain has no representation independent
of the fetch that produced it. That is not an accident of drafting — it is the
counter-invariant CI-6 (no seams) visible as an absence in the domain map.

---

## Design

### Repository shape

```
apps/
  web/          Next.js — the dashboard UI, App Router
  api/          Express — a thin proxy + preference CRUD
prisma/
  schema.prisma two models
scripts/
  seed-synthetic.ts   (from EPIC-01 Phase 5c)
package.json    workspaces, no version pinning
package-lock.json
```

**Rationale for shipping both Next.js and Express.** The concept doc calls this
out as the median condition — *"yes, both — the median project has both for
historical reasons nobody remembers"* (`docs/mist-concept-evaluation.md:47`). To
keep it honest rather than a stunt, the construction log (EPIC-08) must record
the plausible history: Express first, for the API; Next.js added later for the
UI; the Express layer never removed because things depend on it.

### The Prisma schema

`prisma/schema.prisma` (new):

```prisma
model Location {
  id        Int          @id @default(autoincrement())
  label     String
  latitude  Float
  longitude Float
  createdAt DateTime     @default(now())
  prefs     Preference[]
}

model Preference {
  id         Int      @id @default(autoincrement())
  locationId Int
  location   Location @relation(fields: [locationId], references: [id])
  units      String   @default("metric")
  locale     String   @default("en")
  theme      String   @default("system")
}
```

Two tables, as specified (`docs/mist-concept-evaluation.md:47`). The Prisma
client is instantiated once at module scope and imported directly wherever it is
needed — no repository layer, no injection. That single decision is
counter-invariant CI-6 in its purest form, and it is exactly what a hurried
developer writes.

### The weather provider call

`apps/web/app/dashboard/CurrentConditions.tsx` (new), sketched:

```tsx
export default async function CurrentConditions({ lat, lon }: Props) {
  // No port. No adapter. No injection. The component IS the integration.
  const { data } = await axios.get(`${PROVIDER_URL}/current`, {
    params: { lat, lon, key: process.env.WEATHER_API_KEY },
  });

  // Business rule (feels-like threshold) computed inline, in the view.
  const feelsHarsh = data.feelslike_c > 32 || data.feelslike_c < -5;

  return <ConditionsCard data={data} harsh={feelsHarsh} />;
}
```

**Rationale.** Three counter-invariants land in nine lines: the provider is
reached through no seam (CI-6, unfakeable), the domain rule `feelsHarsh` has no
existence outside the render path (CI-4, no purity partition), and the provider's
wire shape (`feelslike_c`) leaks straight into the view (boundary erosion).
Writing this correctly — with a port and a parsed domain type — would be the
EPIC-09 version. Here, this *is* the specification.

### Dependency slate (each with its one-step intent)

Every row must pass `docs/MEDIANNESS.md`. Recorded here so the choices are
reviewable in one place; the ledger (EPIC-08) records the session that produced
each.

| Package | One-step intent | Median? |
|---|---|---|
| `next`, `react`, `react-dom` | "I need a React app" | yes |
| `express` | "I need an API" | yes |
| `prisma`, `@prisma/client` | "I need a database" | yes |
| `axios` | "I need to call an API" (over `fetch`) | yes — the reflex choice |
| `moment` + `moment-timezone` | "I need to format times in the location's timezone" (over `Temporal`) | yes — named at `docs/mist-concept-evaluation.md:39` |
| `lodash` | "I need `groupBy` and `debounce`" — three functions, whole library | yes — named at `docs/mist-concept-evaluation.md:39` |
| a charting library | "I need a temperature graph" | yes |
| a component library | "I need a settings modal" — one component, whole library | yes — named at `docs/mist-concept-evaluation.md:39` |
| an i18n library | "I need translations" | yes |
| `dotenv` | "I need env vars locally" | yes |

**Rationale for writing this table before installing.** Not to pre-plan the tree
— the tree must grow the way an agentic session grows it — but so that a
reviewer can later check the *shape* of what happened against what was intended,
and catch drift toward strawman. Additions beyond this slate are expected and
fine; each just needs its ledger entry and its medianness argument.

### The test suite

`apps/web/__tests__/` — deliberately thin and mock-heavy. The concept doc asks
for a suite that *"demonstrates the prophecy problem in its worst form: mocks
verifying conversations with dependencies whose actual behavior nobody controls
or has read"* (`docs/mist-concept-evaluation.md:29`).

```ts
jest.mock('axios');

it('renders current conditions', async () => {
  (axios.get as jest.Mock).mockResolvedValue({
    data: { feelslike_c: 21, condition: { text: 'Sunny' } },
  });
  // This test passes forever, including on the day the provider renames
  // feelslike_c. It asserts the shape of our belief, not the provider's behavior.
  ...
});
```

**Rationale — and the honesty rule that applies to it.** This must be a *real*
test suite that a team would plausibly write, and it must genuinely pass. Its
weakness is structural, not authored: nothing in it is wrong on purpose. The
comment above is the only editorial addition, and it belongs in
`VIOLATIONS.md` (EPIC-05) rather than in the test — the code should look like
code, not like an exhibit annotating itself.

---

## Work Items

### Phase 0 — Prerequisites & gates

- [ ] **0a.** Confirm EPIC-00 landed: `docs/ANTI_KERNEL.md`,
      `docs/MEDIANNESS.md`, `CONTRIBUTING.md`, PR template.
- [ ] **0b.** Confirm EPIC-01 landed: `scripts/check-containment.sh` runs
      blocking, README banner present, `deploy/isolation.md` written,
      `@mist-demo` scope registered.
- [ ] **0c.** Confirm EPIC-08 Phase 0 landed: `docs/construction-log/` and
      `install-ledger.jsonl` exist. **The ledger cannot be reconstructed after
      the fact — this is the hard ordering constraint.**
- [ ] **0d.** Confirm no `.npmrc` exists and none is added at any point in this
      EPIC (`docs/ROADMAP.md:31-37`).

### Phase 1 — Scaffold and the first install

- [ ] **1a.** `npm init` at the root with workspaces `apps/*`. Record the
      resulting `package.json` as ledger entry 001.
- [ ] **1b.** Scaffold `apps/api` with Express. Record the install.
- [ ] **1c.** Scaffold `apps/web` with Next.js. Record the install. Record the
      plausible history note (Express first, Next.js later) in the construction
      log per Design.
- [ ] **1d.** Capture the transitive count after each install into the ledger, so
      surface growth is attributable per-decision, not just per-commit.

### Phase 2 — Data and the provider

- [ ] **2a.** Add Prisma; write `prisma/schema.prisma` with the two models from
      Design. Run the first migration.
- [ ] **2b.** Instantiate the Prisma client at module scope in
      `apps/api/src/db.ts` and import it directly at every call site. No
      repository layer.
- [ ] **2c.** Provision weather API key **K1** on the isolated account
      (EPIC-01 `docs/KEY_ROTATION.md` step 1).
- [ ] **2d.** Add `axios`; implement `CurrentConditions.tsx` per Design, calling
      the provider directly from the component body.
- [ ] **2e.** Commit K1 inline in the ordinary course of making the feature work
      (`KEY_ROTATION.md` step 2). This is a real commit, not a staged stunt.
- [ ] **2f.** Wire `scripts/seed-synthetic.ts` (from EPIC-01 Phase 5c) into
      `npm run seed`. Confirm `check-containment.sh` still passes.

### Phase 3 — Time, units, locale

- [ ] **3a.** Add `moment` and `moment-timezone`. Format observation timestamps
      in the location's timezone, computed inside the component.
- [ ] **3b.** Add an i18n library; translate the dashboard into two locales.
- [ ] **3c.** Implement unit conversion (metric/imperial) as an inline helper in
      the view layer, reading `Preference.units`. Do not extract it.

### Phase 4 — Charts and the modal

- [ ] **4a.** Add a charting library; render an hourly temperature series and a
      7-day summary.
- [ ] **4b.** Add a component library for the settings modal — one component
      used, whole library installed. Record the medianness argument.
- [ ] **4c.** Add `lodash` for `groupBy` (bucketing hourly into daily) and
      `debounce` (the location search box).

### Phase 5 — Geolocation and polish

- [ ] **5a.** Browser geolocation for "use my location", with a typed search
      fallback against the provider's geocoding endpoint.
- [ ] **5b.** Persist the selected location and preferences via the Express API.

### Phase 6 — The test suite

- [ ] **6a.** Add the test runner. Write the thin, mock-heavy suite per Design:
      target roughly 15–25 tests covering the happy paths, all provider calls
      mocked.
- [ ] **6b.** Do **not** add contract tests, integration tests against the real
      provider, or a fake provider server. Their absence is the finding.

### Phase 7 — Deploy

- [ ] **7a.** Deploy `apps/web` and `apps/api` to the isolated target from
      `deploy/isolation.md`. Provision **K2** as a deployment environment
      variable (`KEY_ROTATION.md` step 5).
- [ ] **7b.** Verify the deployed dashboard shows live weather for a real
      location. This is the load-bearing "workable" criterion
      (`docs/mist-concept-evaluation.md:49`).
- [ ] **7c.** **Revoke K1** at the provider and record the timestamp in
      `docs/KEY_ROTATION.md` (step 4). Do not rewrite history (step 6).

### Phase 8 — Close

- [ ] **8a.** Record the final transitive package count from
      `npm ls --all --parseable | wc -l` in this EPIC's corrigendum. Report the
      true number even if it is far from the 1,200–2,000 estimate.
- [ ] **8b.** Tag the release `v1.0.0` — EPIC-07 freezes this tag.
- [ ] **8c.** Flip Status rows; write the corrigendum.

---

## Test Plan

Application tests (the deliberately thin suite):

- `CurrentConditions.renders` — mocked axios, asserts the card renders. Pins the
  happy path and nothing else.
- `Forecast.buckets-hourly-into-daily` — asserts the `lodash.groupBy` bucketing.
  The one test with real logic in it.
- `Preferences.persists` — mocked Prisma client, asserts the API is called with
  the expected arguments. A conversation test: it verifies the call, not the
  effect.
- `UnitConversion.metric-imperial` — inline helper, pure by accident.

Structural tests (these are the ones that protect the *demonstration*):

- `wx-no-npmrc` — asserts `.npmrc` does not exist at any workspace root.
  Prevents accidental mitigation (EPIC-00 Scope rule 4).
- `wx-ranges-are-wide` — asserts every entry in every `package.json`
  `dependencies` block uses a range operator, never an exact pin.
- `wx-ledger-complete` — asserts every direct dependency in every `package.json`
  has a matching entry in `install-ledger.jsonl` (EPIC-08). Fails on an
  undocumented install.
- `wx-deploy-shows-weather` — a smoke check against the deployed URL asserting a
  temperature value renders. This is the workability guarantee; if it fails,
  Mist is not making its argument.

Gold Standard: adding `save-exact=true` to an `.npmrc` must make `wx-no-npmrc`
fail. Removing the port-less provider call in favour of an injected client must
change nothing in the test suite — and that silence is itself the finding
EPIC-05 records.

## Key Files

| File | Role |
|---|---|
| `package.json` | Root workspaces; the surface begins here (new) |
| `package-lock.json` | The parody of event sourcing (`docs/mist-concept-evaluation.md:23`) (new) |
| `apps/web/` | Next.js dashboard (new) |
| `apps/api/` | Express API (new) |
| `apps/api/src/db.ts` | Module-scope Prisma client, imported everywhere (new) |
| `apps/web/app/dashboard/CurrentConditions.tsx` | The seamless provider call (new) |
| `prisma/schema.prisma` | Two models (new) |
| `apps/web/__tests__/` | The thin, mock-heavy suite (new) |
| `docs/KEY_ROTATION.md` | Steps 1–4 executed by this EPIC (exists, EPIC-01) |

## Reuse (do NOT recreate)

- `docs/MEDIANNESS.md` (EPIC-00) — the rubric every install is judged by. Do not
  restate it per PR.
- `docs/KEY_ROTATION.md` (EPIC-01) — the credential lifecycle is already
  specified; this EPIC executes steps 1–4, it does not redesign them.
- `scripts/seed-synthetic.ts` (EPIC-01 Phase 5c) — the fixture generator already
  exists; wire it, do not write a second one.
- `docs/mist-concept-evaluation.md:39` — `moment`, `axios`, `lodash`, and the
  one-modal component library are named there as the canonical examples. Use
  those, so the app matches the argument the book makes.

## Compatibility

- **Preserves** nothing; this is the first code in the repository.
- **Adds** the entire application and the dependency surface.
- **Breaks** the EPIC-01 verification line `test ! -f package.json`, which is
  expected and is deleted as part of Phase 1a.

## Dependencies

- **Blocks:** EPIC-05 (nothing to inventory until deps exist), EPIC-06 (nothing
  to index), EPIC-07 (needs the `v1.0.0` tag), EPIC-09 (needs something to
  refactor against).
- **Built on:** EPIC-00 (charter), EPIC-01 (containment — hard prerequisite),
  EPIC-08 Phase 0 (the ledger must precede the first install).
- **Related:** EPIC-03 — the scan battery should be wired early enough to
  observe surface growth during this EPIC rather than only at its end.

## Verification

```bash
# It builds
npm ci
npm run build --workspaces

# It tests
npm test --workspaces

# It runs, and it shows the weather
npm run dev &
curl -sf http://localhost:3000/dashboard | grep -qE '[0-9]+°' && echo "OK: weather rendered"

# The surface — measured, not targeted
npm ls --all --parseable | wc -l
npm ls --all --json | node -e "…count packages with install/postinstall scripts…"

# No mitigation crept in
test ! -f .npmrc && test ! -f apps/web/.npmrc && test ! -f apps/api/.npmrc \
  && echo "OK: no hygiene applied"

# Containment still holds
bash scripts/check-containment.sh
```

Exit criteria:

1. The deployed dashboard shows live weather for a real location, from the
   isolated target in `deploy/isolation.md`.
2. `npm run build --workspaces` and `npm test --workspaces` are green.
3. The transitive package count is **recorded truthfully** in the corrigendum,
   whatever it is. Missing the 1,200–2,000 estimate is a result, not a failure.
4. Every direct dependency has a ledger entry (`wx-ledger-complete` passes) and
   a stated one-step intent.
5. No `.npmrc`, no exact pins, no `--ignore-scripts` anywhere in the repo.
6. K1 is committed in history **and revoked at the provider**, with the
   revocation timestamp recorded in `docs/KEY_ROTATION.md`.
7. `scripts/check-containment.sh` passes — synthetic data only, owned scopes
   only, banner intact.
8. Release tagged `v1.0.0`.

---

## Implementation corrigendum

*Added 2026-09-03. What actually landed, what the numbers really are, and where
this EPIC's own plan was wrong.*

### 1. The transitive package count is 737, and that sentence is misleading

Phase 8a asks for the count from `npm ls --all --parseable | wc -l`, reported
truthfully whatever it is. It is **737**.

The estimate was 1,200–2,000. **737 is well below it.** That is the result, not
a failure, and it must not be closed by adding packages: EPIC-02's Context says
the count is an outcome to be measured, never a target to be gamed.

The harder finding is that **"the transitive package count" is not one number.**
Four defensible measures of the same tree, taken minutes apart:

| Measure | Value | What it counts |
|---|---:|---|
| `npm ls --all --parseable \| wc -l` | **737** | tree *positions*, plus the root line |
| `node_modules` walk (`scripts/license-inventory.mjs`) | **700** | package directories on disk |
| CycloneDX components | **663** | what the SBOM tool considers a component |
| distinct `name@version` in `npm ls --all --json` | **804** | identities, counting a package present at two versions twice |

A 141-package spread, and every one of these is a number somebody would happily
write in a headline. `schemas/ledger.schema.json` names the first, so the ledger
uses it and includes the root line, making it exactly 1 greater than a package
count.

**EPIC-06 must pick one definition and say which.** `scan-run.json`'s
`surface.transitivePackages` currently carries the CycloneDX figure (663) while
the ledger carries 737. They are not comparable and the Mist Index must not
treat them as though they were.

### 2. The first mitigation was applied silently, and the containment gate missed it

The very first install came out exact-pinned — `"express": "5.2.1"`. Nobody
chose that. A contributor's **global `~/.npmrc`** sets `save-exact=true`.

An exact pin is a supply-chain mitigation: it closes the semver-range hidden
input channel (`CI-1`), one of the specific things Mist exists to measure.
`CONTRIBUTING.md` standing rule 4 calls adopting a mitigation a silent
destruction of the measurement, and this is what that looks like — not an
argument anybody won, just a machine default deleting the finding.

`scripts/check-containment.sh`'s `containment-no-hygiene-mitigation` did not
catch it, and could not: it reads a **repository** `.npmrc`, and this came from
a user-level file that is not in the repository at all. **That is a real gap in
a blocking gate.**

`scripts/check-wx.mjs`'s `wx-ranges-are-wide` closes it by reading the *result*
rather than the configuration — it inspects the ranges actually written into
every `package.json`, so it does not care where the pin came from. Nine ledger
corrections record the pins that were caught this way.

Also worth stating: no command-line flag reliably overrides a global
`save-exact`. `--save-prefix='^'`, `--save-exact=false` and `--no-save-exact`
were each tried and each lost. The ranges are widened by
`scripts/ledger-install.mjs` after every install.

### 3. A live npm token was found in the same file

The same `~/.npmrc` contains a live npm automation token. It is outside the
repository and was never at risk of being committed, but it was read into the
session transcript. The contributor was told immediately and asked to revoke it.
`schemas/secret-patterns.json` already carries an `npm-token` pattern, so
`scripts/redact.mjs` removes it from any published transcript — but redaction is
not the safeguard here. Revocation is.

### 4. The tree changed underneath the project three times in one afternoon

None of these was a decision, and all three are `CI-1` arriving as real cost:

1. **`npm install prisma` installed a release candidate.** Prisma's `latest`
   dist-tag pointed at `8.0.0-rc.12`; `@prisma/client`'s pointed at `7.10.0`.
   The default install produced two mismatched majors. Correcting it removed
   364 packages, which is why the ledger's running total *falls* between seq 10
   and seq 17.
2. **`npm install typescript` installed TypeScript 7.** `ts-jest` declares a
   peer of `>=4.3 <7`, so the next install failed with `ERESOLVE`. Downgraded to
   5.x (correction seq 36). `--legacy-peer-deps` was the other median move and
   was rejected because Scope rule 5 says it must actually work.
3. **Prisma 7 refused its own schema format.** `url` in `datasource` is gone;
   the connection string moved to a new `prisma.config.ts` and a driver adapter
   became mandatory — 34 more packages for a feature nobody wanted.

This did not have to be simulated. It is one afternoon of an unpinned tree.

### 5. Ledger entry 001 is `express`, not `npm init`

Phase 1a says to record the root `package.json` as ledger entry 001.
`schemas/ledger.schema.json` requires `package`, `range` and `packagesAdded` on
every install record, and `npm init` installs nothing — a record for it would
have needed invented values in three contemporaneous fields. The root scaffold
is recorded in `docs/construction-log/001-*.md` instead, and entry 001 is the
first thing that actually entered the tree.

### 6. The recording tool was wrong before the record was

`scripts/ledger-add.mjs` computed `packagesAdded` as *(total now − total at the
previous record)*, which assumes the tree only ever grows. After the Prisma
downgrade removed 364 packages the subtraction went negative and was clamped to
zero, so two installs that really added 2 packages were recorded as adding 0
(corrections seq 19–20).

Replaced by `scripts/ledger-install.mjs`, which runs the install itself and
measures immediately before and after. The number is now a fact about one
command rather than an inference about the file's history.

The lesson generalises: **the ledger's weakest point is not honesty, it is
arithmetic.** Rule 2 asks people to record what was true; nothing in
`docs/CONSTRUCTION.md` asks whether the tool measuring it can count.

### 7. The i18n library is used by exactly one component, and not the one that matters

`react-i18next` calls `React.createContext` at module scope, which does not
exist in the server runtime, so importing `lib/i18n.ts` from the dashboard page
crashed the build. The strings were split into `lib/translations.ts`, and the
server component now reads them with a two-line lookup.

So: an i18n library was installed, initialised, and is used by one client
component, while the page that actually renders the translated strings does not
use it at all. The strings would have worked without it. Nobody would have
noticed if it had been removed. It is still installed.

### 8. `lodash` added zero packages, and that is the interesting part

Seq 21 records `packagesAdded: 0`. The number is correct and was verified by
removing and reinstalling: **`prisma` had already pulled `lodash` in** through
`@prisma/studio-core`. The marginal cost of the "whole library for two
functions" decision was nothing, because a dependency nobody chose had already
paid it.

That is worse than the decision looking expensive, not better. The cost was
real; it was just already sunk, invisibly, by a package four levels down.

### 9. `npm audit` reports zero findings

The first real scan run found **0 known advisories** across 663 SBOM components.
Reported because it is true and because the temptation to bury it is real: Mist's
argument does not need the tree to be vulnerable. The argument is about
*surrendered controllability*, and a clean audit alongside 737 packages, 41
unaudited maintainer relationships and three breaking changes in one afternoon
makes that point better than a CVE would.

The licence scan is the one that found things: **700 packages, 693 permissive,
3 weak-copyleft, 4 with no declared licence at all.** Four unanswered questions
nobody will ever ask.

### 10. Two defects in EPIC-03, found by having a real tree

- **`surface.directDependencies` counted only the root manifest.** The first
  real scan reported 17 while `check-wx` reported 35, because the root holds the
  dev toolchain and the workspaces hold the application's own dependencies. Two
  numbers disagreeing about one word is worse than either being wrong. Fixed to
  span all manifests; both now say 35.
- **A test in `scripts/test-scan.mjs` used "the repository has no
  `package.json`" as its fixture.** EPIC-02 created one and the test failed —
  not because the property broke, but because the fixture was the absence of a
  file somebody was about to write. Rewritten to measure a genuinely empty tree,
  plus a new assertion that a tree *with* a manifest reports a number.

### 11. What is blocked, and by what

| Item | Blocked on |
|---|---|
| K1 provisioned, committed, revoked (2c, 2e, 7c) | a weather-provider account on the isolated infrastructure |
| Deploy (7a) | the cloud account gated in EPIC-01 — needs a human with a payment method |
| Live weather (7b, exit criterion 1) | K1 |
| `v1.0.0` tag (8b) | the agent may not run state-changing git commands here |

Everything else in Phases 1–6 and 8 landed. The application is complete
*around* the K1 gap: it calls OpenWeatherMap correctly, receives `401 Invalid
API key`, and renders that as a visible state.

`docs/KEY_ROTATION.md` steps 1–5 stay **Owed**. Nothing was faked to make a
Status row green.

### Debt this EPIC did not pay

- **`@mist-demo` is not a registered npm scope.** The workspaces use the name
  anyway. `docs/slopsquat.json` still records `scopeRegistered: false`, so the
  names in `package.json` are currently squattable by anyone else. EPIC-01
  Phase 3a owns this and it is now more urgent, not less.
- **No scanner sees the CI configuration**, unchanged from EPIC-03.
- **The mis-numbered citation checker still does not exist**, now 5 of 5 EPICs.

---

## Corrigendum addendum — K1, and the countdown that switched itself off

*Added 2026-09-03, after a weather API key was provisioned.*

### 12. K1 arrived through a real bug, which is what the runbook asked for

`docs/KEY_ROTATION.md` step 2 requires the commit to be ordinary rather than
staged, and forbids a stunt commit. It was not staged.

The key went into the repository-root `.env` first, which is gitignored. The
dashboard still returned `401`, because **Next.js reads `.env` from its own
project root (`apps/web`), not the workspace root** — so `process.env.WEATHER_API_KEY`
was `undefined` and the app was calling OpenWeatherMap with no key at all. The
documented Next.js answer is the `env` block in `next.config.js`, which is a
committed file. The key went there, live weather appeared, and the session moved
on.

Nobody in that sequence was thinking about secrets. They were thinking about why
the temperature would not render. That is how keys actually reach public
history, and it is why this commit satisfies `docs/MEDIANNESS.md` rather than
merely resembling something that would.

**Verified true positive:** scanning the tracked tree with
`schemas/secret-patterns.json` — the same ruleset that compiles into the CI
gitleaks config — the `openweather-style-key` rule matches
`apps/web/next.config.js` twice. EPIC-03's `gitleaks` job now has something real
to find, which was the entire point of committing a key.

### 13. The revocation countdown reported itself satisfied the moment the key went live

This is the most serious defect found in the project so far, and it was in
EPIC-01's own test.

`key-rotation-recorded` in `scripts/test-containment.sh` asserted:

```bash
grep -qE '^\| K1 \|.*[0-9]{4}-[0-9]{2}-[0-9]{2}' docs/KEY_ROTATION.md
```

It matched **any date anywhere on the K1 row**. The row's first date column is
`Provisioned`. So at the exact moment K1 was created — when a live credential
became public and the reminder mattered most — the countdown went green and
stopped asking.

`docs/KEY_ROTATION.md` describes that check as *"a countdown that starts when
EPIC-02 Phase 2 lands and stops when someone revokes the key they promised to
revoke."* It did the opposite: it stopped when the key was **provisioned**.

Fixed to read the revocation-timestamp column specifically. Proven both ways: it
reports PENDING against the current unrevoked row, and `ok` against a copy with
a timestamp filled in. The old regex reports SATISFIED against the current row,
which is the bug, reproduced.

**The general lesson is worse than the specific one.** A reminder that switches
off when the hazard begins is more dangerous than no reminder, because somebody
is relying on it. This one was written before the hazard existed, was never
exercised against a real K1, and would have gone unnoticed precisely because its
failure mode is silence. Every other "pending" assertion in this repository was
written the same way and has never been exercised either.

### 14. Still blocked

| Item | Blocked on |
|---|---|
| **Revoke K1** (step 4) | a human at openweathermap.org — **urgent, the key is public** |
| Provision K2 (step 5) | after step 4 |
| Deploy (7a) | the cloud account gated in EPIC-01 |
| Live weather *on the deployed target* (7b) | the deploy |
| `v1.0.0` tag (8b) | the agent may not run state-changing git commands here |
