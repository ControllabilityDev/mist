#!/usr/bin/env node
/**
 * The paired mutation exhibit (EPIC-09, Gold Standard).
 *
 * The EPIC's exit criterion 7: "A real behavior change in derive.ts breaks a
 * kernel test with no mock updates; the equivalent change on `main` leaves its
 * suite green. Both demonstrated, both recorded."
 *
 * This is that demonstration, as a command rather than a sentence. It applies
 * the SAME semantic change to both architectures, runs each suite, restores
 * both files, and verifies the restoration by hash.
 *
 * WHY THIS IS THE STRONGEST ARTIFACT IN THE PROJECT. Package counts are easy to
 * argue with -- a reviewer can always say the dependencies were doing real work.
 * This is not arguable. Two suites, one behaviour change, one of them notices.
 * `main`'s tests open with `jest.mock('axios')` and assert on rendered HTML
 * produced from a payload we wrote ourselves, so they test our belief about the
 * provider rather than the rule. The rule is a `const` inside a component body
 * and nothing can reach it.
 *
 * NOTHING IS LEFT MUTATED. Restoration runs in a finally block and is checked by
 * SHA-256; a failed restore is reported loudly and exits non-zero.
 *
 * Zero dependencies.  Usage: node scripts/mutation-exhibit.mjs [--json]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/**
 * The mutation. Semantically identical on both sides: a reader at 33 degrees
 * stops being told to dress for it. Not a typo, not a refactor -- a change any
 * user would notice and no reviewer would approve.
 */
//
// EACH ANCHOR MUST MATCH THE CODE, NOT THE PROSE ABOUT IT. The first draft of
// this file used the bare expression `feelsLike > 32 || feelsLike < -5`, which
// appears TWICE in derive.ts: once in the doc comment citing main's line, and
// once in the rule. String.replace takes the first match, so it edited the
// comment, the kernel suite passed, and the exhibit reported that `pure` could
// not see the change either -- a false result, in this project's own favour.
// The anchors below are whole statements, and applyOnce() refuses any anchor
// that does not occur exactly once.
const MUTATIONS = [
  {
    side: "main",
    file: "apps/web/app/dashboard/CurrentConditions.tsx",
    from: "const feelsHarsh = feelsLike > 32 || feelsLike < -5;",
    to: "const feelsHarsh = feelsLike > 35 || feelsLike < -5;",
    run: () => spawnSync("npx", ["jest"], { cwd: join(ROOT, "apps/web"), encoding: "utf8" }),
  },
  {
    side: "pure",
    file: "packages/kernel/src/derive.ts",
    from: 'return feelsLike > 32 || feelsLike < -5 ? "harsh" : "ordinary";',
    to: 'return feelsLike > 35 || feelsLike < -5 ? "harsh" : "ordinary";',
    run: () => spawnSync(process.execPath, ["--test", "packages/kernel/test/"], { cwd: ROOT, encoding: "utf8" }),
  },
];

/**
 * Replace an anchor that occurs EXACTLY once, or refuse.
 *
 * An exhibit that silently mutates the wrong occurrence produces a confident,
 * wrong answer -- which is worse than an error, because nobody re-checks a
 * result that agrees with them.
 */
export function applyOnce(body, from, to, file) {
  const occurrences = body.split(from).length - 1;
  if (occurrences !== 1)
    throw new Error(`${file}: the anchor occurs ${occurrences} time(s), expected exactly 1 -- refusing to guess which one is the rule.\n  anchor: ${from}`);
  return body.replace(from, to);
}

/**
 * Run one side and return { suitePassed, output }.
 *
 * BOTH STREAMS ARE CAPTURED. jest prints its "Tests: 13 passed" summary to
 * STDERR, so reading stdout alone left the `main` row of this exhibit with no
 * evidence under it -- the one row a sceptical reader most wants to see.
 */
function runSuite(m) {
  const r = m.run();
  return { suitePassed: r.status === 0, output: (r.stdout ?? "") + (r.stderr ?? "") };
}

export function exhibit() {
  const results = [];
  for (const m of MUTATIONS) {
    const path = join(ROOT, m.file);
    const before = readFileSync(path, "utf8");
    const beforeHash = sha(path);


    let restored = false;
    try {
      const mutated = applyOnce(before, m.from, m.to, m.file);
      writeFileSync(path, mutated);
      const { suitePassed, output } = runSuite(m);
      results.push({
        side: m.side, file: m.file, mutation: `${m.from}  ->  ${m.to}`,
        // A suite that still passes did NOT notice a real behaviour change.
        noticed: !suitePassed,
        summary: (output.match(/^(?:Tests:|Test Suites:).*$|^.\s+(?:tests|pass|fail)\s+\d+$/gm) ?? [])
          .map((x) => x.trim()).slice(0, 4),
      });
    } finally {
      writeFileSync(path, before);
      restored = sha(path) === beforeHash;
    }
    if (!restored) throw new Error(`FAILED TO RESTORE ${m.file} -- the working tree is now mutated. Restore it before committing.`);
    results[results.length - 1].restored = true;
  }
  return results;
}

function main(argv) {
  const results = exhibit();
  if (argv.includes("--json")) { process.stdout.write(JSON.stringify(results, null, 2) + "\n"); return; }

  console.log("mutation-exhibit (EPIC-09 Gold Standard)\n");
  console.log("  One behaviour change, applied to both architectures:");
  console.log(`  ${MUTATIONS[0].from}  ->  ${MUTATIONS[0].to}`);
  console.log("  A reader at 33 degrees stops being warned.\n");
  for (const r of results) {
    console.log(`  ${r.side.padEnd(6)} ${r.noticed ? "CAUGHT  the suite failed" : "MISSED  the suite stayed green"}`);
    for (const s of r.summary) console.log(`         ${s}`);
    console.log(`         ${r.file} restored`);
  }
  const missed = results.filter((r) => !r.noticed).map((r) => r.side);
  console.log(`\n  ${missed.length ? `${missed.join(", ")} cannot see this change.` : "both suites caught it."}`);
  // Exit 0 either way. This REPORTS a property of two architectures; it is not
  // a gate, and `main` missing the mutation is the expected, documented result.
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
