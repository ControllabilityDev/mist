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

**K1 is provisioned, committed, and LIVE. It must be revoked.**

| Step | Owner | State |
|---|---|---|
| 1. Provision K1 | EPIC-02 Phase 2 | **Done** — 2026-09-03, OpenWeatherMap free tier |
| 2. Commit K1 plausibly | EPIC-02 Phase 2 | **Done** — `apps/web/next.config.js`, `env` block |
| 3. Ship the feature | EPIC-02 Phase 2 | **Done locally** — dashboard renders live weather; deploy still blocked |
| 4. Revoke K1 | EPIC-02 closing Work Item | ⚠️ **OWED — this is the open one** |
| 5. Provision K2 (env var only) | EPIC-02 Phase 2 | **Owed** — after step 4, and **step 5 is not currently safe**, see below |
| 6. Never rewrite history | standing, forever | **In force** |

| Key | Provisioned | Committed at | Revoked at | Revocation timestamp |
|---|---|---|---|---|
| K1 | 2026-09-03 | `apps/web/next.config.js` env block | *not yet* | *unset* |
| K2 | *unset* | never — env var only | — | — |

### How K1 arrived, so the medianness claim can be checked

Step 2 requires the commit to be ordinary rather than staged, and this one was
caused by a real bug rather than arranged.

The key was first put in the repository-root `.env`, which is gitignored. The
dashboard still returned `401`, because **Next.js reads `.env` from its own
project root (`apps/web`), not the workspace root**, so `process.env.WEATHER_API_KEY`
was `undefined`. The documented Next.js answer to that is the `env` block in
`next.config.js` — a committed file. The key went there, the feature started
working, and the session moved on.

That is exactly how keys reach public history: not by carelessness about
secrets, but by carefulness about making the thing work. Nobody in that sequence
was thinking about `gitleaks`.

**Verified true positive.** Scanning the tracked tree with
`schemas/secret-patterns.json` — the same ruleset `scripts/gen-gitleaks-config.mjs`
compiles into the CI gitleaks config — the `openweather-style-key` rule matches
`apps/web/next.config.js` twice. The scanner has something real to find.

(Other matches in that scan are deliberate test data in
`fixtures/synthetic-transcript.md` and `scripts/test-ledger.mjs`. They are
fixtures for the redaction tests, not credentials.)

### Step 5 is not safe as written, and this was found by a scanner

An automated security review of the K1 commit raised a second point that this
runbook did not anticipate, and it invalidates step 5 as currently worded.

`apps/web/components/LocationSearch.tsx:27` calls the provider's geocoding
endpoint **from the browser**, using `NEXT_PUBLIC_WEATHER_API_KEY`. In Next.js,
a `NEXT_PUBLIC_*` value is **inlined into the client bundle at build time**. It
is not read from the environment at runtime; it is compiled into JavaScript and
served to every visitor.

So step 5's protection — *"K2, supplied only via deployment environment
variables"* — **does not exist for this application**. Supplying K2 as an
environment variable and building the site publishes K2 to every browser that
loads the page. It would be a live, unrevoked key handed out on request. That is
strictly worse than K1's situation, because K1 is at least scheduled for
revocation.

**Step 5 therefore now requires one of:**

1. K2 is server-side only, and the browser reaches the provider through an API
   route on `apps/api` that holds the key; or
2. K2 is a *separate, rate-limited, deliberately-public* key, provisioned in
   full knowledge that it is public, and recorded here as such.

Option 1 is the correct engineering answer. Option 2 may be the right answer for
Mist, because option 1 is a **mitigation** — introducing a proxy is exactly the
seam this application is specified not to have (`CI-6`), and adding it would be
EPIC-09's work, not EPIC-02's. That tension is real and is left open here rather
than resolved quietly. **Whoever provisions K2 must choose deliberately and
record the choice in this table.**

Note where this came from: nobody in the project noticed. An automated scanner
looking at the K1 commit noticed, which is the whole thesis of
`docs/mist-concept-evaluation.md:27` — observability the design did not provide
has to be bought back afterwards, from a tool, one finding at a time.

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

**K1 exists and is live as of 2026-09-03.** It is committed at
`apps/web/next.config.js` and has not been revoked. That is not a leak — it is
step 2 working as designed — but it means the window this section describes is
open right now. Revoke immediately,
record the timestamp here, and **do not** rewrite history. Report per
`SECURITY.md` — say *"a live credential is exposed at `<file>:<line>`"* and do
not paste the value. The value being public is the expected end state; it being
*live* is the defect.
