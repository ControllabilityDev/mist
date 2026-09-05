#!/usr/bin/env node
/**
 * Kernel purity gate (EPIC-09 Phase 1e).
 *
 * The EPIC's load-bearing claim is that `packages/kernel` is genuinely pure --
 * no I/O, no clock, no environment, zero runtime dependencies. A claim like that
 * asserted in a README decays in a fortnight. Asserted here, it fails a build.
 *
 * Every assertion is proven able to say NO in scripts/test-paired.mjs, against a
 * deliberately broken copy of the tree. A gate that has never failed is not a
 * gate, it is a decoration.
 *
 * Zero dependencies.  Usage: node scripts/check-pure.mjs [--root DIR]
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * What a pure core may not reach for.
 *
 * Each pattern names the capability, not the spelling, so a rename does not slip
 * past: `node:fs` and `require('fs')` are the same surrender.
 */
const FORBIDDEN = [
  [/\bfrom\s+["']node:/, "a node: builtin import -- the kernel does no I/O"],
  [/\brequire\s*\(\s*["'](node:)?(fs|http|https|net|dns|child_process|os|path)["']/, "a node builtin via require()"],
  [/\bfetch\s*\(/, "fetch() -- the network belongs to a ProviderPort adapter"],
  [/\bDate\s*\.\s*now\b/, "Date.now() -- the clock is a ClockPort argument, not an ambient fact"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date() with no argument -- that reads the clock"],
  [/\bprocess\s*\.\s*env\b/, "process.env -- configuration arrives as an argument"],
  [/\bglobalThis\b/, "globalThis -- ambient state is not an input"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, "browser storage -- that is a PreferenceStore adapter"],
  [/\bMath\s*\.\s*random\b/, "Math.random() -- an unfakeable input"],
];

/** The provider's spelling. Permitted in parse.ts and nowhere else. */
const WIRE_NAMES = [/\bfeels_like\b/, /\bmain\s*\.\s*temp\b/, /["']timezone["']/, /\bcity\b/];

const MOCKING = /\b(jest\s*\.\s*mock|vi\s*\.\s*mock|sinon|proxyquire|mock-require|testdouble)\b/;

const files = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
};

export function checkPure(root = SELF_ROOT) {
  const results = [];
  const ok = (name) => results.push({ name, ok: true });
  const no = (name, why) => results.push({ name, ok: false, why });
  const kernel = join(root, "packages/kernel");

  if (!existsSync(kernel)) {
    no("pure-kernel-exists", "packages/kernel is absent");
    return results;
  }
  ok("pure-kernel-exists");

  // --- pure-kernel-zero-deps: THE load-bearing test --------------------------
  const pkg = JSON.parse(readFileSync(join(kernel, "package.json"), "utf8"));
  const deps = Object.keys(pkg.dependencies ?? {});
  const devDeps = Object.keys(pkg.devDependencies ?? {});
  if (deps.length) no("pure-kernel-zero-deps", `${deps.length} runtime dependency(ies): ${deps.join(", ")}`);
  else ok("pure-kernel-zero-deps");

  // A test runner counts. `node --test` runs TypeScript directly on Node 24+,
  // so the kernel's suite adds nothing -- and a project whose thesis is package
  // count must not smuggle packages in through its own test harness.
  if (devDeps.length) no("pure-kernel-zero-dev-deps", `${devDeps.length} dev dependency(ies): ${devDeps.join(", ")} -- the suite runs on node --test`);
  else ok("pure-kernel-zero-dev-deps");

  // --- pure-kernel-no-io ------------------------------------------------------
  const srcFiles = files(join(kernel, "src"));
  if (!srcFiles.length) no("pure-kernel-no-io", "no source files found under packages/kernel/src");
  else {
    const bad = [];
    for (const f of srcFiles) {
      const body = readFileSync(f, "utf8")
        // Comments explain what the kernel MUST NOT do and necessarily name it.
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const [re, why] of FORBIDDEN)
        if (re.test(body)) bad.push(`${relative(root, f)}: ${why}`);
    }
    if (bad.length) no("pure-kernel-no-io", bad.join("; "));
    else ok("pure-kernel-no-io");
  }

  // --- pure-wire-names-confined-to-parse -------------------------------------
  // The property that makes the kernel survive a provider rename: the wire
  // spelling exists in exactly one file. Without this, "we have types now"
  // means the wire shape simply acquired an alias.
  {
    const leaked = [];
    for (const f of srcFiles) {
      if (/parse\.ts$/.test(f)) continue;
      const body = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const re of WIRE_NAMES)
        if (re.test(body)) leaked.push(`${relative(root, f)}: ${re.source}`);
    }
    if (leaked.length) no("pure-wire-names-confined-to-parse", leaked.join("; "));
    else ok("pure-wire-names-confined-to-parse");
  }

  // --- pure-fakes-no-mocks ----------------------------------------------------
  {
    const testFiles = files(join(kernel, "test"));
    if (!testFiles.length) no("pure-fakes-no-mocks", "the kernel has no tests");
    else {
      const bad = testFiles.filter((f) =>
        MOCKING.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
      if (bad.length) no("pure-fakes-no-mocks", `${bad.map((f) => relative(root, f)).join(", ")} reaches for a mocking library -- pure functions need none, and a port takes a plain object`);
      else ok("pure-fakes-no-mocks");
    }
  }

  return results;
}

function main(argv) {
  const i = argv.indexOf("--root");
  const root = resolve(i >= 0 ? argv[i + 1] : SELF_ROOT);
  console.log("check-pure (EPIC-09 kernel purity)\n");
  const results = checkPure(root);
  for (const r of results)
    console.log(r.ok ? `  ok   ${r.name}` : `  FAIL ${r.name}\n       ${r.why}`);
  const failed = results.some((r) => !r.ok);
  console.log(failed ? "\ncheck-pure: FAILED" : "\ncheck-pure: all assertions pass");
  process.exit(failed ? 1 : 0);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
