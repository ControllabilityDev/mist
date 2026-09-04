#!/usr/bin/env node
/**
 * The violation-inventory completeness gate (EPIC-05 Phase 1c). BLOCKING.
 *
 * WHY THIS BLOCKS AND EPIC-03's SCANNERS DO NOT
 *
 * A scanner finding is a measurement of the ecosystem's decay, and gating merge
 * on it would stop Mist recording the thing it exists to record. A drifted
 * inventory is not a finding about the ecosystem -- it is Mist failing to do its
 * own documentation job, and it silently misrepresents the specimen. The word
 * "maintained" in docs/mist-concept-evaluation.md:62 is the whole difficulty of
 * this EPIC, and it is only true if something enforces it.
 *
 * So Mist now has three blocking gates, all of them about HONESTY and none of
 * them about exposure: containment (EPIC-01), the install ledger (EPIC-08), and
 * this.
 *
 * Six assertions, per EPIC-05 Design. Assertion 4 differs from the Design and
 * says so: evidence resolves against the TREE rather than against scan-run.json
 * finding ids, because EPIC-03's behavioural SCA was never wired and there are
 * no finding ids to cite. Mechanical evidence is the stronger source anyway.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/check-violations.mjs
 *   node scripts/check-violations.mjs --root DIR
 *   node scripts/check-violations.mjs --update-fingerprints
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { validate } from "./lib/json-schema-subset.mjs";
import { resolve as resolveEvidence } from "./lib/evidence.mjs";
import { isMain } from "./lib/is-main.mjs";
import { generate } from "./gen-violations.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FINGERPRINTS = "violations.fingerprints.json";

let failed = 0, warned = 0;
const pass = (n, extra = "") => console.log(`  ok    ${n}${extra ? " " + extra : ""}`);
const warn = (n, why) => { warned++; console.log(`  WARN  ${n}\n        ${why}`); };
const fail = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

const manifests = (root) => ["package.json", "apps/api/package.json", "apps/web/package.json"]
  .map((f) => join(root, f)).filter(existsSync);

function directDeps(root) {
  const names = new Set();
  for (const file of manifests(root)) {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"])
      for (const n of Object.keys(pkg[field] ?? {})) names.add(n);
  }
  return names;
}

function main(argv) {
  const i = argv.indexOf("--root");
  const root = i >= 0 ? resolve(argv[i + 1]) : SELF_ROOT;
  const updating = argv.includes("--update-fingerprints");

  console.log("check-violations (EPIC-05 -- BLOCKING)");

  const file = join(root, "violations.json");
  if (!existsSync(file)) { fail("viol-exists", "violations.json is missing"); process.exit(1); }
  const data = JSON.parse(readFileSync(file, "utf8"));

  // --- 0. viol-schema-valid --------------------------------------------------
  const schema = JSON.parse(readFileSync(join(SELF_ROOT, "schemas/violations.schema.json"), "utf8"));
  const errs = validate(data, schema, schema);
  if (errs.length) fail("viol-schema-valid", errs.slice(0, 5).join("\n        "));
  else pass("viol-schema-valid", `(${data.entries.length} entries)`);

  const entries = data.entries;

  // --- 1. viol-completeness --------------------------------------------------
  const subjects = new Set(entries.map((e) => e.subject));
  const missing = [...directDeps(root)].filter((d) => !subjects.has(d)).sort();
  if (missing.length)
    fail("viol-completeness", `direct dependenc(ies) with no entry: ${missing.join(", ")}\n        Every direct dependency needs a row. If it exhibits nothing, say so with class "none" and a written justification -- absence is not an option, because absence makes "maintained" unverifiable.`);
  else pass("viol-completeness", `(${directDeps(root).size} direct dep(s), all classified)`);

  // --- 2. viol-none-needs-note ----------------------------------------------
  const thinNotes = entries.filter((e) => (e.note ?? "").trim().length < 20).map((e) => e.id);
  if (thinNotes.length) fail("viol-none-needs-note", `entries with no real justification: ${thinNotes.join(", ")}`);
  else pass("viol-none-needs-note", "(every entry carries a written note)");

  // --- 3. viol-evidence-required --------------------------------------------
  const noEvidence = entries.filter((e) => e.class !== "none" && !(e.evidence ?? []).length).map((e) => e.id);
  if (noEvidence.length)
    fail("viol-evidence-required", `non-none entr(ies) with no evidence: ${noEvidence.join(", ")} -- a violation with no evidence is a claim, and claims do not go in the exhibit`);
  else pass("viol-evidence-required", `(${entries.filter((e) => e.class !== "none").length} violation(s), all evidenced)`);

  // --- 4 + 5. viol-evidence-resolves, and anchor drift -----------------------
  const fpFile = join(root, FINGERPRINTS);
  const known = existsSync(fpFile) ? JSON.parse(readFileSync(fpFile, "utf8")) : {};
  const fresh = {};
  const unresolved = [];
  const drifted = [];
  let count = 0;
  for (const e of entries)
    for (const ev of e.evidence ?? []) {
      count++;
      const r = resolveEvidence(ev, root);
      if (!r.ok) { unresolved.push(`${e.id} ${ev}: ${r.detail}`); continue; }
      if (r.fingerprint) {
        fresh[ev] = r.fingerprint;
        if (known[ev] && known[ev] !== r.fingerprint) drifted.push(`${e.id} ${ev} -- now: ${r.detail}`);
      }
    }

  if (unresolved.length)
    fail("viol-evidence-resolves", unresolved.join("\n        "));
  else pass("viol-evidence-resolves", `(${count} evidence item(s), all resolve)`);

  if (updating) {
    writeFileSync(fpFile, JSON.stringify(fresh, null, 2) + "\n");
    console.log(`  ---   fingerprints written: ${Object.keys(fresh).length}`);
  } else if (drifted.length) {
    // Deliberately a WARNING. Failing on line drift would make the inventory
    // hostile to edit, and a hostile inventory gets abandoned -- which is the
    // actual risk this EPIC is guarding against (EPIC-05 Design, check 5).
    warn("viol-anchor-drift", drifted.join("\n        ") +
      "\n        The anchored line changed. Re-read each one, confirm it still says what the note claims, then run --update-fingerprints.");
  } else if (Object.keys(known).length) {
    pass("viol-anchor-drift", `(${Object.keys(known).length} anchor(s) unchanged)`);
  }

  // --- 6. viol-md-is-generated ----------------------------------------------
  const mdFile = join(root, "VIOLATIONS.md");
  if (!existsSync(mdFile)) fail("viol-md-is-generated", "VIOLATIONS.md is missing -- run scripts/gen-violations.mjs --write");
  else {
    const onDisk = readFileSync(mdFile, "utf8");
    const expected = generate(root);
    if (onDisk !== expected)
      fail("viol-md-is-generated", "VIOLATIONS.md differs from the generator's output. It is generated, not authored: edit violations.json and re-run scripts/gen-violations.mjs --write.");
    else pass("viol-md-is-generated", "(byte-identical)");
  }

  // --- 7. viol-first-party-counted ------------------------------------------
  const firstParty = entries.filter((e) => e.party === "first" && e.class !== "none").length;
  if (!firstParty)
    fail("viol-first-party-counted", "no first-party violations recorded. Mist's claim is that its defects are second-party and emergent; an inventory that only indicts dependencies makes that claim unfalsifiable.");
  else pass("viol-first-party-counted", `(${firstParty} first-party violation(s))`);

  if (failed) { console.log("\ncheck-violations: the inventory has drifted -- do not merge"); process.exit(1); }
  console.log(`\ncheck-violations: the inventory holds${warned ? ` (${warned} warning(s) above)` : ""}`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
