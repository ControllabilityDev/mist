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
| Monorepo scaffold (`apps/web` Next.js, `apps/api` Express) | Planned |
| Prisma schema — two tables (`Location`, `Preference`) | Planned |
| Weather provider integration (deliberately seamless) | Planned |
| Charting — hourly + 7-day | Planned |
| Date/time & timezone handling | Planned |
| i18n | Planned |
| Component library + the one modal | Planned |
| Geolocation | Planned |
| Thin, mock-heavy test suite | Planned |
| Deployment to the isolated target | Planned |
| K1 credential committed, then revoked (EPIC-01 Phase 4) | Planned |

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
