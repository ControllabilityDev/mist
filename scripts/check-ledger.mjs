#!/usr/bin/env node
/**
 * The install-ledger completeness gate (EPIC-08 Phase 0e). BLOCKING.
 *
 * WHY THIS BLOCKS: a missing ledger entry is UNRECOVERABLE. The moment has
 * passed, and a backfilled record is indistinguishable from a fabricated one.
 * The check must fire at the only time it can still be fixed -- which is before
 * the PR lands, not after.
 *
 * Mist blocks on honesty, never on exposure: this gate and EPIC-01's containment
 * gate block; every scanner in EPIC-03 reports (docs/CONSTRUCTION.md).
 *
 * Zero dependencies. Validates against schemas/ledger.schema.json rather than
 * carrying its own copy of the rules, so the schema and the checker cannot
 * drift apart.
 *
 * Usage:
 *   node scripts/check-ledger.mjs               # check this repository
 *   node scripts/check-ledger.mjs --root DIR    # check a fixture tree
 *   node scripts/check-ledger.mjs --no-git      # skip the append-only check
 *
 * Env:
 *   MIST_LEDGER_BASE   git ref to compare against for append-only.
 *                      Default HEAD (i.e. what is already committed).
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const skip = (n, why) => console.log(`  skip  ${n}\n        ${why}`);
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

// --- a deliberately small JSON Schema subset --------------------------------
// Enough for schemas/ledger.schema.json: oneOf, $ref/$defs, type, required,
// additionalProperties:false, enum, const, minimum, minLength, pattern, items.
// Not a general validator, and it says so rather than pretending otherwise.
function validate(value, schema, root, path = "") {
  if (schema.$ref) {
    const def = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root);
    return validate(value, def, root, path);
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => validate(value, s, root, path));
    const okCount = results.filter((r) => r.length === 0).length;
    if (okCount === 1) return [];
    if (okCount > 1) return [`${path || "/"}: matches more than one record type`];
    return [`${path || "/"}: matches no record type -- ${results.flat()[0]}`];
  }
  const errs = [];
  if (schema.const !== undefined && value !== schema.const)
    errs.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    errs.push(`${path}: ${JSON.stringify(value)} not in [${schema.enum.join(", ")}]`);
  if (schema.type === "integer" && !Number.isInteger(value))
    errs.push(`${path}: expected integer`);
  if (schema.type === "string" && typeof value !== "string")
    errs.push(`${path}: expected string`);
  if (schema.type === "array" && !Array.isArray(value))
    errs.push(`${path}: expected array`);
  if (schema.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value)))
    errs.push(`${path}: expected object`);
  if (errs.length) return errs;

  if (schema.minimum !== undefined && value < schema.minimum)
    errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
  if (schema.minLength !== undefined && String(value).length < schema.minLength)
    errs.push(`${path}: shorter than ${schema.minLength}`);
  if (schema.pattern && !new RegExp(schema.pattern).test(value))
    errs.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  if (schema.items && Array.isArray(value))
    value.forEach((v, i) => errs.push(...validate(v, schema.items, root, `${path}[${i}]`)));

  if (schema.type === "object" || schema.properties) {
    for (const key of schema.required ?? [])
      if (!(key in value)) errs.push(`${path}: missing required field "${key}"`);
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!(key in (schema.properties ?? {}))) errs.push(`${path}: unknown field "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties ?? {}))
      if (key in value) errs.push(...validate(value[key], sub, root, `${path}.${key}`));
  }
  return errs;
}

// --- inputs -----------------------------------------------------------------
function readLedger(root) {
  const file = join(root, "install-ledger.jsonl");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  return raw
    .split("\n")
    .map((line, i) => ({ line: i + 1, raw: line }))
    .filter((e) => e.raw.trim() !== "");
}

function directDeps(root) {
  const file = join(root, "package.json");
  if (!existsSync(file)) return null;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const out = new Set();
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"])
    for (const name of Object.keys(pkg[field] ?? {})) out.add(name);
  return out;
}

function secretRules(root) {
  const spec = JSON.parse(readFileSync(join(root, "schemas/secret-patterns.json"), "utf8"));
  return spec.patterns.map((p) => ({ id: p.id, re: new RegExp(p.regex, p.flags ?? "") }));
}

// --- the six assertions -----------------------------------------------------
function main(argv) {
  const rootIdx = argv.indexOf("--root");
  const root = rootIdx >= 0 ? resolve(argv[rootIdx + 1]) : SELF_ROOT;
  const noGit = argv.includes("--no-git");

  console.log("check-ledger (EPIC-08 -- BLOCKING)");

  const entries = readLedger(root);
  if (entries === null) {
    fail("ledger-exists", "install-ledger.jsonl is missing -- EPIC-08 Phase 0a creates it, and it must exist before the first install");
    return finish();
  }

  // parse + schema
  const schema = JSON.parse(readFileSync(join(root, "schemas/ledger.schema.json"), "utf8"));
  const records = [];
  let schemaErrs = [];
  for (const e of entries) {
    let obj;
    try { obj = JSON.parse(e.raw); }
    catch { schemaErrs.push(`line ${e.line}: not valid JSON`); continue; }
    const errs = validate(obj, schema, schema, `line ${e.line}`);
    if (errs.length) schemaErrs.push(...errs);
    else records.push({ ...e, obj });
  }
  if (schemaErrs.length) fail("ledger-schema-valid", schemaErrs.slice(0, 5).join("\n        "));
  else pass("ledger-schema-valid", `(${records.length} record(s))`);

  // 5. deliberation enum -- asserted separately from the schema because it is
  //    the field that carries the argument, and a silent drift here would make
  //    the whole ledger uninteresting rather than merely invalid.
  const allowed = schema.$defs.install.properties.deliberation.enum;
  const badDelib = records
    .filter((r) => (r.obj.type ?? "install") === "install")
    .filter((r) => !allowed.includes(r.obj.deliberation))
    .map((r) => `line ${r.line}: "${r.obj.deliberation}"`);
  if (badDelib.length) fail("ledger-deliberation-enum", badDelib.join("; "));
  else pass("ledger-deliberation-enum", `(allowed: ${allowed.join(", ")})`);

  // 2. seq contiguous and strictly increasing
  const seqs = records.map((r) => r.obj.seq);
  const seqProblems = [];
  seqs.forEach((s, i) => {
    if (i === 0 && s !== 1) seqProblems.push(`first seq is ${s}, expected 1`);
    if (i > 0 && s !== seqs[i - 1] + 1) seqProblems.push(`seq ${seqs[i - 1]} -> ${s} is not contiguous`);
  });
  if (seqProblems.length) fail("ledger-seq-contiguous", seqProblems.join("; "));
  else pass("ledger-seq-contiguous", `(${seqs.length} record(s))`);

  // 1. every direct dependency has a record -- THE LOAD-BEARING ASSERTION
  const deps = directDeps(root);
  if (deps === null) {
    skip("ledger-completeness", "no package.json yet (EPIC-02 owns it); nothing to attribute");
  } else {
    const ledgered = new Set(records.filter((r) => r.obj.package).map((r) => r.obj.package));
    const missing = [...deps].filter((d) => !ledgered.has(d)).sort();
    if (missing.length)
      fail("ledger-completeness", `unledgered direct dependenc(ies): ${missing.join(", ")} -- the moment has passed; record the gap in docs/CONSTRUCTION.md rather than backfilling`);
    else pass("ledger-completeness", `(${deps.size} direct dep(s))`);
  }

  // 4. every session referenced has a narrative
  const logDir = join(root, "docs/construction-log");
  const narratives = existsSync(logDir)
    ? new Set(readdirSync(logDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, 3)))
    : new Set();
  const sessions = [...new Set(records.map((r) => r.obj.session).filter(Boolean))];
  const orphan = sessions.filter((s) => !narratives.has(s)).sort();
  if (orphan.length) fail("ledger-session-narratives-exist", `session(s) with no docs/construction-log/<id>-*.md: ${orphan.join(", ")}`);
  else pass("ledger-session-narratives-exist", `(${sessions.length} session(s), ${narratives.size} narrative(s))`);

  // 6. no ledger line matches the secret ruleset
  const rules = secretRules(root);
  const leaks = [];
  for (const e of entries)
    for (const rule of rules)
      if (rule.re.test(e.raw)) leaks.push(`line ${e.line}: ${rule.id}`);
  if (leaks.length) fail("ledger-no-secrets", leaks.join("; "));
  else pass("ledger-no-secrets", `(${rules.length} pattern(s))`);

  // 3. append-only against the previous commit
  if (noGit) {
    skip("ledger-append-only", "--no-git");
  } else {
    const base = process.env.MIST_LEDGER_BASE ?? "HEAD";
    let previous;
    try {
      previous = execFileSync("git", ["-C", root, "show", `${base}:install-ledger.jsonl`], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      previous = ""; // not in the base tree yet -- first landing
    }
    const current = readFileSync(join(root, "install-ledger.jsonl"), "utf8");
    if (!current.startsWith(previous))
      fail("ledger-append-only", `install-ledger.jsonl diverges from ${base}: an existing line was changed or removed. Corrections are APPENDED as a correction record (schemas/ledger.schema.json), never edited in place.`);
    else pass("ledger-append-only", `(vs ${base}, +${current.length - previous.length} bytes)`);
  }

  return finish();
}

function finish() {
  if (failed) { console.log("\ncheck-ledger: FAILED -- do not merge"); process.exit(1); }
  console.log("\ncheck-ledger: the record holds");
}

main(process.argv.slice(2));
