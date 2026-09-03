#!/usr/bin/env node
/**
 * Instrument-integrity assertions for the scan battery (EPIC-03 Test Plan).
 *
 * WHAT THIS DOES AND DOES NOT GUARD
 *
 * It never looks at whether the tree is clean. It looks at whether the
 * INSTRUMENT is honest: that no scan job can fail a build, that no suppression
 * file exists, that gitleaks sees full history, that a skipped scanner says why
 * it was skipped, and that no counter-invariant mapping was guessed.
 *
 * It runs inside scan.yml's `assemble` job, which is the one job in that file
 * that is not continue-on-error. That is not an exception to "scanners never
 * block" -- it is that rule applied to the measuring device. A red scan is
 * data; a broken instrument is a defect.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/check-scan.mjs                  # check this repository
 *   node scripts/check-scan.mjs --root DIR       # check a fixture tree
 *   node scripts/check-scan.mjs --envelope FILE  # also validate this envelope
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { validate, unsupportedKeywords } from "./lib/json-schema-subset.mjs";
import { parseJobs } from "./lib/yaml-jobs.mjs";
import { CI_MAP, SCANNER_IDS } from "./assemble-scan-run.mjs";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const skip = (n, why) => console.log(`  skip  ${n}\n        ${why}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

/** The only job in scan.yml permitted to block. See the file header. */
const BLOCKING_JOB = "assemble";

/** Files whose existence means someone is suppressing findings. */
const SUPPRESSION_FILES = [
  [".semgrepignore", "semgrep rule/path suppression"],
  [".gitleaks.toml", "a committed gitleaks config -- generate it from schemas/secret-patterns.json into build/ instead (scripts/gen-gitleaks-config.mjs)"],
  ["gitleaks.toml", "a committed gitleaks config"],
  [".gitleaksignore", "a gitleaks finding baseline -- it would hide K1"],
  ["gitleaks-baseline.json", "a gitleaks finding baseline"],
  ["audit-resolve.json", "an npm audit resolution allowlist"],
  [".nsprc", "an npm audit allowlist"],
  ["semgrep.yml", "a hand-rolled semgrep ruleset in place of the defaults"],
];

function checkJobsNonBlocking(root) {
  const name = "scan-jobs-nonblocking";
  const file = join(root, ".github/workflows/scan.yml");
  if (!existsSync(file)) return fail(name, `${file} does not exist`);

  const { jobs, order } = parseJobs(readFileSync(file, "utf8"));
  if (!order.length) return fail(name, "no jobs found -- the reader's indentation assumption broke (scripts/lib/yaml-jobs.mjs)");

  const blocking = order.filter((id) => id !== BLOCKING_JOB && !jobs[id].continueOnError);
  if (blocking.length)
    return fail(name, `job(s) can fail the build: ${blocking.join(", ")} -- a red scan is data, not a defect (docs/ROADMAP.md:48)`);

  if (jobs[BLOCKING_JOB]?.continueOnError)
    return fail(name, `${BLOCKING_JOB} sets continue-on-error -- a malformed envelope is a real defect and must block`);

  pass(name, `(${order.length - 1} non-blocking, ${BLOCKING_JOB} blocks on a broken instrument)`);
}

function checkNoSuppression(root) {
  const name = "scan-no-suppression";
  const found = SUPPRESSION_FILES.filter(([f]) => existsSync(join(root, f)));
  if (found.length)
    return fail(name, found.map(([f, why]) => `${f} exists (${why})`).join("; ") +
      " -- suppression is mitigation, and mitigation corrupts the measurement (EPIC-00 Scope rule 4)");

  // The generated ruleset must carry no allowlist either. A TOML section
  // header, not the word: the generator's own header comment mentions it.
  const gen = join(root, "build/gitleaks.mist.toml");
  if (existsSync(gen)) {
    const sections = readFileSync(gen, "utf8").split("\n").filter((l) => /^\s*\[\[?allowlist/.test(l));
    if (sections.length)
      return fail(name, `build/gitleaks.mist.toml has ${sections.length} allowlist section(s) -- the generator must never emit one`);
  }
  pass(name, `(${SUPPRESSION_FILES.length} path(s) checked, 0 allowlists)`);
}

function checkGitleaksFullHistory(root) {
  const name = "scan-gitleaks-full-history";
  const file = join(root, ".github/workflows/scan.yml");
  if (!existsSync(file)) return fail(name, "scan.yml does not exist");
  const { jobs } = parseJobs(readFileSync(file, "utf8"));
  const job = jobs.gitleaks;
  if (!job) return fail(name, "no gitleaks job in scan.yml");
  if (job.fetchDepth !== "0")
    return fail(name, `gitleaks checkout uses fetch-depth: ${job.fetchDepth ?? "(unset)"} -- a shallow clone misses K1 in history and reports a FALSE GREEN (docs/KEY_ROTATION.md)`);
  if (!/--log-opts=/.test(job.text))
    return fail(name, "gitleaks does not pass --log-opts= -- without it the scan may cover only the tip commit");
  pass(name, "(fetch-depth: 0, full log range)");
}

function checkSemgrepScope(root) {
  const name = "scan-semgrep-scope";
  const file = join(root, ".github/workflows/scan.yml");
  if (!existsSync(file)) return fail(name, "scan.yml does not exist");
  const { jobs } = parseJobs(readFileSync(file, "utf8"));
  const job = jobs.semgrep;
  if (!job) return fail(name, "no semgrep job in scan.yml");
  if (!/--exclude=node_modules/.test(job.text))
    return fail(name, "semgrep does not exclude node_modules -- second-party noise swamps the honest dozen and makes the first/second-party split unreadable");
  if (/\.semgrepignore/.test(job.text))
    return fail(name, "semgrep job references a .semgrepignore");
  pass(name, "(first-party paths, node_modules excluded)");
}

function checkCiMapDeclared(root) {
  const name = "scan-ci-map-ids-exist";
  const anti = join(root, "docs/ANTI_KERNEL.md");
  if (!existsSync(anti)) return fail(name, "docs/ANTI_KERNEL.md does not exist -- the CI-* join key has no source");
  const text = readFileSync(anti, "utf8");
  const known = new Set([...text.matchAll(/^\| (CI-[0-9]+) \|/gm)].map((m) => m[1]));
  if (!known.size) return fail(name, "no CI-* rows found in docs/ANTI_KERNEL.md");

  const bad = [];
  for (const [scanner, spec] of Object.entries(CI_MAP))
    for (const [type, id] of Object.entries(spec.map))
      if (!known.has(id)) bad.push(`${scanner}/${type} -> ${id}`);
  if (bad.length)
    return fail(name, `mapping(s) point at a CI id that is not in docs/ANTI_KERNEL.md: ${bad.join(", ")} -- renaming a counter-invariant breaks the join key`);

  const mapped = Object.values(CI_MAP).reduce((n, s) => n + Object.keys(s.map).length, 0);
  const unmapped = Object.values(CI_MAP).reduce((n, s) => n + s.unmapped.length, 0);
  pass(name, `(${mapped} mapped type(s), ${unmapped} declared unmapped, ${known.size} CI ids)`);
}

function checkSchemaKeywords(root) {
  const name = "scan-schema-keywords-supported";
  const problems = [];
  for (const f of ["schemas/scan-run.schema.json", "schemas/ledger.schema.json"]) {
    const file = join(root, f);
    if (!existsSync(file)) continue;
    const bad = unsupportedKeywords(JSON.parse(readFileSync(file, "utf8")));
    if (bad.length) problems.push(`${f}: ${bad.join(", ")}`);
  }
  if (problems.length)
    return fail(name, problems.join("; ") + " -- the subset validator SILENTLY ACCEPTS keywords it does not implement, so an unsupported keyword is an unenforced rule (scripts/lib/json-schema-subset.mjs)");
  pass(name);
}

function checkEnvelope(root, envelopeFile) {
  const name = "scan-envelope-valid";
  const file = envelopeFile ?? join(root, "scan-run.json");
  if (!existsSync(file)) return skip(name, `${file} not present -- nothing assembled in this working tree`);

  const schema = JSON.parse(readFileSync(join(SELF_ROOT, "schemas/scan-run.schema.json"), "utf8"));
  const envelope = JSON.parse(readFileSync(file, "utf8"));
  const errs = validate(envelope, schema, schema);
  if (errs.length) return fail(name, errs.slice(0, 5).join("\n        "));

  // Every one of the seven, present. A missing scanner is not a clean scanner.
  const ids = envelope.scanners.map((s) => s.id);
  const missing = SCANNER_IDS.filter((id) => !ids.includes(id));
  if (missing.length) return fail(name, `envelope omits scanner(s): ${missing.join(", ")}`);

  pass(name, `(${envelope.scanners.length} scanner(s), ${envelope.scanners.reduce((n, s) => n + s.findings.length, 0)} finding(s))`);

  // --- scan-skip-has-reason ---
  const n2 = "scan-skip-has-reason";
  const silent = envelope.scanners.filter((s) => s.status === "skipped" && !s.skipReason);
  if (silent.length)
    fail(n2, `skipped without a stated reason: ${silent.map((s) => s.id).join(", ")} -- a skip with no reason is indistinguishable from a clean run`);
  else pass(n2, `(${envelope.scanners.filter((s) => s.status === "skipped").length} skipped, all with reasons)`);

  // --- scan-ci-mapping-complete ---
  const n3 = "scan-ci-mapping-complete";
  const undeclared = envelope.scanners.flatMap((s) => (s.unmapped ?? []).filter((u) => u.startsWith("UNDECLARED:")).map((u) => `${s.id}: ${u.slice(11)}`));
  if (undeclared.length)
    fail(n3, `finding type(s) with neither a CI mapping nor a declared gap: ${undeclared.join(", ")} -- add to CI_MAP.map or CI_MAP.unmapped in scripts/assemble-scan-run.mjs. Silent nulls are guesses wearing a data type.`);
  else pass(n3, `(0 undeclared type(s))`);
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const root = resolve(arg("--root", SELF_ROOT));
  const envelope = arg("--envelope", null);

  console.log("check-scan (EPIC-03 instrument integrity)");
  checkJobsNonBlocking(root);
  checkNoSuppression(root);
  checkGitleaksFullHistory(root);
  checkSemgrepScope(root);
  checkCiMapDeclared(root);
  checkSchemaKeywords(root);
  checkEnvelope(root, envelope ? resolve(envelope) : null);

  if (failed) { console.log("\ncheck-scan: the instrument is not trustworthy"); process.exit(1); }
  console.log("\ncheck-scan: the instrument is honest");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
