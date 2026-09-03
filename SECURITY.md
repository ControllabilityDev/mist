# Security Policy

**Read this before reporting anything.** Mist is deliberately insecure by
construction (`README.md:1-12`). Most of what a scanner finds here is not a bug.
It is the exhibit.

---

## The short version

| You found | Is it a Mist bug? | Where it goes |
|---|---|---|
| A CVE in one of Mist's ~1,500 transitive dependencies | **No.** That is the demonstration. | Report it **upstream**, to that package. Not here. |
| A package in Mist's tree that is actively malicious | **Yes — urgent.** | Open an issue. See below. |
| An app-layer flaw in Mist's own first-party code | **Yes, mildly.** | Open an issue. It is expected; a median project has an honest dozen. |
| An exploit chain that reaches beyond the deployment | **Yes — urgent.** Containment failed. | Open an issue. See below. |
| A hallucinated package name Mist references outside `@mist-demo` | **Yes — urgent.** Policy breach. | Open an issue. See `docs/SLOPSQUAT.md`. |
| The committed weather API key in git history | **No.** Known, deliberate, revoked. | See `docs/KEY_ROTATION.md`. |

---

## What Mist is, in security terms

Mist runs with **no supply-chain mitigations**: install scripts enabled, semver
ranges wide open, no registry cooldown, no provenance gate, no `--ignore-scripts`
(`docs/ROADMAP.md:40-48`). This is not an oversight and it will not be fixed. It
is the control condition of an experiment measuring what that posture costs
(`docs/ANTI_KERNEL.md:1`).

The dependency vulnerabilities the scanners report are therefore **findings, not
defects**. They are published on purpose (EPIC-04). Sending them here does not
help anyone; sending them to the package that has the flaw does.

## What actually is a Mist bug

Three things, and they are the things this policy exists for:

1. **Containment breach.** Mist promises that total compromise of its deployment
   reaches no other system and costs one throwaway account
   (`deploy/isolation.md`). If you can show a path out of the deployment — into
   another account, another network, a real user's data, or a live credential
   that still works — that is a real defect and the highest-priority issue this
   project can receive.
2. **A knowingly-malicious dependency.** Mist may depend on a package that
   *later* turns out to be compromised; that is the experiment running. It may
   never knowingly carry a package currently flagged as malicious. If one is in
   the tree today, tell us — we remove it and publish the finding.
3. **A policy breach.** A hallucinated package name referenced outside the
   `@mist-demo` scope this project owns; a real person's data in a fixture; a
   supply-chain mitigation quietly added, which corrupts the measurement in the
   other direction. See `CONTRIBUTING.md` for the four standing rules.

## What the deployment holds

Nothing. Synthetic data only — no real user, no real email address, no real
location (`deploy/isolation.md`). There is no personal data to breach here, and
that is a design constraint, not a claim of maturity.

## No bug bounty

There is no bounty, no reward, and no severity SLA. Mist is an unfunded research
artifact attached to a book. Reports about points 1–3 above get attention;
everything else gets pointed at this file.

## How to report

Open a public GitHub issue. **Do not email a private disclosure** — with three
exceptions, nothing about this project is secret, and the exceptions have their
own homes:

- A **working exploit** against a third party's system: report it to that third
  party, not to Mist.
- A **live credential** you found that still works: say only *"a live credential
  is exposed at `<file>:<line>`"*. Do not paste the value. We revoke, then
  discuss in the open (`docs/KEY_ROTATION.md`).
- A **real person's data** in a Mist fixture or transcript: say where. Do not
  quote it. This is an EPIC-01 containment defect and an EPIC-08 redaction
  defect at the same time.

## What we will not do

**We will not harden Mist.** Every request to pin a version, enable
`--ignore-scripts`, adopt a cooldown policy, or reduce the dependency count will
be declined and pointed at standing rule 4 (`CONTRIBUTING.md`). Those are
correct real-world measures and adopting one here silently destroys the thing
being measured.

**We will not scrub the committed key from history.** The honest lifecycle — key
committed, key found by a scanner, key revoked, key still in history forever — is
the demonstration. Step 4 of `docs/KEY_ROTATION.md` is what makes that safe.
