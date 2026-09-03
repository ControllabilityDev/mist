#!/usr/bin/env node
/**
 * Appends one install record to install-ledger.jsonl (EPIC-08 Phase 1, used by
 * EPIC-02).
 *
 * WHY THIS IS A TOOL AND NOT A TEXT EDITOR
 *
 * `packagesAdded` and `transitiveTotalAfter` are CONTEMPORANEOUS fields
 * (docs/CONSTRUCTION.md): they record what was true at the moment of the
 * install, and they may never be revised. A hand-typed count is a guess, and a
 * guessed number in an append-only file cannot be corrected without a
 * correction record. So the count is measured, here, immediately.
 *
 * THE MEASURE IS THE ONE THE SCHEMA NAMES, VERBATIM:
 *
 *     npm ls --all --parseable | wc -l
 *
 * That count INCLUDES the root directory line, so it is exactly 1 greater than
 * the number of installed packages, and 1 greater than a CycloneDX component
 * count. It is used unchanged because schemas/ledger.schema.json names this
 * command and one definition beats a better definition that disagrees with the
 * file it is written into. EPIC-06 must not compare it naively against
 * scan-run.json's surface.transitivePackages; the corrigendum records this.
 *
 * The contemporaneous fields you must supply yourself, because no tool can
 * measure intent: --prompt, --deliberation, --alternatives.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/ledger-add.mjs --package express --range '^5.1.0' \
 *     --session 001 --deliberation reflex \
 *     --prompt "I need an API" \
 *     --alternatives "fastify,koa"
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { validate } from "./lib/json-schema-subset.mjs";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(SELF_ROOT, "install-ledger.jsonl");

/** The measure named by schemas/ledger.schema.json. Do not "improve" it. */
export function transitiveTotal(root = SELF_ROOT) {
  try {
    // npm ls exits non-zero on peer-dependency complaints while still printing
    // the tree, so the exit code is ignored and the output is what counts.
    const out = execSync("npm ls --all --parseable 2>/dev/null | wc -l", { cwd: root, encoding: "utf8" });
    return parseInt(out.trim(), 10);
  } catch (e) {
    const out = (e.stdout ?? "").toString().trim();
    return /^\d+$/.test(out) ? parseInt(out, 10) : 0;
  }
}

export function readRecords() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const pkg = arg("--package");
  const range = arg("--range");
  const prompt = arg("--prompt");
  const deliberation = arg("--deliberation");
  const session = arg("--session");
  if (!pkg || !range || !prompt || !deliberation || !session) {
    console.error("usage: ledger-add.mjs --package NAME --range RANGE --session NNN --deliberation reflex|brief|researched --prompt TEXT [--alternatives a,b] [--actor agent|human]");
    process.exit(2);
  }

  const records = readRecords();
  const installs = records.filter((r) => (r.type ?? "install") === "install");
  const prevTotal = installs.length ? installs[installs.length - 1].transitiveTotalAfter : 0;
  const total = transitiveTotal();

  const record = {
    seq: records.length + 1,
    ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    session,
    actor: arg("--actor", "agent"),
    package: pkg,
    range,
    prompt,
    alternativesConsidered: (arg("--alternatives", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
    deliberation,
    // A first install has no previous total to subtract from, so the whole tree
    // is attributed to it. That is honest: it did pull all of it in.
    packagesAdded: Math.max(0, total - prevTotal),
    transitiveTotalAfter: total,
  };
  // Several packages are often one decision and one npm command (next + react +
  // react-dom). The transitive cost lands on whichever record is written first;
  // --note says so on the others, rather than splitting a number nobody measured.
  const note = arg("--note", null);
  if (note) record.note = note;

  const schema = JSON.parse(readFileSync(join(SELF_ROOT, "schemas/ledger.schema.json"), "utf8"));
  const errs = validate(record, schema, schema);
  if (errs.length) {
    console.error("ledger-add: the record is invalid, refusing to append:");
    for (const e of errs) console.error(`  ${e}`);
    process.exit(1);
  }

  appendFileSync(LEDGER, JSON.stringify(record) + "\n");
  console.error(`ledger-add: seq ${record.seq}  ${pkg}@${range}  +${record.packagesAdded} package(s), total ${total}`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
