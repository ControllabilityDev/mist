# The Medianness Test

*The single discipline that keeps Mist from collapsing into a strawman. Every
dependency, every file, and every commit in this repository must survive it.
Normative source: `docs/mist-concept-evaluation.md:82`. Enforced at PR time by
`.github/pull_request_template.md`.*

---

## Why this document is load-bearing

Mist's whole value is that it is **typical**. The concept evaluation states the
failure mode plainly:

> *"the moment Mist takes a step no ordinary team would take, it becomes a
> strawman and the demonstration collapses; every dependency must survive the
> question 'would an agent, or a hurried developer, plausibly have done this?'"*
> (`docs/mist-concept-evaluation.md:82`)

A strawman is not a weaker version of this project. It is a different project,
one that proves nothing. The Medianness Test is the gate.

---

## The rubric

A proposed dependency, pattern, or commit passes only if a reviewer can answer
**yes to all four**.

### 1. Plausible origin

Can you name the user intent that leads here **in one step**?

- *"I need to format a date in the user's timezone"* → a date library. **Yes.**
- *"I need to demonstrate a postinstall script"* → **No.** That is authoring the
  finding, not observing it.

The test is the length of the chain from a feature request to the install. One
link passes. Two links means you went looking.

### 2. Non-adversarial

The choice was made **for convenience, never for its vulnerability**. You may
know a package has a postinstall script. You may not choose it *because* it has
one. The exposure must arrive as a side effect of ordinary laziness, which is
the only way it arrives in real projects.

### 3. Individually defensible

A competent reviewer looking at this one line of `package.json` **in isolation**
would not object. Not "would grudgingly allow" — would not object. If you have
to explain the thesis to justify a line, the line fails.

### 4. Indefensible only in aggregate

The surface must be damning **as a sum, never as a term**.

This is the load-bearing criterion, and it is stated as a **requirement**, not
an observation. It is what separates Mist from Juice Shop: Juice Shop's flaws
are first-party and curated; Mist's are second-party and emergent
(`docs/mist-concept-evaluation.md:68`). **If any single dependency is
individually damning, the project has drifted into the wrong genre and the
dependency comes out** — however well it illustrates the thesis.

---

## Worked examples

### Example 1 — clear pass: `axios` instead of `fetch`

**The proposal.** The dashboard needs to call a third-party weather API. Add
`axios` rather than using the platform `fetch`.

| Criterion | Verdict |
|---|---|
| 1. Plausible origin | **Pass.** *"I need to call an HTTP API"* → `axios`. One step. It is the median answer, and an agent's lowest-perplexity answer. |
| 2. Non-adversarial | **Pass.** Chosen for interceptors and terser error handling. Its transitive surface is not the reason. |
| 3. Individually defensible | **Pass.** No reviewer in this ecosystem objects to `axios` on sight. |
| 4. Indefensible only in aggregate | **Pass.** It contributes to the surface without being the indictment. |

**Verdict: accept.** This is exactly the shape Mist is made of — a locally
reasonable choice that is unimpeachable at the individual step
(`docs/mist-concept-evaluation.md:37`).

### Example 2 — clear fail: a package chosen because it has a postinstall script

**The proposal.** Pick a package specifically so that `npm install` executes an
install script, giving the behavioral SCA scanner (EPIC-03) something to flag.

| Criterion | Verdict |
|---|---|
| 1. Plausible origin | **Fail.** The stated intent *is* the finding. No user need leads here. |
| 2. Non-adversarial | **Fail.** The vulnerability is the selection criterion. |
| 3. Individually defensible | **Fail.** A reviewer told why it was chosen would object immediately. |
| 4. Indefensible only in aggregate | **Fail.** It is damning as a single term. |

**Verdict: reject.** Zero of four. And note what is *not* the problem: install
scripts themselves are in scope and stay enabled — the ROADMAP fixes that
deliberately (`docs/ROADMAP.md:45`). The exposure is welcome. **Manufacturing
it is not.** Mist waits for install scripts to arrive on their own, because in
this ecosystem they will (`docs/mist-concept-evaluation.md:41`).

### Example 3 — genuinely borderline: committing a live weather-API key

**The proposal.** The concept evaluation says Mist *"should have at least one
plausibly-committed API key in its history, since the weather API needs one and
that is how it goes"* (`docs/mist-concept-evaluation.md:56`). Do it: commit a
real key, let `gitleaks` find it.

**Arguing for.**

- Criterion 1 passes cleanly. *"I need the app to run locally"* → key in a
  committed `.env`. One step. This is how it goes, everywhere, constantly.
- Criterion 3 passes: a reviewer sees one line and thinks *"sloppy"*, not
  *"planted"*. Sloppy is the target register.
- The secret scanner is otherwise measuring nothing. A `gitleaks` job on a repo
  with no secrets is a green light that proves the light works, not that the
  project is exposed. The finding must be real to be evidence.

**Arguing against.**

- Criterion 2 is where it wobbles. If the key is committed *so that the scanner
  fires*, the vulnerability is the selection criterion — Example 2's exact
  failure, wearing a plausible costume.
- It also runs at EPIC-01's charter rule: **exposure, not exploitation**. A live
  key is a real credential belonging to a real vendor. Leaking someone's
  key is not a demonstration of a hidden input channel; it is just a leak.
- Criterion 4: a live third-party credential in git history is arguably damning
  as a single term.

**Verdict: conditional, and EPIC-01 decides.** The medianness argument for the
*shape* is strong; the objection is to the *payload*. The likely resolution is a
key that is genuinely committed the median way (an `.env` that should have been
git-ignored, committed early, found later) but scoped to something Mist owns and
can revoke — real enough to fire `gitleaks`, harmless enough to publish. That
design is EPIC-01's to make, not this document's.

**This example is kept unresolved on purpose.** A rubric with only clean cases
teaches nothing. Most real medianness calls look like this one.

---

## How to use this at PR time

`.github/pull_request_template.md` asks you to state, for each dependency added,
the one-step user intent that leads to it. That is criterion 1 in the smallest
box it fits in. Criteria 2–4 are the reviewer's job.

**Medianness is a judgement, not a predicate.** It is deliberately *not*
automated: a rule that can be checked can be gamed, and a gamed medianness rule
produces a strawman with a green tick. The mechanical halves of the PR gate — a
`VIOLATIONS.md` row exists (EPIC-05), a ledger entry exists (EPIC-08) — do get
CI checks. This one does not, and should not.
