/**
 * Evidence resolvers for the violation inventory (EPIC-05).
 *
 * WHY THIS EXISTS INSTEAD OF SCANNER FINDING IDS
 *
 * EPIC-05's Design has evidence pointing at `scan-run.json` finding ids from
 * EPIC-03's behavioural SCA. That SCA was never wired -- EPIC-03 Phase 2a is
 * still open -- so there are no finding ids to cite, and Scope rule 4 says a
 * violation with no evidence is a claim, and claims do not go in the exhibit.
 *
 * So evidence is derived MECHANICALLY from the tree instead. That is a stronger
 * source, not a weaker one: an install script is either declared in a
 * package.json on disk or it is not, and anyone can re-run the check. A finding
 * id is a tool's opinion, reproducible only by re-running that tool at that
 * version.
 *
 * Four evidence forms, each of which either resolves or fails loudly:
 *
 *   install-script:<pkg>            <pkg>/package.json declares pre/install/postinstall
 *   import-effect:<pkg>:<file>:<n>  line n of <pkg>/<file> exists (a module-scope effect)
 *   path:<file>:<n>                 first-party anchor: line n of <file> exists
 *   fanout:<pkg>:<n>                <pkg> declares at least n direct dependencies
 *
 * Every resolver returns { ok, detail, fingerprint }. `fingerprint` is a short
 * hash of the anchored line so that drift can WARN without failing -- see the
 * rationale in EPIC-05 Design, check 5: failing on line drift makes the
 * inventory hostile to edit, and a hostile inventory gets abandoned.
 *
 *   pkg-file:<pkg>:<file>           <pkg> ships <file> (a whole-module behaviour)
 *
 * Zero dependencies.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const shortHash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);

function readPkg(root, name) {
  const file = join(root, "node_modules", name, "package.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function lineOf(root, relPath, n) {
  const file = join(root, relPath);
  if (!existsSync(file)) return { ok: false, detail: `${relPath} does not exist` };
  const lines = readFileSync(file, "utf8").split("\n");
  if (n < 1 || n > lines.length)
    return { ok: false, detail: `${relPath} has ${lines.length} line(s), anchor asks for ${n}` };
  const text = lines[n - 1].trim();
  return { ok: true, detail: text.slice(0, 90), fingerprint: shortHash(text) };
}

export const EVIDENCE_FORMS = ["install-script", "import-effect", "path", "fanout", "pkg-file"];

export function resolve(evidence, root) {
  const [form, ...rest] = evidence.split(":");

  if (form === "install-script") {
    const name = rest.join(":");
    const pkg = readPkg(root, name);
    if (!pkg) return { ok: false, detail: `${name} is not in node_modules` };
    const hooks = ["preinstall", "install", "postinstall"].filter((h) => pkg.scripts?.[h]);
    if (!hooks.length) return { ok: false, detail: `${name}@${pkg.version} declares no install hook -- the violation may have been fixed upstream, which is worth knowing` };
    return { ok: true, detail: `${name}@${pkg.version} runs ${hooks.join(", ")}`, fingerprint: shortHash(hooks.map((h) => pkg.scripts[h]).join("|")) };
  }

  if (form === "import-effect") {
    const n = Number(rest.pop());
    const file = rest.pop();
    const name = rest.join(":");
    const pkg = readPkg(root, name);
    if (!pkg) return { ok: false, detail: `${name} is not in node_modules` };
    const r = lineOf(root, join("node_modules", name, file), n);
    return r.ok ? { ...r, detail: `${name}@${pkg.version} ${file}:${n} -- ${r.detail}` } : r;
  }

  if (form === "path") {
    const n = Number(rest.pop());
    return lineOf(root, rest.join(":"), n);
  }

  if (form === "pkg-file") {
    // "this package ships a file that does X". Weaker than a line anchor and
    // used only where the behaviour is a whole module rather than a statement
    // -- a telemetry poster, for instance. The note must say what the file does;
    // the evidence only proves it is there.
    const rel = rest.pop();
    const name = rest.join(":");
    const pkg = readPkg(root, name);
    if (!pkg) return { ok: false, detail: `${name} is not in node_modules` };
    const file = join(root, "node_modules", name, rel);
    if (!existsSync(file)) return { ok: false, detail: `${name}@${pkg.version} does not ship ${rel} -- it may have been removed upstream, which is worth knowing` };
    return { ok: true, detail: `${name}@${pkg.version} ships ${rel}`, fingerprint: shortHash(rel) };
  }

  if (form === "fanout") {
    const n = Number(rest.pop());
    const name = rest.join(":");
    const pkg = readPkg(root, name);
    if (!pkg) return { ok: false, detail: `${name} is not in node_modules` };
    const count = Object.keys(pkg.dependencies ?? {}).length;
    if (count < n) return { ok: false, detail: `${name}@${pkg.version} declares ${count} direct dep(s), evidence claims at least ${n}` };
    return { ok: true, detail: `${name}@${pkg.version} declares ${count} direct dependenc(ies)`, fingerprint: shortHash(String(count)) };
  }

  return { ok: false, detail: `unknown evidence form "${form}" -- expected one of ${EVIDENCE_FORMS.join(", ")}` };
}
