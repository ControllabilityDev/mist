# Session 000 — scaffold

Date: 2026-09-02 · Actor: agent (Claude Opus 5, Claude Code) · Ledger seq: none

*The zeroth session. It records the method being set up, before there is anything
to record. There are no installs here — that is the point of it landing first.*

---

## What was asked

Land EPIC-08 Phase 0 — the install ledger, the narrative format, the redaction
policy, and the blocking completeness gate — **before** EPIC-02 creates
`package.json` and starts installing. The ordering constraint is the tightest in
the project (`docs/ROADMAP.md:122-124`).

## What happened

`install-ledger.jsonl` was created empty. `schemas/ledger.schema.json` fixed the
record shape, including a `correction` record type so that rule 4 (append-only)
has a mechanism rather than only a prohibition.

`schemas/secret-patterns.json` was created as the single secret-shaped ruleset
for the repository. EPIC-08's Reuse note says to reuse EPIC-03's `gitleaks`
ruleset because two divergent secret regexes would be a real hazard — but EPIC-03
does not exist yet, so this file became the source and EPIC-03 must generate its
config from it rather than fork it.

`scripts/redact.mjs` and `scripts/check-ledger.mjs` were written against that one
ruleset, and `.github/workflows/ledger.yml` wired the checker as the project's
second blocking job.

No package was installed. `package.json` was confirmed absent at every step.

## Installs

| seq | package | deliberation | +pkgs |
|---|---|---|---|
| — | *none* | — | — |

**Zero.** A session with no installs is a legitimate ledger state, and this one
is the reference case: the method existed before the first decision it had to
record.

## Transcript

**Not committed.** This session produced no transcript artifact — the work was
file creation, and the narrative above is the record.

The first committed transcript will be EPIC-02's Session 001, and it will carry
its mechanical-redaction result and its named human reviewer in the redaction log
at `docs/CONSTRUCTION.md`.
