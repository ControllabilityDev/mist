#!/usr/bin/env node
/**
 * Dashboard integrity assertions (EPIC-04 Test Plan). BLOCKING.
 *
 * Guards three things the dashboard would stop being an instrument without:
 *
 *   1. it is not made of the specimen (zero dependencies);
 *   2. the record is append-only (a run that was red stays red);
 *   3. nothing on the page can make the exposure look smaller than it is
 *      (no filters, no acknowledge, no snooze).
 *
 * The third is worth stating plainly: if a dashboard can be made to look better
 * without the exposure changing, it is not an instrument. The check exists
 * against future well-meaning additions, not against malice.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/check-dashboard.mjs
 *   node scripts/check-dashboard.mjs --telemetry DIR --base-telemetry DIR
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const skip = (n, why) => console.log(`  skip  ${n}\n        ${why}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

/**
 * Affordances that would let the page flatter the exposure.
 *
 * This checks for CONTROLS, not for words. The first version grepped for
 * "acknowledge", "snooze" and "mute" and immediately failed on the page's own
 * footer, which says *"There is deliberately no severity filter, no acknowledge
 * control and no snooze."* A check that cannot tell a disclaimer from the thing
 * it disclaims is worse than no check: the obvious fix is to delete the
 * sentence, which would remove the honest statement and leave the hazard.
 *
 * So: the dashboard is asserted to contain NO interactive controls at all.
 * That is a stronger claim than "no snooze button" and a much easier one to
 * verify. `<details>`/`<summary>` are permitted -- they hold the chart data
 * fallbacks and cannot hide a finding, only a duplicate of one.
 */
const FORBIDDEN = [
  [/<button\b/i, "a <button>"],
  [/<input\b/i, "an <input>"],
  [/<select\b/i, "a <select>"],
  [/<textarea\b/i, "a <textarea>"],
  [/<form\b/i, "a <form>"],
  [/\son[a-z]+\s*=\s*["']/i, "an inline event handler"],
  [/<script\b/i, "a <script> (the page is static by construction)"],
];

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

/** --- dash-zero-deps: the load-bearing test ------------------------------- */
export function zeroDeps(root) {
  const dir = join(root, "site");
  const offenders = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules") { offenders.push(`${p.slice(root.length + 1)} exists`); continue; }
        if (name === "dist") continue;
        walk(p); continue;
      }
      if (!name.endsWith(".mjs")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) {
        const spec = m[1];
        if (!spec.startsWith("node:") && !spec.startsWith(".") && !spec.startsWith("/"))
          offenders.push(`${p.slice(root.length + 1)} imports "${spec}"`);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return offenders;
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const root = resolve(arg("--root", SELF_ROOT));
  const telemetry = arg("--telemetry", null);
  const base = arg("--base-telemetry", null);

  console.log("check-dashboard (EPIC-04 -- BLOCKING)");

  // --- dash-zero-deps ------------------------------------------------------
  const offenders = zeroDeps(root);
  if (offenders.length)
    fail("dash-zero-deps", offenders.join("; ") +
      "\n        The dashboard is the INSTRUMENT, not the specimen. An instrument built out of the thing it measures cannot be trusted: its own supply chain becomes a confound in every reading. A thermometer is not made of fever. (CONTRIBUTING.md, instrument exemption.)");
  else pass("dash-zero-deps", "(site/ imports only node: builtins)");

  // --- dash-headline-framing + dash-no-filters + dash-chart-fallbacks ------
  // Rendered from the fixture record so these run without a real one.
  const fixture = join(root, "fixtures/telemetry");
  if (!existsSync(fixture)) skip("dash-render-checks", "no fixtures/telemetry to render from");
  else {
    // Imported lazily so a syntax error in build.mjs fails here with a clear name.
    import(new URL("../site/build.mjs", import.meta.url)).then(({ render, loadRecord, FRAMING }) => {
      const out = render(loadRecord(fixture));

      if (!out.includes(FRAMING))
        fail("dash-headline-framing", `the framing sentence "${FRAMING}" is missing. Without it the page reads as an ordinary security dashboard and the argument is invisible in a screenshot.`);
      else pass("dash-headline-framing", "(verbatim)");

      const found = FORBIDDEN.filter(([re]) => re.test(out)).map(([, what]) => what);
      if (found.length)
        fail("dash-no-filters", `the page contains ${found.join(", ")} -- if a dashboard can be made to look better without the exposure changing, it is not an instrument`);
      else pass("dash-no-filters", `(${FORBIDDEN.length} affordance(s) checked)`);

      const svgs = (out.match(/<svg/g) ?? []).length;
      const tables = (out.match(/class="chart-fallback"/g) ?? []).length;
      if (tables < svgs)
        fail("dash-chart-fallbacks", `${svgs} chart(s), ${tables} data table(s) -- every chart must carry its numbers so the data survives the SVG`);
      else pass("dash-chart-fallbacks", `(${svgs} chart(s), ${tables} table(s))`);

      const gates = (out.match(/Not built yet — owned by EPIC-\d\d/g) ?? []).length;
      if (gates < 2)
        fail("dash-gated-panels-visible", `${gates} gated panel(s) rendered, expected 2 (decay, index). A dashboard that silently omitted a panel it cannot fill would be claiming completeness it does not have.`);
      else pass("dash-gated-panels-visible", `(${gates} labelled placeholder(s))`);

      finish();
    }).catch((e) => { fail("dash-render-checks", `site/build.mjs failed: ${e.message}`); finish(); });
    return;
  }
  finish();

  function finish() {
    // --- dash-append-only -------------------------------------------------
    if (!telemetry || !base) skip("dash-append-only", "needs --telemetry and --base-telemetry; CI supplies both");
    else {
      const load = (d) => {
        const idx = JSON.parse(readFileSync(join(d, "index.json"), "utf8"));
        return new Map((idx.runs ?? []).map((r) => [r.path, sha(readFileSync(join(d, r.path), "utf8"))]));
      };
      try {
        const before = load(base), after = load(telemetry);
        const changed = [...before].filter(([p, h]) => after.has(p) && after.get(p) !== h).map(([p]) => p);
        const removed = [...before.keys()].filter((p) => !after.has(p));
        if (changed.length || removed.length)
          fail("dash-append-only",
            [changed.length ? `modified: ${changed.join(", ")}` : "", removed.length ? `removed: ${removed.join(", ")}` : ""].filter(Boolean).join("; ") +
            "\n        The record is append-only. A run that was red stays red, including runs that were red because of a Mist bug.");
        else pass("dash-append-only", `(${before.size} existing run(s) unchanged, +${after.size - before.size} new)`);
      } catch (e) { fail("dash-append-only", e.message); }
    }

    // --- dash-url-stable ---------------------------------------------------
    const doc = join(root, "docs/DASHBOARD.md");
    if (!existsSync(doc)) fail("dash-url-stable", "docs/DASHBOARD.md is missing -- the permanent URL has no home");
    else {
      const text = readFileSync(doc, "utf8");
      // Trailing markdown punctuation is not part of the URL.
      const url = text.match(/https:\/\/[a-z0-9.-]+\.github\.io\/[^\s)`*]*/i)?.[0]?.replace(/[.,*]+$/, "");
      if (!url) fail("dash-url-stable", "no Pages URL found in docs/DASHBOARD.md");
      else pass("dash-url-stable", `(${url})`);
    }

    if (failed) { console.log("\ncheck-dashboard: the instrument is compromised -- do not merge"); process.exit(1); }
    console.log("\ncheck-dashboard: the instrument holds");
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
