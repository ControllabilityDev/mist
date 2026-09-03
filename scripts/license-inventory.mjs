#!/usr/bin/env node
/**
 * Full-tree license inventory, by OBLIGATION CLASS (EPIC-03 Phase 4d).
 *
 * "Obligations nobody read, accumulating in the same tree"
 * (docs/mist-concept-evaluation.md:58). A list of SPDX identifiers is not a
 * cost. A count of strong-copyleft, weak-copyleft and undeclared-licence
 * packages is a cost, and it is the number EPIC-04 should render.
 *
 * WHY IT READS node_modules AND NOT THE LOCKFILE
 *
 * package-lock.json records names and versions but not licences. Deriving the
 * licence from the registry would mean trusting metadata over the artifact
 * actually on disk, and the artifact on disk is the thing that will ship. So
 * this walks node_modules and reads each package's own package.json.
 *
 * If node_modules is absent the script says so and exits non-zero rather than
 * emitting an empty inventory. An empty inventory reads as "no obligations",
 * which would be false.
 *
 * Emits the shape scripts/assemble-scan-run.mjs consumes for the `licenses`
 * scanner. Zero dependencies.
 *
 * Usage:
 *   node scripts/license-inventory.mjs                 # JSON to stdout
 *   node scripts/license-inventory.mjs --root DIR
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * SPDX id -> obligation class. Four classes, because four is what a reader can
 * hold and what actually changes what you must do:
 *
 *   permissive       attribution only
 *   weak-copyleft    share modifications to the library itself
 *   strong-copyleft  share the work that links it
 *   unknown          no declared licence, or a string this table does not know
 *
 * `unknown` is the interesting one and it is deliberately not called "other":
 * an undeclared licence is not a mild licence, it is an unanswered question,
 * and it should read that way on the dashboard.
 */
export const OBLIGATION_CLASS = {
  "MIT": "permissive", "ISC": "permissive", "0BSD": "permissive",
  "BSD-2-Clause": "permissive", "BSD-3-Clause": "permissive",
  "Apache-2.0": "permissive", "Unlicense": "permissive", "CC0-1.0": "permissive",
  "BlueOak-1.0.0": "permissive", "Python-2.0": "permissive", "WTFPL": "permissive",
  "Zlib": "permissive", "MIT-0": "permissive", "CC-BY-4.0": "permissive",

  "LGPL-2.0-only": "weak-copyleft", "LGPL-2.0-or-later": "weak-copyleft",
  "LGPL-2.1-only": "weak-copyleft", "LGPL-2.1-or-later": "weak-copyleft",
  "LGPL-3.0-only": "weak-copyleft", "LGPL-3.0-or-later": "weak-copyleft",
  "MPL-2.0": "weak-copyleft", "EPL-2.0": "weak-copyleft", "CDDL-1.0": "weak-copyleft",

  "GPL-2.0-only": "strong-copyleft", "GPL-2.0-or-later": "strong-copyleft",
  "GPL-3.0-only": "strong-copyleft", "GPL-3.0-or-later": "strong-copyleft",
  "AGPL-3.0-only": "strong-copyleft", "AGPL-3.0-or-later": "strong-copyleft",
  "SSPL-1.0": "strong-copyleft",
};

/**
 * Classify a declared licence string. A compound expression takes the STRICTEST
 * class among its terms -- an OR expression gives you a choice, but the
 * obligation you must be prepared to meet is the heaviest one on the tree until
 * somebody actually makes that choice and writes it down. Nobody has.
 */
export function classify(license) {
  if (license == null || license === "" || license === "UNLICENSED") return "unknown";
  const raw = typeof license === "string" ? license : (license.type ?? "");
  const terms = String(raw).split(/\s+(?:OR|AND)\s+|[()]/).map((t) => t.trim()).filter(Boolean);
  if (!terms.length) return "unknown";
  const rank = { permissive: 0, "weak-copyleft": 1, "strong-copyleft": 2, unknown: 3 };
  let worst = "permissive";
  for (const t of terms) {
    const c = OBLIGATION_CLASS[t] ?? "unknown";
    if (rank[c] > rank[worst]) worst = c;
  }
  return worst;
}

/** Every package.json under node_modules, scoped packages included. */
function* walkPackages(nodeModules) {
  const entries = (() => { try { return readdirSync(nodeModules); } catch { return []; } })();
  for (const name of entries) {
    if (name === ".bin" || name === ".package-lock.json") continue;
    const dir = join(nodeModules, name);
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    if (name.startsWith("@")) { yield* walkPackages(dir); continue; }
    const pkgFile = join(dir, "package.json");
    if (existsSync(pkgFile)) {
      try { yield JSON.parse(readFileSync(pkgFile, "utf8")); } catch { /* unparseable: counted below */ }
    }
    // Nested node_modules: npm hoists, but not always.
    const nested = join(dir, "node_modules");
    if (existsSync(nested)) yield* walkPackages(nested);
  }
}

export function inventory(root = SELF_ROOT) {
  const nodeModules = join(root, "node_modules");
  if (!existsSync(nodeModules)) return null;
  const seen = new Map();
  for (const pkg of walkPackages(nodeModules)) {
    if (!pkg.name || !pkg.version) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    const license = typeof pkg.license === "string" ? pkg.license
      : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type ?? l).join(" OR ") : null);
    seen.set(key, { name: pkg.name, version: pkg.version, license: license ?? null, obligationClass: classify(license) });
  }
  const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const byClass = {};
  for (const p of packages) byClass[p.obligationClass] = (byClass[p.obligationClass] ?? 0) + 1;
  return { summary: { total: packages.length, byObligationClass: byClass }, packages };
}

function main(argv) {
  const i = argv.indexOf("--root");
  const root = i >= 0 ? resolve(argv[i + 1]) : SELF_ROOT;
  const out = inventory(root);
  if (out === null) {
    console.error("license-inventory: no node_modules -- run npm install first.");
    console.error("license-inventory: refusing to emit an empty inventory, which would read as 'no obligations'.");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
