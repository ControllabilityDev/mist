#!/usr/bin/env node
/**
 * Structural assertions over the application (EPIC-02 Test Plan).
 *
 * These are not tests of the weather dashboard. They are tests of the
 * DEMONSTRATION: they fail when somebody quietly applies a supply-chain
 * mitigation, which would destroy the measurement without breaking a single
 * feature (CONTRIBUTING.md standing rule 4).
 *
 * That failure mode is not hypothetical. During session 001 the first install
 * came out exact-pinned because a contributor's GLOBAL ~/.npmrc sets
 * save-exact=true. Nobody chose it, no repository file recorded it, and
 * check-containment.sh did not see it, because that gate reads a repository
 * .npmrc and this came from outside the repository entirely. wx-ranges-are-wide
 * below catches it by reading the result rather than the configuration.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/check-wx.mjs
 *   node scripts/check-wx.mjs --root DIR
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const skip = (n, why) => console.log(`  skip  ${n}\n        ${why}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

/** Every package.json in the repository that declares dependencies. */
function manifests(root) {
  const files = ["package.json", "apps/api/package.json", "apps/web/package.json"]
    .map((f) => join(root, f)).filter(existsSync);
  return files.map((f) => ({ file: f.slice(root.length + 1), pkg: JSON.parse(readFileSync(f, "utf8")) }));
}

// --- wx-no-npmrc -------------------------------------------------------------
function checkNoNpmrc(root) {
  const name = "wx-no-npmrc";
  const found = [".npmrc", "apps/web/.npmrc", "apps/api/.npmrc"].filter((f) => existsSync(join(root, f)));
  if (found.length)
    return fail(name, `${found.join(", ")} exists -- an .npmrc is where ignore-scripts, save-exact and audit levels get applied silently. Mist must not carry one (docs/ROADMAP.md toolchain table).`);
  pass(name, "(3 path(s) checked)");
}

// --- wx-ranges-are-wide ------------------------------------------------------
function checkRangesAreWide(root) {
  const name = "wx-ranges-are-wide";
  const pinned = [];
  for (const { file, pkg } of manifests(root))
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"])
      for (const [dep, range] of Object.entries(pkg[field] ?? {}))
        if (/^\d/.test(range ?? "")) pinned.push(`${file}: ${dep}@${range}`);

  if (pinned.length)
    return fail(name, `exact pin(s): ${pinned.join(", ")}\n        An exact pin closes the semver-range hidden input channel (CI-1, docs/ANTI_KERNEL.md), which is one of the specific things Mist exists to measure. If npm did this to you, it is a global ~/.npmrc save-exact=true; no command-line flag reliably overrides it. Widen by hand.`);

  const n = manifests(root).reduce((c, { pkg }) =>
    c + ["dependencies", "devDependencies"].reduce((k, f) => k + Object.keys(pkg[f] ?? {}).length, 0), 0);
  pass(name, `(${n} direct dependenc(ies), all ranged)`);
}

// --- wx-no-ignore-scripts ----------------------------------------------------
function checkInstallScriptsEnabled(root) {
  const name = "wx-install-scripts-enabled";
  const problems = [];
  for (const { file, pkg } of manifests(root)) {
    const cfg = pkg.config ?? {};
    if (cfg["ignore-scripts"] === true || pkg.scripts?.preinstall?.includes("--ignore-scripts"))
      problems.push(`${file} disables install scripts`);
  }
  if (existsSync(join(root, ".npmrc")) &&
      /^\s*ignore-scripts\s*=\s*true/m.test(readFileSync(join(root, ".npmrc"), "utf8")))
    problems.push(".npmrc sets ignore-scripts=true");
  if (problems.length)
    return fail(name, problems.join("; ") + " -- install scripts are remote code execution you scheduled yourself, and the exposure must be real for the scans to have something true to say.");
  pass(name);
}

// --- wx-ledger-complete ------------------------------------------------------
function checkLedgerComplete(root) {
  const name = "wx-ledger-complete";
  const ledgerFile = join(root, "install-ledger.jsonl");
  if (!existsSync(ledgerFile)) return fail(name, "install-ledger.jsonl is missing");

  const records = readFileSync(ledgerFile, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const ledgered = new Set(records.filter((r) => (r.type ?? "install") === "install").map((r) => r.package));

  const direct = new Set();
  for (const { pkg } of manifests(root))
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"])
      for (const dep of Object.keys(pkg[field] ?? {})) direct.add(dep);

  const missing = [...direct].filter((d) => !ledgered.has(d)).sort();
  if (missing.length)
    return fail(name, `unledgered direct dependenc(ies): ${missing.join(", ")}\n        The moment has passed. Record the gap in docs/CONSTRUCTION.md rather than backfilling a record that would be indistinguishable from a fabricated one.`);
  pass(name, `(${direct.size} direct dep(s), ${ledgered.size} ledgered)`);
}

// --- wx-no-seam --------------------------------------------------------------
// The absence this EPIC is specified to have. Asserted so that a well-meaning
// refactor toward a port cannot land here by accident -- that refactor is
// EPIC-09, on a separate branch, and doing it here would delete the finding.
function checkNoSeam(root) {
  const name = "wx-no-seam";
  const dbFile = join(root, "apps/api/src/db.ts");
  if (!existsSync(dbFile)) return skip(name, "apps/api/src/db.ts not present");
  const db = readFileSync(dbFile, "utf8");
  if (!/^export const prisma = new PrismaClient/m.test(db))
    return fail(name, "apps/api/src/db.ts no longer instantiates the client at module scope -- if a seam was introduced deliberately, that is EPIC-09 and belongs on its own branch (docs/EPIC-09_The_Paired_Refactor.md)");

  const cc = join(root, "apps/web/app/dashboard/CurrentConditions.tsx");
  if (existsSync(cc) && !/axios\.get\(/.test(readFileSync(cc, "utf8")))
    return fail(name, "CurrentConditions.tsx no longer calls the provider directly -- same note as above");
  pass(name, "(module-scope client, provider called from the component body)");
}

// --- wx-synthetic-fixtures ---------------------------------------------------
function checkTestData(root) {
  const name = "wx-tests-use-synthetic-data";
  const dirs = ["apps/web/__tests__", "apps/api/__tests__"].map((d) => join(root, d)).filter(existsSync);
  if (!dirs.length) return skip(name, "no test directories yet");
  const REAL_COORD = /"(?:lat|latitude)"\s*:\s*(-?\d{1,3}\.\d{3,})/;
  const problems = [];
  for (const dir of dirs)
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      if (REAL_COORD.test(text)) problems.push(`${f}: a high-precision coordinate`);
      const emails = [...text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) => m[1]);
      for (const d of emails) if (d !== "example.invalid") problems.push(`${f}: address at ${d}`);
    }
  if (problems.length) return fail(name, problems.join("; ") + " -- EPIC-01 Scope rule 3: synthetic only");
  pass(name, `(${dirs.length} director(ies) scanned)`);
}

function main(argv) {
  const i = argv.indexOf("--root");
  const root = i >= 0 ? resolve(argv[i + 1]) : SELF_ROOT;
  console.log("check-wx (EPIC-02 structural assertions)");
  checkNoNpmrc(root);
  checkRangesAreWide(root);
  checkInstallScriptsEnabled(root);
  checkLedgerComplete(root);
  checkNoSeam(root);
  checkTestData(root);
  if (failed) { console.log("\ncheck-wx: FAILED -- the demonstration is compromised, not just the build"); process.exit(1); }
  console.log("\ncheck-wx: the demonstration is intact");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
