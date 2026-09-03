#!/usr/bin/env node
/**
 * Generates a gitleaks config from schemas/secret-patterns.json (EPIC-03 Phase
 * 3b; settles the debt EPIC-08 recorded in that file's $comment).
 *
 * WHY GENERATE INSTEAD OF COMMITTING A .gitleaks.toml
 *
 * Two documents in this repository disagreed, and both were right about
 * something:
 *
 *   - EPIC-03's Verification block asserts `test ! -f .gitleaks.toml`, treating
 *     the file as a SUPPRESSION artifact. That instinct is correct: the usual
 *     reason a repository has one is to allowlist findings away, and EPIC-00
 *     Scope rule 4 forbids that outright.
 *
 *   - schemas/secret-patterns.json says EPIC-03 must GENERATE its gitleaks
 *     ruleset from that file rather than fork it, because two divergent secret
 *     regexes is a real hazard: one gate would redact what the other missed.
 *
 * Generating to an UNCOMMITTED path satisfies both. No `.gitleaks.toml` exists
 * in the tree, so nothing can be quietly added to an allowlist in a PR, and the
 * ruleset still has exactly one source. `scripts/check-scan.mjs` asserts both
 * halves: no committed config, and zero allowlists in the generated one.
 *
 * ADDITIVE, NEVER SUBTRACTIVE. `[extend] useDefault = true` keeps every default
 * gitleaks rule. This generator only ADDS Mist's own patterns -- most
 * importantly the 32-hex openweather shape that finds K1.
 *
 * RE2, NOT JAVASCRIPT. gitleaks uses Go's RE2, which has no lookahead,
 * lookbehind or backreferences. A pattern using one is a hard error here rather
 * than a rule that silently never fires.
 *
 * Usage:
 *   node scripts/gen-gitleaks-config.mjs                     # to stdout
 *   node scripts/gen-gitleaks-config.mjs --out build/gitleaks.mist.toml
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Constructs RE2 does not implement. A pattern using one cannot be translated. */
const RE2_UNSUPPORTED = [
  [/\(\?=/, "lookahead (?=...)"],
  [/\(\?!/, "negative lookahead (?!...)"],
  [/\(\?<=/, "lookbehind (?<=...)"],
  [/\(\?<!/, "negative lookbehind (?<!...)"],
  [/\\[1-9]/, "backreference \\1"],
];

const tomlString = (s) => `'''${s}'''`; // literal multi-line: no escape processing

export function toRe2(pattern) {
  const problems = RE2_UNSUPPORTED.filter(([re]) => re.test(pattern.regex)).map(([, why]) => why);
  if (problems.length) {
    throw new Error(
      `pattern "${pattern.id}" uses ${problems.join(" and ")}, which Go's RE2 does not support. ` +
      `Rewrite the pattern in schemas/secret-patterns.json without it, or state in docs/SCANNERS.md ` +
      `that gitleaks structurally cannot enforce this rule. Do NOT ship a rule that silently never fires.`
    );
  }
  // JavaScript carries flags out of band; RE2 takes them as an inline prefix.
  const flags = (pattern.flags ?? "").split("").filter((f) => "ims".includes(f)).join("");
  return flags ? `(?${flags})${pattern.regex}` : pattern.regex;
}

export function generate(root = SELF_ROOT) {
  const spec = JSON.parse(readFileSync(join(root, "schemas/secret-patterns.json"), "utf8"));
  const lines = [
    "# GENERATED -- do not edit, and do not commit.",
    "#",
    "# Source: schemas/secret-patterns.json (version " + spec.version + ")",
    "# Generator: scripts/gen-gitleaks-config.mjs (EPIC-03 Phase 3b)",
    "#",
    "# This file is written into build/ at CI time and is gitignored. A committed",
    "# .gitleaks.toml is what EPIC-03's no-suppression assertion forbids; a",
    "# generated one has exactly one source of truth and no allowlist. If you are",
    "# reading this inside the repository tree, something went wrong.",
    "#",
    "# There is deliberately NO [allowlist] section anywhere below. Suppression is",
    "# mitigation, and mitigation corrupts the measurement (EPIC-00 Scope rule 4).",
    "",
    'title = "Mist secret patterns (generated)"',
    "",
    "[extend]",
    "# ADDITIVE. Keep every default gitleaks rule; Mist only adds to them.",
    "useDefault = true",
    "",
  ];

  for (const p of spec.patterns) {
    lines.push(
      "[[rules]]",
      `id = ${JSON.stringify("mist-" + p.id)}`,
      `description = ${JSON.stringify(p.description)}`,
      `regex = ${tomlString(toRe2(p))}`,
      "",
    );
  }
  return { toml: lines.join("\n"), count: spec.patterns.length };
}

function main(argv) {
  const i = argv.indexOf("--out");
  const out = i >= 0 ? argv[i + 1] : null;
  const { toml, count } = generate();
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, toml);
    console.error(`gen-gitleaks-config: wrote ${out} (${count} Mist rules + gitleaks defaults, 0 allowlists)`);
  } else {
    process.stdout.write(toml);
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
