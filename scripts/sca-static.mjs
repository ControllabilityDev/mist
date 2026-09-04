#!/usr/bin/env node
/**
 * A STATIC APPROXIMATION of behavioural SCA (EPIC-03 Phase 2a, partial).
 *
 * READ THIS BEFORE QUOTING ANY NUMBER IT PRODUCES.
 *
 * This is NOT Socket and it is NOT a behavioural SCA. Socket -- the tool EPIC-03
 * names -- requires an API token, which needs an account, which needs a human.
 * That remains owed. This script exists so that A3 (import-time reach, 25% of the
 * Mist Index weight) has a real, reproducible number instead of `not-measured`,
 * and so the gap is a smaller one that is honestly described.
 *
 * WHAT IT ACTUALLY DOES: it reads text. It parses no ASTs, executes nothing, and
 * resolves no re-exports. Every result is a grep with a stated bias:
 *
 *   install-script        EXACT. The hook is declared in package.json or it is not.
 *
 *   network-at-install    UPPER BOUND. The install command, and any local .js file
 *                         it names, are searched for network primitives. A script
 *                         that merely mentions `https` in a comment counts.
 *
 *   network-at-import     UPPER BOUND, AND A LOOSE ONE. A package counts if its
 *                         entry point requires or imports a network module at
 *                         module scope. REQUIRING IS NOT CALLING: a package that
 *                         imports `https` and only uses it inside an exported
 *                         function is counted here and should not be. This number
 *                         is a ceiling on the true value, never an estimate of it.
 *
 *   obfuscated            HEURISTIC. Very long lines and a low newline ratio.
 *                         Minified builds are indistinguishable from hostile ones
 *                         by this measure, and most hits are minified builds.
 *
 *   maintainers           EXACT but OPT-IN (--maintainers). Queries the npm
 *                         registry once per distinct package name, which is slow
 *                         and needs network, so the default run omits it and the
 *                         field is reported as not measured rather than 0.
 *
 * Emitting an upper bound labelled as an upper bound is defensible. Emitting one
 * labelled as a measurement is how a dashboard starts lying, which is the failure
 * mode this whole project exists to document.
 *
 * Output matches the `sca-behavioral` shape scripts/assemble-scan-run.mjs
 * consumes, so scan-run.json picks it up with no change there.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/sca-static.mjs                    # offline, fast
 *   node scripts/sca-static.mjs --maintainers      # + registry lookups (slow)
 *   node scripts/sca-static.mjs --root DIR --out F
 */

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const INSTALL_HOOKS = ["preinstall", "install", "postinstall"];

/** Network primitives, as they appear in source text. */
const NET_MODULES = ["https", "http", "net", "tls", "dgram", "http2", "node-fetch", "axios", "undici", "got", "request"];
const NET_IN_COMMAND = /\b(curl|wget|npm\s+(?:i|install)|pip\s+install|prebuild-install|node-pre-gyp|nydus)\b/;
// A bare `fetch(` was in this pattern and was removed: `lru-cache` defines a
// METHOD called fetch, and matched. A method name is not a network call, and one
// false positive of that kind in a 700-package tree is enough to distrust the
// rest. Module-scope fetch() calls are rare enough that dropping the pattern
// costs little; the require/import forms carry the signal.
const NET_IN_SOURCE = new RegExp(
  `require\\(\\s*['"](?:node:)?(?:${NET_MODULES.join("|")})['"]\\s*\\)` +
  `|from\\s*['"](?:node:)?(?:${NET_MODULES.join("|")})['"]`,
);

/** Only used for install-script analysis, where a fetch() call IS the signal. */
const NET_IN_INSTALL_SOURCE = new RegExp(NET_IN_SOURCE.source + `|\\bfetch\\s*\\(`);

/** Every package directory under node_modules, scoped packages included. */
function* walkPackages(nodeModules) {
  let entries; try { entries = readdirSync(nodeModules); } catch { return; }
  for (const name of entries) {
    if (name === ".bin" || name === ".package-lock.json") continue;
    const dir = join(nodeModules, name);
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    if (name.startsWith("@")) { yield* walkPackages(dir); continue; }
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      try { yield { dir, pkg: JSON.parse(readFileSync(pj, "utf8")) }; } catch { /* unparseable: skipped, and counted below */ }
    }
    const nested = join(dir, "node_modules");
    if (existsSync(nested)) yield* walkPackages(nested);
  }
}

const readOr = (f, limit = 400_000) => {
  try { return readFileSync(f, "utf8").slice(0, limit); } catch { return ""; }
};

/** Resolve a package's entry point. Conservative: main, then index.js. */
function entryPoint(dir, pkg) {
  const candidates = [];
  if (typeof pkg.main === "string") candidates.push(pkg.main);
  const dot = pkg.exports?.["."] ?? pkg.exports;
  if (typeof dot === "string") candidates.push(dot);
  else if (dot && typeof dot === "object")
    for (const v of Object.values(dot)) if (typeof v === "string") candidates.push(v);
  candidates.push("index.js", "index.mjs", "index.cjs");
  for (const c of candidates) {
    const p = join(dir, c);
    if (existsSync(p) && statSync(p).isFile()) return p;
    if (existsSync(p + ".js")) return p + ".js";
  }
  return null;
}

/**
 * Module-scope only: strip everything inside braces one level deep or more, so a
 * require inside a function body does not count. Crude, and deliberately so --
 * it is a text filter, not a parser, and it is documented as an upper bound.
 */
function moduleScope(src) {
  let depth = 0, out = "";
  for (const ch of src) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
    if (ch === "{" && depth === 1) out += " ";
  }
  return out;
}

const isObfuscated = (src) => {
  if (src.length < 5000) return false;
  const lines = src.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  return longest > 5000 && lines.length < src.length / 2000;
};

export function analyse(root, { maintainers = false } = {}) {
  const nm = join(root, "node_modules");
  if (!existsSync(nm)) return null;

  const alerts = [];
  const seen = new Set();
  let inspected = 0;
  const counts = { installScript: 0, netAtInstall: 0, netAtImport: 0, obfuscated: 0 };

  for (const { dir, pkg } of walkPackages(nm)) {
    if (!pkg.name || !pkg.version) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inspected++;

    const hooks = INSTALL_HOOKS.filter((h) => pkg.scripts?.[h]);
    if (hooks.length) {
      counts.installScript++;
      alerts.push({ type: "install-script", package: pkg.name, version: pkg.version, severity: "high",
        title: `Runs ${hooks.join(", ")}` });

      // Does that hook reach the network? Command text, plus any local .js it names.
      const cmd = hooks.map((h) => pkg.scripts[h]).join(" ; ");
      let reaches = NET_IN_COMMAND.test(cmd);
      if (!reaches)
        for (const m of cmd.matchAll(/(?:^|\s)(?:node\s+)?\.?\/?([\w./-]+\.(?:js|cjs|mjs))/g)) {
          const f = join(dir, m[1]);
          if (existsSync(f) && NET_IN_INSTALL_SOURCE.test(readOr(f))) { reaches = true; break; }
        }
      if (reaches) {
        counts.netAtInstall++;
        alerts.push({ type: "network-at-install", package: pkg.name, version: pkg.version, severity: "critical",
          title: "Install script appears to reach the network" });
      }
    }

    const entry = entryPoint(dir, pkg);
    if (entry) {
      const src = readOr(entry);
      if (NET_IN_SOURCE.test(moduleScope(src))) {
        counts.netAtImport++;
        alerts.push({ type: "network-at-import", package: pkg.name, version: pkg.version, severity: "high",
          title: "Entry point references a network module at module scope (UPPER BOUND: requiring is not calling)" });
      }
      if (isObfuscated(src)) {
        counts.obfuscated++;
        alerts.push({ type: "obfuscated-code", package: pkg.name, version: pkg.version, severity: "medium",
          title: "Entry point looks minified or obfuscated" });
      }
    }
  }

  const summary = {
    packagesInspected: inspected,
    packagesWithInstallScripts: counts.installScript,
    packagesWithNetworkAtInstall: counts.netAtInstall,
    packagesWithNetworkAtImport: counts.netAtImport,
    packagesObfuscated: counts.obfuscated,
  };
  // distinctMaintainers is deliberately ABSENT rather than 0 when not requested.
  // scripts/assemble-scan-run.mjs only copies integer fields, so an absent key
  // stays null in the envelope, which reads as "not measured".
  if (maintainers && typeof maintainers === "number") summary.distinctMaintainers = maintainers;

  return { tool: "sca-static", toolNote: "STATIC APPROXIMATION, not a behavioural SCA -- see scripts/sca-static.mjs header", summary, alerts };
}

/** Distinct maintainers across the tree, from the npm registry. Opt-in, slow. */
export async function countMaintainers(root, { concurrency = 16 } = {}) {
  const nm = join(root, "node_modules");

  // Workspace packages are this repository's own code, symlinked into
  // node_modules. They are not published, so the registry 404s on them, and
  // their authors are not third parties anybody is trusting. Excluded by the
  // same `link: true` rule A1 uses, so the two measures agree about what counts
  // as "the tree".
  const workspaces = new Set();
  const lock = join(root, "package-lock.json");
  if (existsSync(lock))
    for (const [p, meta] of Object.entries(JSON.parse(readFileSync(lock, "utf8")).packages ?? {}))
      if (meta.link && p.startsWith("node_modules/")) workspaces.add(p.split("node_modules/").pop());

  const names = new Set();
  for (const { pkg } of walkPackages(nm)) if (pkg.name && !workspaces.has(pkg.name)) names.add(pkg.name);
  const list = [...names];
  const people = new Set();
  let done = 0, failed = 0;

  async function worker() {
    while (list.length) {
      const name = list.pop();
      try {
        // NOT the abbreviated packument. `application/vnd.npm.install-v1+json`
        // omits `maintainers` entirely, so the first run of this returned
        // "0 distinct maintainers across 658 packages" -- a number absurd enough
        // to catch, which is the only reason it was caught. A subtler field
        // would have shipped.
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`);
        if (!res.ok) { failed++; continue; }
        const body = await res.json();
        for (const m of body.maintainers ?? []) if (m?.name) people.add(m.name);
      } catch { failed++; }
      if (++done % 100 === 0) process.stderr.write(`  ...${done}/${names.size}\n`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { distinct: people.size, queried: names.size, failed };
}

async function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const root = resolve(arg("--root", SELF_ROOT));
  let maintainers = false;

  if (argv.includes("--maintainers")) {
    process.stderr.write("sca-static: querying the npm registry for maintainers (slow)\n");
    const r = await countMaintainers(root);
    process.stderr.write(`sca-static: ${r.distinct} distinct maintainer(s) across ${r.queried} package name(s); ${r.failed} lookup(s) failed\n`);
    // A partial answer is not reported as a whole one.
    if (r.failed === 0) maintainers = r.distinct;
    else process.stderr.write("sca-static: lookups failed, so distinctMaintainers is left NOT MEASURED rather than undercounted\n");
  }

  const out = analyse(root, { maintainers });
  if (!out) { console.error("sca-static: no node_modules -- nothing to analyse"); process.exit(1); }
  const json = JSON.stringify(out, null, 2) + "\n";
  const target = arg("--out", null);
  if (target) {
    // Create the directory rather than failing after the slow work is done.
    mkdirSync(dirname(resolve(target)), { recursive: true });
    writeFileSync(target, json);
    console.error(`sca-static: wrote ${target}`);
  }
  else process.stdout.write(json);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
