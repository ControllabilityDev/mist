#!/usr/bin/env node
/**
 * Installs a package AND records the decision, measuring around the install
 * (EPIC-08, used by EPIC-02).
 *
 * WHY THIS REPLACED scripts/ledger-add.mjs FOR NEW INSTALLS
 *
 * ledger-add computed `packagesAdded` as (total now - total at the last
 * record). That silently assumes the tree only ever grows. It does not: during
 * session 001 a Prisma release-candidate was swapped for the stable line and
 * the tree lost 364 packages, after which every delta computed that way was
 * wrong -- two installs that really added 2 packages were recorded as adding 0.
 *
 * Measuring immediately before and immediately after the install removes the
 * assumption. The number is then a fact about this one command rather than an
 * inference about the file's history.
 *
 * `packagesAdded` can now be 0 honestly (a package whose deps were all present)
 * and the count is never negative: a removal is reported separately rather than
 * folded into an install record, because "this install added -364 packages" is
 * not a thing that happened.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/ledger-install.mjs --session 001 --deliberation reflex \
 *     --prompt "I need a temperature graph." \
 *     --workspace @mist-demo/web --package recharts [--dev] [--alternatives a,b] [--note TEXT]
 *
 * Extra packages installed by the same command (one decision, several names):
 *     --also react-is,d3-shape
 * Each gets its own record with packagesAdded 0 and a note pointing at the first.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { validate } from "./lib/json-schema-subset.mjs";
import { isMain } from "./lib/is-main.mjs";
import { transitiveTotal, readRecords } from "./ledger-add.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(SELF_ROOT, "install-ledger.jsonl");

/**
 * A contributor's global ~/.npmrc may set save-exact=true. npm applies it
 * silently and NO command-line flag reliably overrides it once a version is
 * already resolved -- --save-prefix, --save-exact=false and --no-save-exact
 * were all tried in session 001 and all lost.
 *
 * An exact pin is a supply-chain mitigation: it closes the semver-range hidden
 * input channel that is counter-invariant CI-1, which Mist exists to measure.
 * So the ranges are widened here, after the install and BEFORE the record is
 * written, so the ledger's `range` field is true at the moment it is written
 * rather than needing a correction afterwards.
 *
 * This is not hygiene applied to Mist. It is hygiene REMOVED from Mist.
 */
function widenRanges(root) {
  const files = ["package.json", "apps/api/package.json", "apps/web/package.json"]
    .map((f) => join(root, f)).filter(existsSync);
  const widened = [];
  for (const file of files) {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    let dirty = false;
    for (const field of ["dependencies", "devDependencies"])
      for (const [name, range] of Object.entries(pkg[field] ?? {}))
        if (range && /^\d/.test(range)) { pkg[field][name] = "^" + range; widened.push(name); dirty = true; }
    if (dirty) writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  }
  return widened;
}

function rangeOf(root, name) {
  for (const f of ["package.json", "apps/api/package.json", "apps/web/package.json"]) {
    const file = join(root, f);
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    for (const field of ["dependencies", "devDependencies"])
      if (pkg[field]?.[name]) return pkg[field][name];
  }
  return null;
}

function append(record) {
  const schema = JSON.parse(readFileSync(join(SELF_ROOT, "schemas/ledger.schema.json"), "utf8"));
  const errs = validate(record, schema, schema);
  if (errs.length) {
    console.error("ledger-install: invalid record, refusing to append:");
    for (const e of errs) console.error(`  ${e}`);
    process.exit(1);
  }
  appendFileSync(LEDGER, JSON.stringify(record) + "\n");
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const pkg = arg("--package");
  const prompt = arg("--prompt");
  const deliberation = arg("--deliberation");
  const session = arg("--session");
  if (!pkg || !prompt || !deliberation || !session) {
    console.error("usage: ledger-install.mjs --package NAME --session NNN --deliberation reflex|brief|researched --prompt TEXT [--workspace WS] [--dev] [--also a,b] [--alternatives a,b] [--note TEXT]");
    process.exit(2);
  }
  const also = (arg("--also", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const names = [pkg, ...also];

  const before = transitiveTotal(SELF_ROOT);
  const npmArgs = ["install", ...names, "--no-audit", "--no-fund"];
  if (arg("--workspace", null)) npmArgs.push("--workspace", arg("--workspace"));
  if (argv.includes("--dev")) npmArgs.push("--save-dev");
  console.error(`ledger-install: npm ${npmArgs.join(" ")}`);
  execFileSync("npm", npmArgs, { cwd: SELF_ROOT, stdio: ["ignore", "inherit", "inherit"] });
  const after = transitiveTotal(SELF_ROOT);

  const widened = widenRanges(SELF_ROOT);
  if (widened.length) console.error(`ledger-install: widened exact pin(s): ${widened.join(", ")}`);

  const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  let seq = readRecords().length;
  const note = arg("--note", null);

  for (const [i, name] of names.entries()) {
    const range = rangeOf(SELF_ROOT, name);
    if (!range) { console.error(`ledger-install: ${name} is not in any package.json -- not recorded`); continue; }
    const record = {
      seq: ++seq, ts, session, actor: arg("--actor", "agent"),
      package: name, range, prompt,
      alternativesConsidered: (arg("--alternatives", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
      deliberation,
      // Measured around THIS command. The whole delta lands on the first name;
      // the others were part of the same decision and are marked as such.
      packagesAdded: i === 0 ? Math.max(0, after - before) : 0,
      transitiveTotalAfter: after,
    };
    const n = i === 0 ? note : `Same npm command as seq ${seq - i} (${pkg}) -- one decision. Transitive cost attributed there.`;
    if (n) record.note = n;
    append(record);
    console.error(`ledger-install: seq ${record.seq}  ${name}@${range}  +${record.packagesAdded}, total ${after}`);
  }
  if (after < before) console.error(`ledger-install: NOTE the tree SHRANK ${before} -> ${after}. Records say +0, which is true; the removal is not an install and is not ledgered.`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
