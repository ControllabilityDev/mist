#!/usr/bin/env node
/**
 * Tests for the longitudinal decay experiment (EPIC-07 Test Plan).
 *
 * Gold Standard: modifying one byte of decay/v1.0.0/lockfile.json must make
 * decay-never-updates fail. Proven against a broken copy, not asserted.
 *
 * Zero dependencies.  Usage: node scripts/test-decay.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { verifyIntegrity, check as vaultCheck } from "./vault.mjs";
import { auditSeries, loadSeries } from "./check-decay.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const FREEZE = join(ROOT, "decay/v1.0.0");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));

const temps = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); temps.push(d); return d; };
const runCheck = (extra) => {
  try { return { code: 0, out: execFileSync(NODE, [join(ROOT, "scripts/check-decay.mjs"), ...extra], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }; }
};

console.log("test-decay (EPIC-07 Test Plan)\n");

// --- the freeze itself --------------------------------------------------------
{
  const manifest = JSON.parse(readFileSync(join(FREEZE, "manifest.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(FREEZE, "lockfile.json"), "utf8"));

  check("decay-freeze-matches-main (the frozen lockfile is the shipped one)",
    createHash("sha256").update(readFileSync(join(FREEZE, "lockfile.json"))).digest("hex") ===
    createHash("sha256").update(readFileSync(join(ROOT, "package-lock.json"))).digest("hex"),
    "decay/v1.0.0/lockfile.json differs from package-lock.json. That is expected once main moves on -- but it must be a deliberate re-freeze, not a drift, and this test is the reminder.");

  const need = Object.entries(lock.packages ?? {})
    .filter(([p, m]) => p.startsWith("node_modules/") && !m.link && m.resolved).length;
  check("decay-manifest-complete (every resolvable package has a slot)",
    manifest.packages.length === need, `manifest has ${manifest.packages.length}, lockfile needs ${need}`);
  check("decay-manifest-complete (every entry carries an integrity hash)",
    manifest.packages.every((p) => p.integrity && p.vaultPath), "an entry has no integrity hash or no vault path");
  check("decay-size-is-measured (not estimated)",
    manifest.packages.every((p) => Number.isInteger(p.bytes) && p.bytes > 0) && manifest.totals.bytes > 0,
    "a package has no measured size; EPIC-07 Phase 1d requires the size measured, not estimated");
}

// --- Gold Standard: decay-never-updates ---------------------------------------
{
  const d = tmp("mist-decay-freeze-");
  cpSync(FREEZE, d, { recursive: true });
  const lock = readFileSync(join(d, "lockfile.json"), "utf8");
  // One byte. A single character inside a version string.
  writeFileSync(join(d, "lockfile.json"), lock.replace('"version": "1.0.0"', '"version": "1.0.1"'));
  const r = runCheck(["--freeze", d]);
  check("gold-standard-decay-never-updates (one changed byte fails, permanently)",
    r.code === 1 && /decay-never-updates/.test(r.out),
    `expected a refusal; got exit ${r.code}:\n${r.out}`);
}

{
  const d = tmp("mist-decay-drop-");
  cpSync(FREEZE, d, { recursive: true });
  const m = JSON.parse(readFileSync(join(d, "manifest.json"), "utf8"));
  m.packages = m.packages.slice(1);
  writeFileSync(join(d, "manifest.json"), JSON.stringify(m));
  const r = runCheck(["--freeze", d]);
  check("decay-manifest-complete (a dropped package fails)",
    r.code === 1 && /decay-manifest-complete/.test(r.out), `got exit ${r.code}:\n${r.out}`);
}

// --- integrity verification ----------------------------------------------------
{
  const buf = Buffer.from("a tarball, pretend");
  const good = "sha512-" + createHash("sha512").update(buf).digest("base64");
  check("decay-vault-integrity (matching bytes verify)", verifyIntegrity(buf, good).ok === true, "a matching tarball failed verification");
  check("decay-vault-integrity (one tampered byte is caught)",
    verifyIntegrity(Buffer.from("a tarball, pretenz"), good).ok === false,
    "a tampered tarball verified -- a vault entry that does not match the lockfile is worse than a missing one, because it looks like evidence");
  check("decay-vault-integrity (an unparseable hash is rejected, not ignored)",
    verifyIntegrity(buf, "nonsense").ok === false, "a malformed integrity string was accepted");
}

{
  // A vault missing its tarballs must report missing, not pass vacuously.
  const d = tmp("mist-decay-vault-");
  mkdirSync(join(d, "vault"), { recursive: true });
  writeFileSync(join(d, "manifest.json"), JSON.stringify({
    packages: [{ name: "x", version: "1.0.0", integrity: "sha512-abc", vaultPath: "vault/absent.tgz" }],
  }));
  const r = vaultCheck(d);
  check("decay-vault-complete (an empty vault reports missing, not OK)",
    r.missing.length === 1, `vault check returned ${JSON.stringify(r)}`);
}

// --- the series: dual scan, gaps, no interpolation -------------------------------
{
  const mk = (dir, records) => {
    mkdirSync(dir, { recursive: true });
    records.forEach((r, i) => writeFileSync(join(dir, `${r.startedAt ?? `2026-0${i + 1}-01T00:00:00Z`}.json`.replace(/:/g, "-")), JSON.stringify(r)));
    return dir;
  };

  const ok = mk(join(tmp("mist-decay-ok-"), "s"), [
    { startedAt: "2026-09-01T00:00:00Z", scannerMode: "pinned", findings: 3 },
    { startedAt: "2026-09-01T00:05:00Z", scannerMode: "current", findings: 5 },
    { startedAt: "2026-10-01T00:00:00Z", scannerMode: "pinned", findings: 4 },
    { startedAt: "2026-10-01T00:05:00Z", scannerMode: "current", findings: 9 },
  ]);
  let a = auditSeries(loadSeries(ok));
  check("decay-dual-scan-recorded (both modes each month passes)", a.problems.length === 0, a.problems.join("; "));

  const half = mk(join(tmp("mist-decay-half-"), "s"), [
    { startedAt: "2026-09-01T00:00:00Z", scannerMode: "pinned", findings: 3 },
  ]);
  a = auditSeries(loadSeries(half));
  check("gold-standard-decay-dual-scan-recorded (a month with only one mode fails)",
    a.problems.length === 1 && /current/.test(a.problems[0]),
    `expected a problem about the missing mode; got ${JSON.stringify(a.problems)}`);

  const gapped = mk(join(tmp("mist-decay-gap-"), "s"), [
    { startedAt: "2026-09-01T00:00:00Z", status: "gap", reason: "runner could not fetch the vault asset" },
  ]);
  a = auditSeries(loadSeries(gapped));
  check("decay-gap-recorded (an explicit gap is a valid month)",
    a.problems.length === 0,
    "a month with an explicit gap record was reported as missing data -- a gap IS data, and it must be recordable");

  const r = runCheck(["--series", gapped]);
  check("decay-gap-recorded (a gap needs a stated reason)",
    r.code === 0 && /decay-gap-recorded/.test(r.out), `got exit ${r.code}:\n${r.out}`);

  const noReason = mk(join(tmp("mist-decay-noreason-"), "s"), [{ startedAt: "2026-09-01T00:00:00Z", status: "gap" }]);
  const r2 = runCheck(["--series", noReason]);
  check("gold-standard-decay-gap-recorded (a gap with no reason fails)",
    r2.code === 1 && /no stated reason/.test(r2.out), `got exit ${r2.code}:\n${r2.out}`);

  const interp = mk(join(tmp("mist-decay-interp-"), "s"), [
    { startedAt: "2026-09-01T00:00:00Z", scannerMode: "pinned", findings: 3 },
    { startedAt: "2026-09-01T00:05:00Z", scannerMode: "current", findings: 5, interpolated: true },
  ]);
  const r3 = runCheck(["--series", interp]);
  check("gold-standard-decay-no-interpolation (a filled-in value fails)",
    r3.code === 1 && /interpolat/i.test(r3.out),
    `expected a refusal; got exit ${r3.code}:\n${r3.out}`);
}

// --- the pinned-scanner degradation case -----------------------------------------
{
  const d = join(tmp("mist-decay-degrade-"), "s");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "2026-09-01.json"), JSON.stringify({
    startedAt: "2026-09-01T00:00:00Z", scannerMode: "pinned",
    perScannerGaps: [{ id: "semgrep", reason: "semgrep 1.90.0 no longer runs on the current CI image" }],
  }));
  writeFileSync(join(d, "2026-09-01b.json"), JSON.stringify({ startedAt: "2026-09-01T00:05:00Z", scannerMode: "current" }));
  const a = auditSeries(loadSeries(d));
  check("decay-pinned-scanner-degradation (a per-scanner gap does not void the month)",
    a.problems.length === 0,
    "a month where one pinned scanner could not run was treated as a missing month; it is a partial month with an annotated series");
}

for (const d of temps) rmSync(d, { recursive: true, force: true });
if (failed) { console.log("\ntest-decay: FAILED"); process.exit(1); }
console.log("\ntest-decay: all assertions pass");
