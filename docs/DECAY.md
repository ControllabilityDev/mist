# Longitudinal decay — the protocol

*Owned by EPIC-07. The cleanest experiment in the project, because it has exactly
one variable.*

---

## The experiment

Freeze one release. Rescan it every month, unchanged, forever. Chart the result.

The code does not change. The lockfile does not change. The tree does not change.
**Only what the world knows about it changes.** Every new finding is therefore
attributable to disclosure alone — which is the sharpest available demonstration
that the exposure was always there and observability was the thing being
purchased.

> *"Freeze a Mist release and re-scan it monthly without updating: chart how a
> static dependency tree accumulates known vulnerabilities purely through
> disclosure. Telemetry of entropy — the invoice arriving on its own."*
> (`docs/mist-concept-evaluation.md:90`)

## Rule 1 — the tree is never updated

**Not for a critical CVE. Not for a compromised package. Not ever.**

Patching the frozen tree destroys the only variable the experiment has. If the
frozen tree becomes dangerous the response is to stop *deploying* it — and it is
not deployed anywhere, by design. It is scanned, never served.

`decay-never-updates` compares `decay/v1.0.0/lockfile.json` against the SHA-256
recorded in `manifest.json`. **One changed byte fails, permanently.** The Gold
Standard test edits a single version string and asserts the refusal.

### The freeze is a hash, not a commit

`manifest.json` records `lockfileSha256`. That is the experiment's identity. The
invariant is the *resolution set*; which commit happens to carry a `v1.0.0` tag
is a naming question, and tying the experiment to a tag would make it fragile to
an ordinary git operation.

## Rule 2 — registry independence

A lockfile records **resolutions**, not **content**. Over a multi-year window
packages get unpublished, republished and yanked, and registries go away.
Unpublished packages are the *expected* case, not the failure case.

So the freeze archives the actual bytes. `decay/v1.0.0/vault/` holds every
resolved tarball, content-addressed, each verified against its lockfile integrity
hash **before** it is stored — a vault entry that does not match the lockfile is
worse than a missing one, because it looks like evidence.

`scripts/vault.mjs restore` rewrites every `resolved` to a `file:` URL and runs
`npm ci --offline` with npm pointed at a dead registry. A run that quietly
reached the network would fail rather than succeed. That matters: a rescan that
silently re-resolved one package would invalidate every later point in the series
without anyone noticing.

### The irony, stated rather than hidden

The vault is content-addressed, hash-verified, hermetic and reproducible offline.
**It is the one place in this repository that behaves like a controlled system.**

It has to be, because otherwise the *measurement* would be at the mercy of the
same ecosystem being measured.

That the experiment's integrity requires exactly the discipline the specimen
lacks is not a design problem. It is the thesis arriving uninvited, and it should
be quoted that way rather than explained away.

### Storage: a release asset, not Git LFS

**635.5 MiB, measured** — via registry range requests, not estimated. Roughly
double what EPIC-07's Design guessed, and dominated by platform-specific
binaries: **89 of the 826 packages are per-platform builds**, six of them
Next.js SWC binaries at ~190 MiB combined, five for platforms this application
will never run on.

Git LFS would consume about two thirds of GitHub's free 1 GiB quota on day one
and be re-fetched by every LFS-enabled clone and CI run. A release asset is
fetched once a month by the decay job and costs everyone else nothing. The vault
is gitignored.

## Rule 3 — the scanner-version confound is isolated

A rising decay curve has two possible causes: **the world learned more**, or
**the scanner got better at finding things**. Conflating them makes the chart
uncitable.

So every month runs the battery **twice**:

| Mode | Scanner versions | Measures |
|---|---|---|
| `pinned` | frozen at the freeze (`scanners.pinned.json`) | disclosure only |
| `current` | latest | disclosure + detection capability |

`pinned` is the primary series and the honest answer to *"what did the world
learn about this unchanged tree?"*. `current` is secondary. **Their divergence is
itself a measure**: how much of what we now know we could have known, had the
tools been better.

`decay-dual-scan-recorded` fails on any month with only one mode and no gap
record.

### Pinned scanners will eventually stop running

An old scanner binary will one day refuse to execute on a current CI image. When
that happens it is recorded as a **per-scanner gap** and the affected series is
annotated on the chart. It is never interpolated, and it does not void the month
— the other scanners still ran.

Known already: the CycloneDX SBOM tool was **not** pinned at freeze time.
`scanners.pinned.json` records that as a gap rather than pretending otherwise.

## Rule 4 — gaps are data

A month that could not run is written as an explicit record:

```json
{ "startedAt": "...", "scannerMode": "pinned", "status": "gap",
  "reason": "the vault release asset was unavailable" }
```

**A gap with no stated reason fails CI.** So does any record carrying
`interpolated: true`.

The chart breaks the line at a gap and prints `▨ N month(s) with no data — not
interpolated` under the axis. A gapless chart that is not gapless would be a lie
of exactly the kind this project exists to document, and it would be the easiest
possible lie to tell.

## Rule 5 — if the frozen tree contains something malicious

1. **Publish it prominently** as a finding on the dashboard (EPIC-04).
2. **Confirm the tree is not deployed** anywhere. It should not be; verify.
3. **Do not remove it from the vault.** Removing it would rewrite the
   experiment's history and destroy the data point.
4. **Record the discovery date** in this document. A vault entry that is known to
   be malicious must be known-malicious to anyone who reconstitutes it, and
   `decay/v1.0.0/README.md` carries the warning.

None discovered to date.

## The stopping condition

**The experiment runs indefinitely.** It has no planned end.

It ends only if the vault becomes unreconstitutable — a corrupted archive, a lost
release asset, a Node version that can no longer install a lockfile of this
vintage. **That end is recorded as a final data point**, with the reason, not as
a quiet stop. A series that simply stops updating is indistinguishable from a
series nobody is running, and the difference matters to a reader years later.

## Running it

```bash
node scripts/vault.mjs build   decay/v1.0.0            # ~635 MiB, verifies every hash
node scripts/vault.mjs check   decay/v1.0.0            # completeness + integrity
node scripts/vault.mjs restore decay/v1.0.0 --into /tmp/frozen   # offline
node scripts/check-decay.mjs                           # the freeze holds
node scripts/test-decay.mjs                            # 17 tests
```

`.github/workflows/decay.yml` runs on the 1st of each month at 03:17 UTC, plus
manual dispatch. Non-blocking, like every scan job — it publishes a measurement,
it does not judge one.

## Status

**The freeze exists. No rescan has run.** `decay/v1.0.0/` holds the frozen
lockfile, a complete 826-package manifest with measured sizes and integrity
hashes, and the pinned scanner versions. The vault has been built and
reconstituted **on a four-package sample** to prove the machinery end to end; the
full 635.5 MiB build and its release upload are a one-time operation that has not
been run.

**Two points are not a curve.** EPIC-07's Status rows stay unflipped until the
third successful monthly rescan, and this document will say so until then.
