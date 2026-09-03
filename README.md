# Mist

**A working weather dashboard built as the *negative control* of the
Controllability framework: maximal dependency surface, no purity partition,
every input channel a domain kernel excludes embraced by design — with a full
battery of supply-chain and security scanning wired into CI, so the project
continuously measures its own decay.**

The deliverable is **evidence, not a product**.

<!-- EPIC-01: safety banner -->

---

## What Mist is

The kernel repositories demonstrate the Controllability thesis by construction:
control the inputs totally, and observability is free. **Mist demonstrates it by
violation.** It surrenders control of its inputs and then buys the observability
back — continuously, after the fact, at market rates — from the
security-scanning industry that exists because this surrender is the ecosystem's
default posture.

A thesis that can only show its positive case is a sales pitch. The negative
control is what makes it an argument.

Mist is also built the way an agentic coding session builds software, because
**that construction method is itself the exhibit**: every dependency a locally
reasonable choice, the sum indefensible.

Start with [`docs/ANTI_KERNEL.md`](docs/ANTI_KERNEL.md) — the thesis and the six
counter-invariants.

## What Mist is not

- **Not a vulnerable app for training.** It plants no flaws and has no
  scoreboard. Juice Shop and WebGoat teach exploitation; Mist measures exposure.
- **Not an attack.** It demonstrates *exposure, not exploitation*: no live
  malicious packages, no hallucinated package names registered on public
  registries, deployment isolated from anything that matters.
- **Not a strawman.** Every dependency must survive the question *"would an
  agent, or a hurried developer, plausibly have done this?"* A choice no ordinary
  team would make gets removed, however well it illustrates the thesis. See
  [`docs/MEDIANNESS.md`](docs/MEDIANNESS.md).
- **Not anti-scanning.** The scans are genuinely necessary. Their necessity is
  the evidence.
- **Not a template.** Do not copy this repository's configuration. Every
  toolchain decision in it was made to *maximise* measurable exposure
  ([`docs/ROADMAP.md`](docs/ROADMAP.md)).

## The name

*Mist* as anti-clarity — the inversion of an observable system. *Mist* in German
— an accurate one-word review of the median `node_modules` directory. And mist
as the thing that condenses out of the atmosphere without anyone deciding to
make it, which is exactly how a dependency tree of 1,500 packages comes into
being.

---

## Where to look

| Document | What it holds |
|---|---|
| [`docs/ANTI_KERNEL.md`](docs/ANTI_KERNEL.md) | The thesis and the counter-invariant table (`CI-1`…`CI-6`) |
| [`docs/MEDIANNESS.md`](docs/MEDIANNESS.md) | The four-criterion test every change must survive |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | The four standing rules |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | EPIC map, build order, and the fixed toolchain decisions |
| [`docs/mist-concept-evaluation.md`](docs/mist-concept-evaluation.md) | The original concept evaluation that argues Mist is worth building |
| `VIOLATIONS.md` | Each dependency mapped to the invariant it breaks — **not yet written** (EPIC-05) |
| The public telemetry dashboard | The permanent scan artifact — **not yet built** (EPIC-04) |

## Current state

**Documentation only.** There is no application, no `package.json`, no
`node_modules`, and no CI workflow yet. The dependency surface is zero, and the
charter is what gates its creation: EPIC-02 builds the app, and it is blocked
until EPIC-00 and EPIC-01 land.

The EPIC `## Status` tables in `docs/` are the canonical progress signal.
