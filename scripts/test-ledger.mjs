#!/usr/bin/env node
/**
 * Tests for the ledger gate and the redactor (EPIC-08 Test Plan).
 *
 * check-ledger.mjs is the gate; this proves it can say no. Each case builds a
 * throwaway repository in a temp dir breaking exactly one rule.
 *
 * GOLD STANDARD (EPIC-08): "installing a package without a ledger line must make
 * ledger-completeness fail". gold-standard-ledger-completeness below installs a
 * package into a fixture with no record, watches the gate block, then adds the
 * record and watches it pass. If that ever stops happening, EPIC-02 could have
 * started before this EPIC and nobody would know.
 *
 * Usage: node scripts/test-ledger.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redact, loadRules } from "./redact.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "mist-ledger-"));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

let failed = 0;
const ok = (n) => console.log(`  ok    ${n}`);
const bad = (n, why) => { failed = 1; console.log(`  FAIL  ${n}\n        ${why}`); };

const rec = (o) => JSON.stringify({
  seq: 1, ts: "2026-09-03T11:42:07Z", session: "007", actor: "agent",
  package: "moment-timezone", range: "^0.5.45",
  prompt: "times are showing in UTC", deliberation: "reflex",
  packagesAdded: 3, transitiveTotalAfter: 1204, ...o,
});

/** Build a fixture repo. lines = array of JSONL strings. */
function scaffold(name, { lines = [], pkg = null, sessions = ["007"] } = {}) {
  const dir = join(TMP, name);
  mkdirSync(join(dir, "schemas"), { recursive: true });
  mkdirSync(join(dir, "docs/construction-log"), { recursive: true });
  cpSync(join(ROOT, "schemas/ledger.schema.json"), join(dir, "schemas/ledger.schema.json"));
  cpSync(join(ROOT, "schemas/secret-patterns.json"), join(dir, "schemas/secret-patterns.json"));
  writeFileSync(join(dir, "install-ledger.jsonl"), lines.map((l) => l + "\n").join(""));
  for (const s of sessions) writeFileSync(join(dir, `docs/construction-log/${s}-fixture.md`), "# fixture\n");
  if (pkg) writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  return dir;
}

function run(dir, extra = ["--no-git"]) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, "scripts/check-ledger.mjs"), "--root", dir, ...extra],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

const expectBlock = (dir, needle, name, extra) => {
  const { code, out } = run(dir, extra);
  if (code === 0) bad(name, "gate passed; it should have blocked");
  else if (!out.includes(needle)) bad(name, `blocked, but not for "${needle}"`);
  else ok(name);
};
const expectHold = (dir, name, extra) => {
  const { code, out } = run(dir, extra);
  if (code !== 0) bad(name, `gate blocked a clean fixture:\n${out}`);
  else ok(name);
};

console.log("test-ledger (EPIC-08 Test Plan)\n");

// baseline
expectHold(scaffold("baseline", { lines: [rec({})] }), "baseline-clean-fixture-passes");

// ledger-schema-valid
expectBlock(scaffold("bad-type", { lines: [rec({ packagesAdded: "three" })] }),
  "ledger-schema-valid", "ledger-schema-valid (wrong type)");
expectBlock(scaffold("unknown-field", { lines: [rec({ vibes: "good" })] }),
  "ledger-schema-valid", "ledger-schema-valid (unknown field)");
expectBlock(scaffold("missing-prompt", { lines: [JSON.stringify({
    seq: 1, ts: "2026-09-03T11:42:07Z", session: "007", actor: "agent",
    package: "axios", range: "^1.7.0", deliberation: "reflex",
    packagesAdded: 2, transitiveTotalAfter: 100 })] }),
  "ledger-schema-valid", "ledger-schema-valid (missing prompt)");

// ledger-completeness -- THE LOAD-BEARING TEST
expectBlock(scaffold("unledgered", {
  lines: [rec({})],
  pkg: { name: "mist", dependencies: { "moment-timezone": "^0.5.45", axios: "^1.7.0" } },
}), "unledgered direct dependenc", "ledger-completeness (an install with no record)");

// GOLD STANDARD: add the record, the gate goes quiet.
expectHold(scaffold("gold-standard", {
  lines: [rec({}), rec({ seq: 2, package: "axios", range: "^1.7.0", prompt: "call the weather API", packagesAdded: 8, transitiveTotalAfter: 1212 })],
  pkg: { name: "mist", dependencies: { "moment-timezone": "^0.5.45", axios: "^1.7.0" } },
}), "gold-standard-ledger-completeness (recording the install silences the gate)");

// ledger-seq-contiguous
expectBlock(scaffold("seq-gap", { lines: [rec({}), rec({ seq: 3 })] }),
  "not contiguous", "ledger-seq-contiguous (gap)");
expectBlock(scaffold("seq-dup", { lines: [rec({}), rec({ seq: 1 })] }),
  "not contiguous", "ledger-seq-contiguous (duplicate)");
expectBlock(scaffold("seq-start", { lines: [rec({ seq: 4 })] }),
  "expected 1", "ledger-seq-contiguous (does not start at 1)");

// ledger-session-narratives-exist
expectBlock(scaffold("orphan-session", { lines: [rec({ session: "042" })], sessions: ["007"] }),
  "no docs/construction-log", "ledger-session-narratives-exist");

// ledger-deliberation-enum
expectBlock(scaffold("bad-delib", { lines: [rec({ deliberation: "careful" })] }),
  "ledger-schema-valid", "ledger-deliberation-enum (value outside the enum)");

// ledger-no-secrets
expectBlock(scaffold("secret-in-note", {
  lines: [rec({ note: "the key was a1b2c3d4e5f60718293a4b5c6d7e8f90" })],
}), "ledger-no-secrets", "ledger-no-secrets");

// correction records are accepted; edits are not
expectHold(scaffold("correction", {
  lines: [rec({}), JSON.stringify({ type: "correction", seq: 2, ts: "2026-09-04T09:00:00Z", corrects: 1, field: "note", value: "Intl would have covered this", reason: "hindsight, recorded after the fact" })],
}), "ledger-correction-record-accepted");
expectBlock(scaffold("correction-no-reason", {
  lines: [rec({}), JSON.stringify({ type: "correction", seq: 2, ts: "2026-09-04T09:00:00Z", corrects: 1, field: "note", value: "x" })],
}), "ledger-schema-valid", "ledger-correction-requires-a-reason");

// ledger-append-only (needs a real git repo)
{
  const dir = scaffold("append-only", { lines: [rec({}), rec({ seq: 2, package: "axios", range: "^1.7.0" })] });
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "subject1@example.invalid");
  git("config", "user.name", "Test Subject 1");
  git("add", "-A");
  git("commit", "-qm", "fixture");

  const lines = readFileSync(join(dir, "install-ledger.jsonl"), "utf8").split("\n");
  lines[0] = rec({ deliberation: "researched" }); // quietly improve the record
  writeFileSync(join(dir, "install-ledger.jsonl"), lines.join("\n"));
  expectBlock(dir, "diverges from", "ledger-append-only (an existing line was edited)", []);

  writeFileSync(join(dir, "install-ledger.jsonl"),
    [rec({}), rec({ seq: 2, package: "axios", range: "^1.7.0" }), rec({ seq: 3, package: "lodash", range: "^4.17.21" })].map((l) => l + "\n").join(""));
  expectHold(dir, "ledger-append-only-permits-appending", []);
}

// redact-removes-known-patterns
{
  const src = readFileSync(join(ROOT, "fixtures/synthetic-transcript.md"), "utf8");
  const { text, hits } = redact(src, loadRules(ROOT));
  const leftovers = [
    ["fake API key", "a1b2c3d4e5f60718293a4b5c6d7e8f90"],
    ["home path", "/Users/janedoe"],
    ["real-shaped email", "jane.doe@example.com"],
    ["AWS key id", "AKIAIOSFODNN7EXAMPLE"],
    ["private key body", "MIIEowIBAAKCAQEA"],
  ].filter(([, s]) => text.includes(s));

  if (leftovers.length) bad("redact-removes-known-patterns", `still present: ${leftovers.map(([l]) => l).join(", ")}`);
  else if (!text.includes("[REDACTED:")) bad("redact-removes-known-patterns", "no visible redaction marker; invisible cleaning is indistinguishable from curation");
  else if (!text.includes("subject1@example.invalid")) bad("redact-removes-known-patterns", "example.invalid address was removed; synthetic addresses must survive");
  else ok(`redact-removes-known-patterns (${hits.size} pattern(s) fired, markers visible)`);
}

console.log("");
if (failed) { console.log("test-ledger: FAILED"); process.exit(1); }
console.log("test-ledger: all assertions pass");
