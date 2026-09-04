/**
 * Raw measurement, separated from scoring (EPIC-06 Phase 1d: each axis module is
 * pure, `(measures) => score`). This file does the impure part -- reading the
 * repository -- so the axis modules can be unit-tested against their anchor
 * tables without a filesystem.
 *
 * Zero dependencies. Node builtins only. A tool that measures dependency surface
 * must not have one; if it scored badly on its own metric the metric would be a
 * joke (EPIC-06 Scope rule 3).
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * A1: distinct name@version in the resolved tree, from package-lock.json.
 *
 * WHY THE LOCKFILE AND NOT node_modules. Four defensible counts of the same tree
 * differ by 141 packages (docs/MIST_INDEX.md). The lockfile is committed, so
 * anyone can recompute this without installing -- and a metric you cannot
 * recompute is not a metric. Distinct name@version rather than distinct name,
 * because a package present at two versions is two artifacts, from two publish
 * events, that you trust.
 *
 * Workspace links are excluded: they are this repository's own code.
 */
export function surface(root) {
  const file = join(root, "package-lock.json");
  if (!existsSync(file)) return { ok: false, why: "no package-lock.json -- run npm install, or this is not an npm project" };
  const lock = JSON.parse(readFileSync(file, "utf8"));
  const seen = new Set();
  for (const [p, meta] of Object.entries(lock.packages ?? {})) {
    if (!p.startsWith("node_modules/")) continue;
    if (meta.link) continue;
    seen.add(`${p.split("node_modules/").pop()}@${meta.version}`);
  }
  return { ok: true, value: seen.size, detail: `from package-lock.json, workspace links excluded` };
}

/**
 * A2: packages declaring an install hook.
 *
 * Read from node_modules, because the hook is declared in the package's own
 * manifest and the lockfile does not carry it. That makes A2 require an install,
 * which is a real asymmetry with A1 and is reported rather than smoothed over.
 */
export function installExecution(root) {
  const nm = join(root, "node_modules");
  if (!existsSync(nm)) return { ok: false, why: "no node_modules -- A2 needs an installed tree, unlike A1" };
  const hooks = ["preinstall", "install", "postinstall"];
  const found = [];
  let inspected = 0;
  const walk = (dir) => {
    let entries; try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === ".bin" || name === ".package-lock.json") continue;
      const d = join(dir, name);
      if (!statSync(d, { throwIfNoEntry: false })?.isDirectory()) continue;
      if (name.startsWith("@")) { walk(d); continue; }
      const pj = join(d, "package.json");
      if (existsSync(pj)) {
        inspected++;
        try {
          const pkg = JSON.parse(readFileSync(pj, "utf8"));
          const declared = hooks.filter((h) => pkg.scripts?.[h]);
          if (declared.length) found.push(`${pkg.name}@${pkg.version} [${declared.join(",")}]`);
        } catch { /* unparseable manifest: not counted, and not silently a zero either */ }
      }
      if (existsSync(join(d, "node_modules"))) walk(join(d, "node_modules"));
    }
  };
  walk(nm);
  return { ok: true, value: found.length, detail: `${found.length} of ${inspected} packages inspected`, names: found };
}

/**
 * A3: import-time network or filesystem reach.
 *
 * NOT IMPLEMENTED, AND NOT ZERO. Detecting this needs a behavioural SCA that
 * actually loads or statically analyses every package; EPIC-03 Phase 2a never
 * wired one. Returning 0 would assert "this tree performs no import-time network
 * access", which nobody has checked and which is probably false.
 *
 * If a scan-run.json with a behavioural scanner appears, this reads it.
 */
export function importReach(root) {
  const file = join(root, "scan-run.json");
  if (!existsSync(file)) return { ok: false, why: "no scan-run.json; and no behavioural SCA is wired (EPIC-03 Phase 2a)" };
  const env = JSON.parse(readFileSync(file, "utf8"));
  const sca = env.scanners?.find((s) => s.id === "sca-behavioral");
  if (!sca || sca.status !== "ran")
    return { ok: false, why: `scan-run.json exists but sca-behavioral is "${sca?.status ?? "absent"}"` };
  const n = env.surface?.packagesWithNetworkAtImport;
  if (!Number.isInteger(n)) return { ok: false, why: "sca-behavioral ran but reported no packagesWithNetworkAtImport" };
  return { ok: true, value: n, detail: "from scan-run.json surface.packagesWithNetworkAtImport" };
}

/**
 * A4: mean packages added+removed per merged PR, trailing 90 days.
 *
 * Approximated from commits touching package-lock.json, because this repository
 * has no merged-PR history to read. The approximation is REPORTED, not hidden:
 * it is a different measure and calling it the same one would be dishonest.
 */
export function churn(root, days = 90) {
  const git = (args) => {
    try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return null; }
  };
  // NOT `--reverse --max-count=1`: git applies max-count BEFORE reverse, so that
  // returns the NEWEST commit and the repository always looks 0 days old. The
  // bug is silent -- it reports "insufficient history" forever, which is the
  // answer you were expecting, so nobody checks it.
  const all = git(["log", "--format=%at"]);
  if (!all) return { ok: false, why: "not a git repository" };
  const first = all.split("\n").filter(Boolean).pop();
  const ageDays = Math.floor((Date.now() / 1000 - Number(first)) / 86400);
  if (ageDays < days)
    return { ok: false, insufficient: true, why: `history is ${ageDays} day(s); the window needs ${days}` };

  const shas = (git(["log", `--since=${days}.days`, "--format=%H", "--", "package-lock.json"]) ?? "").split("\n").filter(Boolean);
  if (!shas.length) return { ok: false, insufficient: true, why: `no package-lock.json changes in the trailing ${days} days` };
  return { ok: true, value: shas.length, detail: `${shas.length} lockfile-touching commit(s) in ${days} days -- an APPROXIMATION of per-PR churn` };
}

/** A5: mean days between red battery states. Needs EPIC-04's telemetry record. */
export function redState(root, days = 180) {
  const file = join(root, "telemetry", "index.json");
  if (!existsSync(file)) return { ok: false, why: "no telemetry/index.json -- EPIC-04 is not built" };
  const t = JSON.parse(readFileSync(file, "utf8"));
  const reds = (t.runs ?? []).filter((r) => r.red).map((r) => Date.parse(r.at)).sort();
  if (reds.length < 2) return { ok: false, insufficient: true, why: `${reds.length} red state(s) recorded; a mean interval needs at least 2` };
  const gaps = reds.slice(1).map((x, i) => (x - reds[i]) / 86400000);
  return { ok: true, value: gaps.reduce((a, b) => a + b, 0) / gaps.length, detail: `${reds.length} red state(s) in ${days} days` };
}
