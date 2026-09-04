#!/usr/bin/env node
/**
 * Appends one scan-run envelope to the telemetry record (EPIC-04 Phase 1a).
 *
 * APPEND-ONLY, ENFORCED HERE AS WELL AS IN CI. This script refuses to overwrite
 * an existing run file or to rewrite an existing index entry. The CI check
 * (`dash-append-only`) is the backstop; this is the part that makes the correct
 * thing the easy thing.
 *
 * NOTHING IS BACKFILLED. The record starts when it starts (EPIC-04 Phase 1c),
 * and `recordStarted` is set once, on the first run, and never revised.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/append-telemetry.mjs --record ./base --envelope ./scan-run.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";
import { validate } from "./lib/json-schema-subset.mjs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function append({ recordDir, envelope }) {
  const indexFile = join(recordDir, "index.json");
  const index = existsSync(indexFile)
    ? JSON.parse(readFileSync(indexFile, "utf8"))
    : { schemaVersion: "1", recordStarted: null, runs: [] };

  // A run is identified by commit AND timestamp: the same commit can legitimately
  // be scanned twice (that is how EPIC-07's decay experiment works), and the
  // second scan is a different observation, not a correction of the first.
  const key = `${envelope.startedAt}_${envelope.commit}`;
  if (index.runs.some((r) => `${r.startedAt}_${r.sha}` === key))
    return { appended: false, why: `run ${key} is already in the record; the record is append-only and never re-writes` };

  const name = `${envelope.startedAt.replace(/:/g, "-")}_${envelope.commit.slice(0, 12)}.json`;
  const path = `runs/${name}`;
  const file = join(recordDir, path);
  if (existsSync(file)) return { appended: false, why: `${path} already exists; refusing to overwrite a recorded run` };

  mkdirSync(join(recordDir, "runs"), { recursive: true });
  writeFileSync(file, JSON.stringify(envelope, null, 2) + "\n");

  index.runs.push({ sha: envelope.commit, ref: envelope.ref, startedAt: envelope.startedAt, path });
  // Set once, never revised. A moving start date would let the record appear
  // younger than it is.
  if (!index.recordStarted) index.recordStarted = envelope.startedAt;
  writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");
  return { appended: true, path, total: index.runs.length };
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const recordDir = resolve(arg("--record", "./telemetry"));
  const envFile = resolve(arg("--envelope", "./scan-run.json"));
  if (!existsSync(envFile)) { console.error(`append-telemetry: no envelope at ${envFile}`); process.exit(1); }

  const envelope = JSON.parse(readFileSync(envFile, "utf8"));
  const schema = JSON.parse(readFileSync(join(SELF_ROOT, "schemas/scan-run.schema.json"), "utf8"));
  const errs = validate(envelope, schema, schema);
  if (errs.length) {
    console.error("append-telemetry: the envelope is malformed, refusing to record it:");
    for (const e of errs.slice(0, 5)) console.error(`  ${e}`);
    process.exit(1);
  }

  const r = append({ recordDir, envelope });
  if (!r.appended) { console.error(`append-telemetry: ${r.why}`); process.exit(0); }
  console.error(`append-telemetry: recorded ${r.path} (${r.total} run(s) in the record)`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
