#!/usr/bin/env node
/**
 * Measures ONE branch for the paired refactor (EPIC-09 Phase 0b).
 *
 * The EPIC's whole claim is a before/after on the same domain, so the two sides
 * must be measured by the same instrument on the same day. This is that
 * instrument. `main` is measured BEFORE any `pure` code is written, so the
 * baseline cannot drift toward the answer we are hoping for.
 *
 * NULL MEANS NOT MEASURED, NEVER ZERO. Inherited from EPIC-03's surface, and it
 * matters more here than anywhere else in the repository: if `main` is measured
 * without an envelope and `pure` with one, zeros would show the refactor
 * removing findings it never touched. That is not a rounding error, it is a
 * fabricated result. Absence stays absence.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/branch-metrics.mjs [DIR] [--scan-run FILE] [--out FILE]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join, extname } from "node:path";
import { run as indexRun } from "../tools/mist-index/bin/mist-index.mjs";
import { isMain } from "./lib/is-main.mjs";

/**
 * What counts as the SPECIMEN.
 *
 * `scripts/`, `tools/` and `site/` are Mist's measuring apparatus, not the
 * application under test. Both branches carry the same apparatus, so folding it
 * in would dilute "lines of first-party code" -- the one row expected to favour
 * `main`, and therefore the row most worth protecting from flattery.
 */
export const FIRST_PARTY_ROOTS = ["apps", "packages"];

const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".git", "coverage"]);

/** Lines of first-party code, tests excluded -- they are measured on their own row. */
function firstPartyLines(root) {
  let lines = 0;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(p); continue; }
      if (!CODE.has(extname(e.name))) continue;
      if (/\.(test|spec)\.[tj]sx?$/.test(e.name)) continue;
      try { lines += readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length; } catch { /* unreadable is not zero-length, but it is not countable either */ }
    }
  };
  for (const r of FIRST_PARTY_ROOTS) if (existsSync(join(root, r))) walk(join(root, r));
  return lines;
}

/** Every distinct name@version in the lockfile. null when there is no lockfile. */
function lockfilePackages(root) {
  const f = join(root, "package-lock.json");
  if (!existsSync(f)) return null;
  try {
    const pkgs = JSON.parse(readFileSync(f, "utf8")).packages ?? {};
    return Object.keys(pkgs).filter((k) => k.startsWith("node_modules/")).length;
  } catch { return null; }
}

const git = (root, args) => {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; }
  catch { return null; }
};

export function metrics({ root, scanRun = null, measuredAt = null }) {
  const envelope = scanRun && existsSync(scanRun)
    ? JSON.parse(readFileSync(scanRun, "utf8"))
    : null;

  // A scanner that did not run reports nothing. Counting findings across a
  // crashed battery would understate the branch that happened to crash.
  const ran = envelope ? (envelope.scanners ?? []).filter((s) => s.status === "ran") : null;
  const byParty = (p) => ran === null ? null : ran.flatMap((s) => s.findings ?? []).filter((f) => f.party === p).length;
  const surface = (k) => {
    const v = envelope?.surface?.[k];
    return Number.isInteger(v) ? v : null;
  };

  const idx = indexRun(root, { scanRun });

  return {
    schemaVersion: "1",
    measuredAt: measuredAt ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    target: root,
    branch: git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: git(root, ["rev-parse", "HEAD"]),
    scanRun: scanRun ?? null,

    lockfilePackages: lockfilePackages(root),
    packagesWithInstallScripts: surface("packagesWithInstallScripts"),
    packagesWithNetworkAtInstall: surface("packagesWithNetworkAtInstall"),
    packagesWithNetworkAtImport: surface("packagesWithNetworkAtImport"),
    // EPIC-03 never wired a maintainer count. Recorded as absent rather than
    // dropped from the table, because a missing ROW reads as an oversight and a
    // null CELL reads as a limit -- and it is a limit.
    distinctMaintainers: surface("distinctMaintainers"),

    firstPartyFindings: byParty("first"),
    secondPartyFindings: byParty("second"),
    firstPartyLines: firstPartyLines(root),

    mistIndex: {
      value: idx.composite.value,
      missing: idx.composite.missing,
      measuredWeight: idx.composite.measuredWeight,
      axes: Object.fromEntries(Object.entries(idx.axes).map(([k, v]) => [k, { state: v.state, raw: v.raw, score: v.score }])),
    },

    // Rows this instrument cannot fill. Phase 4 fills the first; the second
    // needs a build on each branch and is measured at comparison time.
    notMeasuredHere: [
      "tests that can fail on a real behavior change (EPIC-09 Phase 4d, mutation run)",
      "build time (measured at comparison time, same machine, same day)",
    ],
  };
}

function main(argv) {
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const scanRun = flag("--scan-run");
  const out = flag("--out");
  const positional = argv.filter((a, i) => !a.startsWith("--") && !["--scan-run", "--out"].includes(argv[i - 1]));
  const m = metrics({ root: resolve(positional[0] ?? "."), scanRun: scanRun ? resolve(scanRun) : null });
  const json = JSON.stringify(m, null, 2) + "\n";
  if (out) { writeFileSync(out, json); console.error(`branch-metrics: wrote ${out}`); }
  else process.stdout.write(json);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
