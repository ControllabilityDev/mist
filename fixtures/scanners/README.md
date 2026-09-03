# Scanner fixtures (EPIC-03 Test Plan)

Raw scanner output, in each tool's own shape, used to pin the
`scan-run.json` contract. These are **hand-written**, not captured from a real
run: EPIC-02 has not landed, so there is no dependency tree to scan yet. They
are shaped from each tool's documented JSON output.

That is a real limitation and it is written down here rather than implied: when
the first true battery runs, these fixtures should be **replaced with captured
output** and any shape mismatch recorded as a corrigendum in
`docs/EPIC-03_The_Scan_Battery.md`.

`gitleaks.json` deliberately carries `Secret` and `Match` fields, because the
real tool does. `scan-secret-never-leaves-raw` in `scripts/test-scan.mjs`
asserts that string never reaches the envelope.

Constraint: `scripts/check-containment.sh` scans every `fixtures/**/*.json` for
addresses at real mail domains and for coordinates outside
`deploy/synthetic-locations.txt`. Nothing in here may carry either.
