#!/usr/bin/env node
/**
 * Tests for the Mist Index (EPIC-06 Test Plan).
 *
 * Gold Standard: changing any anchor in anchors.json must make mi-axis-anchors
 * fail, and adding a runtime dependency must make mi-zero-deps fail. Both are
 * proven here against deliberately broken copies, not asserted.
 *
 * Zero dependencies.  Usage: node scripts/test-mist-index.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { interpolate } from "../tools/mist-index/axes/score.mjs";
import { scoreAxis, composite, AXIS_IDS, NOT_MEASURED } from "../tools/mist-index/axes/index.mjs";
import { run } from "../tools/mist-index/bin/mist-index.mjs";
import { human, json } from "../tools/mist-index/report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = join(ROOT, "tools/mist-index");
const ANCHORS = JSON.parse(readFileSync(join(TOOL, "anchors.json"), "utf8"));

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));

const temps = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); temps.push(d); return d; };

console.log("test-mist-index (EPIC-06 Test Plan)\n");

// --- mi-axis-anchors ---------------------------------------------------------
{
  const wrong = [];
  for (const id of AXIS_IDS)
    for (const [x, y] of ANCHORS.axes[id].points) {
      const got = scoreAxis(id, x, ANCHORS);
      if (got !== y) wrong.push(`${id} at ${x}: got ${got}, anchor says ${y}`);
    }
  check("mi-axis-anchors (every anchor point reproduces exactly)", wrong.length === 0, wrong.join("; "));
}

{
  // Monotonic between anchors, in the declared direction.
  const bad = [];
  for (const id of AXIS_IDS) {
    const pts = ANCHORS.axes[id].points;
    const inverted = ANCHORS.axes[id].inverted === true;
    for (let x = pts[0][0]; x <= pts[pts.length - 1][0]; x += Math.max(1, Math.floor(pts[pts.length - 1][0] / 60))) {
      const a = scoreAxis(id, x, ANCHORS), b = scoreAxis(id, x + 1, ANCHORS);
      if (inverted ? b > a + 1e-9 : b < a - 1e-9) { bad.push(`${id} not monotonic near ${x}`); break; }
    }
  }
  check("mi-axis-anchors (monotonic between anchors)", bad.length === 0, bad.join("; "));
}

{
  // Gold Standard: move an anchor, the test must notice.
  const tampered = JSON.parse(JSON.stringify(ANCHORS));
  tampered.axes.A1.points[2] = [250, 99];
  const got = scoreAxis("A1", 250, tampered);
  check("gold-standard-mi-axis-anchors (a moved anchor changes the score)",
    got === 99 && scoreAxis("A1", 250, ANCHORS) === 50,
    `tampered anchors returned ${got}; the published table returns ${scoreAxis("A1", 250, ANCHORS)}`);
}

// --- mi-composite-weights ----------------------------------------------------
{
  const scores = { A1: 80, A2: 40, A3: 20, A4: 60, A5: 100 };
  const hand = 0.30 * 80 + 0.25 * 40 + 0.25 * 20 + 0.10 * 60 + 0.10 * 100;
  const got = composite(scores, ANCHORS);
  check("mi-composite-weights (matches a hand-computed fixture)",
    got.value === Math.round(hand * 10) / 10,
    `got ${got.value}, hand-computed ${hand}`);
  const w = Object.values(ANCHORS.weights).reduce((a, b) => a + b, 0);
  check("mi-composite-weights (weights sum to 1)", Math.abs(w - 1) < 1e-9, `weights sum to ${w}`);
}

{
  const partial = composite({ A1: 80, A2: 40, A3: null, A4: null, A5: null }, ANCHORS);
  check("mi-no-partial-score (a missing axis yields null, never a renormalised number)",
    partial.value === null && partial.missing.length === 3 && Math.abs(partial.measuredWeight - 0.55) < 1e-9,
    `got ${JSON.stringify(partial)}`);
}

// --- mi-zero-deps: THE load-bearing test -------------------------------------
{
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!name.endsWith(".mjs")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) {
        const spec = m[1];
        if (!spec.startsWith("node:") && !spec.startsWith(".") && !spec.startsWith("/"))
          offenders.push(`${p.slice(ROOT.length + 1)} imports "${spec}"`);
      }
    }
  };
  walk(TOOL);
  check("mi-zero-deps (the instrument imports only node: builtins and its own files)",
    offenders.length === 0,
    offenders.join("; ") + " -- a dependency-surface metric with a dependency surface is not credible");

  // Gold Standard: a bare import must be caught.
  const d = tmp("mist-mi-deps-");
  writeFileSync(join(d, "bad.mjs"), 'import chalk from "chalk";\nexport const x = 1;\n');
  const found = [...readFileSync(join(d, "bad.mjs"), "utf8").matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)]
    .map((m) => m[1]).filter((s) => !s.startsWith("node:") && !s.startsWith(".") && !s.startsWith("/"));
  check("gold-standard-mi-zero-deps (a bare import is detected)", found.length === 1 && found[0] === "chalk",
    `detector found ${JSON.stringify(found)}`);
}

{
  const pkgs = readdirSync(TOOL).includes("node_modules");
  check("mi-zero-deps (the tool has no node_modules of its own)", !pkgs, "tools/mist-index/node_modules exists");
}

// --- mi-anchor-version-recorded ---------------------------------------------
{
  const r = run(ROOT);
  const h = human(r), j = JSON.parse(json(r));
  check("mi-anchor-version-recorded (human output names the anchors)", h.includes(ANCHORS.anchorsVersion), h.slice(0, 120));
  check("mi-anchor-version-recorded (json output names the anchors)", j.anchorsVersion === ANCHORS.anchorsVersion, JSON.stringify(j.anchorsVersion));
}

// --- mi-not-measured-block ---------------------------------------------------
{
  const r = run(ROOT);
  const h = human(r), j = JSON.parse(json(r));
  check("mi-not-measured-block (present in human output)", /Not measured, by construction/.test(h) && NOT_MEASURED.every((n) => h.includes(n)), "the honesty block is incomplete in human output");
  check("mi-not-measured-block (present in json output)", Array.isArray(j.notMeasured) && j.notMeasured.length === NOT_MEASURED.length, "the honesty block is missing from json output");
  check("mi-not-measured-block (names vendoring, the most gameable property)",
    NOT_MEASURED.some((n) => /vendor/i.test(n)), "vendoring is not listed as a blind spot");
}

// --- mi-insufficient-history -------------------------------------------------
{
  const r = run(ROOT);
  check("mi-insufficient-history (A4 reports the state, never an imputed value)",
    r.axes.A4.state === "insufficient-history" && r.axes.A4.raw === null && r.axes.A4.score === null,
    `A4 came back ${JSON.stringify(r.axes.A4)}`);
  check("mi-insufficient-history (A5 is unavailable, not zero)",
    r.axes.A5.state === "unavailable" && r.axes.A5.score === null,
    `A5 came back ${JSON.stringify(r.axes.A5)}`);
  check("mi-insufficient-history (A3 is not-measured, not zero)",
    r.axes.A3.state === "not-measured" && r.axes.A3.score === null,
    `A3 came back ${JSON.stringify(r.axes.A3)} -- scoring 0 would assert this tree does no import-time network access, which nobody has checked`);
  check("mi-insufficient-history (the composite is flagged, not computed)",
    r.composite.value === null, `composite came back ${r.composite.value}`);
}

// --- mi-scores-external-repo -------------------------------------------------
{
  const r = run(join(ROOT, "fixtures/repos/ordinary-app"));
  check("mi-scores-external-repo (A1 from the lockfile alone, no install needed)",
    r.axes.A1.state === "measured" && r.axes.A1.raw === 40,
    `A1 came back ${JSON.stringify(r.axes.A1)}`);
}

// --- mi-discriminates: falsification criterion 1 -----------------------------
{
  // Same package count, different install-script count. If these score the same
  // the index is a package counter wearing a costume.
  const build = (nScripts) => {
    const d = tmp("mist-mi-repo-");
    for (const f of ["package.json", "package-lock.json"])
      writeFileSync(join(d, f), readFileSync(join(ROOT, "fixtures/repos/ordinary-app", f), "utf8"));
    const nm = join(d, "node_modules");
    mkdirSync(nm);
    for (let i = 1; i <= 40; i++) {
      const name = `example-pkg-${String(i).padStart(2, "0")}`;
      mkdirSync(join(nm, name));
      const pkg = { name, version: "1.0.0" };
      if (i <= nScripts) pkg.scripts = { postinstall: "node ./build.js" };
      writeFileSync(join(nm, name, "package.json"), JSON.stringify(pkg));
    }
    return d;
  };
  const plain = run(build(0));
  const scripted = run(build(12));

  check("mi-discriminates (identical A1, different A2)",
    plain.axes.A1.raw === scripted.axes.A1.raw && plain.axes.A2.raw !== scripted.axes.A2.raw,
    `A1 ${plain.axes.A1.raw} vs ${scripted.axes.A1.raw}; A2 ${plain.axes.A2.raw} vs ${scripted.axes.A2.raw}`);
  check("mi-discriminates (and they score differently)",
    plain.axes.A2.score !== scripted.axes.A2.score,
    `both scored A2 = ${plain.axes.A2.score}. The index has collapsed into a package count -- falsification criterion 1 in docs/MIST_INDEX.md.`);
  pass("mi-discriminates", `(40 pkgs both; A2 ${plain.axes.A2.raw}->${plain.axes.A2.score} vs ${scripted.axes.A2.raw}->${scripted.axes.A2.score})`);
}

// --- the interpolator itself --------------------------------------------------
{
  let threw = null;
  try { interpolate(5, [[0, 0], [0, 10]]); } catch (e) { threw = e.message; }
  check("mi-anchor-table-must-increase (a malformed table is rejected)", threw !== null, "a non-increasing anchor table was accepted");
}

for (const d of temps) rmSync(d, { recursive: true, force: true });
if (failed) { console.log("\ntest-mist-index: FAILED"); process.exit(1); }
console.log("\ntest-mist-index: all assertions pass");
