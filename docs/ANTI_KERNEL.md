# The Anti-Kernel

*The thesis Mist exists to demonstrate, stated in the repository so Mist is
legible without the book. Derived from `docs/mist-concept-evaluation.md`;
governed by `docs/EPIC-00_Charter_And_Anti_Kernel_Thesis.md`. Every
counter-invariant below carries a stable id (`CI-1`…`CI-6`) that later work
joins against: `VIOLATIONS.md` (EPIC-05) and the Mist Index (EPIC-06) reference
these ids, not this prose.*

---

## The claim

> Control the inputs totally and observability is free.
> Surrender control of the inputs and observability must be purchased —
> continuously, after the fact, at market rates.

The kernel repositories (`cardpack.rs`, `pkcore`, `gfcore`) demonstrate the
Controllability thesis **by construction**. Mist demonstrates it **by
violation**: it surrenders control of its inputs and then buys the observability
back from a security-scanning industry that exists precisely because this
surrender is the ecosystem's default posture
(`docs/mist-concept-evaluation.md:13`).

A thesis that can only show its positive case is a sales pitch. The negative
control is what makes it an argument.

---

## The counter-invariant table

| # | Domain kernel invariant | Mist counter-invariant | Where Mist exhibits it |
|---|---|---|---|
| CI-1 | No hidden input channels — state driven entirely by supplied inputs | Hidden input channels everywhere: postinstall scripts, env-var behavior switches, network access at import time, dependencies that update under semver ranges | `VIOLATIONS.md#hidden-input-channels` |
| CI-2 | Telemetry is the return value — events in the transition function's type | Telemetry is a bill: scan reports, SBOM diffs, and audit findings produced by external tooling after the fact | EPIC-03 (the scan battery), EPIC-04 (the public dashboard) |
| CI-3 | Narrow, stable, language-neutral boundary | The boundary is `node_modules`: ~1,500 transitive packages, each an unaudited party to the trust relationship | EPIC-06 (the surface metric) |
| CI-4 | Pure by default; convenience behind opt-in features | Impure by default; every convenience on, every feature flag someone else's decision | `VIOLATIONS.md` |
| CI-5 | Input log is a sufficient statistic for state | No input log exists; `package-lock.json` is a statistic sufficient only for reproducing the *exposure* | EPIC-07 (longitudinal decay) |
| CI-6 | Every dependency reached through a seam | Unfakeable: third-party APIs called from component bodies, the database client imported globally, no ports | `VIOLATIONS.md#unfakeable-seams` |

Rows `CI-1` through `CI-5` are transcribed from the concept evaluation's
inversion table (`docs/mist-concept-evaluation.md:17-23`). `CI-6` is derived
from the fakeability paragraph at `docs/mist-concept-evaluation.md:29`.

**The `Where Mist exhibits it` column points forward.** `VIOLATIONS.md` does not
exist yet — EPIC-05 creates it, and EPIC-05 is what makes those anchors resolve.
Until then these cells name the owner of the evidence, not evidence already
filed.

**Why the ids exist.** A prose table with no ids cannot be joined against a
dependency list. `CI-1`…`CI-6` are the join key. Renaming one is a breaking
change to EPIC-05 and EPIC-06, and `scripts/check-docs.sh` fails when the set
drifts.

### CI-5 is the sharpest row

The lockfile is Mist's parody of event sourcing. It replays perfectly — but what
it replays is the dependency tree, not the domain. It is a complete,
deterministic record of every decision *not* made
(`docs/mist-concept-evaluation.md:25`).

---

## Scanning is compensatory observability

The scans in Mist's CI — `npm audit`, osv-scanner, behavioral SCA, SAST, secret
detection, SBOM, license scan — are sensors bolted onto a plant whose inputs
nobody controls. They are genuinely necessary. **Their necessity is the
evidence.** The kernel needs no vulnerability scanner for the same reason it
needs no fakes: there is nothing hidden to detect
(`docs/mist-concept-evaluation.md:27`).

This document is not anti-scanning. It is anti-*needing*-scanning.

## Open hypothesis: scan spend as a proxy metric

> **Scan spend is a proxy metric for surrendered controllability.**
> (`docs/mist-concept-evaluation.md:27`)

This is stated here as an **open hypothesis**, not a result. It is unproven, and
Mist is the instrument built to test it. EPIC-06 owns the attempt to make it
quantitative; candidate axes named by the concept doc
(`docs/mist-concept-evaluation.md:87`) are transitive package count,
install-script count, packages with network access at import, SBOM churn rate,
and mean time between red dashboard states.

If EPIC-06 cannot make the formula hold, that result gets written down here.
The honest negative is worth more to the argument than a fitted curve.

---

## The construction method is the vulnerability

Mist is built the way an agentic coding session builds software, because that
construction method is itself the exhibit
(`docs/mist-concept-evaluation.md:33`). Three parts:

1. **"Add a package for that" as the default move.** The lowest-perplexity path
   from user intent to running code routes through `npm install`. Each install is
   a trust decision made in milliseconds by a process with no memory of the last
   supply-chain incident (`docs/mist-concept-evaluation.md:37`). EPIC-08 keeps
   the ledger that proves this happened, rather than asserting it.
2. **Slopsquatting.** Package names that models hallucinate, registered by
   whoever reads the hallucination first
   (`docs/mist-concept-evaluation.md:39`). Mist may demonstrate the *shape* of
   this only inside a namespace the project owns, with inert placeholders —
   never on a public registry. EPIC-01 owns that line.
3. **The install-time blast radius.** The package registry is a hidden input
   channel to your build, and install scripts are remote code execution you
   scheduled yourself (`docs/mist-concept-evaluation.md:41`). Mist carries the
   full exposure — no `--ignore-scripts`, no cooldown policy, semver ranges wide
   open — precisely so the scans have something true to say
   (`docs/ROADMAP.md:40-48`).

---

## Why this is not another vulnerable-app clone

The deliberately-vulnerable genre is mature. Mist's differentiation is real but
must be stated carefully (`docs/mist-concept-evaluation.md:64-74`, prior art
checked 2026-08).

- **OWASP Juice Shop** is the closest neighbor: a deliberately insecure
  Node/Express/Angular app covering the OWASP Top Ten, used for trainings and
  CTFs. Its vulnerabilities are **first-party and curated** — app-layer flaws
  written on purpose and scored on a scoreboard. Mist's defects are
  **second-party and emergent**: the supply chain and the construction method
  are the vulnerability, and the "attacker" is the ecosystem's ambient threat
  activity arriving on its own schedule. *Juice Shop teaches exploitation; Mist
  measures exposure* (`docs/mist-concept-evaluation.md:68`).
- **DVWA, WebGoat, the OWASP VWA Directory** share Juice Shop's frame: planted
  app-layer flaws for training. None, as far as checked, treats *dependency
  surface itself* as the exhibit or runs a permanent scan dashboard as its
  primary artifact (`docs/mist-concept-evaluation.md:69`).
- **The npm incident record** is not prior art but a live collaborator. Mist is
  designed to be downstream of whatever comes next
  (`docs/mist-concept-evaluation.md:70`).
- **Supply-chain hygiene tooling is the counter-genre** — cooldown policies,
  `--ignore-scripts` defaults, install-time firewalls, provenance work. Mist is
  the control group for all of it: the project that adopts none of the
  mitigations, so their absence is measurable
  (`docs/mist-concept-evaluation.md:72`).

**The gap Mist fills:** the genre has apps that are worse than average on
purpose. It lacks one that is *exactly average* on purpose, with the meter
running (`docs/mist-concept-evaluation.md:74`).

---

## What this document does not do

It does not build the application (EPIC-02), wire a scanner (EPIC-03), publish a
dashboard (EPIC-04), or file a single violation (EPIC-05). It states the thesis
and fixes the ids. The evidence is owned elsewhere.
