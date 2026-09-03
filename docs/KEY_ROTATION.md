# The Burnt Credential

*The lifecycle of the weather API key Mist commits on purpose. Owned by EPIC-01;
steps 1–4 execute inside EPIC-02 Phase 2. Normative source:
`docs/mist-concept-evaluation.md:56`.*

---

## Why Mist commits a key at all

> *"Mist should have at least one plausibly-committed API key in its history,
> since the weather API needs one and that is how it goes."*
> (`docs/mist-concept-evaluation.md:56`)

`gitleaks` is in the scan battery (EPIC-03). A secret scanner running against a
repository with no secrets is a green light that proves the light works — not
that the project is exposed. **The finding must be real to be evidence.**

The credential must therefore be:

- **Real-shaped**, so `gitleaks` fires truthfully rather than on a decoy.
- **Genuinely revoked**, so nobody is harmed.
- **Committed the median way**, not staged. See the medianness argument in
  `docs/MEDIANNESS.md:103` — this exact case is the rubric's worked borderline
  example, and this document is its resolution.

---

## The sequence

```
1. Provision key K1 against the weather API on the isolated account.
2. Commit K1 in a plausible way — inline in a config file, in the ordinary
   course of making the feature work. Do not stage this as a stunt commit.
3. Ship the feature. Let it live in history.
4. Revoke K1 at the provider. Record the revocation timestamp here.
5. Provision K2, supplied only via deployment environment variables.
6. Never rewrite history to remove K1. The finding is the artifact.
```

## Why step 6 does not undo step 4

Scrubbing the key from history would be the correct real-world response and the
**wrong** response here. `gitleaks` needs a true positive to report
(`docs/mist-concept-evaluation.md:56`), and the honest lifecycle — key committed,
key found by a scanner, key revoked, key still in history forever — *is* the
demonstration.

**Step 4 is what makes step 6 safe.** Revocation, not deletion, is the control.
A revoked key in public history harms nobody and teaches exactly the right
lesson: that the second half of a leak — the part where the secret is
permanently public — is not fixable by `git`, only survivable by rotation.

## Why K1 must not be a stunt commit

Step 2 says *"in the ordinary course of making the feature work"*, and that
constraint is doing real work. A commit that exists only to plant a key fails
medianness criteria 1 and 2 (`docs/MEDIANNESS.md:25`): the stated intent would be
the finding, and the exposure would be the selection criterion. That is the same
failure as choosing a package *because* it has a postinstall script
(`docs/MEDIANNESS.md:85`).

K1 must arrive the way keys actually arrive: someone needed the app to run,
pasted the key where it worked, and moved on.

---

## Rotation record

**Nothing has been provisioned.** There is no weather API account, no isolated
cloud account (`deploy/isolation.md`), and no `package.json`. Steps 1–4 are owed
by **EPIC-02 Phase 2** (weather provider integration).

| Step | Owner | State |
|---|---|---|
| 1. Provision K1 | EPIC-02 Phase 2 | **Owed** |
| 2. Commit K1 plausibly | EPIC-02 Phase 2 | **Owed** |
| 3. Ship the feature | EPIC-02 Phase 2 | **Owed** |
| 4. Revoke K1 | EPIC-02 closing Work Item | **Owed** |
| 5. Provision K2 (env var only) | EPIC-02 Phase 2 | **Owed** |
| 6. Never rewrite history | standing, forever | **In force** |

| Key | Provisioned | Committed at | Revoked at | Revocation timestamp |
|---|---|---|---|---|
| K1 | *unset* | *unset* | *unset* | *unset* |
| K2 | *unset* | never — env var only | — | — |

**The `key-rotation-recorded` test fails until the K1 revocation timestamp is
filled in, and that failure is the reminder.** It is not a broken test. It is a
countdown that starts when EPIC-02 Phase 2 lands and stops when someone revokes
the key they promised to revoke.

## The trigger

Revocation of K1 is a **required checkbox on EPIC-02's closing Work Item**
(EPIC-01 Work Item 4c). It is not scheduled by a calendar, because a calendar
reminder for a key already public is theatre. The gate is: EPIC-02 cannot close
with K1 live.

## If K1 leaks before step 4

It has not, because it does not exist yet. When it does: revoke immediately,
record the timestamp here, and **do not** rewrite history. Report per
`SECURITY.md` — say *"a live credential is exposed at `<file>:<line>`"* and do
not paste the value. The value being public is the expected end state; it being
*live* is the defect.
