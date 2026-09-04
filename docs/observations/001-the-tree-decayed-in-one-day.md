# Observation 001 — the tree decayed in one day, with nothing changed

*Recorded 2026-09-04. Owned by EPIC-03; the thesis belongs to EPIC-07
(Longitudinal Decay), which is not built yet. Written now because the
observation is perishable and the evidence is currently checkable.*

---

## What happened

On 2026-09-03, hours after EPIC-02 landed the dependency tree, the first real
scan battery run reported:

```
npm-audit        ran        0 finding(s)
```

Later the same day, the second run reported:

```
npm-audit        ran        3 finding(s)
  high     deepmerge-ts@<8.0.0   DeepmergeTS has stack exhaustion when merging recursive object graphs
  high     mysql2@<=3.23.0       MySQL2: Auth Plugin Downgrade to mysql_clear_password Leaks Plaintext Credentials
  medium   mysql2@<=3.23.0       MySQL2: Unbounded zlib inflate in compressed MySQL protocol handler allows decompression-bomb DoS
```

## Nothing in the repository changed

Verified, not assumed:

| Check | Result |
|---|---|
| `package-lock.json` content hash | `5cdb7f84…` |
| Same file as committed at `8a4b444` | `5cdb7f84…` — **byte-identical** |
| `mysql2` present in that commit | yes, `3.15.3` |
| `deepmerge-ts` present in that commit | yes, `7.1.5` |
| Packages installed, removed or upgraded between runs | none |

**The lockfile is the same. The tree is the same. The advisory database is
different.**

## Why this is the whole argument in one afternoon

`docs/ANTI_KERNEL.md` states counter-invariant `CI-5` as: *"No input log exists;
`package-lock.json` is a statistic sufficient only for reproducing the
exposure."*

This is that sentence, demonstrated. The lockfile reproduced the tree perfectly
and told nobody anything about its safety, because safety was never a property
of the tree — it is a property of what the world currently knows about the tree,
and the world updated overnight without asking.

A kernel's input log is a sufficient statistic for its state. A lockfile is a
sufficient statistic for your *exposure* and says nothing about your *risk*. The
difference took less than 24 hours to become visible.

## The sharper detail

**Mist does not use MySQL.** It uses SQLite — `prisma/schema.prisma` declares
`provider = "sqlite"`, and the driver is `@prisma/adapter-better-sqlite3`.

`mysql2` is in the tree because `prisma` depends on it unconditionally:

```
mist@0.1.0
└─┬ prisma@7.10.0
  ├─┬ @prisma/config@7.10.0
  │ └── deepmerge-ts@7.1.5
  └── mysql2@3.15.3
```

So two of the three advisories are against a **MySQL client this application
will never call**, shipped because a database tool bundles every driver it
supports. The credential-leaking one — *"Auth Plugin Downgrade to
mysql_clear_password Leaks Plaintext Credentials"* — describes an attack on a
protocol Mist does not speak.

That is `CI-3` and `CI-5` at once: the boundary is `node_modules`, every package
in it is an unaudited party, and the ones that turn out to matter are not the
ones anybody chose. Nobody decided to depend on a MySQL driver. Nobody could
have decided otherwise while still using Prisma.

## What this is not

- **Not a criticism of Prisma, MySQL2 or DeepmergeTS.** Bundling drivers is a
  normal design choice, and advisories being published is the system working.
  The finding is about what a lockfile can and cannot promise, not about anyone's
  code.
- **Not staged.** Nothing was installed, pinned or held back to produce it. The
  first run was green because the advisories did not exist yet.
- **Not a claim about severity.** Neither MySQL2 advisory is reachable from this
  application. That is precisely why it is interesting: unreachable exposure
  still shows up as a red scan, still costs review time, and still has to be
  triaged by somebody.

## What EPIC-07 should do with it

EPIC-07 freezes a tree and rescans it monthly to chart entropy. This observation
is a single unplanned data point from that experiment, taken before the
experiment was built, and it suggests the interesting interval is **shorter than
monthly**. A tree that gains three advisories in one day while sitting still is
not going to be well characterised by twelve samples a year.

The re-run cadence should be justified against this, and this run should be
`t=0`.
