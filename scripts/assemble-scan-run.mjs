#!/usr/bin/env node
/**
 * The assembler (EPIC-03 Phase 0c, 1c, 2b/2c, 5a/5b).
 *
 * Reads each scanner's raw output from a directory and normalizes it into the
 * one envelope EPIC-04 and EPIC-06 consume: schemas/scan-run.schema.json.
 *
 * THREE RULES THIS SCRIPT EXISTS TO ENFORCE
 *
 * 1. A scanner that did not run is `skipped`, never a clean `ran` with zero
 *    findings. Before EPIC-02 lands there is no dependency tree and five of the
 *    seven scanners have nothing to look at. Reporting zero would be a false
 *    green -- the one failure mode that would actually damage the argument.
 *
 * 2. No secret material crosses into the envelope. gitleaks' raw JSON carries
 *    the matched secret by construction; the normalizer copies File:StartLine
 *    and the rule id, and nothing else. See scrubbed() below.
 *
 * 3. Counter-invariant mappings are declared in one table (CI_MAP) with an
 *    explicit list of types that have NO clean mapping. A silent null is a
 *    guess wearing a data type. A declared unmapped type is a finding about
 *    the taxonomy, which is worth having.
 *
 * Zero dependencies. Node builtins only, like every gate in this repository.
 *
 * Usage:
 *   node scripts/assemble-scan-run.mjs --raw DIR [--out FILE]
 *   node scripts/assemble-scan-run.mjs --raw DIR --commit SHA --ref main
 *
 * DIR layout, one pair per scanner id:
 *   <id>.json        the tool's own output, verbatim (absent if it never ran)
 *   <id>.meta.json   { status, version, exitCode, durationMs, skipReason }
 *
 * The meta file is written by the CI job itself, because only the job knows
 * whether the tool crashed or was skipped. A scanner with neither file present
 * is reported `skipped` with reason "no output and no meta file", which is the
 * honest reading of an absent job.
 *
 * Exit 0 = a valid envelope was produced. Exit 1 = the envelope is malformed,
 * which is a REAL defect: a broken instrument is not a measurement.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { validate } from "./lib/json-schema-subset.mjs";
import { isMain } from "./lib/is-main.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The seven scanner classes (docs/mist-concept-evaluation.md:53-60). */
export const SCANNER_IDS = [
  "npm-audit", "osv-scanner", "sca-behavioral", "semgrep", "gitleaks", "sbom", "licenses",
];

/**
 * Counter-invariant mapping, declared per scanner.
 *
 * `map`      finding-type -> CI-n. Argued in docs/SCANNERS.md, contestable there.
 * `unmapped` finding-types with no clean row. Emitted in the envelope's
 *            `unmapped` array so the gap is visible rather than inferred from
 *            a field full of nulls.
 */
export const CI_MAP = {
  "npm-audit": {
    // A known CVE in a transitive package is a clean instance of CI-3: the
    // boundary is node_modules, and each package there is an unaudited party
    // to the trust relationship. The CVE is that party turning out to matter.
    map: { "known-cve": "CI-3" },
    unmapped: [],
  },
  "osv-scanner": {
    map: { "known-cve": "CI-3" },
    unmapped: [],
  },
  "sca-behavioral": {
    // The interesting layer. These are anti-kernel PROPERTIES, not known bugs.
    map: {
      "install-script": "CI-1",
      "network-at-install": "CI-1",
      "network-at-import": "CI-1",
      "env-var-behavior-switch": "CI-1",
      "new-maintainer": "CI-1",
      "semver-range-drift": "CI-1",
      "global-side-effect-on-import": "CI-4",
    },
    // Real SCA finding types with no honest CI-1..CI-6 row. Obfuscation and
    // abandonment are supply-chain hazards but they are not inversions of a
    // controllability invariant. Forcing them into CI-1 would inflate CI-1's
    // count, which EPIC-06 turns into a number. Left unmapped on purpose.
    unmapped: ["obfuscated-code", "unmaintained", "deprecated", "typosquat-risk", "license-risk"],
  },
  "semgrep": {
    // First-party SAST findings describe code defects, not surrendered
    // controllability. Mapping them to CI-* would blur exactly the
    // first/second-party line the envelope exists to keep sharp.
    map: {},
    unmapped: ["sast"],
  },
  "gitleaks": {
    map: {},
    unmapped: ["secret-in-history"],
  },
  "sbom": { map: {}, unmapped: [] },
  "licenses": {
    // "Obligations nobody read, accumulating in the same tree"
    // (docs/mist-concept-evaluation.md:58). A real cost, not a CI-* row.
    map: {},
    unmapped: ["license-obligation"],
  },
};

const SEVERITY = new Set(["critical", "high", "medium", "low", "info"]);
const normSeverity = (s) => {
  const v = String(s ?? "").toLowerCase();
  if (v === "moderate") return "medium"; // npm audit's word for medium
  if (v === "warning") return "medium";  // semgrep's word
  if (v === "error") return "high";      // semgrep's word
  if (v === "unknown" || v === "") return "info";
  return SEVERITY.has(v) ? v : "info";
};

/** Resolve a finding type to a CI id, or null with the gap declared. */
function ci(scannerId, type, seen) {
  const spec = CI_MAP[scannerId];
  if (spec.map[type]) return spec.map[type];
  seen.add(spec.unmapped.includes(type) ? type : `UNDECLARED:${type}`);
  return null;
}

/**
 * Rule 2. Strip anything that could carry secret material. gitleaks emits the
 * matched secret in `Secret` and `Match`; those must never reach an artifact
 * that the public dashboard renders.
 */
const scrubbed = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

// --- per-scanner normalizers -------------------------------------------------
// Each returns { findings, unmapped, surface } -- surface being whatever counts
// this scanner is the right instrument for. Unknown counts are simply absent;
// the caller leaves them null, meaning NOT MEASURED.

const NORMALIZERS = {
  "npm-audit"(raw) {
    const seen = new Set();
    const findings = [];
    for (const [name, v] of Object.entries(raw?.vulnerabilities ?? {})) {
      for (const via of v.via ?? []) {
        if (typeof via !== "object") continue; // a string via is an indirection, not a finding
        findings.push({
          id: `npm-audit:${via.source ?? via.url ?? name}`,
          severity: normSeverity(via.severity ?? v.severity),
          party: "second",
          subject: `${name}@${v.range ?? "*"}`,
          counterInvariant: ci("npm-audit", "known-cve", seen),
          title: scrubbed(via.title ?? "known advisory"),
        });
      }
    }
    return { findings, unmapped: [...seen], surface: {} };
  },

  "osv-scanner"(raw) {
    const seen = new Set();
    const findings = [];
    for (const result of raw?.results ?? []) {
      for (const pkg of result.packages ?? []) {
        for (const vuln of pkg.vulnerabilities ?? []) {
          findings.push({
            id: `osv:${vuln.id}`,
            severity: normSeverity(
              vuln.database_specific?.severity ?? vuln.severity?.[0]?.type ?? "info"
            ),
            party: "second",
            subject: `${pkg.package?.name ?? "?"}@${pkg.package?.version ?? "?"}`,
            counterInvariant: ci("osv-scanner", "known-cve", seen),
            title: scrubbed(vuln.summary ?? vuln.id),
          });
        }
      }
    }
    return { findings, unmapped: [...seen], surface: {} };
  },

  "sca-behavioral"(raw) {
    const seen = new Set();
    const findings = [];
    for (const a of raw?.alerts ?? []) {
      findings.push({
        id: `sca:${a.type}:${a.package ?? "?"}`,
        severity: normSeverity(a.severity),
        party: "second",
        subject: `${a.package ?? "?"}@${a.version ?? "?"}`,
        counterInvariant: ci("sca-behavioral", a.type, seen),
        title: scrubbed(a.title ?? a.type),
      });
    }
    // Phase 2b: the four behavioral counts. Absent keys stay NOT MEASURED.
    const s = raw?.summary ?? {};
    const surface = {};
    if (Number.isInteger(s.packagesWithInstallScripts)) surface.packagesWithInstallScripts = s.packagesWithInstallScripts;
    if (Number.isInteger(s.packagesWithNetworkAtInstall)) surface.packagesWithNetworkAtInstall = s.packagesWithNetworkAtInstall;
    if (Number.isInteger(s.packagesWithNetworkAtImport)) surface.packagesWithNetworkAtImport = s.packagesWithNetworkAtImport;
    if (Number.isInteger(s.distinctMaintainers)) surface.distinctMaintainers = s.distinctMaintainers;
    return { findings, unmapped: [...seen], surface };
  },

  semgrep(raw) {
    const seen = new Set();
    const findings = (raw?.results ?? []).map((r) => ({
      id: `semgrep:${r.check_id}:${r.path}:${r.start?.line ?? 0}`,
      severity: normSeverity(r.extra?.severity),
      party: "first",
      subject: `${r.path}:${r.start?.line ?? 0}`,
      counterInvariant: ci("semgrep", "sast", seen),
      title: scrubbed(r.extra?.message ?? r.check_id),
    }));
    return { findings, unmapped: [...seen], surface: {} };
  },

  gitleaks(raw) {
    const seen = new Set();
    // Rule 2: RuleID, File, StartLine, Description only. `Secret` and `Match`
    // are deliberately not read. Do not add them.
    const findings = (Array.isArray(raw) ? raw : raw?.findings ?? []).map((f) => ({
      id: `gitleaks:${f.RuleID ?? f.rule ?? "?"}:${f.Commit ?? "?"}:${f.StartLine ?? 0}`,
      severity: "high",
      party: "first",
      subject: `${f.File ?? f.file ?? "?"}:${f.StartLine ?? 0}`,
      counterInvariant: ci("gitleaks", "secret-in-history", seen),
      title: scrubbed(f.Description ?? f.RuleID ?? "secret detected"),
    }));
    return { findings, unmapped: [...seen], surface: {} };
  },

  sbom(raw) {
    // An inventory, not a scanner of defects. It contributes the surface count.
    const components = raw?.components ?? [];
    return { findings: [], unmapped: [], surface: { transitivePackages: components.length } };
  },

  licenses(raw) {
    const seen = new Set();
    // Obligation classes, not bare SPDX ids (docs/mist-concept-evaluation.md:58).
    const findings = (raw?.packages ?? [])
      .filter((p) => p.obligationClass && p.obligationClass !== "permissive")
      .map((p) => ({
        id: `license:${p.name}@${p.version}`,
        severity: p.obligationClass === "unknown" ? "medium" : "info",
        party: "second",
        subject: `${p.name}@${p.version}`,
        counterInvariant: ci("licenses", "license-obligation", seen),
        title: scrubbed(`${p.obligationClass}: ${p.license ?? "no declared license"}`),
      }));
    return { findings, unmapped: [...seen], surface: {} };
  },
};

// --- assembly ----------------------------------------------------------------

function readJson(file) {
  if (!existsSync(file)) return undefined;
  const raw = readFileSync(file, "utf8").trim();
  if (raw === "") return undefined;
  try { return JSON.parse(raw); } catch { return null; } // null = present but unparseable
}

function directDeps(root) {
  const file = join(root, "package.json");
  if (!existsSync(file)) return null;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  return ["dependencies", "devDependencies", "optionalDependencies"]
    .flatMap((f) => Object.keys(pkg[f] ?? {})).length;
}

export function assemble({ rawDir, root = SELF_ROOT, commit, ref, startedAt }) {
  const surface = {
    directDependencies: directDeps(root),
    transitivePackages: null,
    packagesWithInstallScripts: null,
    packagesWithNetworkAtInstall: null,
    packagesWithNetworkAtImport: null,
    distinctMaintainers: null,
  };

  const scanners = SCANNER_IDS.map((id) => {
    const meta = readJson(join(rawDir, `${id}.meta.json`)) ?? {};
    const raw = readJson(join(rawDir, `${id}.json`));

    const entry = {
      id,
      status: "skipped",
      skipReason: null,
      version: meta.version ?? null,
      exitCode: Number.isInteger(meta.exitCode) ? meta.exitCode : null,
      durationMs: Number.isInteger(meta.durationMs) ? meta.durationMs : null,
      findings: [],
      unmapped: [],
    };

    if (meta.status === "skipped" || (raw === undefined && meta.status !== "crashed")) {
      entry.status = "skipped";
      entry.skipReason = meta.skipReason
        ?? (raw === undefined && !Object.keys(meta).length
          ? "no output and no meta file: the job did not run"
          : "skipped without a stated reason");
      return entry;
    }

    // Present but unparseable, or the job told us it crashed. Either way this
    // is NOT a clean scanner, and the envelope must not let it read as one.
    if (raw === null || meta.status === "crashed") {
      entry.status = "crashed";
      entry.skipReason = null;
      return entry;
    }

    const out = NORMALIZERS[id](raw);
    entry.status = "ran";
    entry.findings = out.findings;
    entry.unmapped = out.unmapped;
    for (const [k, v] of Object.entries(out.surface)) surface[k] = v;
    return entry;
  });

  return {
    schemaVersion: "1",
    commit: commit ?? gitCommit(root),
    ref: ref ?? gitRef(root),
    startedAt: startedAt ?? new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    surface,
    scanners,
  };
}

const git = (root, args, fallback) => {
  // stderr ignored: outside a repository git is loud and the fallback is fine.
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback; }
  catch { return fallback; }
};
const gitCommit = (root) => process.env.GITHUB_SHA ?? git(root, ["rev-parse", "HEAD"], "0".repeat(40));
const gitRef = (root) => process.env.GITHUB_REF_NAME ?? git(root, ["rev-parse", "--abbrev-ref", "HEAD"], "unknown");

// --- cli ---------------------------------------------------------------------

function main(argv) {
  const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
  const rawDir = resolve(arg("--raw", "."));
  const root = resolve(arg("--root", SELF_ROOT));
  const out = arg("--out", null);

  const envelope = assemble({
    rawDir, root,
    commit: arg("--commit", undefined),
    ref: arg("--ref", undefined),
    startedAt: arg("--started-at", undefined),
  });

  const schema = JSON.parse(readFileSync(join(SELF_ROOT, "schemas/scan-run.schema.json"), "utf8"));
  const errs = validate(envelope, schema, schema);
  if (errs.length) {
    // Phase 5b: this is the one thing in EPIC-03 that is allowed to fail a job.
    console.error("assemble-scan-run: the envelope is MALFORMED -- a broken instrument is a real defect, not a measurement.");
    for (const e of errs.slice(0, 10)) console.error(`  ${e}`);
    process.exit(1);
  }

  const json = JSON.stringify(envelope, null, 2) + "\n";
  if (out) { writeFileSync(out, json); console.error(`assemble-scan-run: wrote ${out}`); }
  else process.stdout.write(json);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
