# The Scan Battery: what each sensor sees, and what it cannot

*Created 2026-09-03. Owned by EPIC-03. Companion to
`.github/workflows/scan.yml` and `schemas/scan-run.schema.json`.*

---

## Why the blind spots are listed first in every section

A scanner report is an argument about coverage, and the honest half of that
argument is the part about what was **not** looked at. Mist exists to be cited.
A citation that says "the battery found N findings" is worth very little unless
the reader can also see the shape of the hole the battery cannot reach.

So: every section below states **what it structurally cannot see** before it
states what it can. Structurally means *by construction* — not "we did not
configure it", but "this class of tool cannot answer this class of question."

## The asymmetry, once more

Every job in `.github/workflows/scan.yml` is `continue-on-error: true`. A red
scan is data, not a defect (`docs/ROADMAP.md:48`). Nothing blocks on whether the
tree is clean, because the tree is not supposed to be clean.

There are **three blocking jobs**, and all three are about whether the
experiment is being run truthfully rather than whether it is exposed:

| Blocking job | EPIC | What it refuses |
|---|---|---|
| `containment.yml` | EPIC-01 | a breach of the wall around the experiment |
| `ledger.yml` | EPIC-08 | an install with no contemporaneous record |
| `violations.yml` | EPIC-05 | an inventory that no longer matches the tree |

The third is the one worth explaining. A scanner finding measures the
ecosystem's decay; a drifted inventory is Mist failing to do its own
documentation job. An inventory that no longer matches the tree is worse than no
inventory, because people cite it. `docs/mist-concept-evaluation.md:62` calls for
a *maintained* `VIOLATIONS.md`, and "maintained" is only true if something
enforces it.

**Zero blocking scanners, three blocking honesty gates.** That asymmetry is a
claim the project makes on purpose.

The one job in `scan.yml` that is not `continue-on-error` is `assemble`. That is
the rule applied to the instrument rather than an exception to it: a malformed
`scan-run.json` is a broken measuring device, and a broken device is a real
defect.

## What is asleep right now

Five of the seven scanners need a dependency tree. EPIC-02 has not landed, so
there is no `package.json` and no `package-lock.json`. Those jobs run, detect
the absence, and record `status: "skipped"` with a stated reason. They do **not**
report zero.

This distinction is the single most important thing in the envelope. Reporting
"0 transitive packages" would be a false green, and a false green is the one
failure mode that would actually damage the argument. `null` in a `surface.*`
field means **not measured**. It never means zero. EPIC-06 must treat it that
way.

| Scanner | State today | Wakes up when |
|---|---|---|
| `npm-audit` | skipped — no lockfile | EPIC-02 Phase 1 |
| `osv-scanner` | skipped — no lockfile | EPIC-02 Phase 1 |
| `sca-behavioral` | skipped — no tool selected yet | EPIC-03 Phase 2a, needs a real tree |
| `semgrep` | skipped — no `apps/` yet; `scripts/` is scanned once it has JS | EPIC-02 Phase 1 |
| `gitleaks` | **running now** | — |
| `sbom` | skipped — no lockfile | EPIC-02 Phase 1 |
| `licenses` | skipped — no `node_modules` | EPIC-02 Phase 1 |

No edit to `scan.yml` is needed when EPIC-02 lands. The jobs test for the
lockfile themselves.

---

## `npm-audit`

**Cannot see.** Anything without a published advisory. It is a lookup against a
database of things somebody already found, wrote up, and published — so it is
structurally blind to every vulnerability in the window between introduction and
disclosure, which is where a supply-chain attack actually lives. It says nothing
about behaviour: a package that opens a socket at import time is clean to
`npm audit` forever, because that is not a bug, it is a design. It also cannot
see anything that is not a *package*: build scripts, CI config, the lockfile's
own resolution choices.

**Can see.** Known advisories against the resolved tree, with severity and the
version range affected.

**Counter-invariants it can evidence.** `CI-3` — the boundary is `node_modules`,
and each package there is an unaudited party to the trust relationship. A CVE is
that party turning out to matter. This mapping is a judgement call and is
recorded in `CI_MAP` in `scripts/assemble-scan-run.mjs` so it can be argued with.

**Configuration.** `--audit-level=none`: report everything, decide nothing. No
allowlist file, no `audit-resolve.json`; `scripts/check-scan.mjs` fails if one
appears.

## `osv-scanner`

**Cannot see.** The same disclosure-window blindness as `npm audit`. It also
reads the lockfile rather than the installed tree, so a package that is present
on disk but absent from the lockfile — vendored, patched in a `postinstall`,
installed by a script — is invisible to it.

**Can see.** A broader advisory corpus than npm's own, including OSV's
`MAL-*` malicious-package advisories, which npm audit does not carry.

**Counter-invariants.** `CI-3`, as above.

**Feeds a blocking gate — carefully.** The `osv` job runs
`scripts/refresh-denylist.mjs`, which extracts `MAL-*` packages and writes a
**proposal** to `build/advisory-denylist.proposed.txt`. It does not edit
`deploy/advisory-denylist.txt`, which is an input to EPIC-01's blocking gate. A
non-blocking scan job that could rewrite what blocks merge is exactly backwards,
so a human copies the additions across. Note the direction of that gate: it
blocks *knowingly installing* something flagged today, never merging because
something *became* flagged. Decay is data; adoption is a choice.

## `sca-behavioral` — the interesting layer

**The tool is `scripts/sca-static.mjs`, and it is NOT Socket.**

Socket — the tool EPIC-03 names — requires an API token, which requires an
account, which requires a human. **That remains owed.** What runs instead is a
static text-matching approximation written for this repository. Naming it
precisely matters more here than anywhere else in the battery, because its
`network-at-import` figure is 25% of the Mist Index weight.

| | |
|---|---|
| Tool | `scripts/sca-static.mjs` (first-party) |
| Version | tracked with the repository; no external version |
| Method | reads `package.json` manifests and entry-point source as **text** |
| Parses ASTs | no |
| Executes anything | no |
| Resolves re-exports | no |

**Cannot see.** Everything a text search cannot see, which is most behaviour.
Any conduct that is data- or time-dependent — a package that fetches a URL only
when an environment variable is set, or only after a date — is invisible. So is
anything a compiled native addon does. So is intent: an install script that
builds a binary and one that exfiltrates the environment are the same shape to
this and to Socket alike. It resolves one entry point per package, so a network
call in a lazily-required submodule is missed.

**Can see, with the bias of each measure stated.**

| Measure | Quality | Bias |
|---|---|---|
| `packagesWithInstallScripts` | **exact** | the hook is declared in a manifest or it is not |
| `packagesWithNetworkAtInstall` | **upper bound** | the install command and any local `.js` it names are searched for network primitives |
| `packagesWithNetworkAtImport` | **upper bound, and a loose one** | see below |
| `packagesObfuscated` | **heuristic** | long lines, low newline ratio — most hits are ordinary minified builds |
| `distinctMaintainers` | **exact**, opt-in | one npm registry request per package name; omitted in CI, where the field reports as not measured rather than 0 |

**Why `network-at-import` is a ceiling, not an estimate.** A package counts if
its entry point *references* a network module at module scope. **Requiring is not
calling.** Two known false positives in Mist's own tree, named so the bias is
checkable rather than abstract:

- `methods` and `router` both `require('http')` at module scope — to read
  `http.METHODS`, a constant. They open no connections and never will.

A third, `lru-cache`, was caught and removed: a bare `fetch(` pattern matched its
*method* named `fetch`. One false positive of that kind in a 700-package tree is
enough to distrust the whole number, so the pattern was dropped.

The figure is therefore a **ceiling on the true value, never an estimate of it**,
and `docs/MIST_INDEX.md` must not be read as though it were otherwise.

**Counter-invariants.** The richest mapping in the battery — `CI-1` for every
hidden input channel, `CI-4` for import-time global side effects.
`obfuscated-code` and `unmaintained` are deliberately **unmapped**: both are
genuine supply-chain hazards, and neither is an inversion of a controllability
invariant. Forcing them into `CI-1` would inflate a number EPIC-06 publishes.

**What would replace this.** A Socket token. When one exists, the job should call
Socket, this script should become a cross-check rather than the source, and the
two numbers should be published side by side — a static ceiling next to a
behavioural measurement is more informative than either alone.

## `semgrep`

**Cannot see.** Anything that requires running the program. It is pattern
matching over syntax: it cannot follow a value through a `JSON.parse`, cannot
reason about what a dynamically-imported module does, and cannot tell a real
injection from a false one without executing the path. Its recall on
business-logic flaws is close to zero, because a business-logic flaw is not a
syntactic shape.

**Can see.** A modest, realistic crop of app-layer findings — *"not Juice
Shop's curated hundred, a median project's honest dozen"*
(`docs/mist-concept-evaluation.md:55`).

**Scoped to first-party paths on purpose.** `apps/**` and `scripts/**`, with
`node_modules` excluded. Running SAST over `node_modules` produces noise that
swamps the honest dozen and makes the first/second-party split unreadable — and
that split is Mist's core differentiation from Juice Shop, whose flaws are
first-party and curated while Mist's are second-party and emergent
(`docs/mist-concept-evaluation.md:68`). Second-party exposure is measured by the
SCA and audit layers, which are the right instruments for it.

**Counter-invariants.** None, deliberately. First-party SAST findings describe
code defects, not surrendered controllability. Mapping them to `CI-*` would blur
exactly the line the envelope exists to keep sharp. Declared unmapped as `sast`.

**No suppression.** No `.semgrepignore`, default rulesets only, and findings are
not fixed just to make the dashboard look better (EPIC-00 Scope rule 4).

## `gitleaks`

**Cannot see.** A secret that never entered git — an environment variable set in
the hosting console, a credential in a CI secret store, a key pasted into a chat
window. It also cannot see a secret whose shape it has no rule for, which is most
of them: every entropy heuristic trades false positives against recall, and this
config keeps gitleaks' defaults plus eight Mist-specific shapes. It cannot tell a
live key from a revoked one.

**Can see.** Secret-shaped strings anywhere in the full history.

**`fetch-depth: 0`, not negotiable.** K1 lives in history and is never scrubbed
(`docs/KEY_ROTATION.md`). A shallow clone would miss it and this scanner would
report a false green. `scripts/check-scan.mjs` fails if the depth changes or if
`--log-opts=` is dropped.

**The ruleset is generated, not committed.** `scripts/gen-gitleaks-config.mjs`
builds `build/gitleaks.mist.toml` from `schemas/secret-patterns.json` — the one
secret ruleset in this repository, also used by `scripts/redact.mjs` and
`scripts/check-ledger.mjs`. Two divergent copies of those regexes would mean one
gate redacting what another missed.

Generating rather than committing settles a genuine disagreement between two
documents. EPIC-03's own Verification block asserts `test ! -f .gitleaks.toml`,
treating the file as a suppression artifact — a fair instinct, since the usual
reason a repository has one is to allowlist findings away. EPIC-08 requires the
ruleset to have exactly one source. Generating into an uncommitted path
satisfies both: nothing can be quietly allowlisted in a PR, and there is still
one source of truth. The generated config is **additive**
(`[extend] useDefault = true`) and contains no `[allowlist]` section;
`check-scan` asserts both.

**RE2, not JavaScript.** gitleaks uses Go's RE2, which has no lookahead,
lookbehind or backreferences. The generator raises a hard error on a pattern
using one rather than emitting a rule that silently never fires.

**One artifact contains secret material by construction.** `raw-gitleaks` holds
the tool's own JSON, and a secret scanner's output contains the secrets it found.
That is acceptable here only because every key it can find is deliberately
committed and already revoked (K1). The normalized `scan-run.json` carries
`File:StartLine` and the rule id and **never** the matched text;
`scripts/test-scan.mjs` asserts that with a marker string planted in the fixture.

**Counter-invariants.** None. Declared unmapped as `secret-in-history`.

## `sbom`

**Cannot see.** What any of it does. An SBOM is an inventory, and an inventory is
not a risk assessment. It also cannot see anything resolved at runtime rather
than install time, and it inherits the lockfile's view of the tree, so anything
installed by a script is missing from it.

**Can see.** The surface, enumerated: every package and version, in CycloneDX
JSON, retained per build so EPIC-07 can rescan a frozen tree.

**The surface delta is the point.** On a pull request, `scripts/sbom-diff.mjs`
compares head against base and reports packages added and removed, split into
direct-attributable and transitive, alongside the behavioural deltas
(install-script packages, distinct maintainers). It posts as a PR comment because
that is the moment it has the most force: the reviewer sees the cost of the
convenience in the same view as the convenience
(`docs/mist-concept-evaluation.md:57`).

Packages are identified by **purl** — name *and* version — so a version bump
reads as one add and one remove. That looks like churn until you remember what is
being counted: a different version is a different artifact, published by possibly
a different account, containing possibly different install scripts. The report
also gives the name-level view, labelled, so neither can be quoted as the whole
story.

An unmeasured delta renders as `not measured`, never as `+0`.

**Counter-invariants.** None directly. It supplies `surface.transitivePackages`,
which is the evidence for `CI-3`.

## `licenses`

**Cannot see.** Whether an obligation was actually met, or whether the declared
licence is the real one. It reads each package's own `package.json`, which is a
self-report. A package declaring MIT while vendoring GPL code reads as
permissive here.

**Can see.** Every package on disk, classified into four obligation classes:
`permissive`, `weak-copyleft`, `strong-copyleft`, `unknown`.

**Obligation classes, not bare SPDX ids.** *"Obligations nobody read,
accumulating in the same tree"* (`docs/mist-concept-evaluation.md:58`). A list of
identifiers is not a cost; a count of copyleft and undeclared-licence packages
is. `unknown` is deliberately not called "other" — an undeclared licence is not a
mild licence, it is an unanswered question, and it should read that way on the
dashboard. A compound expression takes the **strictest** class among its terms:
an `OR` gives you a choice, but the obligation on the tree is the heaviest one
until somebody makes that choice and writes it down. Nobody has.

**It reads `node_modules`, not the lockfile,** because the lockfile records
versions and not licences, and deriving the licence from the registry would mean
trusting metadata over the artifact that will actually ship. With no
`node_modules` present it exits non-zero rather than emitting an empty
inventory, since an empty inventory reads as "no obligations".

**Counter-invariants.** None. Declared unmapped as `license-obligation`.

---

## Scanner tooling is outside the install ledger, on purpose

`osv-scanner`, `gitleaks` and `semgrep` are installed in CI. None of them gets an
`install-ledger.jsonl` record, and that is deliberate rather than an oversight.

EPIC-08's ledger records **the dependency decisions of the application** — the
"just add a package for that" reflex it exists to evidence
(`docs/CONSTRUCTION.md`). A pinned scanner binary downloaded by a CI job is not
part of Mist's dependency surface, is not in `package.json`, and does not ship.
Counting it would inflate the number the ledger exists to make citable.

The ledger gate agrees mechanically: `ledger-completeness` reads
`package.json`'s direct dependencies, so CI tooling is outside its scope by
construction, not by exemption.

## The battery has already caught something

Within one day of the tree existing, `npm audit` went from 0 findings to 3 with
**a byte-identical lockfile**. Nothing was installed, removed or upgraded; the
advisory database changed. Two of the three advisories are against a MySQL driver
this SQLite application will never call, present because `prisma` bundles it.

Written up in full at
[`docs/observations/001-the-tree-decayed-in-one-day.md`](observations/001-the-tree-decayed-in-one-day.md).
It is EPIC-07's thesis arriving unplanned, and it suggests EPIC-07's monthly
cadence is too slow.

## Known gaps in this document

Written down rather than left implicit:

1. **The blind-spot sections are reasoned, not measured.** They describe what
   each class of tool structurally cannot do. Nobody has run a controlled test
   planting a known-bad package and confirming which scanners miss it. Until
   somebody does, these are arguments, not results.
2. **`sca-behavioral` has no tool.** Its section describes a class, not a
   product. Phase 2a closes this and must record the tool, its version, and its
   real limits — replacing the general claims above.
3. **The fixtures are hand-written.** `fixtures/scanners/` is shaped from each
   tool's documented JSON output, not captured from a real run. When the first
   true battery runs they should be replaced with captured output and any shape
   mismatch recorded as a corrigendum in
   `docs/EPIC-03_The_Scan_Battery.md`.
4. **No scanner here sees the CI configuration itself.** A workflow that leaks a
   token, or an action pinned to a mutable tag, is unmeasured by all seven. That
   is a real hole in the battery and it belongs to no EPIC yet.
