#!/usr/bin/env node
/**
 * Tests for the telemetry dashboard (EPIC-04 Test Plan).
 *
 * Gold Standard: adding a single import from node_modules to site/build.mjs
 * must make dash-zero-deps fail. Proven here against a broken copy, not
 * asserted.
 *
 * Zero dependencies.  Usage: node scripts/test-dashboard.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { render, loadRecord, FRAMING } from "../site/build.mjs";
import { zeroDeps } from "./check-dashboard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const FIXTURE = join(ROOT, "fixtures/telemetry");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };
const check = (n, cond, why) => (cond ? pass(n) : fail(n, why));

const temps = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); temps.push(d); return d; };

const runCheck = (extra) => {
  try { return { code: 0, out: execFileSync(NODE, [join(ROOT, "scripts/check-dashboard.mjs"), ...extra], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }; }
};

console.log("test-dashboard (EPIC-04 Test Plan)\n");

// --- dash-builds-from-fixtures -----------------------------------------------
const html = render(loadRecord(FIXTURE));
{
  check("dash-builds-from-fixtures (produces a document)",
    html.startsWith("<!doctype html>") && html.includes("</html>"), "output is not a complete HTML document");
  check("dash-builds-from-fixtures (renders every run in the record)",
    (html.match(/2026-09-0[1-5]/g) ?? []).length >= 5, "not every fixture run appears in the page");
}

// --- dash-headline-framing ----------------------------------------------------
check("dash-headline-framing (verbatim)", html.includes(FRAMING), `missing: ${FRAMING}`);
check("dash-headline-framing (names the counter-invariant)", /CI-2/.test(html),
  "the framing block does not name CI-2, so a reader cannot join it to docs/ANTI_KERNEL.md");

// --- dash-no-filters ----------------------------------------------------------
{
  const controls = [/<button\b/i, /<input\b/i, /<select\b/i, /<form\b/i, /<script\b/i, /\son[a-z]+\s*=\s*["']/i]
    .filter((re) => re.test(html));
  check("dash-no-filters (the page has no interactive controls at all)",
    controls.length === 0, `found ${controls.length} control pattern(s) in the rendered page`);
  // Whitespace-normalised: the claim is about the text, not its line wrapping.
  // The first version failed because the generator wraps "no\n  snooze".
  const flat = html.replace(/\s+/g, " ");
  check("dash-no-filters (and says so in the page itself)",
    /no severity filter, no acknowledge control and no snooze/i.test(flat),
    "the page no longer states the no-filter rule; the rule should be visible to a reader, not only to CI");
}

// --- dash-chart-fallbacks ------------------------------------------------------
{
  const svgs = (html.match(/<svg/g) ?? []).length;
  const tables = (html.match(/class="chart-fallback"/g) ?? []).length;
  check("dash-chart-fallbacks (every chart carries its numbers)", tables >= svgs && svgs > 0,
    `${svgs} chart(s) but ${tables} table(s)`);
  check("dash-chart-fallbacks (the data is in the DOM, not hidden by CSS)",
    !/chart-fallback[^>]*display:\s*none/i.test(html),
    "a fallback table is display:none in markup -- the data must survive the SVG");
}

// --- dash-gated-panels-visible --------------------------------------------------
{
  const gates = html.match(/Not built yet — owned by (EPIC-\d\d)/g) ?? [];
  check("dash-gated-panels-visible (both placeholders render and name their EPIC)",
    gates.length === 2 && /EPIC-06/.test(html) && /EPIC-07/.test(html),
    `found ${gates.length}: ${gates.join(", ")}`);
}

// --- crashed scanner must read as red -------------------------------------------
{
  // Fixture run 4 has a crashed semgrep and zero findings. A dashboard that
  // showed that as GREEN would be the false-green failure the envelope's
  // `status` field exists to prevent.
  const one = JSON.parse(readFileSync(join(FIXTURE, "index.json"), "utf8"));
  const crashRun = one.runs[3];
  const d = tmp("mist-dash-crash-");
  mkdirSync(join(d, "runs"), { recursive: true });
  cpSync(join(FIXTURE, crashRun.path), join(d, crashRun.path));
  const env = JSON.parse(readFileSync(join(d, crashRun.path), "utf8"));
  for (const s of env.scanners) s.findings = [];   // zero findings, semgrep still crashed
  writeFileSync(join(d, crashRun.path), JSON.stringify(env));
  writeFileSync(join(d, "index.json"), JSON.stringify({ schemaVersion: "1", recordStarted: crashRun.startedAt, runs: [crashRun] }));
  const out = render(loadRecord(d));
  check("dash-crashed-scanner-is-red (zero findings plus a crash is NOT green)",
    /class="panel status red"/.test(out) && /crashed this run/.test(out),
    "a run with a crashed scanner and no findings rendered as green");
}

// --- dash-zero-deps: the load-bearing test ---------------------------------------
{
  check("dash-zero-deps (site/ imports only node: builtins)", zeroDeps(ROOT).length === 0,
    zeroDeps(ROOT).join("; "));

  // Gold Standard: one bare import must break it.
  const d = tmp("mist-dash-deps-");
  mkdirSync(join(d, "site"), { recursive: true });
  writeFileSync(join(d, "site/build.mjs"), 'import chalk from "chalk";\nexport const x = 1;\n');
  const found = zeroDeps(d);
  check("gold-standard-dash-zero-deps (a single bare import is caught)",
    found.length === 1 && /chalk/.test(found[0]),
    `detector returned ${JSON.stringify(found)}`);

  const e = tmp("mist-dash-nm-");
  mkdirSync(join(e, "site/node_modules"), { recursive: true });
  check("dash-zero-deps (a site/node_modules directory is caught)",
    zeroDeps(e).some((o) => /node_modules/.test(o)), "site/node_modules was not detected");
}

// --- dash-append-only ------------------------------------------------------------
{
  const base = tmp("mist-dash-base-");
  cpSync(FIXTURE, base, { recursive: true });

  // Appending is fine.
  const grow = tmp("mist-dash-grow-");
  cpSync(FIXTURE, grow, { recursive: true });
  const idx = JSON.parse(readFileSync(join(grow, "index.json"), "utf8"));
  const last = JSON.parse(readFileSync(join(grow, idx.runs[idx.runs.length - 1].path), "utf8"));
  const newRun = { ...last, commit: "f".repeat(40), startedAt: "2026-09-06T08:00:00Z" };
  writeFileSync(join(grow, "runs/new.json"), JSON.stringify(newRun));
  idx.runs.push({ sha: newRun.commit, ref: "main", startedAt: newRun.startedAt, path: "runs/new.json" });
  writeFileSync(join(grow, "index.json"), JSON.stringify(idx));
  let r = runCheck(["--telemetry", grow, "--base-telemetry", base]);
  check("dash-append-only (appending a run passes)", r.code === 0 && /dash-append-only/.test(r.out),
    `expected pass; got exit ${r.code}:\n${r.out}`);

  // Editing an existing run is not.
  const edit = tmp("mist-dash-edit-");
  cpSync(FIXTURE, edit, { recursive: true });
  const i2 = JSON.parse(readFileSync(join(edit, "index.json"), "utf8"));
  const p0 = i2.runs[0].path;
  const e0 = JSON.parse(readFileSync(join(edit, p0), "utf8"));
  for (const s of e0.scanners) s.findings = [];   // making a red run look green
  writeFileSync(join(edit, p0), JSON.stringify(e0, null, 2) + "\n");
  r = runCheck(["--telemetry", edit, "--base-telemetry", base]);
  check("gold-standard-dash-append-only (editing a past run to make it greener fails)",
    r.code === 1 && /dash-append-only/.test(r.out) && /modified/.test(r.out),
    `expected a refusal; got exit ${r.code}:\n${r.out}`);

  // So is deleting one.
  const del = tmp("mist-dash-del-");
  cpSync(FIXTURE, del, { recursive: true });
  const i3 = JSON.parse(readFileSync(join(del, "index.json"), "utf8"));
  i3.runs = i3.runs.slice(1);
  writeFileSync(join(del, "index.json"), JSON.stringify(i3));
  r = runCheck(["--telemetry", del, "--base-telemetry", base]);
  check("dash-append-only (removing a run fails)",
    r.code === 1 && /removed/.test(r.out), `expected a refusal; got exit ${r.code}:\n${r.out}`);
}

// --- dash-url-stable ---------------------------------------------------------------
{
  const doc = readFileSync(join(ROOT, "docs/DASHBOARD.md"), "utf8");
  const url = doc.match(/https:\/\/[a-z0-9.-]+\.github\.io\/[^\s)`*]*/i)?.[0];
  check("dash-url-stable (a Pages URL is documented)", Boolean(url), "no Pages URL in docs/DASHBOARD.md");
  check("dash-url-stable (it is stated as a commitment, not a link)",
    /stability commitment/i.test(doc),
    "docs/DASHBOARD.md does not say the URL will not move; the book quotes it");
}

for (const d of temps) rmSync(d, { recursive: true, force: true });
if (failed) { console.log("\ntest-dashboard: FAILED"); process.exit(1); }
console.log("\ntest-dashboard: all assertions pass");
