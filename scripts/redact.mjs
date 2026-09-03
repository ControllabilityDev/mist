#!/usr/bin/env node
/**
 * Mechanical redaction for construction-log transcripts (EPIC-08 Phase 0d).
 *
 * Zero dependencies. Reads the ONE secret ruleset in
 * schemas/secret-patterns.json -- it does not carry its own copy, because two
 * divergent secret regexes in this repository would be a real hazard
 * (EPIC-08 "Reuse (do NOT recreate)").
 *
 * EVERY REMOVAL LEAVES A VISIBLE MARKER: [REDACTED:<pattern-id>].
 * This is deliberate. An invisibly-cleaned transcript is indistinguishable from
 * a curated one, and a curated transcript is not evidence (docs/CONSTRUCTION.md).
 *
 * MECHANICAL REDACTION IS NECESSARY AND INSUFFICIENT. The long tail is
 * unpatterned. No transcript is committed until a named human has read it in
 * full and recorded that in docs/CONSTRUCTION.md.
 *
 * Usage:
 *   node scripts/redact.mjs <file>          # redacted text to stdout
 *   node scripts/redact.mjs <file> --report # summary of what was removed
 *   cat x | node scripts/redact.mjs         # stdin
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadRules(root = ROOT) {
  const spec = JSON.parse(readFileSync(resolve(root, "schemas/secret-patterns.json"), "utf8"));
  return [...spec.patterns, ...spec.personalDataPatterns].map((p) => ({
    id: p.id,
    redactGroup: p.redactGroup ?? 0,
    re: new RegExp(p.regex, (p.flags ?? "") + "g"),
  }));
}

/** Returns { text, hits: Map<id, count> }. */
export function redact(input, rules = loadRules()) {
  const hits = new Map();
  let text = input;

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    text = text.replace(rule.re, (...args) => {
      const groups = args.slice(0, -2);
      hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
      const marker = `[REDACTED:${rule.id}]`;
      if (rule.redactGroup > 0 && groups[rule.redactGroup] !== undefined) {
        // Keep the surrounding shape (e.g. `api_key="..."`) and drop only the
        // value, so a reader can see WHAT was removed, not merely that
        // something was. The tail (a closing quote, a comma) is preserved.
        const whole = groups[0];
        const value = groups[rule.redactGroup];
        const at = whole.lastIndexOf(value);
        return whole.slice(0, at) + marker + whole.slice(at + value.length);
      }
      return marker;
    });
  }

  return { text, hits };
}

function main(argv) {
  const args = argv.filter((a) => a !== "--report");
  const wantReport = argv.includes("--report");
  const source = args[0]
    ? readFileSync(args[0], "utf8")
    : readFileSync(0, "utf8");

  const { text, hits } = redact(source);

  if (wantReport) {
    if (hits.size === 0) {
      process.stdout.write("redact: nothing matched\n");
    } else {
      process.stdout.write("redact: removed\n");
      for (const [id, n] of [...hits].sort()) {
        process.stdout.write(`  ${n}x ${id}\n`);
      }
    }
    process.stdout.write(
      "\nMechanical only. A named human must still read this in full before it is\n" +
      "committed, and record that in docs/CONSTRUCTION.md.\n"
    );
    return;
  }

  process.stdout.write(text);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
