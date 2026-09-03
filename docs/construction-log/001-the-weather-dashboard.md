# Session 001 — building the weather dashboard

*EPIC-02. Started 2026-09-03. Actor: agent (Claude Opus 5), directed by a human
who said "do EPIC-02" and nothing more specific.*

---

## Read this before quoting any number from session 001

This session's installs were **guided by a pre-written dependency slate** in
`docs/EPIC-02_The_Weather_Dashboard.md` (the "Dependency slate" table in
Design). That table was written by EPIC-02's author before any install happened,
and it names `axios`, `moment`, `lodash` and a component library specifically.

That matters for what this log can and cannot be evidence of:

- It **is** honest evidence of surface growth: the package counts are measured,
  not estimated, and each one was recorded at the moment of the install.
- It is **not** evidence about unguided agentic reflexes. An agent following a
  slate is not an agent reaching for a package. The `deliberation` distribution
  from this session must not be quoted as "how agents choose dependencies" —
  the choosing largely happened before the session started.

EPIC-08's Phase 3 asks for exactly that distribution. It should draw on sessions
where the agent was not handed a slate. Session 001 is not one of them, and
saying so here costs nothing now and protects the claim later.

## The plausible history, stated plainly

The repository ships both Express and Next.js. `docs/EPIC-02` Design asks for the
history to be recorded rather than implied, so: **Express went in first**
(seq 1), as the API. **Next.js came later** (seq 3), for the UI. The Express
layer was never removed, because the preference CRUD and the provider proxy
already lived there and moving them was never anybody's priority.

This is the median condition the concept doc names — *"yes, both — the median
project has both for historical reasons nobody remembers"*
(`docs/mist-concept-evaluation.md:47`). Here the reason is remembered, because
it was written down within minutes of happening.

## What happened, in order

### The first mitigation was applied by accident, and it was mine

The very first install came out **exact-pinned**: `"express": "5.2.1"`, not
`"^5.2.1"`. Nobody chose that. A contributor's global `~/.npmrc` sets
`save-exact=true`, and npm applied it silently.

An exact pin is a supply-chain **mitigation**. It closes the semver-range hidden
input channel — counter-invariant `CI-1`, *"dependencies that update under
semver ranges"* (`docs/ANTI_KERNEL.md:34`) — which is one of the specific things
Mist exists to measure. Standing rule 4 in `CONTRIBUTING.md` calls adopting a
mitigation a silent destruction of the measurement, and this is what that looks
like in practice: not a decision anybody argued for, just a machine's default
quietly deleting the finding.

It was caught because the ranges were read back after the install rather than
assumed. Recorded as **correction seq 2**, appended and never edited, per
honesty rule 4. Every install after it passes `--save-prefix='^'` explicitly.

`scripts/check-containment.sh` did not catch this: its
`containment-no-hygiene-mitigation` assertion looks for `ignore-scripts=true` in
a **repository** `.npmrc`, and this came from a user-level config that is not in
the repository at all. That is a real gap in the gate, not a near miss, and it is
recorded in EPIC-02's corrigendum.

### A live credential was found in the same file

The same `~/.npmrc` contains a live npm automation token. It is outside the
repository and was never at risk of being committed, but it was read aloud into
the session transcript, which makes it a redaction subject under
`docs/CONSTRUCTION.md`. The contributor was told immediately and asked to revoke
it.

`schemas/secret-patterns.json` already carries an `npm-token` pattern, so
`scripts/redact.mjs` removes it from any transcript published from this session.
The mechanical pass is not the safeguard here, though — revocation is. A redacted
transcript of a live token is still a live token.

## Installs

*Every row below is measured, not estimated. `total` is
`npm ls --all --parseable | wc -l` immediately after the install, which is the
measure `schemas/ledger.schema.json` names. It includes the root directory line,
so it is exactly 1 greater than the package count.*

<!-- INSTALL TABLE: appended as the session runs -->

| seq | package | deliberation | packages added | total after |
|---:|---|---|---:|---:|
| 1 | `express` | reflex | 70 | 70 |
| 3 | `next` | reflex | 25 | 95 |
| 4 | `react` | reflex | 0 | 95 |
| 5 | `react-dom` | reflex | 0 | 95 |
| 6 | `prisma` | brief | 412 | 507 |
| 7 | `@prisma/client` | reflex | 3 | 510 |
| 8 | `axios` | reflex | 13 | 523 |
| 9 | `dotenv` | reflex | 2 | 525 |
| 10 | `cors` | reflex | 0 | 525 |
| 17 | `moment` | reflex | 0 | 245 |
| 18 | `moment-timezone` | reflex | 0 | 245 |
| 21 | `lodash` | reflex | 0 | 245 |
| 22 | `i18next` | brief | 5 | 250 |
| 23 | `react-i18next` | brief | 0 | 250 |
| 24 | `recharts` | brief | 20 | 270 |
| 25 | `@mui/material` | reflex | 69 | 339 |
| 26 | `@emotion/react` | reflex | 0 | 339 |
| 27 | `@emotion/styled` | reflex | 0 | 339 |
| 28 | `typescript` | reflex | 5 | 344 |
| 29 | `tsx` | reflex | 0 | 344 |
| 30 | `@types/node` | reflex | 14 | 358 |
| 31 | `@types/react` | reflex | 0 | 358 |
| 32 | `@types/react-dom` | reflex | 0 | 358 |
| 33 | `@types/express` | reflex | 0 | 358 |
| 34 | `@types/cors` | reflex | 0 | 358 |
| 35 | `@types/lodash` | reflex | 0 | 358 |
| 37 | `jest` | brief | 330 | 687 |
| 38 | `ts-jest` | brief | 0 | 687 |
| 39 | `jest-environment-jsdom` | brief | 0 | 687 |
| 40 | `@types/jest` | brief | 0 | 687 |
| 41 | `@testing-library/react` | brief | 0 | 687 |
| 42 | `@testing-library/jest-dom` | brief | 0 | 687 |
| 44 | `@prisma/adapter-better-sqlite3` | reflex | 34 | 721 |
| 45 | `supertest` | reflex | 16 | 737 |
| 46 | `@types/supertest` | reflex | 0 | 737 |

**35 install records. 11 corrections.** The corrections are not a sign the
method failed; they are the method working. Nine of them record the same silent
mitigation (an exact pin from a global `~/.npmrc`), one records a broken
measurement in the recording tool itself, and one corrects a correction that had
a patch version typed from memory instead of read back.

## Deliberation

| deliberation | count |
|---|---:|
| reflex | 25 |
| brief | 10 |
| researched | 0 |

Ten of thirty-five records name an alternative. **Zero were researched.** Read
the warning at the top of this file before quoting that: the agent was working
from a pre-written slate, so this measures how a slate gets executed, not how an
agent chooses.

The number that is not distorted by the slate is the **cost**:

| decision | packages added |
|---|---:|
| `prisma` — "I need a database" | 412 |
| `jest` — "I need a test runner" | 330 |
| `express` — "I need an API" | 70 |
| `@mui/material` — "I need a settings modal" | 69 |
| `@prisma/adapter-better-sqlite3` — Prisma 7 refused the schema | 34 |
| `next` — "I need a React app" | 25 |
| `recharts` — "I need a temperature graph" | 20 |

Two lines of that table are worth stopping on.

**`jest` cost 330 packages, more than the entire application.** The test runner
is a bigger dependency surface than everything it tests. Nobody would defend
that if it were stated as a decision; it was never stated as a decision.

**`@mui/material` cost 69 packages for one modal.** That is
`docs/MEDIANNESS.md` rubric item 4 exactly: individually defensible, because
nobody should write their own accessible dialog; indefensible in aggregate,
because the aggregate is what you ship.

## Three times the tree changed underneath the project

None of these was a decision. All three are counter-invariant `CI-1`
(`docs/ANTI_KERNEL.md:34`) — hidden input channels — arriving as real cost inside
one session.

1. **`npm install prisma` installed a release candidate.** Prisma's `latest`
   dist-tag pointed at `8.0.0-rc.12` while `@prisma/client`'s `latest` was
   `7.10.0`. The default install produced two mismatched majors. Fixing it
   removed 364 packages, which is why the ledger's running total dips between
   seq 10 and seq 17.

2. **`npm install typescript` installed TypeScript 7**, the native-port major.
   `ts-jest` declares a peer of `>=4.3 <7`, so the very next install failed with
   `ERESOLVE`. Downgraded to the 5.x line (correction seq 36). Nobody chose
   TypeScript 7; an unpinned install did, and it broke the test runner.

3. **Prisma 7 refused its own schema format.** `url` in `datasource` is no
   longer supported; the connection string moved to a new `prisma.config.ts` and
   a driver adapter became mandatory. That is one more package (34 transitive)
   and one more config file, for a feature nobody wanted.

The honest summary: in a single afternoon, an unpinned dependency tree served a
release candidate, a breaking major, and a removed configuration format. This is
what `docs/mist-concept-evaluation.md:19` means by "dependencies that update
under semver ranges", and it did not have to be simulated.

## What was NOT done, and why

- **K1 was never provisioned or committed.** It needs an account at a weather
  provider on the isolated infrastructure, which needs a human with a payment
  method (`deploy/isolation.md`). `docs/KEY_ROTATION.md` steps 1-5 remain
  **Owed**. The application is complete around the gap: it calls
  OpenWeatherMap correctly and receives `401 Invalid API key`, and the dashboard
  renders that as a visible state rather than crashing.
- **Nothing was deployed.** Same blocker.
- **No release was tagged.** The agent is not permitted to run state-changing
  git commands in this repository.

