# Slopsquat Placeholder Policy

*Owned-namespace-only. The rule that lets Mist demonstrate the **shape** of
package hallucination without performing the attack. Owned by EPIC-01.*

---

## The thing being demonstrated

**Slopsquatting** is the registration of package names that language models
hallucinate. The attacker does not guess — they read the model's output and
register what it invents (`docs/mist-concept-evaluation.md:39`).

Two properties from the foundational study make it work:

- Roughly a fifth of packages recommended by code-generation models **did not
  exist**; over 205,000 unique fictional names were produced, and **43% of
  hallucinated names recurred consistently** across repeated runs. The
  hallucinations are farmable, not random.
- **38% are conflations of two real package names** — the kind a reviewer
  unfamiliar with the specific package has no signal to reject.

(`docs/mist-concept-evaluation.md:39`)

This is the prophecy problem weaponised: the model's plausible-but-false theory
of the registry, and an adversary who reads the theory before you do.

---

## The four rules

```
1. The scope @mist-demo is registered and owned by this project before any
   placeholder is referenced anywhere, including in a comment.
2. A placeholder is an inert package: no dependencies, no install scripts,
   a single module exporting a documented no-op, and a README that says what
   it is and links here.
3. Names are chosen to be *shaped like* real hallucinations — the 38%
   conflation-of-two-real-names pattern — but must never be an unregistered
   name on the public registry, because publishing one there is the attack
   itself.
4. Nothing outside @mist-demo is ever registered by this project. The USENIX
   authors declined to register hallucinated names; Mist follows their lead.
```

(Rules transcribed from `docs/EPIC-01_Safety_Scoping_And_Containment.md`; the
restraint precedent is `docs/mist-concept-evaluation.md:71`.)

---

## Why rule 1 says "including in a comment"

This is the clause people want to argue with, so here is the argument.

Writing a plausible hallucinated name into a public repository **is itself a
hint to an attacker about which name to farm**. The study found 43% of
hallucinated names recur consistently across runs
(`docs/mist-concept-evaluation.md:39`) — so a name Mist publishes is a name a
model will produce again, for someone else, tomorrow.

Naming it publicly before owning it is handing over the target. There is no
version of "just in a comment" or "just in the EPIC" that is safe: the
repository is public, and a comment is as indexable as a dependency line.

**Consequence for this document:** it names no candidate placeholder. Not one.
`docs/slopsquat.json` holds the registered names, and it stays empty until the
scope is owned (`docs/slopsquat.json`). That emptiness is the policy working,
not the policy unfinished.

## Why rule 3's second half matters more than its first

Rule 3 sounds like it is about realism. It is not — it is the load-bearing
prohibition. "Shaped like a hallucination" is a design note. **"Never an
unregistered name on the public registry"** is the line between a demonstration
and an attack, and they are separated by one `npm publish`.

If Mist registered a genuinely hallucinated name on the public registry, Mist
would *be* the slopsquatter. Intent would not change what the artifact does:
occupy a name a model tells other people to install. The `@mist-demo` scope is
what makes the demonstration inert — a scoped name cannot be reached by an agent
that hallucinated the unscoped one.

## Why this project follows the USENIX restraint

The researchers who found the phenomenon **deliberately declined to register
hallucinated names on public registries**
(`docs/mist-concept-evaluation.md:71`). They had the strongest possible research
justification and still did not do it.

Mist has a weaker justification — it is an illustration attached to a book — and
so has less room, not more. Where the researchers stopped, Mist stops earlier.

---

## Current state

| Item | State |
|---|---|
| `@mist-demo` scope registered | **No** — EPIC-01 Work Item 3a, requires an npm account |
| Placeholder packages published | **No** — Work Item 3c, blocked by 3a |
| `docs/slopsquat.json` | Exists, `placeholders: []` |
| Candidate names chosen | **Deliberately none.** Rule 1 forbids recording them before 3a. |

`scripts/check-containment.sh` enforces the enforceable half: no `@`-scoped
dependency may appear in `package.json` unless its scope is on the allowlist
(`deploy/scope-allowlist.txt`). A novel scope is a review stop, not a silent
pass.

The unenforceable half — that this project never registers a name outside
`@mist-demo` — is a promise kept by people. It is written here so that breaking
it is visible.
