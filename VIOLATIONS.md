# VIOLATIONS

**Generated from `violations.json` by `scripts/gen-violations.mjs`. Do not edit by
hand — `scripts/check-violations.mjs` fails on a byte difference, and that check
blocks merge.**

Each entry maps a subject — a dependency, or a first-party path:line — to the
kernel counter-invariant it exhibits, with evidence that resolves against the
tree. This is the inventory the concept doc calls the book's exhibit: "each
entry is a kernel invariant with a CVE-shaped shadow"
(`docs/mist-concept-evaluation.md:62`).

---

## Summary

| Class | Entries | Second-party | First-party |
|---|---:|---:|---:|
| hidden-input-channel | 8 | 8 | 0 |
| unfakeable-seam | 6 | 0 | 6 |
| uncontrolled-emission | 2 | 2 | 0 |
| boundary-erosion | 3 | 0 | 3 |
| none | 28 | 28 | 0 |
| **total** | **47** | **38** | **9** |

The first-party column is shown on purpose. Mist's claim is that its defects
are second-party and emergent while Juice Shop's are first-party and curated
(`docs/mist-concept-evaluation.md:68`). That claim is only credible if the
first-party violations are counted honestly and shown to be the smaller number
— and shown by name, so nobody has to take it on faith.

## What this document does and does not enumerate

**Every direct dependency has an entry.** Absence is not permitted; `class:
none` with a written justification is. That is what makes the completeness
check able to assert anything.

**Transitive packages are covered by class, not individually.** There are 736
packages on disk and enumerating them by hand would be neither possible nor
useful; the concept doc anticipates this with "each dependency (or class of
them)". The class-level entries carry `transitive:` subjects and name the
specific packages where the count is small enough to name.

**Evidence or nothing.** Every non-`none` entry cites evidence that resolves
against the tree — an install hook declared in a package.json on disk, a line
in a package's source, or a first-party `path:line`. A violation with no
resolvable evidence is a claim, and claims do not go in the exhibit.

---

## hidden-input-channel

*install scripts, env-switched behaviour, import-time network, semver drift* — primary counter-invariant `CI-1`

#### V-001 — `prisma`

**Counter-invariant:** `CI-1`  
**Behaviour declared by:** `prisma`  
**Evidence:** `install-script:prisma`

Runs a preinstall script. An install script is remote code execution you
scheduled yourself: it runs with your user's privileges, before any code
review, every time the tree is populated. Nobody chose prisma because of this
and nobody weighed it.

#### V-002 — `@prisma/client`

**Counter-invariant:** `CI-1`  
**Behaviour declared by:** `@prisma/engines`  
**Evidence:** `install-script:@prisma/engines`

The runtime the API imports. It does not declare an install hook itself;
@prisma/engines, which it pulls in, runs a postinstall that places a
query-engine binary. The behaviour is one level down from the decision, which
is exactly why per-decision attribution matters.

#### V-003 — `@prisma/adapter-better-sqlite3`

**Counter-invariant:** `CI-1`  
**Behaviour declared by:** `better-sqlite3`  
**Evidence:** `install-script:better-sqlite3`

Pulls in better-sqlite3, whose install hook is `prebuild-install || node-gyp
rebuild`. That first branch downloads a prebuilt native binary over the
network at install time; the second compiles C++ locally. Either way the
artifact on disk is not the artifact in the lockfile. This package was never
wanted -- Prisma 7 made a driver adapter mandatory.

#### V-004 — `tsx`

**Counter-invariant:** `CI-1`  
**Behaviour declared by:** `esbuild`  
**Evidence:** `install-script:esbuild`, `import-effect:esbuild:install.js:149`

Pulls in esbuild, whose postinstall calls https.get to download a platform
binary. The evidence anchors the actual network call. The lockfile records
which version of esbuild was resolved; it records nothing about what that
download returned.

#### V-005 — `jest`

**Counter-invariant:** `CI-1`  
**Behaviour declared by:** `@parcel/watcher, unrs-resolver`  
**Evidence:** `install-script:@parcel/watcher`, `install-script:unrs-resolver`

The test runner pulls in two packages that run install scripts. Note the
direction of the cost: the tooling that exists to give confidence in the code
enlarges the unaudited surface the code runs on.

#### V-006 — `moment-timezone`

**Counter-invariant:** `CI-1`  
**Evidence:** `import-effect:moment-timezone:index.js:2`

Line 2 of its entry point is
`moment.tz.load(require('./data/packed/latest.json'))`. The set of timezones
this application believes in is a function of when node_modules was populated,
not of any input the application supplies. A tz database revision changes
behaviour with no code change and no lockfile change.

#### V-009 — `next`

**Counter-invariant:** `CI-1`  
**Evidence:** `pkg-file:next:dist/server/lib/generate-agent-files.js`, `path:apps/web/AGENTS.md:1`

Running `next dev` WRITES FILES INTO THE REPOSITORY: apps/web/AGENTS.md and
apps/web/CLAUDE.md, containing instructions addressed to AI coding agents.
Nobody asked for them. They appeared during EPIC-02 and were committed in
8a4b444 by a `git add -A` that nobody inspected line by line. The generator is
node_modules/next/dist/server/lib/generate-agent-files.js. This is a hidden
input channel of an unusually direct kind -- not a value flowing into the
program, but instructions flowing into the humans and agents who write it,
placed there by a dependency, on its own initiative, at dev-server startup.
The file argues its own case for being committed: "Removing it from a diff
only re-creates the uncontrolled change; committing it with your work keeps
the tree clean." Whether the advice is good is beside the point. A package
that edits your source tree to tell your tools what to think is a channel the
project never opened and cannot see from package.json.

#### V-010 — `transitive:install-scripts`

**Counter-invariant:** `CI-1`  
**Evidence:** `install-script:prisma`, `install-script:@prisma/engines`, `install-script:better-sqlite3`, `install-script:esbuild`, `install-script:@parcel/watcher`, `install-script:unrs-resolver`

Class-level entry. Of 736 packages on disk, 6 declare an install hook: prisma,
@prisma/engines, better-sqlite3, esbuild, @parcel/watcher, unrs-resolver. All
six are named individually rather than counted, because six is small enough to
name -- and the honest finding is that the number is SMALL. Mist expected
more. Reported as measured.

---

## unfakeable-seam

*live-API coupling with no port; global client imports* — primary counter-invariant `CI-6`

#### V-011 — `apps/web/app/dashboard/CurrentConditions.tsx:12`

**Counter-invariant:** `CI-6`  
**Evidence:** `path:apps/web/app/dashboard/CurrentConditions.tsx:12`

The weather provider is called with axios from inside the component body.
There is no port and no adapter, so there is nothing to substitute. The only
way to test this component is to mock axios, which asserts what we believe
about the provider and never what the provider does.

#### V-012 — `apps/api/src/db.ts:18`

**Counter-invariant:** `CI-6`  
**Evidence:** `path:apps/api/src/db.ts:18`

The Prisma client is constructed once at module scope and exported. Every
route imports it directly. A test that wants to stay off a real database has
to reach into the module registry and replace the module -- not because the
suite chose mocks, but because that is the only door in the building.

#### V-013 — `apps/api/src/server.ts:14`

**Counter-invariant:** `CI-6`  
**Evidence:** `path:apps/api/src/server.ts:14`

The route handler calls prisma.location.findMany directly. Persistence, HTTP
shape and the response body are the same statement. There is no layer where
the domain exists on its own.

#### V-014 — `apps/web/components/LocationSearch.tsx:27`

**Counter-invariant:** `CI-6`  
**Evidence:** `path:apps/web/components/LocationSearch.tsx:27`

The provider's geocoding endpoint is called from the browser, from inside a
component. Beyond the missing seam, this is the line that forced a correction
to docs/KEY_ROTATION.md step 5: a NEXT_PUBLIC_ value is inlined into the
client bundle at build time, so 'supply the key by environment variable'
protects nothing here.

#### V-015 — `apps/web/__tests__/CurrentConditions.test.tsx:5`

**Counter-invariant:** `CI-6`  
**Evidence:** `path:apps/web/__tests__/CurrentConditions.test.tsx:5`

jest.mock('axios'). This suite passes forever, including on the morning the
provider renames feels_like. It asserts the shape of our belief, not the
provider's behaviour -- the prophecy problem in its worst form
(docs/mist-concept-evaluation.md:29). Nothing in it is wrong on purpose; its
weakness is structural, inherited from the missing seam above.

#### V-016 — `apps/api/__tests__/preferences.test.ts:4`

**Counter-invariant:** `CI-6`  
**Evidence:** `path:apps/api/__tests__/preferences.test.ts:4`

jest.mock of the db module. The assertions check that prisma was CALLED with
certain arguments -- a conversation test. It would keep passing if `include`
stopped meaning what we think it means, because nothing here ever touches a
database.

---

## uncontrolled-emission

*libraries that log, telemeter, or phone home on their own initiative* — primary counter-invariant `CI-2`

#### V-007 — `next`

**Counter-invariant:** `CI-2`  
**Evidence:** `pkg-file:next:dist/telemetry/post-telemetry-payload.js`

Ships a telemetry subsystem that posts to
https://telemetry.nextjs.org/api/v1/record. It is on by default and opt-out.
Whatever one thinks of the practice, the point here is structural: the
framework emits on its own initiative, so emission is not a return value the
application controls -- it is a side effect it hosts.

#### V-008 — `prisma`

**Counter-invariant:** `CI-2`  
**Evidence:** `pkg-file:prisma:build/cli.js`

The CLI contacts checkpoint.prisma.io to check for updates. Second entry for
the same package, because a package can exhibit more than one
counter-invariant and collapsing them would hide one.

---

## boundary-erosion

*format and transport types leaking through every layer* — primary counter-invariant `CI-3`

#### V-017 — `apps/web/app/dashboard/CurrentConditions.tsx:36`

**Counter-invariant:** `CI-3`, `CI-4`  
**Evidence:** `path:apps/web/app/dashboard/CurrentConditions.tsx:36`

`feelsHarsh` is a domain rule with no existence outside the render path,
computed from the provider's wire field. The provider's JSON shape IS the
domain model; there is no parsed type between the socket and the view.

#### V-018 — `apps/web/app/dashboard/CurrentConditions.tsx:40`

**Counter-invariant:** `CI-4`  
**Evidence:** `path:apps/web/app/dashboard/CurrentConditions.tsx:40`

Unit conversion is an inline arrow function in the view, reading a stored
preference. It is pure by accident rather than by design, and it is duplicated
in Forecast.tsx because there is no module for it to live in.

#### V-019 — `apps/web/app/dashboard/Forecast.tsx:24`

**Counter-invariant:** `CI-3`  
**Evidence:** `path:apps/web/app/dashboard/Forecast.tsx:24`

The `Slot` type this file groups over is the provider's wire shape, imported
by every consumer. The bucketing logic -- the one piece of real domain logic
in the application -- is defined inside a chart component and had to be
exported separately so a test could reach it.

---

## none

*no counter-invariant exhibited; justification required*

#### V-020 — `axios`


A HTTP client. No install hook, no import-time network, no telemetry. Inert as
a package. The seam it participates in is first-party and is recorded at
CurrentConditions.tsx:12 -- charging axios for how it was used would move the
blame to the wrong place.

#### V-021 — `express`


A router with 28 direct dependencies. The fanout is real but it is not a
counter-invariant; it is counted in the surface totals. Express itself
declares no install hook and no telemetry. What leaks through it is
first-party, recorded at server.ts:14.

#### V-022 — `react`


No install hook, no network, no telemetry, no dependencies at all.

#### V-023 — `react-dom`


No install hook and no emission. One dependency.

#### V-024 — `lodash`


Zero dependencies, no install hook, no import-time effect. Its real finding is
not a counter-invariant: it added ZERO packages to the tree because prisma had
already pulled it in through @prisma/studio-core. The cost of the
whole-library-for-two-functions decision was already sunk, invisibly.

#### V-025 — `moment`


The library itself is inert -- no install hook, no network. It is in
maintenance mode and recommends against itself for new projects, which is a
maintenance risk rather than a controllability violation. moment-timezone is
the one with the import-time effect.

#### V-026 — `i18next`


Zero dependencies, no install hook. Genuinely inert. Its finding is that it is
barely used: the page that renders the translated strings cannot import it at
all, so it reads a plain object instead.

#### V-027 — `react-i18next`


No install hook or emission. Calls React.createContext at module scope, which
is ordinary for a React binding and is why it cannot be imported from a server
component.

#### V-028 — `recharts`


A charting library, 11 direct dependencies, no install hook and no telemetry.

#### V-029 — `@mui/material`


No install hook, no emission. 69 transitive packages for one Dialog. That is
the aggregate cost recorded in the install ledger and in docs/MEDIANNESS.md
rubric item 4 -- expensive, defensible individually, and not a
counter-invariant.

#### V-030 — `@emotion/react`


MUI's styling peer. No install hook, no emission.

#### V-031 — `@emotion/styled`


MUI's styling peer. No install hook, no emission.

#### V-032 — `cors`


Two dependencies, no install hook. Added because the browser refused a
cross-origin call from localhost:3000.

#### V-033 — `dotenv`


Reads a file at explicit call time. No install hook, no network, no
import-time effect. Inert.

#### V-034 — `typescript`


A compiler. Ships a binary in the package, runs no install hook, declares no
dependencies.

#### V-035 — `jest-environment-jsdom`


Part of the jest install. No install hook of its own.

#### V-036 — `ts-jest`


The TypeScript transform for jest. No install hook. Its peer range on
typescript is what forced the TypeScript 7 downgrade recorded in EPIC-02
correction seq 36 -- a real cost, but a compatibility one rather than a
controllability one.

#### V-037 — `supertest`


Drives the Express app in-process for tests. No install hook or emission.

#### V-038 — `@testing-library/react`


No install hook or emission.

#### V-039 — `@testing-library/jest-dom`


No install hook or emission.

#### V-040 — `@types/node`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-041 — `@types/react`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-042 — `@types/react-dom`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-043 — `@types/express`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-044 — `@types/cors`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-045 — `@types/lodash`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-046 — `@types/jest`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

#### V-047 — `@types/supertest`


A DefinitelyTyped declaration package. It contains no runtime code at all:
nothing executes, nothing is imported at runtime, nothing can emit. Inert by
construction. Recorded rather than omitted so the completeness check has
something to assert.

---

## What is deliberately not here

**The committed API key (K1).** It is a security finding, not a kernel
counter-invariant, and stretching the four-class taxonomy to hold it would
weaken the taxonomy. Its lifecycle lives in `docs/KEY_ROTATION.md`.

**Fixes.** Recording a violation never triggers a fix on `main`. The paired
refactor that eliminates these is EPIC-09, on a separate branch, and it is
measured by which of these entries it removes.

