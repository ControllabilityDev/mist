# The Containment Boundary

*How Mist carries real exposure without becoming a liability. Owned by EPIC-01.
Normative source: `docs/mist-concept-evaluation.md:82` — "the line between
'negative control' and 'attractive nuisance' is the line between this being
citable in the book and being a liability."*

---

## The move: worthless, not hardened

The temptation is to secure the deployment. **That is the wrong move**, and it
would contradict standing rule 4 (`CONTRIBUTING.md`): a hardened Mist measures
nothing.

The right move is to make the deployment *worthless*. Not defended — **empty**.
Containment through low value is the only mitigation that does not corrupt the
measurement. Everything below follows from that one decision.

---

## The invariants

A reviewer can check each of these. They are the contract `SECURITY.md` makes to
the outside world.

```
Account:      dedicated cloud account, no org trust relationship, no SSO link
Billing:      hard cap; the account can be abandoned without cleanup
Identity:     no role assumable from any other account; no shared OIDC subject
Network:      egress to the weather API and package registries only;
              no VPC peering, no private link, no path to any other system
Data:         synthetic only — no real user, no real email, no real location
Blast radius: total compromise of this deployment costs one throwaway account
              and one revocable API key
Recovery:     documented as "delete the account and re-provision from IaC"
```

## Provisioning record

**Not yet provisioned.** EPIC-01 Work Item 1a owns this and requires a human
with a payment method; it cannot be done from a repository.

| Field | Value |
|---|---|
| Cloud provider | *unset — 1a* |
| Account identifier | *unset — 1a* (identifier only; never credentials) |
| Hard billing cap | *unset — 1a* |
| Provisioned on | *unset — 1a* |
| IaC source of truth | *unset — 1a* |

Until this table is filled, **EPIC-02 must not deploy.** The four containment
rules that can be enforced from the repository — scope allowlist, advisory
denylist, README banner, synthetic-data-only — are enforced today by
`scripts/check-containment.sh`. The account-level invariants above are not, and
cannot be. They are attested here by a human or they are not true.

---

## Egress allowlist rationale

Egress is restricted to two destinations: **package registries** and **the
weather API**.

**What this restricts.** Where code running in the deployment can *reach*. If a
compromised dependency tries to exfiltrate to an attacker-controlled host, the
network says no, and the attempt shows up as a blocked connection — which is
itself telemetry worth having (EPIC-04).

**What this explicitly does not restrict.** What installed packages *do*. Mist
runs install scripts. It imports packages that open sockets at import time. It
lets its dependency tree drift under semver ranges. None of that is filtered,
throttled, or reviewed — filtering it would be standing rule 4's exact
prohibition, and the scans would go quiet for the wrong reason.

The allowlist is a wall around the room. It is not a leash on the specimen.

**Why registries stay open.** Mist must be able to install. An egress rule that
blocked the registry would be a de facto cooldown policy — a mitigation adopted
by accident, which is the failure mode standing rule 4 names.

---

## What total compromise costs

An honest accounting, because `SECURITY.md` promises it:

| Asset | Exposure if the deployment is fully owned |
|---|---|
| User data | None. Synthetic rows only; `example.invalid` addresses; low-population coordinates. |
| Credentials | One weather API key (K2), revocable in minutes (`docs/KEY_ROTATION.md`). |
| Cloud account | One throwaway with a hard billing cap. Deleted and re-provisioned from IaC. |
| Lateral movement | None by construction: no trust relationship, no assumable role, no network path. |
| Reputation | Real, and unmitigated. This is why the README banner is byte-for-byte enforced. |
| The experiment | A compromise **is a result**. It gets published (EPIC-04), not hidden. |

The last row is the point. Mist is designed to be downstream of whatever comes
next (`docs/mist-concept-evaluation.md:70`). A breach of the *dependency tree* is
data. A breach of *this boundary* is a defect — and that is the only distinction
this document exists to draw.
