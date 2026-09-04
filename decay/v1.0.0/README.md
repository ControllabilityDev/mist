# Frozen release v1.0.0

The subject of EPIC-07's longitudinal decay experiment. **This tree never
changes.** Not for a critical CVE, not for a compromised package. If it becomes
dangerous the response is to stop *deploying* it — it is not deployed anywhere —
never to patch it. Patching destroys the only variable the experiment has.

| File | What it is |
|---|---|
| `lockfile.json` | Exact copy of `package-lock.json` at the freeze. **Byte-identical, forever.** |
| `manifest.json` | 826 packages: name@version, resolved URL, integrity hash, measured size, vault path |
| `scanners.pinned.json` | Scanner versions at the freeze, for the `pinned` rescan mode |
| `vault/` | Content-addressed tarballs. **Not in git — see below.** |

## The freeze is defined by the lockfile hash, not by a commit

`manifest.json` records `lockfileSha256`. That, not a git tag, is the experiment's
identity: the invariant is the *resolution set*, and which commit happens to carry
a `v1.0.0` tag is a naming question. `decay-never-updates` compares against the
hash.

## The vault is not in git

**635.5 MiB, measured** — not estimated, and roughly double what EPIC-07's Design
guessed. Storage decision (Phase 1d): **a GitHub release asset bundle**, not Git
LFS.

Git LFS would consume about two thirds of GitHub's free 1 GiB quota on day one
and be re-fetched by every LFS-enabled clone and CI run. A release asset is
downloaded once a month by the decay job and costs everyone else nothing.

Build it locally:

```bash
node scripts/vault.mjs build decay/v1.0.0     # ~635 MiB, verifies every hash
node scripts/vault.mjs check decay/v1.0.0     # completeness + integrity
node scripts/vault.mjs restore decay/v1.0.0 --into /tmp/frozen   # offline
```

`restore` points npm at a dead registry and runs `npm ci --offline`. A run that
quietly reached the network would fail rather than succeed — which matters,
because a rescan that silently re-resolved a package would invalidate every later
point in the series.

## What is in here that Mist otherwise refuses to do

This directory is content-addressed, hash-verified and reproducible offline. It is
the one place in the repository that behaves like a controlled system, and it has
to be, because otherwise the *measurement* would be at the mercy of the same
ecosystem being measured.

That the experiment's integrity requires exactly the discipline the specimen lacks
is not a design problem. It is the thesis arriving uninvited.
