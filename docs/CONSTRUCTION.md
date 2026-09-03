# How Mist Is Built

*The method, the honesty rules, and the redaction policy. Owned by EPIC-08.
This file exists **before the first install**, because an install ledger cannot
be reconstructed after the fact — a reconstruction is a rationalisation, and its
evidentiary value is zero.*

---

## Why there is a log at all

The concept doc's central claim about the agentic age is that **the construction
method is itself the vulnerability**
(`docs/mist-concept-evaluation.md:33`), and the first mechanism it names is
*"'Add a package for that' as the default move"* — installs as *"a trust decision
made in milliseconds by a process with no memory of the last supply-chain
incident"* (`docs/mist-concept-evaluation.md:37`).

Without a log, that is **an assertion about a process nobody can inspect** —
which is precisely the epistemic position Mist criticises. So Mist keeps the
receipts (`docs/mist-concept-evaluation.md:89`).

**This does not require that every line of Mist be written by an agent.** It
requires that however each dependency arrived, the record says so truthfully —
including the entries that say *"a human did this deliberately"*.

---

## The two artifacts

| Artifact | What it is | Good for |
|---|---|---|
| `install-ledger.jsonl` | One append-only JSON line per install decision. Schema: `schemas/ledger.schema.json`. | Counting. Queryable, joinable, quotable as a number. |
| `docs/construction-log/NNN-*.md` | One narrative per session, with the redacted transcript. | Quoting. Preserves the texture the ledger strips. |

Both are needed. The ledger can tell you that 61% of installs were `reflex`; only
the narrative can show you the thirty seconds between *"times are wrong"* and
`npm i moment-timezone`.

---

## The five honesty rules

### 1. Every install gets a ledger record

Direct dependencies only. Transitive packages are attributed to the direct
install that pulled them in — that is what `packagesAdded` is for. A tree of
1,500 packages has perhaps 40 decisions in it, and the decisions are the subject.

### 2. Record what was true, not what sounds good

If a package was installed because it was the first search result, the record
says that.

**A sanitised log is worse than none.** It fabricates deliberation that did not
happen, which is the exact failure the log exists to document. There is no
penalty for `"deliberation": "reflex"` and `"alternativesConsidered": []` — that
is the expected shape of the data and, if the concept doc is right, the finding.

### 3. Redaction before commit

No transcript is committed until it has passed mechanical redaction **and** a
named human read. See *Redaction policy* below.

### 4. The ledger is append-only

Correcting a record **adds a correction entry**; it never edits history. The
correction record type is in `schemas/ledger.schema.json`, and it requires a
`reason` — a correction with no reason is an edit wearing a costume.

`scripts/check-ledger.mjs` enforces this against the previous commit. You cannot
quietly improve your own record.

### 5. The log does not editorialise

The log **records**. Analysis belongs in `VIOLATIONS.md` (EPIC-05) and in the
book. A ledger `note` may carry hindsight; a ledger `prompt` may not.

---

## Contemporaneous vs. hindsight

This distinction is the one that keeps the log worth citing, so the schema
enforces it field by field.

| Field | When written | May it be revised? |
|---|---|---|
| `prompt` | at install time | **No.** |
| `deliberation` | at install time | **No.** |
| `alternativesConsidered` | at install time | **No.** |
| `ts`, `package`, `range`, `packagesAdded`, `transitiveTotalAfter` | at install time | **No.** |
| `note` | any time after | Yes — via a correction record. |

Writing `"alternativesConsidered": ["date-fns", "Temporal"]` a week later, because
by then you *have* thought about the alternatives, converts a reflex into a
deliberation and destroys the only interesting variable in the file. If the
thought arrives late, it goes in `note`, where its lateness is visible.

**`transitiveTotalAfter` must be captured immediately**, from
`npm ls --all --parseable | wc -l`, not inferred later from a commit diff. A diff
tells you what changed between commits; only the live count tells you what *this
one decision* cost.

---

## Redaction policy

Transcripts leak. This policy exists before the first one is committed, per
EPIC-01's containment rules (`CONTRIBUTING.md`, standing rule 2).

### Mechanical pass

`scripts/redact.mjs` removes, from `schemas/secret-patterns.json`:

- secret-shaped strings — API keys, bearer tokens, JWTs, PEM blocks, cloud and
  registry tokens
- absolute paths containing a home directory or username
- email addresses not at `example.invalid`
- environment dumps

Every removal leaves a visible marker, e.g. `[REDACTED:generic-api-key-assignment]`.
**Redaction must be visible.** An invisibly-cleaned transcript is indistinguishable
from a curated one, and a curated transcript is not evidence.

### Then a human read

Mechanical redaction is **necessary and insufficient** — the long tail is
unpatterned. A person reads every transcript in full before it is committed, and
records their name and the date in the *Redaction log* below.

If a transcript cannot be read in full, it is **summarised rather than committed**.

### The K1 exception, and why it is only one exception

EPIC-02 deliberately commits the weather API key K1 into application code
(`docs/KEY_ROTATION.md`). That is a controlled, revoked credential in a known
location, and `gitleaks` finding it there is the point.

**Transcripts are not a controlled location.** K1 is redacted there anyway. The
honest-key demonstration lives in exactly one place, on purpose — and a `gitleaks`
finding inside `docs/construction-log/` is therefore a **real defect**, not an
exhibit.

### Redaction log

*No transcript has been committed yet.* Every future entry names a human.

| Session | Transcript | Mechanical pass | Human reviewer | Date |
|---|---|---|---|---|
| — | — | — | — | — |

### Withheld from publication

*Nothing withheld yet.* **Withholding is acceptable; silent withholding is not.**
Anything summarised rather than committed is named here with the reason.

| Session | What was withheld | Why |
|---|---|---|
| — | — | — |

---

## The gate

`scripts/check-ledger.mjs` runs **blocking** in
`.github/workflows/ledger.yml`. Six assertions:

1. every direct dependency in `package.json` has a ledger record
2. `seq` numbers are contiguous and strictly increasing
3. no existing line changed — append-only, verified against the previous commit
4. every `session` referenced by a ledger record has a narrative file
5. every `deliberation` value is in the enum
6. no ledger line matches the secret-shaped ruleset

**Why this blocks.** A missing ledger entry is *unrecoverable* — the moment has
passed. The check must fire at the only time it can still be fixed.

Mist now has **two blocking checks** — containment (EPIC-01) and the ledger
(EPIC-08) — with violations (EPIC-05) to come, and **zero blocking scanners**.
That asymmetry is the statement: **Mist blocks on honesty, never on exposure.**

---

## Shortfall record

*Required by Work Item 0f, and by exit criterion 1.*

**No shortfall.** Phase 0 landed on 2026-09-02 with `package.json` confirmed
absent, so the ledger existed before the first install. If that ever ceases to be
true — if a dependency is found with no contemporaneous record — the gap is
recorded **here**, honestly, rather than backfilled with a plausible-sounding
entry. A backfilled record is indistinguishable from a fabricated one, and one
fabricated record makes the whole file uncitable.
