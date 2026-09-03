## What this PR does

<!-- One paragraph. What changed, and which EPIC it serves. -->

**EPIC:** <!-- e.g. EPIC-02 -->

---

## The gate

Mist's deliverable is evidence, not a product. These three prompts are required
on every PR. See `CONTRIBUTING.md` for the four standing rules.

- [ ] **Medianness.** For each dependency added, state the one-step user intent
      that leads to it. (See `docs/MEDIANNESS.md`)
- [ ] **Violation entry.** Every new direct dependency has a row in
      `VIOLATIONS.md`, or an explicit `class: none` classification. (EPIC-05)
- [ ] **Ledger entry.** Every `npm install` in this PR is recorded in the
      construction log with the prompt that produced it. (EPIC-08)

### Medianness justifications

<!--
One line per dependency added. One step from intent to install, or it fails.

| Dependency | One-step user intent |
|---|---|
| axios | "I need to call an HTTP API" |

Write "none" if this PR adds no dependencies.
-->

none

---

## Standing rules check

- [ ] **Exposure, not exploitation.** This PR ships no working attack, no live
      malicious package, and registers no hallucinated name outside a namespace
      we own. (EPIC-01)
- [ ] **Workability.** `main` still builds, deploys, and shows the weather.
      (EPIC-02)
- [ ] **No mitigation by accident.** This PR adopts no supply-chain hygiene
      measure — no `--ignore-scripts`, no exact pins, no cooldown policy, no
      provenance gate — **or** it documents an explicit exception below with the
      reason.

**Exception (if any):**

none
