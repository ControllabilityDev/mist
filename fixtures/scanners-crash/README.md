# Crash / skip fixture (EPIC-03 Test Plan: scan-assemble-survives-crash)

Three of the seven scanners are deliberately broken here:

| Scanner | State | Expected envelope |
|---|---|---|
| `npm-audit` | normal output | `status: "ran"` |
| `semgrep` | output present but unparseable | `status: "crashed"`, `exitCode` recorded |
| `gitleaks` | meta says skipped, with a reason | `status: "skipped"`, reason preserved |
| the other four | no files at all | `status: "skipped"`, reason states the job did not run |

A crashed scanner must never read as a clean one. That is the whole test.
