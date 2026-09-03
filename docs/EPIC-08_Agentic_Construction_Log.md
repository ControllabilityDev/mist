# EPIC-08: Agentic Construction Log (LOG)

## Context

The concept doc argues that Mist's construction method *is* the vulnerability:
*"Mist should be built the way an agentic coding session builds software, because
that construction method is itself the vulnerability"*
(`docs/mist-concept-evaluation.md:33`). The mechanism it names first is *"'Add a
package for that' as the default move"* — installs as *"a trust decision made in
milliseconds by a process with no memory of the last supply-chain incident"*
(`docs/mist-concept-evaluation.md:35`).

The open threads then ask whether to keep the evidence: *"Should Mist literally
be built *by* agentic sessions, with the transcripts kept? The construction log
would be primary-source evidence for the 'add a package for that' mechanism — and
an uncomfortable, honest artifact for a book partly about AI-age engineering"*
(`docs/mist-concept-evaluation.md:89`).

**This EPIC answers yes**, and makes it operational — because the alternative is
an unfalsifiable claim. Without a log, "this is how agents build software" is an
assertion about a process nobody can inspect, which is precisely the epistemic
position Mist criticises.

At commit `1e69b61` nothing exists. **This EPIC has the tightest ordering
constraint in the project: Phase 0 must land before EPIC-02 Phase 1.** An install
ledger cannot be reconstructed after the fact; a reconstruction is a
rationalisation, and its evidentiary value is zero.

**This EPIC does not require that every line of Mist be written by an agent.**
It requires that however each dependency arrived, the record says so truthfully —
including the entries that say "a human did this deliberately".

---

## Status

| Component | Status |
|---|---|
| `install-ledger.jsonl` — one record per install decision | Planned |
| `docs/construction-log/` — per-session narratives | Planned |
| Redaction policy and pass | Planned |
| Ledger completeness check (CI) | Planned |
| Surface attribution — packages per decision | Planned |
| `docs/CONSTRUCTION.md` — method and its honesty rules | Planned |

---

## Goals

- Produce **primary-source evidence** for the "add a package for that" mechanism,
  rather than an assertion about it.
- Attribute **surface growth to individual decisions**, so the cost of each
  convenience is visible at the moment it was incurred.
- Keep the record **uncomfortable and honest** — including the installs that were
  wrong, reverted, or made without thought.
- Make the log **safe to publish**: transcripts leak, and a redaction policy must
  exist before the first one is committed.

## Scope

1. **Every install gets a ledger record.** Direct dependencies only — transitive
   packages are attributed to the direct install that pulled them in.
2. **Record what was true, not what sounds good.** If a package was installed
   because it was the first search result, the record says that. A sanitised log
   is worse than none: it fabricates deliberation that did not happen, which is
   the exact failure the log exists to document.
3. **Redaction before commit.** Transcripts may contain API keys, paths with
   personal names, or third-party content. Redaction is mechanical plus reviewed,
   and its policy is written before the first commit.
4. **Ledger is append-only.** Correcting a record adds a correction entry; it
   never edits history.
5. **The log does not editorialise.** Analysis of the log belongs in
   `VIOLATIONS.md` (EPIC-05) and the book. The log records.

---

## Domain map

| Domain concept | Code construct | Status |
|---|---|---|
| Session (one construction sitting) | `docs/construction-log/NNN-*.md` | ❌ absent |
| Install Decision | a line in `install-ledger.jsonl` | ❌ absent |
| Prompt (the intent that produced it) | `prompt` field | ❌ absent |
| Deliberation (how much thought it got) | `deliberation` enum | ❌ absent |
| Surface Delta (what it cost) | `packagesAdded` field | ❌ absent |
| Correction | append-only correction record | ❌ absent |

---

## Design

### `install-ledger.jsonl`

One JSON object per line, append-only. The schema is deliberately small; a heavy
form would not survive contact with a fast session, and a ledger that is annoying
to fill in gets filled in falsely.

```json
{
  "seq": 14,
  "ts": "2026-09-03T11:42:07Z",
  "session": "007",
  "actor": "agent | human",
  "package": "moment-timezone",
  "range": "^0.5.45",
  "prompt": "times are showing in UTC, they should show in the location's timezone",
  "alternativesConsidered": [],
  "deliberation": "reflex | brief | researched",
  "packagesAdded": 3,
  "transitiveTotalAfter": 1204,
  "note": "Intl.DateTimeFormat would have covered this. Not considered at the time."
}
```

**Rationale for `deliberation` as a three-value enum.** It is the field that
carries the argument. The concept doc's claim is about *speed* of trust decisions
(`docs/mist-concept-evaluation.md:35`), and a ledger that recorded only what was
installed could not evidence it. A distribution heavily weighted to `reflex` is
the finding; if it turns out weighted to `researched`, that is a finding too, and
it must be published rather than reframed.

**Rationale for `alternativesConsidered` defaulting to empty.** Empty is the
honest common case. A field that pressures the author to list alternatives would
manufacture deliberation retroactively.

**Rationale for `note` being written later.** The `note` above ("Intl would have
covered this") is hindsight, and hindsight is legitimate — as long as it is
clearly separated from what was true at decision time. `prompt`, `deliberation`,
and `alternativesConsidered` are contemporaneous and must not be revised;
`note` is retrospective and may be added by a correction record.

### Session narratives

`docs/construction-log/007-timezone-and-charts.md`:

```markdown
# Session 007 — timezone display and the hourly chart
Date: 2026-09-03 · Actor: agent (model, harness) · Ledger seq 12–19

## What was asked
<the user-level goal, verbatim>

## What happened
<narrative: what was tried, what broke, what got installed and why>

## Installs
| seq | package | deliberation | +pkgs |
|---|---|---|---|

## Transcript
<redacted transcript, or a link to the redacted artifact>
```

**Rationale for narrative alongside the ledger.** The ledger is queryable but
strips context; the narrative preserves the texture — the thirty seconds between
"times are wrong" and `npm i moment-timezone`. Both are needed: one for counting,
one for quoting.

### Redaction

`scripts/redact.mjs` (new) plus a documented human pass. Mechanical rules:

```
- secret-shaped strings (the gitleaks ruleset, reused)
- absolute paths containing a home directory or username
- email addresses not on example.invalid
- any string matching the current K1/K2 values
- environment dumps
```

**Then a human read.** Mechanical redaction is necessary and insufficient — the
long tail is unpatterned. `docs/CONSTRUCTION.md` states that no transcript is
committed without a human read, and that an unreadable-in-full transcript is
summarised rather than committed. Note the exception: **K1 is deliberately
committed in application code** by EPIC-02, but that is a controlled, revoked
credential in a known location. Transcripts are not a controlled location, so K1
is redacted there anyway; the honest-key demonstration lives in one place, on
purpose.

### The completeness check

`scripts/check-ledger.mjs` (new), **blocking**, joining to EPIC-05's gate:

```
1. every direct dependency in every package.json has a ledger record
2. seq numbers are contiguous and strictly increasing
3. no existing line changed (append-only; verified against the previous commit)
4. every session id referenced by a ledger record has a narrative file
5. every deliberation value is in the enum
6. no ledger line matches the secret-shaped ruleset
```

**Rationale for blocking.** Same reasoning as EPIC-05: this is not decay, it is
whether the project is doing its own evidentiary job. A missing ledger entry is
unrecoverable — the moment has passed — so the check must fire at the only time
it can still be fixed.

This gives Mist exactly **three blocking checks** — containment (EPIC-01),
violations (EPIC-05), ledger (EPIC-08) — and zero blocking scanners. That
asymmetry is itself a statement worth making explicitly in `docs/SCANNERS.md`:
Mist blocks on honesty, never on exposure.

---

## Work Items

### Phase 0 — Before the first install (HARD PREREQUISITE for EPIC-02)

- [ ] **0a.** Create `install-ledger.jsonl` (empty) and
      `schemas/ledger.schema.json`.
- [ ] **0b.** Create `docs/construction-log/` with `000-scaffold.md` describing
      the method.
- [ ] **0c.** Write `docs/CONSTRUCTION.md`: the method, the honesty rules, the
      contemporaneous-vs-hindsight distinction, and the redaction policy.
- [ ] **0d.** Write `scripts/redact.mjs` and prove it on a synthetic transcript
      containing a fake key, a home path, and a real-shaped email.
- [ ] **0e.** Write `scripts/check-ledger.mjs` with the six assertions and wire
      `.github/workflows/ledger.yml` as blocking.
- [ ] **0f.** **Gate:** confirm `package.json` does not yet exist. If it does,
      this EPIC is already late and the shortfall must be recorded honestly in
      `docs/CONSTRUCTION.md` rather than backfilled.

### Phase 1 — Capture during EPIC-02

- [ ] **1a.** Record a ledger line at every install throughout EPIC-02 Phases
      1–5, contemporaneously.
- [ ] **1b.** Capture `transitiveTotalAfter` from `npm ls --all --parseable | wc -l`
      immediately after each install, so attribution is exact rather than
      inferred from a commit diff.
- [ ] **1c.** Write a session narrative per sitting, with the redacted transcript.
- [ ] **1d.** Record `actor` truthfully. Human-authored installs are expected and
      are not a failure of the method.

### Phase 2 — Analysis surface

- [ ] **2a.** `scripts/ledger-report.mjs` (zero deps): deliberation distribution,
      packages-added per decision, cumulative surface attributed by session.
- [ ] **2b.** Publish the deliberation distribution to the dashboard (EPIC-04) as
      a small panel. This is the "add a package for that" mechanism, quantified.
- [ ] **2c.** Cross-link: each `violations.yaml` second-party entry (EPIC-05)
      references the ledger `seq` that introduced its subject.

### Phase 3 — Publication safety

- [ ] **3a.** Run the full redaction pass over every committed transcript; record
      each human reviewer and date in `docs/CONSTRUCTION.md`.
- [ ] **3b.** Run `gitleaks` (EPIC-03) over `docs/construction-log/` specifically
      and confirm zero findings. Unlike the K1 case, a transcript finding is a
      real defect.
- [ ] **3c.** State in `docs/CONSTRUCTION.md` what was withheld and why — e.g.
      a transcript summarised rather than committed. Withholding is acceptable;
      silent withholding is not.

### Phase 4 — Close

- [ ] **4a.** Publish the deliberation distribution in the corrigendum with real
      counts, **including the case where it undercuts the concept doc's
      prediction**.
- [ ] **4b.** Flip Status rows.

---

## Test Plan

- `ledger-schema-valid` — every line validates against
  `schemas/ledger.schema.json`.
- `ledger-completeness` — a fixture `package.json` with an unledgered dependency
  fails. **The load-bearing test.**
- `ledger-append-only` — modifying an existing line fails the check against the
  previous commit. Pins Scope rule 4.
- `ledger-seq-contiguous` — a gap or duplicate in `seq` fails.
- `ledger-session-narratives-exist` — a `session` id with no narrative file fails.
- `ledger-no-secrets` — a fixture line containing a secret-shaped string fails.
- `redact-removes-known-patterns` — the synthetic transcript from Phase 0d comes
  back with the key, home path, and email removed, and with a redaction marker
  left in place so the removal is visible rather than invisible.
- `ledger-report-deterministic` — the report over a fixture ledger produces
  identical output across runs. Pins citability: a number quoted in the book must
  be reproducible.

Gold Standard: installing a package without a ledger line must make
`ledger-completeness` fail — and this test is the reason EPIC-02 cannot start
before this EPIC's Phase 0.

## Key Files

| File | Role |
|---|---|
| `install-ledger.jsonl` | Append-only install decision record (new) |
| `schemas/ledger.schema.json` | Ledger entry schema (new) |
| `docs/construction-log/` | Per-session narratives + redacted transcripts (new) |
| `docs/CONSTRUCTION.md` | Method, honesty rules, redaction policy (new) |
| `scripts/redact.mjs` | Mechanical redaction (new) |
| `scripts/check-ledger.mjs` | Six-assertion blocking gate (new) |
| `scripts/ledger-report.mjs` | Deliberation distribution + attribution (new) |
| `.github/workflows/ledger.yml` | The third blocking job (new) |

## Reuse (do NOT recreate)

- EPIC-03's `gitleaks` ruleset — reuse it for the secret-shaped patterns in both
  `redact.mjs` and `check-ledger.mjs`. Two divergent secret regexes would be a
  real hazard.
- `docs/KEY_ROTATION.md` (EPIC-01) — K1/K2 values and the reason transcripts
  redact them even though application code does not.
- EPIC-04's zero-dependency site pattern — the ledger report panel plugs into it.
- `schemas/scan-run.schema.json` `surface.transitivePackages` (EPIC-03) — the
  same measure as `transitiveTotalAfter`; use one definition, cited in both
  schemas, so the dashboard and the ledger cannot disagree.

## Compatibility

- **Preserves** everything.
- **Adds** the ledger, the narratives, one blocking CI job, and one dashboard
  panel.
- **Breaks** nothing, though it blocks any PR installing an unledgered package —
  which is the intent, and is why it must land first.

## Dependencies

- **Blocks:** EPIC-02 (Phase 0 of this EPIC is a hard prerequisite for EPIC-02
  Phase 1 — see `docs/ROADMAP.md` build order).
- **Built on:** EPIC-00 (charter), EPIC-01 (the redaction policy inherits the
  containment and key-handling rules).
- **Related:** EPIC-05 (violation entries cite ledger `seq`), EPIC-04 (the
  deliberation panel), EPIC-06 (A4 churn and the ledger measure related things
  from different sources; `docs/MIST_INDEX.md` should note the relationship).

## Verification

```bash
# The gate
node scripts/check-ledger.mjs

# Append-only holds against the previous commit
git show HEAD~1:install-ledger.jsonl | head -c $(stat -f%z install-ledger.jsonl) \
  | diff -q - <(head -c $(git show HEAD~1:install-ledger.jsonl | wc -c) install-ledger.jsonl)

# Every direct dependency is ledgered
node -e "…assert set(deps) subset of set(ledger.package)…"

# No secrets in the log
gitleaks detect --source docs/construction-log --no-git

# The report reproduces
node scripts/ledger-report.mjs > /tmp/r1 && node scripts/ledger-report.mjs > /tmp/r2 \
  && diff -q /tmp/r1 /tmp/r2 && echo "OK: deterministic"
```

Exit criteria:

1. `install-ledger.jsonl` and `docs/construction-log/` existed **before** the
   first `npm install` in EPIC-02, or the shortfall is recorded honestly in
   `docs/CONSTRUCTION.md`.
2. Every direct dependency has a contemporaneous ledger record with a `prompt`
   and a `deliberation` value.
3. `ledger.yml` runs blocking; append-only is enforced against the previous
   commit.
4. Every committed transcript passed mechanical redaction **and** a named human
   read, with reviewer and date recorded.
5. `gitleaks` over `docs/construction-log/` reports zero findings.
6. The deliberation distribution is published on the dashboard and in this
   EPIC's corrigendum, reported truthfully even where it undercuts the concept
   doc's prediction (`docs/mist-concept-evaluation.md:35`).
7. Anything withheld from publication is named, with the reason, in
   `docs/CONSTRUCTION.md`.
