#!/usr/bin/env node
/**
 * Tests for the static SCA approximation (EPIC-03 Phase 2a).
 *
 * These matter more than most: `packagesWithNetworkAtImport` is 25% of the Mist
 * Index weight, and the measure is a text search. A text search that is wrong in
 * an unexamined direction would move a published number.
 *
 * The suite builds synthetic packages with known behaviour and asserts the
 * analyser finds exactly them -- including the two false-positive shapes named
 * in docs/SCANNERS.md, which are asserted to STILL be counted, because the
 * measure is documented as an upper bound and silently tightening it would make
 * the documentation wrong.
 *
 * Zero dependencies.  Usage: node scripts/test-sca.mjs
 */

import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyse } from "./sca-static.mjs";

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));

const temps = [];
/** Build a throwaway tree from {name: {pkg, files}} */
function tree(spec) {
  const root = mkdtempSync(join(tmpdir(), "mist-sca-"));
  temps.push(root);
  const nm = join(root, "node_modules");
  mkdirSync(nm);
  for (const [name, { pkg = {}, files = {} }] of Object.entries(spec)) {
    const dir = join(nm, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", ...pkg }));
    for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, f), body);
  }
  return root;
}
const types = (r, t) => r.alerts.filter((a) => a.type === t).map((a) => a.package).sort();

console.log("test-sca (EPIC-03 Phase 2a)\n");

// --- install scripts: EXACT ---------------------------------------------------
{
  const r = analyse(tree({
    "has-postinstall": { pkg: { scripts: { postinstall: "node ./build.js" } }, files: { "build.js": "console.log(1)" } },
    "has-preinstall": { pkg: { scripts: { preinstall: "echo hi" } } },
    "has-test-only": { pkg: { scripts: { test: "jest" } } },
    "has-nothing": {},
  }));
  check("sca-install-script (finds exactly the packages with hooks)",
    JSON.stringify(types(r, "install-script")) === JSON.stringify(["has-postinstall", "has-preinstall"]),
    `found ${JSON.stringify(types(r, "install-script"))}`);
  check("sca-install-script (a `test` script is not an install hook)",
    !types(r, "install-script").includes("has-test-only"), "a test script was counted as an install hook");
  check("sca-summary-counts-match-alerts",
    r.summary.packagesWithInstallScripts === types(r, "install-script").length,
    `summary says ${r.summary.packagesWithInstallScripts}, alerts say ${types(r, "install-script").length}`);
}

// --- network at install --------------------------------------------------------
{
  const r = analyse(tree({
    "downloads-in-js": { pkg: { scripts: { postinstall: "node ./install.js" } }, files: { "install.js": "const https=require('https');https.get(u,cb)" } },
    "downloads-in-cmd": { pkg: { scripts: { install: "prebuild-install || node-gyp rebuild" } } },
    "curls": { pkg: { scripts: { postinstall: "curl -o x https://example.invalid/x" } } },
    "builds-locally": { pkg: { scripts: { postinstall: "node ./build.js" } }, files: { "build.js": "require('fs').writeFileSync('a','b')" } },
  }));
  check("sca-network-at-install (script file reaching the network)", types(r, "network-at-install").includes("downloads-in-js"), "missed an https.get in an install script");
  check("sca-network-at-install (a known downloader in the command)", types(r, "network-at-install").includes("downloads-in-cmd"), "missed prebuild-install");
  check("sca-network-at-install (curl in the command)", types(r, "network-at-install").includes("curls"), "missed curl");
  check("sca-network-at-install (a purely local build is NOT flagged)",
    !types(r, "network-at-install").includes("builds-locally"),
    "a local fs-only build script was flagged as reaching the network");
}

// --- network at import: documented UPPER BOUND ---------------------------------
{
  const r = analyse(tree({
    "requires-https": { pkg: { main: "index.js" }, files: { "index.js": "const https = require('https');\nmodule.exports = {};" } },
    "imports-http": { pkg: { main: "index.mjs" }, files: { "index.mjs": "import http from 'node:http';\nexport default 1;" } },
    "requires-inside-fn": { pkg: { main: "index.js" }, files: { "index.js": "module.exports = function () {\n  const https = require('https');\n  return https;\n};" } },
    "pure": { pkg: { main: "index.js" }, files: { "index.js": "module.exports = (a,b) => a+b;" } },
  }));
  const got = types(r, "network-at-import");
  check("sca-network-at-import (module-scope require is flagged)", got.includes("requires-https"), "missed a module-scope require('https')");
  check("sca-network-at-import (module-scope import is flagged)", got.includes("imports-http"), "missed a module-scope import of node:http");
  check("sca-network-at-import (a require inside a function body is NOT flagged)",
    !got.includes("requires-inside-fn"),
    "a require inside a function body was counted -- the module-scope filter is not working");
  check("sca-network-at-import (a pure module is not flagged)", !got.includes("pure"), "a pure module was flagged");
}

{
  // The documented false-positive shape. It MUST still be counted: the measure
  // is published as an upper bound, and quietly tightening it would make
  // docs/SCANNERS.md wrong about its own bias.
  const r = analyse(tree({
    "constants-only": { pkg: { main: "index.js" }, files: { "index.js": "const http = require('http');\nmodule.exports = http.METHODS;" } },
  }));
  check("sca-network-at-import (the documented false positive is still counted)",
    types(r, "network-at-import").includes("constants-only"),
    "requiring http for METHODS is no longer counted -- if that is deliberate, update docs/SCANNERS.md, which names `methods` and `router` as known false positives");
}

{
  // The regression that started it: a method named `fetch` is not a network call.
  const r = analyse(tree({
    "has-fetch-method": { pkg: { main: "index.js" }, files: { "index.js": "class C {\n  fetch(k) { return k; }\n}\nmodule.exports = C;" } },
  }));
  check("sca-network-at-import (a method named `fetch` is not a network call)",
    !types(r, "network-at-import").includes("has-fetch-method"),
    "a class method named fetch was counted as import-time network reach -- this is the lru-cache false positive returning");
}

// --- obfuscation is a heuristic, and small files are never flagged --------------
{
  const r = analyse(tree({
    "minified": { pkg: { main: "index.js" }, files: { "index.js": "var a=1;".repeat(1200) + "\n" } },
    "small": { pkg: { main: "index.js" }, files: { "index.js": "var a = 1;\n" } },
  }));
  check("sca-obfuscated (a long single-line bundle is flagged)", types(r, "obfuscated-code").includes("minified"), "missed a minified bundle");
  check("sca-obfuscated (a small file is never flagged)", !types(r, "obfuscated-code").includes("small"), "a tiny file was flagged as obfuscated");
}

// --- honesty: absent measures are absent, not zero -----------------------------
{
  const r = analyse(tree({ "a": {} }));
  check("sca-maintainers-absent-not-zero",
    !("distinctMaintainers" in r.summary),
    "distinctMaintainers appeared without --maintainers; an absent key stays null in the envelope, a 0 would read as 'nobody maintains this tree'");
  check("sca-declares-what-it-is",
    /STATIC APPROXIMATION/.test(r.toolNote) && r.tool === "sca-static",
    `toolNote is ${JSON.stringify(r.toolNote)} -- output that does not say what produced it can be mistaken for Socket`);
}

// --- no tree at all -------------------------------------------------------------
{
  const empty = mkdtempSync(join(tmpdir(), "mist-sca-empty-"));
  temps.push(empty);
  check("sca-no-tree-returns-null", analyse(empty) === null, "an absent node_modules produced a result instead of null");
}

for (const d of temps) rmSync(d, { recursive: true, force: true });
if (failed) { console.log("\ntest-sca: FAILED"); process.exit(1); }
console.log("\ntest-sca: all assertions pass");
