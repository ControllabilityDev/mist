#!/usr/bin/env node
/**
 * Surface growth per PR (EPIC-03 Phase 4b/4c).
 *
 * Compares two CycloneDX SBOMs and reports what the change cost in exposure.
 * Posted as a PR comment, because that is the moment it has the most force: the
 * reviewer sees the cost of the convenience in the same view as the
 * convenience (docs/mist-concept-evaluation.md:57).
 *
 * ONE DESIGN DECISION WORTH KNOWING
 *
 * Packages are identified by purl -- name AND version. A version bump is
 * therefore reported as an add and a remove, which looks noisy until you
 * remember what is being counted: a different version is a different artifact,
 * published by possibly a different account, containing possibly different
 * install scripts. For surface accounting that is the honest unit.
 *
 * Because the raw purl counts alone would read as churn, the report ALSO gives
 * the name-level view: names added, names removed, names whose version moved.
 * Both, labelled, so neither can be quoted as the whole story.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/sbom-diff.mjs --base BASE.json --head HEAD.json
 *   node scripts/sbom-diff.mjs --base b.json --head h.json \
 *        --base-sca b.sca.json --head-sca h.sca.json --markdown
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));

const isDirect = (c) =>
  (c.properties ?? []).some((p) => p.name === "mist:direct" && String(p.value) === "true");

function index(sbom) {
  const byPurl = new Map();
  const byName = new Map();
  for (const c of sbom.components ?? []) {
    const purl = c.purl ?? `pkg:npm/${c.name}@${c.version}`;
    byPurl.set(purl, c);
    if (!byName.has(c.name)) byName.set(c.name, new Set());
    byName.get(c.name).add(c.version);
  }
  return { byPurl, byName };
}

const SCA_COUNTS = [
  ["packagesWithInstallScripts", "install-script packages"],
  ["packagesWithNetworkAtInstall", "network-at-install packages"],
  ["packagesWithNetworkAtImport", "network-at-import packages"],
  ["distinctMaintainers", "distinct maintainers"],
];

export function diff({ base, head, baseSca = null, headSca = null }) {
  const b = index(base);
  const h = index(head);

  const addedPurls = [...h.byPurl.keys()].filter((p) => !b.byPurl.has(p)).sort();
  const removedPurls = [...b.byPurl.keys()].filter((p) => !h.byPurl.has(p)).sort();

  const addedDirect = addedPurls.filter((p) => isDirect(h.byPurl.get(p)));
  const addedTransitive = addedPurls.filter((p) => !isDirect(h.byPurl.get(p)));

  const namesAdded = [...h.byName.keys()].filter((n) => !b.byName.has(n)).sort();
  const namesRemoved = [...b.byName.keys()].filter((n) => !h.byName.has(n)).sort();
  const namesRevved = [...h.byName.keys()]
    .filter((n) => b.byName.has(n))
    .filter((n) => [...h.byName.get(n)].some((v) => !b.byName.get(n).has(v)))
    .sort();

  const deltas = [];
  for (const [key, label] of SCA_COUNTS) {
    const bv = baseSca?.summary?.[key];
    const hv = headSca?.summary?.[key];
    // null delta means NOT MEASURED, exactly as in the scan-run envelope. A
    // missing behavioral scan must not render as "no change".
    deltas.push({
      key, label,
      delta: Number.isInteger(bv) && Number.isInteger(hv) ? hv - bv : null,
      from: Number.isInteger(bv) ? bv : null,
      to: Number.isInteger(hv) ? hv : null,
    });
  }

  return {
    totals: { base: b.byPurl.size, head: h.byPurl.size },
    added: { total: addedPurls.length, direct: addedDirect.length, transitive: addedTransitive.length, purls: addedPurls },
    removed: { total: removedPurls.length, purls: removedPurls },
    names: { added: namesAdded, removed: namesRemoved, revved: namesRevved },
    deltas,
  };
}

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

export function render(d, { markdown = false } = {}) {
  const L = [];
  if (markdown) {
    L.push("### Surface delta (EPIC-03 SBOM diff)", "");
    L.push("A red scan is data, not a defect. So is this. It is here so the cost of the");
    L.push("convenience is visible in the same view as the convenience.", "");
    L.push("```");
  }
  L.push(`+ ${String(d.added.total).padStart(3)} packages added     (${d.added.direct} direct-attributable, ${d.added.transitive} transitive)`);
  L.push(`- ${String(d.removed.total).padStart(3)} packages removed`);
  L.push(`  ${String(d.totals.base).padStart(3)} -> ${d.totals.head} total packages on the tree`);
  L.push("");
  L.push(`  names added ${d.names.added.length}, names removed ${d.names.removed.length}, names version-bumped ${d.names.revved.length}`);
  L.push("");
  for (const x of d.deltas) {
    const v = x.delta === null ? "not measured" : `${sign(x.delta)}  (${x.from} -> ${x.to})`;
    L.push(`  D ${x.label.padEnd(28)} ${v}`);
  }
  if (markdown) L.push("```");
  return L.join("\n") + "\n";
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const baseF = arg("--base", null);
  const headF = arg("--head", null);
  if (!baseF || !headF) {
    console.error("usage: sbom-diff.mjs --base BASE.json --head HEAD.json [--base-sca F] [--head-sca F] [--markdown]");
    process.exit(2);
  }
  const scaOr = (f) => (f && existsSync(f) ? read(f) : null);
  const d = diff({
    base: read(baseF), head: read(headF),
    baseSca: scaOr(arg("--base-sca", null)), headSca: scaOr(arg("--head-sca", null)),
  });
  process.stdout.write(render(d, { markdown: argv.includes("--markdown") }));
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
