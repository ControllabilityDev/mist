# Fixture telemetry record (EPIC-04)

**Entirely synthetic.** Five invented scan runs used to test `site/build.mjs`
without depending on the real record, which lives on the `telemetry` orphan
branch and starts when it starts (EPIC-04 Phase 1c: nothing is backfilled).

The numbers here are shaped to exercise the render path — growth, a flat axis, a
red run, a run where a scanner crashed — not to resemble Mist. Do not quote them.
`docs/DASHBOARD.md` states where the real numbers are.
