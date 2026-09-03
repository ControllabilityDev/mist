#!/usr/bin/env node
/**
 * Refreshes the advisory denylist from osv-scanner output (EPIC-03 Phase 1d).
 *
 * CORRECTION TO EPIC-03's OWN TEXT. The EPIC's Key Files table asks for a new
 * `security/denylist.json`. That file must not be created: EPIC-01 already
 * shipped `deploy/advisory-denylist.txt`, `scripts/check-containment.sh` reads
 * it as a BLOCKING input, and the file's own header says "Refreshed by the
 * EPIC-03 osv-scanner job, which has not been built yet." A second denylist
 * would split the gate's input, and the gate would enforce whichever half
 * someone remembered. So this script refreshes the existing file. Recorded as a
 * corrigendum in docs/EPIC-03_The_Scan_Battery.md.
 *
 * IT PROPOSES; IT DOES NOT COMMIT.
 *
 * The denylist is an input to a blocking gate. A scan job that could rewrite it
 * unattended would be able to change what blocks merge without review -- and a
 * non-blocking job editing a blocking gate's rules is exactly backwards. So the
 * osv job writes a PROPOSAL to build/ and surfaces the additions in the job
 * summary. A human copies them across. Slower, and the only version that is
 * actually safe.
 *
 * WHAT COUNTS AS "FLAGGED MALICIOUS TODAY". Containment rule 1 is narrow on
 * purpose: a package that goes bad LATER is the experiment; one that is bad NOW
 * is a defect (SECURITY.md). So only OSV's malicious-package advisories count
 * -- `MAL-*` ids. An ordinary CVE is decay, and decay is data.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/refresh-denylist.mjs --osv build/raw/osv-scanner.json
 *   node scripts/refresh-denylist.mjs --osv F --out build/advisory-denylist.proposed.txt
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DENYLIST = "deploy/advisory-denylist.txt";

/** An advisory that means "this package is malicious", not "this package has a bug". */
export const isMaliciousAdvisory = (vuln) =>
  /^MAL-/.test(vuln.id ?? "") ||
  (vuln.aliases ?? []).some((a) => /^MAL-/.test(a));

export function maliciousPackages(osv) {
  const names = new Set();
  for (const result of osv?.results ?? [])
    for (const pkg of result.packages ?? [])
      for (const vuln of pkg.vulnerabilities ?? [])
        if (isMaliciousAdvisory(vuln) && pkg.package?.name) names.add(pkg.package.name);
  return [...names].sort();
}

export function existingEntries(root = SELF_ROOT) {
  const file = join(root, DENYLIST);
  if (!existsSync(file)) return { header: [], entries: new Set() };
  const lines = readFileSync(file, "utf8").split("\n");
  const entries = new Set();
  const header = [];
  for (const line of lines) {
    const body = line.split("#", 1)[0].trim();
    if (body) entries.add(body);
    else if (line.startsWith("#") || line.trim() === "") header.push(line);
  }
  return { header, entries };
}

export function propose({ osv, root = SELF_ROOT }) {
  const found = maliciousPackages(osv);
  const { header, entries } = existingEntries(root);
  const added = found.filter((n) => !entries.has(n));
  const all = [...new Set([...entries, ...found])].sort();
  const body = [
    ...header,
    ...(all.length ? ["", `# Refreshed by scripts/refresh-denylist.mjs on ${new Date().toISOString().slice(0, 10)}`, ...all] : []),
  ].join("\n").replace(/\n{3,}/g, "\n\n");
  return { added, total: all.length, text: body.endsWith("\n") ? body : body + "\n" };
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const osvFile = arg("--osv", null);
  const out = arg("--out", null);

  if (!osvFile || !existsSync(osvFile)) {
    // Not an error: before EPIC-02 there is no lockfile, so osv has nothing to
    // scan and produces no output. Saying so is the point.
    console.error(`refresh-denylist: no osv output at ${osvFile ?? "(--osv not given)"} -- nothing to refresh from.`);
    console.error(`refresh-denylist: ${DENYLIST} is unchanged and remains hand-maintained.`);
    process.exit(0);
  }

  const { added, total, text } = propose({ osv: JSON.parse(readFileSync(osvFile, "utf8")) });

  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, text); }
  else process.stdout.write(text);

  console.error(`refresh-denylist: ${total} entr(ies) total, ${added.length} new.`);
  if (added.length) {
    console.error("refresh-denylist: NEW flagged-malicious packages -- copy these into " + DENYLIST + " by hand:");
    for (const n of added) console.error(`  ${n}`);
    console.error("refresh-denylist: this script never edits the blocking gate's input itself.");
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
