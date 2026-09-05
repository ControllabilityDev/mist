#!/usr/bin/env node
/**
 * The Mist Index CLI (EPIC-06).
 *
 * Scores an npm repository on five axes and reports what it could not measure.
 * Works on any repository, not just Mist -- a metric tuned to its own subject is
 * not a metric (EPIC-06 Scope rule 3).
 *
 * ZERO RUNTIME DEPENDENCIES, and this is load-bearing rather than tidy. A tool
 * that measures dependency surface must not have one; if it scored badly on its
 * own metric the metric would be a joke. scripts/test-mist-index.mjs asserts it
 * mechanically.
 *
 * Usage:
 *   node tools/mist-index/bin/mist-index.mjs [DIR] [--json] [--scan-run FILE]
 *
 * --scan-run names an EPIC-03 scan-run envelope for axis A3. The battery emits
 * that envelope as a CI artifact rather than into the tree, so without this flag
 * a quarter of the index weight goes unmeasured on a repository the battery has
 * in fact already measured.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { scoreAxis, AXIS_IDS, composite } from "../axes/index.mjs";
import { measured, missing } from "../axes/score.mjs";
import { human, json } from "../report.mjs";
import * as measure from "../lib/measure.mjs";
import { isMain } from "../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHORS = JSON.parse(readFileSync(join(HERE, "..", "anchors.json"), "utf8"));

/** Which raw measurement feeds which axis. */
const SOURCES = {
  A1: (root) => measure.surface(root),
  A2: (root) => measure.installExecution(root),
  A3: (root, opts) => measure.importReach(root, opts.scanRun),
  A4: (root) => measure.churn(root),
  A5: (root) => measure.redState(root),
};

export function run(root, opts = {}) {
  const axes = {};
  for (const id of AXIS_IDS) {
    const m = SOURCES[id](root, opts);
    if (m.ok) axes[id] = measured(m.value, scoreAxis(id, m.value, ANCHORS), m.detail);
    // `insufficient` distinguishes "the instrument exists but the window is not
    // covered" from "no instrument exists". Different claims; not collapsed.
    else if (m.insufficient) axes[id] = missing("insufficient-history", m.why);
    else if (/not built|no telemetry/.test(m.why)) axes[id] = missing("unavailable", m.why);
    else axes[id] = missing("not-measured", m.why);
  }
  const scores = Object.fromEntries(AXIS_IDS.map((id) => [id, axes[id].score]));
  return { anchors: ANCHORS, axes, composite: composite(scores, ANCHORS), target: root };
}

function main(argv) {
  const asJson = argv.includes("--json");
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const scanRun = flag("--scan-run");
  // The flag's VALUE must not also read as the target directory.
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--scan-run");
  const root = resolve(positional[0] ?? ".");
  const result = run(root, { scanRun: scanRun ? resolve(scanRun) : null });
  process.stdout.write((asJson ? json(result) : human(result)) + "\n");
}

// NOT `argv[1].endsWith("mist-index.mjs")`: "test-mist-index.mjs" ends with
// that string too, so importing this module from the test suite ran the CLI.
// isMain compares realpaths, which is also why it exists -- see its header.
if (isMain(import.meta.url)) main(process.argv.slice(2));
