#!/usr/bin/env node
/**
 * Tests for the violation inventory (EPIC-05 Test Plan).
 *
 * Gold Standard: every assertion in scripts/check-violations.mjs is run twice --
 * once against a clean copy of the tree, once against a copy broken in exactly
 * the way that assertion exists to catch. An assertion that has never failed is
 * not a gate.
 *
 * The fixture root symlinks the real node_modules rather than copying it: the
 * evidence resolvers read package.json files out of the tree, and copying 736
 * packages per test would make the suite unusable.
 *
 * Zero dependencies.  Usage: node scripts/test-violations.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));

function run(root, extra = []) {
  try {
    return { code: 0, out: execFileSync(NODE, [join(ROOT, "scripts/check-violations.mjs"), "--root", root, ...extra], { encoding: "utf8" }) };
  } catch (e) { return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }; }
}

const temps = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "mist-viol-"));
  temps.push(dir);
  for (const f of ["violations.json", "VIOLATIONS.md", "violations.fingerprints.json", "package.json"])
    cpSync(join(ROOT, f), join(dir, f));
  mkdirSync(join(dir, "apps"), { recursive: true });
  // Source only. apps/ carries no node_modules of its own -- npm hoists.
  cpSync(join(ROOT, "apps"), join(dir, "apps"), { recursive: true, filter: (s) => !s.includes("node_modules") && !s.includes("/.next") });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}
const readV = (d) => JSON.parse(readFileSync(join(d, "violations.json"), "utf8"));
const writeV = (d, v) => writeFileSync(join(d, "violations.json"), JSON.stringify(v, null, 2) + "\n");

console.log("test-violations (EPIC-05 Test Plan)\n");

// --- baseline ---------------------------------------------------------------
{
  const d = fixture();
  const { code, out } = run(d);
  check("baseline-clean-inventory-passes", code === 0, `check-violations failed on an unmodified copy:\n${out}`);
}

// --- viol-completeness: THE load-bearing test -------------------------------
{
  const d = fixture();
  const pkg = JSON.parse(readFileSync(join(d, "package.json"), "utf8"));
  pkg.dependencies = { ...(pkg.dependencies ?? {}), "some-new-package": "^1.0.0" };
  writeFileSync(join(d, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  const { code, out } = run(d);
  check("gold-standard-viol-completeness (a dependency with no entry)",
    code === 1 && /viol-completeness/.test(out) && /some-new-package/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

// --- viol-none-needs-note ---------------------------------------------------
{
  const d = fixture();
  const v = readV(d);
  v.entries.find((e) => e.class === "none").note = "inert";
  writeV(d, v);
  const { code, out } = run(d);
  check("gold-standard-viol-none-needs-note (a justification that is not one)",
    code === 1 && /(viol-none-needs-note|viol-schema-valid)/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

// --- viol-evidence-required -------------------------------------------------
{
  const d = fixture();
  const v = readV(d);
  v.entries.find((e) => e.class !== "none").evidence = [];
  writeV(d, v);
  const { code, out } = run(d);
  check("gold-standard-viol-evidence-required (a violation with no evidence)",
    code === 1 && /viol-evidence-required/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

// --- viol-evidence-resolves -------------------------------------------------
{
  const d = fixture();
  const v = readV(d);
  v.entries.find((e) => e.class !== "none").evidence = ["install-script:lodash"];
  writeV(d, v);
  const { code, out } = run(d);
  check("gold-standard-viol-evidence-resolves (evidence that is not true)",
    code === 1 && /viol-evidence-resolves/.test(out) && /lodash/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

{
  const d = fixture();
  const v = readV(d);
  v.entries.find((e) => e.class !== "none").evidence = ["path:apps/web/app/dashboard/CurrentConditions.tsx:99999"];
  writeV(d, v);
  const { code, out } = run(d);
  check("viol-evidence-resolves (a path anchor past the end of the file)",
    code === 1 && /viol-evidence-resolves/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

// --- viol-md-is-generated ---------------------------------------------------
{
  const d = fixture();
  const md = readFileSync(join(d, "VIOLATIONS.md"), "utf8");
  writeFileSync(join(d, "VIOLATIONS.md"), md.replace("# VIOLATIONS", "# VIOLATIONS (edited by hand)"));
  const { code, out } = run(d);
  check("gold-standard-viol-md-is-generated (a hand edit)",
    code === 1 && /viol-md-is-generated/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

// --- viol-anchor-drift: WARNS, does not fail --------------------------------
{
  const d = fixture();
  const fp = JSON.parse(readFileSync(join(d, "violations.fingerprints.json"), "utf8"));
  const anchor = Object.keys(fp).find((k) => k.startsWith("path:"));
  fp[anchor] = "deadbeef";
  writeFileSync(join(d, "violations.fingerprints.json"), JSON.stringify(fp, null, 2) + "\n");
  const { code, out } = run(d);
  check("viol-anchor-drift-warns (drift is a warning, not a failure)",
    code === 0 && /WARN/.test(out) && /viol-anchor-drift/.test(out),
    `expected exit 0 with a warning; got exit ${code}:\n${out}`);
}

// --- viol-first-party-counted -----------------------------------------------
{
  const d = fixture();
  const v = readV(d);
  v.entries = v.entries.filter((e) => e.party !== "first");
  writeV(d, v);
  // Regenerate so the byte-identity check is not the thing that fires.
  const md = execFileSync(NODE, [join(ROOT, "scripts/gen-violations.mjs")], { encoding: "utf8", env: { ...process.env }, cwd: d });
  writeFileSync(join(d, "VIOLATIONS.md"), md);
  const { code, out } = run(d);
  check("gold-standard-viol-first-party-counted (a dependency-only inventory)",
    code === 1 && /viol-first-party-counted/.test(out),
    `expected a refusal; got exit ${code}:\n${out}`);
}

// --- no contradictory classification ----------------------------------------
{
  const v = JSON.parse(readFileSync(join(ROOT, "violations.json"), "utf8"));
  const bySubject = {};
  for (const e of v.entries) (bySubject[e.subject] ??= []).push(e.class);
  const both = Object.entries(bySubject)
    .filter(([, cs]) => cs.includes("none") && cs.some((c) => c !== "none")).map(([s]) => s);
  check("viol-no-subject-is-both-none-and-a-violation", both.length === 0,
    `subject(s) classified both ways: ${both.join(", ")}`);
}

for (const d of temps) rmSync(d, { recursive: true, force: true });
if (failed) { console.log("\ntest-violations: FAILED"); process.exit(1); }
console.log("\ntest-violations: all assertions pass");
