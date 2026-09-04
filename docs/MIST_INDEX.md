# The Mist Index

*A hypothesis, not a result. Owned by EPIC-06. Anchors version `v1`.*

---

## Read the limits before the number

This document is deliberately ordered caveats-first. Writing them last is how
metrics become overclaimed, and an overclaimed metric is precisely the kind of
compensatory observability Mist exists to criticise. A number without its blind
spots would be a self-own.

The index tries to make one sentence computable:

> *"scan spend is a proxy metric for surrendered controllability"*
> (`docs/mist-concept-evaluation.md:27`)

It is **unproven**. The concept doc marks it as an open question
(`docs/mist-concept-evaluation.md:87`) and this document does not resolve it.

---

## Limits — what the index cannot see

1. **Runtime egress.** Nothing here observes a running process. A package that
   opens a socket only on the fourteenth Tuesday of a leap year is invisible.
2. **Transitive maintainer trust.** The index counts packages, not the people who
   can publish them. Two trees of equal size with 40 and 400 distinct publishers
   score identically, and they are not equally exposed.
3. **The CI/CD supply chain.** Workflow files, pinned-to-a-mutable-tag actions,
   and the runner image itself are all outside the measurement. This is a real
   hole; `docs/SCANNERS.md` records that no scanner in this repository sees it
   either.
4. **Build-tool plugins and codegen.** Anything that rewrites source between the
   repository and the artifact.
5. **Non-npm dependencies.** v1 is **npm-only**. System packages, native
   libraries, container base images, and anything from another ecosystem are not
   counted. Saying so is a limit; implying generality would be a lie.
6. **Vendored code.** Copying a dependency into the tree removes it from every
   axis while removing none of the risk. **The index scores that as an
   improvement, and it is not one.** This is the most gameable property of the
   whole design.
7. **Whether any of it ever mattered.** The index measures exposure, not harm.
   Only `A5` touches observed consequence, and `A5` is the axis this repository
   cannot currently compute.

## Falsification — what would show the index measures nothing

Named up front, per EPIC-06 Scope rule 2, so the index stays a claim that can
lose:

1. **The composite tracks `A1` so closely that the other axes are decoration.**
   If the ranking under the full weighting is identical to the ranking under
   `A1` alone across a calibration set, the index is a package counter wearing a
   costume, and it should be replaced by a package count — which is cheaper and
   more honest. `scripts/test-mist-index.mjs` includes `mi-discriminates` as a
   minimum guard, but the real test is the calibration table.
2. **Two functionally identical applications score far apart for reasons
   unrelated to control.** EPIC-09 builds exactly this pair — the same weather
   domain, kernel-first. If `pure` and `main` score similarly, the index is not
   measuring architecture. If they score far apart *for reasons that turn out to
   be project size or language idiom*, it is measuring the wrong thing.
3. **A repository scoring high shows no elevated incident class over a long
   window**, and one scoring low shows the same rate. The index claims to be a
   proxy for surrendered *control*, and control that is never missed was not
   surrendered in any sense worth measuring.

None of these three has been tested. Nothing in this repository currently could
test them.

---

## Current status: the index cannot be computed here

**Two of five axes produce a score. The composite is reported as `partial` and
is not a Mist Index.**

| Axis | State on this repository | Why |
|---|---|---|
| `A1` surface | **measured** | the lockfile is committed |
| `A2` install-execution | **measured** | install hooks are declared in `package.json` files on disk |
| `A3` import-time reach | **not-measured** | needs a behavioural SCA; EPIC-03 Phase 2a is still open |
| `A4` churn | **insufficient-history** | needs 90 days of merged PRs; this repository is 12 days old |
| `A5` red-state | **unavailable** | needs `telemetry/index.json`; EPIC-04 is not built |

A missing axis is reported as missing. It is never imputed, defaulted to zero, or
quietly dropped from the denominator — all three would produce a number that
looks like a Mist Index and is not one. `A3` is the sharpest case: scoring it 0
would say "this tree performs no import-time network access", which nobody has
checked and which is probably false.

---

## The five axes

| Axis | Raw measure | Source |
|---|---|---|
| `A1` surface | distinct `name@version` in the resolved tree | `package-lock.json` |
| `A2` install-execution | packages declaring `preinstall`/`install`/`postinstall` | `node_modules/*/package.json` |
| `A3` import-time reach | packages performing network or filesystem access at import | behavioural SCA (absent) |
| `A4` churn | mean packages added+removed per merged PR, trailing 90 days | SBOM diffs + git history |
| `A5` red-state | mean days between red battery states, trailing 180 days | `telemetry/index.json` |

### Why `A1` counts distinct `name@version`, and why that mattered

Four defensible counts of this repository's tree, taken minutes apart, differ by
141 packages:

| Measure | Value |
|---|---:|
| `npm ls --all --parseable \| wc -l` | 737 |
| `node_modules` directory walk | 700 |
| CycloneDX components | 663 |
| distinct `name@version` in the lockfile | **794** |

EPIC-02's corrigendum flagged this and said the Index must pick one and say
which. **The index counts distinct `name@version` from `package-lock.json`,
excluding workspace links.**

Two reasons. Each distinct version is a distinct artifact from a distinct publish
event by a distinct set of maintainers, so a package present at two versions is
two things you trust, not one. And the lockfile is committed, which makes the
measure reproducible by anyone with the repository and without an install — a
metric you cannot recompute is not a metric.

This choice makes Mist's `A1` the **largest** of the four candidates. That is not
flattering to the project and it is the number that gets published.

## Anchors, not percentiles

Each axis maps its raw measure to 0–100 through fixed anchors, published in
`tools/mist-index/anchors.json` and versioned.

A percentile index would say "you are more entangled than 60% of npm projects" —
a statement about npm, not about the repository — and it would drift as the
ecosystem drifts, making year-over-year comparison meaningless. Fixed anchors say
"you execute install scripts from 6 packages", which stays true. The anchors are
a judgement, they are published, and disagreeing with them is a well-formed
argument rather than a dispute about a hidden corpus.

**The anchors are v1 and provisional.** Changing one requires bumping
`anchorsVersion` and re-publishing every historical score under the new anchors,
clearly labelled. Silently re-anchoring would be the metric equivalent of
rewriting history.

## Weighting, and why it is the most contestable thing here

```
MI = 0.30·A1 + 0.25·A2 + 0.25·A3 + 0.10·A4 + 0.10·A5
```

`A2` and `A3` sit near `A1` despite being much smaller numbers because they
measure *hidden input channels*, which is what the framework actually cares
about, whereas `A1` measures bulk. A vendored 2,000-file dependency with no
install script and no import-time reach is a different animal from twelve
packages that phone home, and a surface-only index scores them backwards.

**This weighting is a judgement and the sensitivity analysis is owed** (EPIC-06
Phase 4c). It has not been done, because it needs a calibration set and this
repository is the only scored point. Until then, treat the weights as an
assertion.

## Not a sixth axis: violation counts

`violations.json` (EPIC-05) counts violations by class, which looks like an
obvious sixth axis. It is deliberately excluded from v1: those entries are
**authored by Mist**, not measured, and an index that reads its own documentation
is circular. A project could improve its score by writing fewer entries.

---

## Calibration

**Not done.** One scored point (Mist itself) is not a calibration, and publishing
a table with one row would imply a spread that has not been demonstrated.

The kernel repositories named in the framework — cardpack.rs, pkcore, gfcore —
are Rust, and v1 is npm-only. **No cross-ecosystem number is fabricated here.**
The comparison stays qualitative until either a cargo adapter exists or the
comparison is dropped.

## Changelog

| Anchors version | Date | Change |
|---|---|---|
| `v1` | 2026-09-04 | First published anchors. Provisional. |
