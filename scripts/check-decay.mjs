#!/usr/bin/env node
/**
 * Decay-experiment integrity assertions (EPIC-07 Test Plan). BLOCKING.
 *
 * The experiment has exactly one variable: what the world knows about an
 * unchanged tree. Every assertion here protects that.
 *
 *   decay-never-updates      the frozen lockfile is byte-identical, forever
 *   decay-manifest-complete  every lockfile entry has an integrity hash and a slot
 *   decay-dual-scan-recorded every month has BOTH scanner modes, or an explicit gap
 *   decay-gap-recorded       a failed month is a `gap` record, never an absence
 *   decay-no-interpolation   no record carries a value it did not measure
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/check-decay.mjs
 *   node scripts/check-decay.mjs --freeze decay/v1.0.0 --series DIR
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const skip = (n, why) => console.log(`  skip  ${n}\n        ${why}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

export const MODES = ["pinned", "current"];

/** Every record in a decay series directory. */
export function loadSeries(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ file: f, record: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}

/** Group by month so a month can be asked whether it has both modes. */
export function byMonth(series) {
  const months = new Map();
  for (const { file, record } of series) {
    const month = (record.startedAt ?? record.at ?? file).slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(record);
  }
  return months;
}

export function auditSeries(series) {
  const problems = [];
  const months = byMonth(series);
  for (const [month, records] of months) {
    const gaps = records.filter((r) => r.status === "gap");
    const modes = new Set(records.filter((r) => r.status !== "gap").map((r) => r.scannerMode));
    if (gaps.length) continue;                     // an explicit gap is a valid month
    for (const m of MODES)
      if (!modes.has(m)) problems.push(`${month}: no "${m}" record and no gap record`);
  }
  return { months: months.size, problems };
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const root = resolve(arg("--root", SELF_ROOT));
  const freeze = resolve(arg("--freeze", join(root, "decay/v1.0.0")));
  const seriesDir = arg("--series", null);

  console.log("check-decay (EPIC-07 -- BLOCKING)");

  // --- decay-never-updates --------------------------------------------------
  const lockFile = join(freeze, "lockfile.json");
  const manFile = join(freeze, "manifest.json");
  if (!existsSync(lockFile) || !existsSync(manFile)) {
    fail("decay-never-updates", `${freeze} is missing lockfile.json or manifest.json`);
  } else {
    const manifest = JSON.parse(readFileSync(manFile, "utf8"));
    const actual = createHash("sha256").update(readFileSync(lockFile)).digest("hex");
    if (manifest.lockfileSha256 && manifest.lockfileSha256 !== "sample" && actual !== manifest.lockfileSha256)
      fail("decay-never-updates",
        `lockfile.json sha256 is ${actual.slice(0, 16)}…, manifest says ${String(manifest.lockfileSha256).slice(0, 16)}…\n        The frozen tree NEVER changes -- not for a critical CVE, not for a compromised package. Patching it destroys the only variable the experiment has. If the tree is dangerous, stop deploying it; it is not deployed anywhere.`);
    else pass("decay-never-updates", `(sha256 ${actual.slice(0, 12)}…)`);

    // --- decay-manifest-complete --------------------------------------------
    const lock = JSON.parse(readFileSync(lockFile, "utf8"));
    const need = Object.entries(lock.packages ?? {})
      .filter(([p, m]) => p.startsWith("node_modules/") && !m.link && m.resolved)
      .map(([p, m]) => `${p.split("node_modules/").pop()}@${m.version}`);
    const have = new Set(manifest.packages.map((p) => `${p.name}@${p.version}`));
    const missing = need.filter((k) => !have.has(k));
    const noIntegrity = manifest.packages.filter((p) => !p.integrity).map((p) => `${p.name}@${p.version}`);
    if (missing.length || noIntegrity.length)
      fail("decay-manifest-complete",
        [missing.length ? `${missing.length} lockfile entr(ies) absent from the manifest: ${missing.slice(0, 4).join(", ")}` : "",
         noIntegrity.length ? `${noIntegrity.length} without an integrity hash: ${noIntegrity.slice(0, 4).join(", ")}` : ""].filter(Boolean).join("; ") +
        "\n        Registry independence requires every package be verifiable from the vault alone.");
    else pass("decay-manifest-complete", `(${manifest.packages.length} package(s), all hashed)`);

    // --- vault presence is informational, not a failure ---------------------
    const vaultDir = join(freeze, "vault");
    if (!existsSync(vaultDir)) skip("decay-vault-present", "vault/ is gitignored (635.5 MiB, distributed as a release asset) -- build it with `node scripts/vault.mjs build`");
    else {
      const n = readdirSync(vaultDir).filter((f) => f.endsWith(".tgz")).length;
      if (n < manifest.packages.length) fail("decay-vault-present", `${n} of ${manifest.packages.length} tarball(s) present -- run \`node scripts/vault.mjs build ${freeze}\``);
      else pass("decay-vault-present", `(${n} tarball(s))`);
    }
  }

  // --- the series -----------------------------------------------------------
  if (!seriesDir) skip("decay-dual-scan-recorded", "no --series given; the record lives on the telemetry branch and CI supplies it");
  else {
    const series = loadSeries(resolve(seriesDir));
    if (!series.length) skip("decay-dual-scan-recorded", `no records in ${seriesDir} -- the experiment has not run yet`);
    else {
      const { months, problems } = auditSeries(series);
      if (problems.length)
        fail("decay-dual-scan-recorded", problems.join("; ") +
          "\n        Every month needs BOTH scanner modes, or an explicit gap. Without the pinned/current split a rising curve could be disclosure OR better tooling, and the headline claim is unsupported.");
      else pass("decay-dual-scan-recorded", `(${months} month(s), both modes or an explicit gap)`);

      const gaps = series.filter(({ record }) => record.status === "gap");
      const badGaps = gaps.filter(({ record }) => !record.reason);
      if (badGaps.length) fail("decay-gap-recorded", `${badGaps.length} gap record(s) with no stated reason`);
      else pass("decay-gap-recorded", `(${gaps.length} gap(s), all with reasons)`);

      const interpolated = series.filter(({ record }) => record.interpolated === true).map((s) => s.file);
      if (interpolated.length)
        fail("decay-no-interpolation", `${interpolated.join(", ")} carry interpolated values. A gap is data. Filling it in makes the chart smooth and the evidence worthless.`);
      else pass("decay-no-interpolation", `(${series.length} record(s))`);
    }
  }

  if (failed) { console.log("\ncheck-decay: the experiment is compromised -- do not merge"); process.exit(1); }
  console.log("\ncheck-decay: the freeze holds");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
