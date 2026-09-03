# Contributing to Mist

Mist is not a product. It is an **experiment**, and its deliverable is
**evidence** (`docs/ROADMAP.md:15-16`). That changes what a good contribution
looks like: a change that makes Mist better software usually makes Mist worse
evidence.

Read `docs/ANTI_KERNEL.md` for what is being demonstrated and
`docs/MEDIANNESS.md` for the test every change must survive. This file is the
short version: four standing rules, and who enforces each.

---

## The four standing rules

### 1. Medianness

Every choice must survive the question: *"would an agent, or a hurried
developer, plausibly have done this?"* (`docs/mist-concept-evaluation.md:82`).
A choice that fails is removed, **no matter how well it illustrates the
thesis**.

The full four-criterion rubric is `docs/MEDIANNESS.md`.

**Containment work is exempt.** A median team would not write
`deploy/isolation.md`, `docs/SLOPSQUAT.md`, or `scripts/check-containment.sh`.
Those files exist *around* the experiment, not inside it, so applying medianness
to them would argue Mist out of its own safety boundary. The exemption is stated
here once so it is never re-argued in a PR. It covers EPIC-01's artifacts only —
**it does not extend to `package.json`**, and it is not a route to a mitigation
(rule 4 still binds).

*Enforced by:* `.github/pull_request_template.md` at review time — by human
judgement, deliberately not by CI. Owned by EPIC-00.

### 2. Exposure, not exploitation

Mist demonstrates **surrendered control**. It never ships a working attack.

- No live malicious packages.
- No hallucinated package names registered outside a namespace the project owns.
- Deployment isolated from anything that matters.
- A prominent README statement of what this project is.

(`docs/mist-concept-evaluation.md:82`)

*Enforced by:* **EPIC-01 (SAFE)**, in detail. EPIC-01 blocks every other EPIC.
If your change touches the exposure/exploitation line, it is EPIC-01's call, not
yours. Mechanically: `scripts/check-containment.sh`, run as the **one blocking
CI job** in this repository (`.github/workflows/containment.yml`). The rules it
cannot check — isolated account, billing cap, no assumable role, no network path
— are attested by a human in `deploy/isolation.md`. Read `SECURITY.md` before
reporting anything; most of what a scanner finds here is the exhibit, not a bug.

### 3. Workability is load-bearing

Mist must build, deploy, and **actually show the weather**
(`docs/mist-concept-evaluation.md:49`). A broken demo demonstrates nothing. The
argument requires that this is what *functioning* software looks like in the
ecosystem's default mode. The rot is in the inputs, not the outputs.

A PR that leaves `main` unable to build is not a partially-good contribution. It
destroys the exhibit.

*Enforced by:* **EPIC-02 (WX)**, which owns the application and its build.

### 4. No mitigation by accident

Adopting a supply-chain hygiene measure **silently destroys the measurement**.
That includes:

- `--ignore-scripts` (install scripts stay **enabled** — `docs/ROADMAP.md:45`)
- pinned exact versions (semver ranges stay **wide open** — `docs/ROADMAP.md:46`)
- registry cooldown policies (`npm` is the deliberate choice —
  `docs/ROADMAP.md:44`)
- provenance and install-time firewall tooling

Mist is the control group for all of it, so the absence of these measures is
measurable (`docs/mist-concept-evaluation.md:72`). Any such measure requires an
**explicit, documented exception** — written down, with the reason, in the PR.

*Enforced by:* **EPIC-00** (this rule) and **EPIC-03 (SCAN)**, which is where a
silent mitigation would show up as a scan result that suddenly went quiet.

---

## Practical notes

**Scan results are data, not blockers.** Scan jobs in CI are non-blocking on
purpose. A red scan is the project working (`docs/ROADMAP.md:48`). Do not "fix"
a finding without an EPIC that says to.

**The containment gate is the one exception.** `containment` blocks merge
(`.github/workflows/containment.yml`). Scans measure decay; containment is the
wall around the experiment, and a breach of the wall is a defect rather than a
measurement. If it blocks you, fix the breach — do not add an exclusion.

**No real person appears in this repository.** Fixtures use `example.invalid`
addresses and coordinates drawn only from `deploy/synthetic-locations.txt`.
`scripts/seed-synthetic.ts` generates conforming rows; the gate rejects the rest.

**Progress is tracked in `## Status` tables.** Each EPIC's Status table is the
canonical live signal. Work Item checkboxes stay `- [ ]`; do not check them.
Flip a Status row to `**Complete**` only when landed code proves it, pinned to a
named commit and date (`docs/ROADMAP.md:35-38`).

**Cite or do not assert.** Every factual claim in a Mist document carries a
`path/file:line`. Honesty about what was done outranks making the demo look
worse — an overstated exhibit is a strawman with extra steps.

**Every dependency you add owes three things:** a one-step medianness
justification (rule 1), a `VIOLATIONS.md` row or an explicit `class: none`
(EPIC-05), and a construction-log entry with the prompt that produced it
(EPIC-08). The PR template asks for all three.
