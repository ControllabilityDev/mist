#!/usr/bin/env node
/**
 * Generates VIOLATIONS.md from violations.json (EPIC-05 Phase 1b).
 *
 * THE SOURCE FORMAT IS JSON, NOT YAML, AND THAT WAS A CHOICE.
 *
 * EPIC-05 Design names `violations.yaml` and permits JSON explicitly: "a small
 * YAML subset parser, or violations.json if that proves fiddly -- decide and
 * record the choice". JSON was chosen.
 *
 * The reason is the notes. Every entry carries a paragraph of prose, and a
 * hand-rolled YAML subset parser handling block scalars, nested lists and
 * quoting is a SILENT-MISPARSE hazard -- it does not crash, it quietly returns
 * the wrong string. This is the one document in the repository that has to be
 * citable, so the format that cannot be subtly misread wins over the format
 * that is nicer to type. The human-facing artifact is the generated Markdown
 * anyway.
 *
 * VIOLATIONS.md is never hand-edited; scripts/check-violations.mjs fails on a
 * byte difference.
 *
 * Zero dependencies.
 *
 * Usage:
 *   node scripts/gen-violations.mjs            # to stdout
 *   node scripts/gen-violations.mjs --write    # to VIOLATIONS.md
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const CLASSES = [
  ["hidden-input-channel", "CI-1", "install scripts, env-switched behaviour, import-time network, semver drift"],
  ["unfakeable-seam", "CI-6", "live-API coupling with no port; global client imports"],
  ["uncontrolled-emission", "CI-2", "libraries that log, telemeter, or phone home on their own initiative"],
  ["boundary-erosion", "CI-3", "format and transport types leaking through every layer"],
  ["none", "—", "no counter-invariant exhibited; justification required"],
];

const wrap = (s, width = 78, indent = "") => {
  const words = String(s).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) { lines.push(indent + line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join("\n");
};

export function generate(root = SELF_ROOT) {
  const data = JSON.parse(readFileSync(join(root, "violations.json"), "utf8"));
  const entries = data.entries;
  const L = [];

  L.push("# VIOLATIONS");
  L.push("");
  L.push("**Generated from `violations.json` by `scripts/gen-violations.mjs`. Do not edit by");
  L.push("hand — `scripts/check-violations.mjs` fails on a byte difference, and that check");
  L.push("blocks merge.**");
  L.push("");
  L.push(wrap("Each entry maps a subject — a dependency, or a first-party path:line — to the kernel counter-invariant it exhibits, with evidence that resolves against the tree. This is the inventory the concept doc calls the book's exhibit: \"each entry is a kernel invariant with a CVE-shaped shadow\" (`docs/mist-concept-evaluation.md:62`)."));
  L.push("");
  L.push("---");
  L.push("");

  // Summary table
  L.push("## Summary");
  L.push("");
  L.push("| Class | Entries | Second-party | First-party |");
  L.push("|---|---:|---:|---:|");
  for (const [cls] of CLASSES) {
    const rows = entries.filter((e) => e.class === cls);
    if (!rows.length) { L.push(`| ${cls} | 0 | 0 | 0 |`); continue; }
    L.push(`| ${cls} | ${rows.length} | ${rows.filter((e) => e.party === "second").length} | ${rows.filter((e) => e.party === "first").length} |`);
  }
  L.push(`| **total** | **${entries.length}** | **${entries.filter((e) => e.party === "second").length}** | **${entries.filter((e) => e.party === "first").length}** |`);
  L.push("");
  L.push(wrap("The first-party column is shown on purpose. Mist's claim is that its defects are second-party and emergent while Juice Shop's are first-party and curated (`docs/mist-concept-evaluation.md:68`). That claim is only credible if the first-party violations are counted honestly and shown to be the smaller number — and shown by name, so nobody has to take it on faith."));
  L.push("");

  // Enumeration limit (Phase 3b)
  L.push("## What this document does and does not enumerate");
  L.push("");
  L.push(wrap("**Every direct dependency has an entry.** Absence is not permitted; `class: none` with a written justification is. That is what makes the completeness check able to assert anything."));
  L.push("");
  L.push(wrap("**Transitive packages are covered by class, not individually.** There are 736 packages on disk and enumerating them by hand would be neither possible nor useful; the concept doc anticipates this with \"each dependency (or class of them)\". The class-level entries carry `transitive:` subjects and name the specific packages where the count is small enough to name."));
  L.push("");
  L.push(wrap("**Evidence or nothing.** Every non-`none` entry cites evidence that resolves against the tree — an install hook declared in a package.json on disk, a line in a package's source, or a first-party `path:line`. A violation with no resolvable evidence is a claim, and claims do not go in the exhibit."));
  L.push("");
  L.push("---");
  L.push("");

  // Entries by class
  for (const [cls, ci, meaning] of CLASSES) {
    const rows = entries.filter((e) => e.class === cls);
    if (!rows.length) continue;
    L.push(`## ${cls}`);
    L.push("");
    L.push(`*${meaning}*${ci !== "—" ? ` — primary counter-invariant \`${ci}\`` : ""}`);
    L.push("");
    for (const party of ["second", "first"]) {
      const partyRows = rows.filter((e) => e.party === party);
      if (!partyRows.length) continue;
      if (rows.some((e) => e.party !== party)) L.push(`### ${party}-party`, "");
      for (const e of partyRows) {
        L.push(`#### ${e.id} — \`${e.subject}\``);
        L.push("");
        if (e.ci.length) L.push(`**Counter-invariant:** ${e.ci.map((c) => `\`${c}\``).join(", ")}  `);
        if (e.attribution) L.push(`**Behaviour declared by:** \`${e.attribution}\`  `);
        if (e.evidence.length) L.push(`**Evidence:** ${e.evidence.map((x) => `\`${x}\``).join(", ")}`);
        L.push("");
        L.push(wrap(e.note));
        L.push("");
      }
    }
    L.push("---");
    L.push("");
  }

  L.push("## What is deliberately not here");
  L.push("");
  L.push(wrap("**The committed API key (K1).** It is a security finding, not a kernel counter-invariant, and stretching the four-class taxonomy to hold it would weaken the taxonomy. Its lifecycle lives in `docs/KEY_ROTATION.md`."));
  L.push("");
  L.push(wrap("**Fixes.** Recording a violation never triggers a fix on `main`. The paired refactor that eliminates these is EPIC-09, on a separate branch, and it is measured by which of these entries it removes."));
  L.push("");
  return L.join("\n") + "\n";
}

function main(argv) {
  const md = generate();
  if (argv.includes("--write")) {
    writeFileSync(join(SELF_ROOT, "VIOLATIONS.md"), md);
    console.error(`gen-violations: wrote VIOLATIONS.md (${md.split("\n").length} lines)`);
  } else process.stdout.write(md);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
