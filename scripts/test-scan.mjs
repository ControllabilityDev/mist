#!/usr/bin/env node
/**
 * Tests for the scan battery (EPIC-03 Test Plan).
 *
 * THE GOLD STANDARD, RESTATED: every assertion in scripts/check-scan.mjs must
 * be provably able to say NO. A gate that has never failed is not a gate, it is
 * a decoration. So each check here is run twice -- once against a tree that
 * should pass, once against a tree deliberately broken in the exact way the
 * check exists to catch.
 *
 * The breakages are made in a COPY of the tree under a temp directory. Nothing
 * here mutates the repository.
 *
 * Zero dependencies.
 *
 * Usage: node scripts/test-scan.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { parseJobs } from "./lib/yaml-jobs.mjs";
import { generate, toRe2 } from "./gen-gitleaks-config.mjs";
import { diff } from "./sbom-diff.mjs";
import { classify, inventory } from "./license-inventory.mjs";
import { assemble, SCANNER_IDS, CI_MAP } from "./assemble-scan-run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));

/** Run check-scan against a root. Returns { code, out }. */
function checkScan(root, extra = []) {
  try {
    const out = execFileSync(NODE, [join(ROOT, "scripts/check-scan.mjs"), "--root", root, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

/** A minimal copy of the tree that check-scan reads. */
function fixtureRoot() {
  const dir = mkdtempSync(join(tmpdir(), "mist-scan-"));
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "schemas"), { recursive: true });
  cpSync(join(ROOT, ".github/workflows/scan.yml"), join(dir, ".github/workflows/scan.yml"));
  cpSync(join(ROOT, "docs/ANTI_KERNEL.md"), join(dir, "docs/ANTI_KERNEL.md"));
  cpSync(join(ROOT, "schemas/scan-run.schema.json"), join(dir, "schemas/scan-run.schema.json"));
  return dir;
}

const readYml = (root) => readFileSync(join(root, ".github/workflows/scan.yml"), "utf8");
const writeYml = (root, t) => writeFileSync(join(root, ".github/workflows/scan.yml"), t);

const temps = [];
const withRoot = (fn) => { const d = fixtureRoot(); temps.push(d); fn(d); };

console.log("test-scan (EPIC-03 Test Plan)\n");

// --- baseline ----------------------------------------------------------------

withRoot((root) => {
  const { code, out } = checkScan(root);
  check("baseline-clean-tree-passes", code === 0, `check-scan failed on an unmodified copy:\n${out}`);
});

// --- the reader's load-bearing assumption ------------------------------------

{
  const { order } = parseJobs(readYml(ROOT));
  const missing = ["audit", "osv", "sca", "semgrep", "gitleaks", "sbom", "licenses", "assemble"].filter((j) => !order.includes(j));
  check("yaml-reader-finds-every-job", missing.length === 0 && !order.includes("push"),
    missing.length ? `reader missed job(s): ${missing.join(", ")}` : "reader picked up 'push' from the on: block as a job");
}

// --- scan-jobs-nonblocking ---------------------------------------------------

withRoot((root) => {
  // Remove the audit job's continue-on-error and nothing else.
  const t = readYml(root).replace(
    "    runs-on: ubuntu-latest\n    continue-on-error: true\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - name: npm audit",
    "    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - name: npm audit");
  if (t === readYml(root)) return fail("gold-standard-scan-jobs-nonblocking", "could not break the audit job -- the anchor text drifted, so this test proves nothing");
  writeYml(root, t);
  const { code, out } = checkScan(root);
  check("gold-standard-scan-jobs-nonblocking (a blocking scan job)",
    code === 1 && /scan-jobs-nonblocking/.test(out) && /audit/.test(out),
    `expected check-scan to refuse; got exit ${code}:\n${out}`);
});

withRoot((root) => {
  // The subtle one: continue-on-error on a STEP, not the job. A regex over the
  // file would be satisfied; the job would still block merge.
  const t = readYml(root)
    .replace("    continue-on-error: true\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - name: npm audit",
             "    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - name: npm audit\n        continue-on-error: true");
  writeYml(root, t);
  const { code, out } = checkScan(root);
  check("scan-jobs-nonblocking (step-level continue-on-error does NOT count)",
    code === 1 && /audit/.test(out),
    `a step-level continue-on-error was accepted as a job-level one; got exit ${code}:\n${out}`);
});

withRoot((root) => {
  writeYml(root, readYml(root).replace(
    "    needs: [audit, osv, sca, semgrep, gitleaks, sbom, licenses]",
    "    continue-on-error: true\n    needs: [audit, osv, sca, semgrep, gitleaks, sbom, licenses]"));
  const { code, out } = checkScan(root);
  check("scan-jobs-nonblocking (assemble must NOT be continue-on-error)",
    code === 1 && /malformed envelope is a real defect/.test(out),
    `a non-blocking assemble job was accepted; got exit ${code}:\n${out}`);
});

// --- scan-no-suppression -----------------------------------------------------

for (const [file, label] of [[".semgrepignore", "a .semgrepignore"], [".gitleaks.toml", "a committed .gitleaks.toml"], [".gitleaksignore", "a gitleaks baseline"]]) {
  withRoot((root) => {
    writeFileSync(join(root, file), "# anything\n");
    const { code, out } = checkScan(root);
    check(`gold-standard-scan-no-suppression (${label})`,
      code === 1 && /scan-no-suppression/.test(out),
      `expected check-scan to refuse ${file}; got exit ${code}:\n${out}`);
  });
}

withRoot((root) => {
  mkdirSync(join(root, "build"), { recursive: true });
  writeFileSync(join(root, "build/gitleaks.mist.toml"), "[extend]\nuseDefault = true\n\n[allowlist]\nregexes = ['''.*''']\n");
  const { code, out } = checkScan(root);
  check("scan-no-suppression (an allowlist in the generated ruleset)",
    code === 1 && /allowlist section/.test(out),
    `expected check-scan to refuse the allowlist; got exit ${code}:\n${out}`);
});

// --- scan-gitleaks-full-history ----------------------------------------------

withRoot((root) => {
  writeYml(root, readYml(root).replace("          fetch-depth: 0\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - name: install gitleaks",
                                       "          fetch-depth: 1\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '24'\n      - name: install gitleaks"));
  const { code, out } = checkScan(root);
  check("gold-standard-scan-gitleaks-full-history (a shallow clone)",
    code === 1 && /FALSE GREEN/.test(out),
    `expected check-scan to refuse fetch-depth: 1; got exit ${code}:\n${out}`);
});

// --- scan-semgrep-scope ------------------------------------------------------

withRoot((root) => {
  writeYml(root, readYml(root).replace("--exclude=node_modules ", ""));
  const { code, out } = checkScan(root);
  check("gold-standard-scan-semgrep-scope (node_modules not excluded)",
    code === 1 && /scan-semgrep-scope/.test(out),
    `expected check-scan to refuse; got exit ${code}:\n${out}`);
});

// --- scan-ci-map-ids-exist ---------------------------------------------------

withRoot((root) => {
  const f = join(root, "docs/ANTI_KERNEL.md");
  writeFileSync(f, readFileSync(f, "utf8").replace(/^\| CI-1 \|/m, "| CI-9 |"));
  const { code, out } = checkScan(root);
  check("scan-ci-map-ids-exist (a renamed counter-invariant breaks the join key)",
    code === 1 && /scan-ci-map-ids-exist/.test(out),
    `expected check-scan to refuse a CI-1 that no longer exists; got exit ${code}:\n${out}`);
});

// --- the assembler: full fixture ---------------------------------------------

const full = assemble({
  rawDir: join(ROOT, "fixtures/scanners"), root: ROOT,
  commit: "1".repeat(40), ref: "main", startedAt: "2026-09-03T12:00:00Z",
});

{
  const byId = Object.fromEntries(full.scanners.map((s) => [s.id, s]));
  check("scan-envelope-all-seven", SCANNER_IDS.every((id) => byId[id]), "an envelope is missing a scanner class");
  check("scan-envelope-fixture-all-ran", full.scanners.every((s) => s.status === "ran"),
    "expected every fixture scanner to read as ran: " + full.scanners.filter((s) => s.status !== "ran").map((s) => `${s.id}=${s.status}`).join(", "));

  const counts = Object.fromEntries(full.scanners.map((s) => [s.id, s.findings.length]));
  const expect = { "npm-audit": 2, "osv-scanner": 2, "sca-behavioral": 8, semgrep: 2, gitleaks: 1, sbom: 0, licenses: 3 };
  const wrong = Object.entries(expect).filter(([id, n]) => counts[id] !== n).map(([id, n]) => `${id}: got ${counts[id]}, expected ${n}`);
  check("scan-envelope-finding-counts", wrong.length === 0, wrong.join("; "));

  check("scan-surface-behavioral-counts",
    full.surface.packagesWithInstallScripts === 41 && full.surface.distinctMaintainers === 612 && full.surface.transitivePackages === 3,
    `surface counts wrong: ${JSON.stringify(full.surface)}`);

  check("scan-surface-unmeasured-is-null (not zero)",
    full.surface.directDependencies === null,
    "directDependencies read as a number with no package.json -- a false green: 0 dependencies is a CLAIM, absence is a FACT");
}

// --- rule 2: no secret material crosses into the envelope --------------------

{
  const raw = readFileSync(join(ROOT, "fixtures/scanners/gitleaks.json"), "utf8");
  const marker = "SECRET-MATERIAL-MUST-NOT-APPEAR-IN-ENVELOPE";
  const inEnvelope = JSON.stringify(full).includes(marker);
  check("scan-secret-never-leaves-raw",
    raw.includes(marker) && !inEnvelope,
    inEnvelope ? "the gitleaks Secret/Match field reached scan-run.json -- that file feeds a PUBLIC dashboard (EPIC-04)"
               : "the fixture no longer contains the marker, so this test proves nothing");
}

// --- scan-assemble-survives-crash --------------------------------------------

{
  const crashed = assemble({
    rawDir: join(ROOT, "fixtures/scanners-crash"), root: ROOT,
    commit: "2".repeat(40), ref: "pr/1", startedAt: "2026-09-03T12:00:00Z",
  });
  const byId = Object.fromEntries(crashed.scanners.map((s) => [s.id, s]));
  check("scan-assemble-survives-crash (unparseable output is crashed, not clean)",
    byId.semgrep.status === "crashed" && byId.semgrep.exitCode === 1,
    `semgrep read as ${byId.semgrep.status} exit=${byId.semgrep.exitCode}; a crashed scanner must never read as a clean one`);
  check("scan-assemble-survives-crash (a working scanner still reports)",
    byId["npm-audit"].status === "ran" && byId["npm-audit"].findings.length === 2,
    "one crashed scanner suppressed the others");
  check("scan-assemble-survives-crash (a stated skip reason survives)",
    byId.gitleaks.status === "skipped" && /no network/.test(byId.gitleaks.skipReason ?? ""),
    `gitleaks skip reason lost: ${JSON.stringify(byId.gitleaks.skipReason)}`);
  check("scan-assemble-survives-crash (an absent job is skipped with a reason)",
    byId.sbom.status === "skipped" && (byId.sbom.skipReason ?? "").length > 0,
    "a job that never ran produced no stated reason");
}

// --- scan-skip-has-reason / scan-ci-mapping-complete, via check-scan ---------

withRoot((root) => {
  const bad = structuredClone(full);
  bad.scanners.find((s) => s.id === "sbom").status = "skipped";
  bad.scanners.find((s) => s.id === "sbom").skipReason = null;
  const f = join(root, "envelope.json");
  writeFileSync(f, JSON.stringify(bad));
  const { code, out } = checkScan(root, ["--envelope", f]);
  check("gold-standard-scan-skip-has-reason (a silent skip)",
    code === 1 && /scan-skip-has-reason/.test(out),
    `expected check-scan to refuse a skip with no reason; got exit ${code}:\n${out}`);
});

withRoot((root) => {
  const bad = structuredClone(full);
  bad.scanners.find((s) => s.id === "sca-behavioral").unmapped.push("UNDECLARED:some-new-alert-type");
  const f = join(root, "envelope.json");
  writeFileSync(f, JSON.stringify(bad));
  const { code, out } = checkScan(root, ["--envelope", f]);
  check("gold-standard-scan-ci-mapping-complete (an undeclared finding type)",
    code === 1 && /scan-ci-mapping-complete/.test(out),
    `expected check-scan to refuse an undeclared type; got exit ${code}:\n${out}`);
});

withRoot((root) => {
  const bad = structuredClone(full);
  bad.scanners[0].findings[0].party = "third"; // not in the enum
  const f = join(root, "envelope.json");
  writeFileSync(f, JSON.stringify(bad));
  const { code, out } = checkScan(root, ["--envelope", f]);
  check("gold-standard-scan-envelope-valid (a malformed envelope)",
    code === 1 && /scan-envelope-valid/.test(out),
    `expected check-scan to refuse; got exit ${code}:\n${out}`);
});

// The assembler itself must refuse to emit a malformed envelope (Phase 5b).
withRoot((root) => {
  const badSchema = JSON.parse(readFileSync(join(ROOT, "schemas/scan-run.schema.json"), "utf8"));
  badSchema.properties.ref = { type: "integer" }; // now every real envelope violates it
  writeFileSync(join(root, "schemas/scan-run.schema.json"), JSON.stringify(badSchema));
  // The assembler reads the schema from ITS OWN root, so drive it via a copied tree.
  // Copy the whole scripts/ tree, not a named subset: a subset silently rots
  // the moment a script grows an import, and the failure looks like the test
  // passing rather than the test breaking.
  cpSync(join(ROOT, "scripts"), join(root, "scripts"), { recursive: true });
  let code = 0, out = "";
  try {
    execFileSync(NODE, [join(root, "scripts/assemble-scan-run.mjs"), "--raw", join(ROOT, "fixtures/scanners"), "--root", root], { encoding: "utf8" });
  } catch (e) { code = e.status ?? 1; out = (e.stdout ?? "") + (e.stderr ?? ""); }
  check("scan-assembler-refuses-to-emit-malformed (Phase 5b)",
    code === 1 && /MALFORMED/.test(out),
    `the assembler emitted an envelope that violates its own schema; exit ${code}:\n${out}`);
});

// --- sbom-diff-counts --------------------------------------------------------

{
  const read = (f) => JSON.parse(readFileSync(join(ROOT, "fixtures/sbom", f), "utf8"));
  const d = diff({ base: read("base.json"), head: read("head.json"), baseSca: read("base.sca.json"), headSca: read("head.sca.json") });
  check("sbom-diff-counts (added/removed by purl)",
    d.added.total === 4 && d.removed.total === 2,
    `added ${d.added.total} (expected 4), removed ${d.removed.total} (expected 2)`);
  check("sbom-diff-counts (direct vs transitive attribution)",
    d.added.direct === 1 && d.added.transitive === 3,
    `direct ${d.added.direct} (expected 1), transitive ${d.added.transitive} (expected 3)`);
  check("sbom-diff-counts (name-level view)",
    d.names.added.length === 3 && d.names.removed.length === 2 && d.names.revved.length === 1,
    `names +${d.names.added.length}/-${d.names.removed.length}/rev ${d.names.revved.length}, expected 3/2/1`);
  const byKey = Object.fromEntries(d.deltas.map((x) => [x.key, x.delta]));
  check("sbom-diff-counts (install-script and maintainer deltas)",
    byKey.packagesWithInstallScripts === 6 && byKey.distinctMaintainers === 31,
    `install-script delta ${byKey.packagesWithInstallScripts} (expected 6), maintainers ${byKey.distinctMaintainers} (expected 31)`);

  const noSca = diff({ base: read("base.json"), head: read("head.json") });
  check("sbom-diff (an unmeasured delta is null, not zero)",
    noSca.deltas.every((x) => x.delta === null),
    "a missing behavioural scan rendered as 'no change', which is a false green");
}

// --- the generated gitleaks ruleset ------------------------------------------

{
  const { toml, count } = generate(ROOT);
  const spec = JSON.parse(readFileSync(join(ROOT, "schemas/secret-patterns.json"), "utf8"));
  check("gitleaks-config-generated-from-the-one-ruleset",
    count === spec.patterns.length && spec.patterns.every((p) => toml.includes(`id = "mist-${p.id}"`)),
    `generated ${count} rules from ${spec.patterns.length} patterns -- the gitleaks ruleset must not fork schemas/secret-patterns.json`);
  check("gitleaks-config-has-no-allowlist",
    !toml.split("\n").some((l) => /^\s*\[\[?allowlist/.test(l)),
    "the generator emitted an allowlist section");
  check("gitleaks-config-is-additive",
    /useDefault = true/.test(toml),
    "the generated config replaces gitleaks' default rules instead of extending them");
  check("gitleaks-config-finds-the-K1-shape",
    /\\b\[a-f0-9\]\{32\}\\b/.test(toml),
    "the 32-hex openweather rule is missing -- gitleaks would never find K1 (docs/KEY_ROTATION.md)");

  let threw = null;
  try { toRe2({ id: "test-lookahead", regex: "foo(?!bar)", flags: "" }); } catch (e) { threw = e.message; }
  check("gitleaks-config-rejects-re2-unsupported",
    threw !== null && /RE2/.test(threw),
    "a pattern using negative lookahead was translated anyway -- gitleaks would silently never fire that rule");
}

// --- licences ----------------------------------------------------------------

{
  const cases = [["MIT", "permissive"], ["GPL-3.0-only", "strong-copyleft"], ["MPL-2.0", "weak-copyleft"],
                 [null, "unknown"], ["UNLICENSED", "unknown"], ["MIT OR GPL-3.0-only", "strong-copyleft"],
                 ["(MIT OR Apache-2.0)", "permissive"], ["SomeNovelLicense", "unknown"]];
  const wrong = cases.filter(([i, e]) => classify(i) !== e).map(([i, e]) => `${JSON.stringify(i)} -> ${classify(i)}, expected ${e}`);
  check("license-obligation-classes", wrong.length === 0, wrong.join("; "));
  check("license-compound-takes-the-strictest",
    classify("MIT OR GPL-3.0-only") === "strong-copyleft",
    "an OR expression was scored by its most convenient term, not the obligation actually on the tree");
  check("license-inventory-refuses-an-empty-answer",
    inventory(mkdtempSync(join(tmpdir(), "mist-nolm-"))) === null,
    "an inventory with no node_modules returned data instead of null -- an empty inventory reads as 'no obligations'");
}

// --- the CI mapping table itself ---------------------------------------------

{
  const overlap = Object.entries(CI_MAP).flatMap(([s, spec]) => spec.unmapped.filter((t) => spec.map[t]).map((t) => `${s}/${t}`));
  check("ci-map-no-type-both-mapped-and-unmapped", overlap.length === 0,
    `type(s) declared in both map and unmapped: ${overlap.join(", ")}`);
}

for (const d of temps) rmSync(d, { recursive: true, force: true });

if (failed) { console.log("\ntest-scan: FAILED"); process.exit(1); }
console.log("\ntest-scan: all assertions pass");
