#!/usr/bin/env node
/**
 * Tests for the paired-refactor measurement (EPIC-09 Phase 0).
 *
 * The comparison between `main` and `pure` is only worth reading if both sides
 * were measured by the SAME instrument. That instrument is branch-metrics.mjs,
 * and these tests pin the two properties that would quietly ruin the comparison:
 * an unmeasured figure must never read as zero, and first-party code must mean
 * the specimen, not Mist's own tooling.
 *
 * Zero dependencies.  Usage: node scripts/test-paired.mjs
 */

import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { metrics, FIRST_PARTY_ROOTS } from "./branch-metrics.mjs";
import { checkPure } from "./check-pure.mjs";
import { applyOnce } from "./mutation-exhibit.mjs";
import { cpSync, readFileSync, appendFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const pass = (n) => console.log(`  ok    ${n}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));
const temps = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); temps.push(d); return d; };

console.log("test-paired (EPIC-09 Phase 0)\n");

// --- paired-unmeasured-is-null ------------------------------------------------
//
// The single most dangerous failure mode in a before/after table. If `pure` is
// measured with an envelope and `main` without one, and the missing figures read
// as 0, the refactor appears to have removed findings it never touched. Absence
// must stay distinguishable from zero, exactly as it is in EPIC-03's surface.
{
  const m = metrics({ root: ROOT, scanRun: null });
  const zeroed = ["packagesWithInstallScripts", "packagesWithNetworkAtImport",
                  "firstPartyFindings", "secondPartyFindings"]
    .filter((k) => m[k] === 0);
  check("paired-unmeasured-is-null (never zero)",
    zeroed.length === 0 && m.packagesWithInstallScripts === null,
    `read as 0 with no envelope: ${zeroed.join(", ")} -- 0 findings is a CLAIM, absence is a FACT`);
}

// --- paired-reads-the-envelope ------------------------------------------------
{
  const dir = tmp("paired-env-");
  const file = join(dir, "scan-run.json");
  writeFileSync(file, JSON.stringify({
    schemaVersion: "1",
    surface: { packagesWithInstallScripts: 6, packagesWithNetworkAtImport: 15, packagesWithNetworkAtInstall: 2 },
    scanners: [
      { id: "sca-behavioral", status: "ran", findings: [{ party: "second" }, { party: "second" }] },
      { id: "semgrep", status: "ran", findings: [{ party: "first" }] },
    ],
  }));
  const m = metrics({ root: ROOT, scanRun: file });
  check("paired-reads-the-envelope (surface counts)",
    m.packagesWithInstallScripts === 6 && m.packagesWithNetworkAtImport === 15,
    `got ${JSON.stringify({ i: m.packagesWithInstallScripts, n: m.packagesWithNetworkAtImport })}`);
  check("paired-reads-the-envelope (findings split by party)",
    m.secondPartyFindings === 2 && m.firstPartyFindings === 1,
    `got second=${m.secondPartyFindings} first=${m.firstPartyFindings}`);
}

// --- paired-first-party-is-the-specimen --------------------------------------
//
// "Lines of first-party code" is the row expected to favour `main`, because
// hand-written parsing costs code a library would have supplied. It only means
// that if it counts the APPLICATION. Counting scripts/ and tools/ would fold
// Mist's measuring apparatus into the specimen -- and both branches carry the
// same apparatus, so it would dilute the very row it is meant to expose.
{
  check("paired-first-party-is-the-specimen (tooling is not the specimen)",
    !FIRST_PARTY_ROOTS.some((r) => /^(scripts|tools|site)/.test(r)),
    `FIRST_PARTY_ROOTS includes Mist's own instrument: ${FIRST_PARTY_ROOTS.join(", ")}`);

  const dir = tmp("paired-loc-");
  mkdirSync(join(dir, "apps/web"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "apps/web/node_modules/x"), { recursive: true });
  writeFileSync(join(dir, "apps/web/a.ts"), "one\ntwo\nthree\n");
  writeFileSync(join(dir, "scripts/big.mjs"), Array(500).fill("x").join("\n"));
  writeFileSync(join(dir, "apps/web/node_modules/x/v.js"), Array(500).fill("x").join("\n"));
  const m = metrics({ root: dir, scanRun: null });
  check("paired-first-party-is-the-specimen (counts apps/, skips scripts/ and node_modules/)",
    m.firstPartyLines === 3,
    `counted ${m.firstPartyLines} lines, expected 3`);
}

// --- paired-index-verdict-is-recorded ----------------------------------------
//
// NOT COMPUTABLE is a RESULT, not a blank. It must travel into the table with
// the axes that blocked it named, or a reader assumes the row was forgotten.
{
  const m = metrics({ root: ROOT, scanRun: null });
  check("paired-index-verdict-is-recorded (a blocked index names its axes)",
    m.mistIndex.value === null && Array.isArray(m.mistIndex.missing) && m.mistIndex.missing.length > 0,
    `mistIndex came back ${JSON.stringify(m.mistIndex)}`);
}

// --- the mutation exhibit refuses an ambiguous anchor -------------------------
//
// The first draft of mutation-exhibit.mjs anchored on the bare expression
// `feelsLike > 32 || feelsLike < -5`, which appears twice in derive.ts: once in
// the doc comment citing main's line, once in the rule. String.replace takes the
// first, so it edited the COMMENT, the kernel suite passed, and the exhibit
// reported that `pure` could not see the change either.
//
// That failure was confident and wrong and flattered nobody -- but the same bug
// with the sides reversed would have produced a result in this project's favour
// that nobody would have re-checked. Hence a guard, and hence this test.

{
  const body = "// cites: return x > 32;\nexport const f = () => { return x > 32; };\n";

  let threw = null;
  try { applyOnce(body, "return x > 32;", "return x > 35;", "derive.ts"); }
  catch (e) { threw = e; }
  check("mutation-anchor-refuses-an-ambiguous-match",
    threw !== null && /occurs 2 time\(s\)/.test(threw.message),
    threw ? `threw the wrong error: ${threw.message}` : "applyOnce silently mutated one of two matches -- it cannot know which one is the rule");

  let missing = null;
  try { applyOnce(body, "return y > 32;", "return y > 35;", "derive.ts"); }
  catch (e) { missing = e; }
  check("mutation-anchor-refuses-a-vanished-rule",
    missing !== null && /occurs 0 time\(s\)/.test(missing.message),
    "an anchor that no longer exists must fail loudly: the rule was renamed and the exhibit is measuring nothing");

  const once = "export const f = () => { return x > 32; };\n";
  check("mutation-anchor-applies-a-unique-match",
    applyOnce(once, "return x > 32;", "return x > 35;", "derive.ts").includes("x > 35"),
    "a unique anchor must still apply");
}

// --- gold standard: every purity assertion must be able to say NO ------------
//
// check-pure passes on the tree as it stands, which proves nothing on its own.
// Each assertion is re-run here against a COPY broken in the exact way that
// assertion exists to catch. Nothing below mutates the repository.

{
  const verdict = (root, name) => (checkPure(root).find((r) => r.name === name) ?? { ok: null });

  const brokenCopy = (mutate) => {
    const dir = tmp("pure-broken-");
    cpSync(join(ROOT, "packages"), join(dir, "packages"), { recursive: true });
    mutate(dir);
    return dir;
  };

  const cases = [
    ["pure-kernel-zero-deps", "a runtime dependency", (d) => {
      const f = join(d, "packages/kernel/package.json");
      const pkg = JSON.parse(readFileSync(f, "utf8"));
      pkg.dependencies = { axios: "^1.20.0" };
      writeFileSync(f, JSON.stringify(pkg, null, 2));
    }],
    ["pure-kernel-zero-dev-deps", "a test-runner dependency", (d) => {
      const f = join(d, "packages/kernel/package.json");
      const pkg = JSON.parse(readFileSync(f, "utf8"));
      pkg.devDependencies = { jest: "^30.0.0" };
      writeFileSync(f, JSON.stringify(pkg, null, 2));
    }],
    ["pure-kernel-no-io", "an import of node:fs", (d) => {
      appendFileSync(join(d, "packages/kernel/src/derive.ts"), '\nimport { readFileSync } from "node:fs";\n');
    }],
    ["pure-kernel-no-io", "a read of the clock", (d) => {
      appendFileSync(join(d, "packages/kernel/src/derive.ts"), "\nexport const nowish = () => Date.now();\n");
    }],
    ["pure-kernel-no-io", "a read of the environment", (d) => {
      appendFileSync(join(d, "packages/kernel/src/derive.ts"), "\nexport const url = process.env.WEATHER_PROVIDER_URL;\n");
    }],
    ["pure-wire-names-confined-to-parse", "the wire spelling leaking out of parse.ts", (d) => {
      appendFileSync(join(d, "packages/kernel/src/derive.ts"), "\nexport const harshFromWire = (w) => w.feels_like > 32;\n");
    }],
    ["pure-fakes-no-mocks", "a mocking library in the kernel suite", (d) => {
      appendFileSync(join(d, "packages/kernel/test/derive.test.ts"), '\njest.mock("../src/derive.ts");\n');
    }],
  ];

  for (const [name, label, mutate] of cases) {
    const r = verdict(brokenCopy(mutate), name);
    check(`gold-standard-${name} (${label})`,
      r.ok === false,
      `check-pure still passed ${name} with ${label} present -- the assertion cannot fail, so it is a decoration`);
  }

  // And the inverse: the unbroken tree must pass, or the cases above prove
  // only that the checker is broken.
  const clean = checkPure(ROOT);
  check("gold-standard-check-pure-passes-the-real-tree",
    clean.every((r) => r.ok),
    `check-pure failed on the repository itself: ${clean.filter((r) => !r.ok).map((r) => r.name).join(", ")}`);
}

for (const d of temps) rmSync(d, { recursive: true, force: true });
console.log(failed ? "\ntest-paired: FAILED" : "\ntest-paired: all assertions pass");
process.exit(failed);
