# Mist — Concept Evaluation and Framing Rationale

*Session date: 2026-08-21. Companion to `controllability-concept-evaluation.md`, `domain-kernel-intersection.md`, and `fakeability-concept-evaluation.md`. This doc evaluates **Mist** as a demonstration project: a deliberately anti-kernel Node.js/React application built to show what the Controllability thesis looks like when violated — with the scans left running.*

## Proposed definition

> **Mist** is a working, deployable Node.js/React application constructed as the *negative control* of the Controllability framework: maximal dependency surface, no purity partition, every input channel the domain kernel excludes embraced by design — and a full battery of supply-chain and security scanning wired into CI, so the project continuously measures its own decay.

The name works three times over: mist as anti-clarity (the inversion of an observable system), *Mist* in German (an accurate one-word review of the median `node_modules` directory), and mist as the thing that condenses out of the atmosphere without anyone deciding to make it — which is exactly how a dependency tree of 1,500 packages comes into being.

## Position in the Controllability framework

**Mist is the experimental negative control the framework has been missing.** The kernel repos (cardpack.rs, pkcore, gfcore) demonstrate the thesis by construction: control the inputs totally, and observability is free. Mist demonstrates it by violation: surrender control of the inputs, and observability must be *purchased* — continuously, after the fact, at market rates, from a security-scanning industry that exists precisely because this surrender is the ecosystem's default posture. A thesis that can only show its positive case is a sales pitch; the negative control is what makes it an argument.

**The inversion, stated precisely.** Every kernel invariant has a Mist counter-invariant:

| Domain kernel | Mist |
|---|---|
| No hidden input channels — state driven entirely by supplied inputs | Hidden input channels everywhere: postinstall scripts, env-var behavior switches, network access at import time, dependencies that update under semver ranges |
| Telemetry is the return value — events in the transition function's type | Telemetry is a bill — scan reports, SBOM diffs, and audit findings produced by external tooling after the fact |
| Narrow, stable, language-neutral boundary | The boundary is `node_modules`: ~1,500 transitive packages, each an unaudited party to the trust relationship |
| Pure by default; convenience behind opt-in features | Impure by default; every convenience on, every feature flag someone else's decision |
| Input log is a sufficient statistic for state | No input log exists; the closest artifact is `package-lock.json`, a statistic sufficient only for reproducing the *exposure* |

The last row is the sharpest: the lockfile is Mist's parody of event sourcing. It replays perfectly — but what it replays is the dependency tree, not the domain. It is a complete, deterministic record of every decision *not* made.

**Mist reframes scanning as compensatory observability.** In the framework's terms: the scans (audit, SCA, SAST, secret detection, SBOM) are sensors bolted onto a plant whose inputs nobody controls. They are genuinely necessary — this doc is not anti-scanning — but their necessity is the evidence. The kernel needs no vulnerability scanner for the same reason it needs no fakes: there is nothing hidden to detect. Every scanner in Mist's CI is a measurement of distance from the purity line. This gives the book a formula worth testing: **scan spend is a proxy metric for surrendered controllability.**

**The fakeability connection.** Mist is also maximally *unfakeable*: dependencies reached through no seam, third-party APIs called from component bodies, the database client imported globally. The fakeability doc's claim — "a dependency reached through no seam is an unfakeable one" — gets its worked example here. Mist's test suite (it should have one, thin and mock-heavy, London-school without the discipline) demonstrates the prophecy problem in its worst form: mocks verifying conversations with dependencies whose actual behavior nobody controls or has read.

## The agentic-age argument

This is what distinguishes Mist from the existing deliberately-vulnerable-app genre (see prior art) and what earns it a place in the book: **Mist should be built the way an agentic coding session builds software, because that construction method is itself the vulnerability.**

The mechanism has three parts:

**1. "Add a package for that" as the default move.** LLM coding agents optimize for working-now. The lowest-perplexity path from user intent to running code routes through npm install, and each install is a trust decision made in milliseconds by a process with no memory of the last supply-chain incident. Mist's dependency tree should be assembled exactly this way — each package a locally reasonable choice (moment instead of Temporal, axios instead of fetch, lodash for three functions, a component library for one modal) — so that the final surface is indefensible in aggregate while unimpeachable at every individual step. Mist must not be a strawman; it must be the median project.

**2. Slopsquatting.** The attack surface built specifically for this workflow: <cite index="27-1,35-1">the term, coined by Seth Larson of the Python Software Foundation, names the registration of package names that LLMs hallucinate</cite> — <cite index="26-1">the foundational study (16 code-generation models, 576,000 samples) found roughly a fifth of recommended packages didn't exist, over 205,000 unique fictional names, and 43% of hallucinated names recurring consistently across repeated runs</cite>, which means attackers can farm the hallucinations rather than guess them. The hallucinations are also semantically convincing: <cite index="27-1">38% are conflations of two real package names — the kind a reviewer unfamiliar with the specific package has no signal to reject</cite>. This is the prophecy problem weaponized: the model's plausible-but-false theory of the registry, and an adversary who reads the theory before you do.

**3. The install-time blast radius.** The recent incident record shows what each reflexive install actually costs. <cite index="11-1">The September 2025 compromise of maintainer accounts cascaded into 18 packages including chalk and debug — collectively about 2.6 billion weekly downloads</cite>, via a single phished maintainer. <cite index="16-1,19-1">Shai-Hulud, the first self-propagating worm in npm's history, harvested npm tokens and cloud credentials and republished infected packages under every token it captured, executing via install scripts</cite>; <cite index="14-1">its second wave in November 2025 compromised 796 packages with 132 million monthly downloads, using preinstall scripts as the infection point</cite>. The structural lesson for the framework: **the package registry is a hidden input channel to your build, and install scripts are remote code execution you scheduled yourself.** Mist should carry the full exposure — no `--ignore-scripts`, no cooldown policy, semver ranges wide open — precisely so the scans have something true to say.

The agentic frame closes the loop back to Part IV of the book: the agent is a controller with no model of the plant, no memory across loops, actuation authority over `package.json`, and feedback latency measured in CVE disclosure cycles. Mist is what the six personal dimensions look like when the "person" is a stateless process optimizing for compile-success.

## Design: workable but rotten

**The app.** A weather dashboard. The domain justifies the surface honestly — geolocation, third-party weather APIs, charting, timezone/date handling, i18n, user preferences in a two-table database — and every feature is a legitimate excuse for a heavyweight dependency. Target stack: Next.js + Express (yes, both — the median project has both for historical reasons nobody remembers) + Prisma + a charting library + a component library. Target transitive count: 1,200–2,000 packages, reached without a single unreasonable individual decision.

**"Workable" is load-bearing.** Mist must build, deploy, and actually show the weather. A broken demo demonstrates nothing; the argument requires that this is what *functioning* software looks like in the ecosystem's default mode. The rot is in the inputs, not the outputs — which is the thesis.

**The scan battery.** Wired into CI from the first commit, publishing to a permanent public dashboard:

- `npm audit` and **osv-scanner** — known-CVE baseline against the full tree.
- **Socket** (or equivalent behavioral SCA) — the interesting layer: install scripts, network access at install/import time, obfuscation, maintainer changes. This is the scanner class that detects *anti-kernel properties* rather than known bugs.
- **Semgrep** — SAST over the first-party code, which should contain a modest, realistic crop of app-layer findings (not Juice Shop's curated hundred — a median project's honest dozen).
- **gitleaks** — secret detection; Mist should have at least one plausibly-committed API key in its history, since the weather API needs one and that is how it goes.
- **CycloneDX SBOM** — generated per build, diffed per PR, so the dashboard can chart *surface growth over time* as agentic-style feature additions land.
- **License scan** — the compliance face of the same surrender: obligations nobody read, accumulating in the same tree.

The dashboard is Mist's telemetry, and its ontological status is the point: it is observability *about the inputs*, purchased because the inputs were never controlled. Given the incident cadence of the last two years, it will not stay green — the ecosystem performs the demonstration on a schedule.

**The violation inventory.** The design discipline that makes Mist citable rather than merely cautionary: a maintained `VIOLATIONS.md` mapping each dependency (or class of them) to the kernel invariant it breaks — hidden input channels (install scripts, env-switched behavior, import-time network), unfakeable seams (live-API coupling with no port), uncontrolled emission (libraries that log, telemeter, or phone home on their own initiative), boundary erosion (format and transport types leaking through every layer). This inventory is the book's exhibit: each entry is a kernel invariant with a CVE-shaped shadow.

## Prior-art landscape (checked 2026-08)

The deliberately-vulnerable genre is mature; Mist's differentiation is real but must be stated carefully.

- **OWASP Juice Shop** — the incumbent and the closest neighbor: <cite index="42-1">a deliberately insecure Node.js/Express/Angular application covering the full OWASP Top Ten, used for trainings, CTFs, and as a guinea-pig for security tools</cite>. The differentiation: Juice Shop's vulnerabilities are *first-party and curated* — app-layer flaws written on purpose, tracked on a scoreboard, designed to be exploited by a human learner. Mist's defects are *second-party and emergent* — the supply chain and the construction method are the vulnerability, and the "attacker" is the ecosystem's ambient threat activity arriving on its own schedule. Juice Shop teaches exploitation; Mist measures exposure.
- **DVWA, WebGoat, and the OWASP VWA Directory** — the broader registry of intentionally vulnerable apps; all share Juice Shop's frame (planted app-layer flaws for training). None, as far as checked, treats *dependency surface itself* as the exhibit or runs a permanent scan dashboard as the primary artifact.
- **The npm incident record** — Mist's live collaborator rather than prior art: <cite index="10-1">the chalk/debug maintainer compromise, the Shai-Hulud worm, and the s1ngularity/Nx campaign together mark an evolution from simple typosquatting toward wormable malware and attacks on developer tooling itself</cite>. Mist is designed to be downstream of whatever comes next.
- **Slopsquatting research** — the USENIX 2025 package-hallucination study and the vendor literature following it (Socket, Snyk, Trend Micro). Mist can go one step further than citation: include one or two *fictional-but-safely-namespaced* dependencies of the kind an agent would plausibly hallucinate, registered by the project itself as inert placeholders, so the demo includes the attack's shape without its payload. (Ethics note: the USENIX researchers deliberately declined to register hallucinated names on public registries; Mist should follow their lead and keep any such demonstration inside a scoped namespace it owns.)
- **Supply-chain hygiene tooling as counter-genre** — pnpm's cooldown policies, `--ignore-scripts` defaults, Socket's install-time firewall, SLSA/provenance work. Mist is the control group for all of it: the project that adopts none of the mitigations, so their absence is measurable.

**The gap Mist fills:** an intentionally *typical* application (not intentionally vulnerable code), instrumented to continuously exhibit what typicality costs, framed against an architectural alternative. The genre has apps that are worse than average on purpose; it lacks one that is *exactly average* on purpose, with the meter running.

## The name

Arguments for: the triple reading (anti-clarity; the German; condensation-without-decision), each doing thematic work. Short, memorable, available as a repo name, and it sits in productive opposition to the clarity vocabulary of the rest of the project — the kernel repos are about seeing, Mist is about the fog you buy by default. Arguments against: "Mist" is a common English word with heavy namespace collision (a game engine, various startups) — but Mist is a demo repo, not a product; discoverability is via the book, not the registry. Alternatives considered: *Smog* (right idea, but implies malice; Mist's defects are ambient, not hostile), *Fugue* (dissociative state — clever, too obscure), *Vapor* (vaporware connotation misleads; Mist must work). The German reading settles it.

## Verdict

Strong, and structurally different from everything else in the project: not a concept but an *artifact of the argument* — the negative control that makes the kernel repos evidence rather than testimony. Two disciplines keep it honest. First, **medianness**: the moment Mist takes a step no ordinary team would take, it becomes a strawman and the demonstration collapses; every dependency must survive the question "would an agent, or a hurried developer, plausibly have done this?" Second, **safety scoping**: Mist demonstrates exposure, not exploitation — no live malicious packages, no registered hallucinated names outside owned namespaces, deployment isolated from anything that matters, and a prominent README stating what the project is. The line between "negative control" and "attractive nuisance" is the line between this being citable in the book and being a liability.

## Open threads

- **Book placement.** Natural home: Part I chapter 3 ("A Territory Without a Name") gains a live exhibit, or a new short chapter closing Part II — "The Anti-Kernel" — with Mist as the mirror held up to chapters 4–7. The dashboard screenshot on the day of the next ecosystem incident may be the book's best figure.
- **The metric.** Can "scan spend as proxy for surrendered controllability" be made quantitative? Candidate axes: transitive package count, install-script count, packages with network access at import, SBOM churn rate, mean time between red dashboard states. A "Mist index" for arbitrary repos would be a genuinely useful spinoff tool.
- **The paired refactor.** The strongest possible demo is Mist plus a branch: the same weather dashboard rebuilt with a small pure core (fetch/parse/derive as a kernel, shell owning I/O), dependency count cut by an order of magnitude, dashboard green. Before/after on the same domain is the purity-partitioning chapter's working code.
- **Agentic construction as method.** Should Mist literally be built *by* agentic sessions, with the transcripts kept? The construction log would be primary-source evidence for the "add a package for that" mechanism — and an uncomfortable, honest artifact for a book partly about AI-age engineering.
- **Longitudinal decay.** Freeze a Mist release and re-scan it monthly without updating: chart how a *static* dependency tree accumulates known vulnerabilities purely through disclosure. Telemetry of entropy — the invoice arriving on its own.
- **The Asha/druj echo.** For the philosophical thread: Mist is the druj-system — not a system that lies, but one built such that *no one can say whether it is lying*, which the Zoroastrian frame would recognize as the deeper corruption. Worth a paragraph when the cross-cultural material gets drafted.
