#!/usr/bin/env node
/**
 * The tarball vault (EPIC-07 Phase 1b/1c, 2a).
 *
 * WHY A VAULT AND NOT JUST A LOCKFILE
 *
 * A lockfile records RESOLUTIONS, not CONTENT. Over a multi-year window packages
 * get unpublished, republished and yanked, and registries go away. If the
 * monthly rescan depends on the registry still serving 826 exact tarballs, then
 * the experiment breaks precisely when the ecosystem does the interesting thing
 * -- and a longitudinal study that cannot survive its subject changing was never
 * longitudinal.
 *
 * THE IRONY IS THE POINT, AND IT IS RECORDED RATHER THAN HIDDEN. The vault is
 * the one place Mist behaves like a controlled system: content-addressed,
 * hermetic, verifiable offline, reproducible by hash. It has to be, because
 * otherwise the MEASUREMENT is at the mercy of the same ecosystem being
 * measured. The experiment's integrity requires exactly the discipline the
 * specimen lacks. See docs/DECAY.md.
 *
 * Zero dependencies.
 *
 * Commands:
 *   node scripts/vault.mjs build   decay/v1.0.0    download + verify + store
 *   node scripts/vault.mjs check   decay/v1.0.0    verify completeness and hashes
 *   node scripts/vault.mjs restore decay/v1.0.0 --into DIR   offline reconstitution
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const readManifest = (dir) => JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

/** npm integrity strings are `sha512-<base64>`. Verify bytes against one. */
export function verifyIntegrity(buf, integrity) {
  const [algo, expected] = String(integrity).split("-");
  if (!algo || !expected) return { ok: false, why: `unparseable integrity ${JSON.stringify(integrity)}` };
  const actual = createHash(algo).update(buf).digest("base64");
  return actual === expected
    ? { ok: true }
    : { ok: false, why: `${algo} mismatch: tarball does not match the lockfile. Expected ${expected.slice(0, 16)}…, got ${actual.slice(0, 16)}…` };
}

async function build(dir, { concurrency = 12 } = {}) {
  const manifest = readManifest(dir);
  const vault = join(dir, "vault");
  mkdirSync(vault, { recursive: true });

  const todo = manifest.packages.filter((p) => !existsSync(join(dir, p.vaultPath)));
  let done = 0, failed = [], bytes = 0;
  const q = [...todo];

  async function worker() {
    while (q.length) {
      const p = q.pop();
      try {
        const res = await fetch(p.resolved);
        if (!res.ok) { failed.push(`${p.name}@${p.version}: HTTP ${res.status}`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        // Verified BEFORE it is stored. A vault entry that does not match the
        // lockfile is worse than a missing one: it looks like evidence.
        const v = verifyIntegrity(buf, p.integrity);
        if (!v.ok) { failed.push(`${p.name}@${p.version}: ${v.why}`); continue; }
        mkdirSync(dirname(join(dir, p.vaultPath)), { recursive: true });
        writeFileSync(join(dir, p.vaultPath), buf);
        bytes += buf.length;
      } catch (e) { failed.push(`${p.name}@${p.version}: ${e.message}`); }
      if (++done % 50 === 0) process.stderr.write(`   ...${done}/${todo.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { attempted: todo.length, stored: todo.length - failed.length, failed, bytes };
}

export function check(dir) {
  const manifest = readManifest(dir);
  const missing = [], corrupt = [];
  for (const p of manifest.packages) {
    const file = join(dir, p.vaultPath ?? "");
    if (!p.vaultPath || !existsSync(file)) { missing.push(`${p.name}@${p.version}`); continue; }
    const v = verifyIntegrity(readFileSync(file), p.integrity);
    if (!v.ok) corrupt.push(`${p.name}@${p.version}: ${v.why}`);
  }
  return { total: manifest.packages.length, missing, corrupt };
}

/**
 * Reconstitute offline. Rewrites `resolved` to file: URLs pointing at the vault
 * and runs `npm ci --offline`, so a run that quietly reaches the registry fails
 * instead of succeeding -- which matters, because a rescan that silently
 * re-resolved a package would invalidate every later data point in the series.
 */
export function restore(dir, into) {
  const manifest = readManifest(dir);
  const lock = JSON.parse(readFileSync(join(dir, "lockfile.json"), "utf8"));
  const byKey = new Map(manifest.packages.map((p) => [`${p.name}@${p.version}`, p]));

  let rewritten = 0, unvaulted = [];
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith("node_modules/") || meta.link || !meta.resolved) continue;
    const key = `${path.split("node_modules/").pop()}@${meta.version}`;
    const p = byKey.get(key);
    const file = p ? join(resolve(dir), p.vaultPath) : null;
    if (!file || !existsSync(file)) { unvaulted.push(key); continue; }
    meta.resolved = `file://${file}`;
    rewritten++;
  }
  if (unvaulted.length) return { ok: false, unvaulted, why: `${unvaulted.length} package(s) are not in the vault; refusing a partial restore that would look like a successful one` };

  mkdirSync(into, { recursive: true });
  writeFileSync(join(into, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  const rootPkg = lock.packages?.[""] ?? {};
  writeFileSync(join(into, "package.json"), JSON.stringify({
    name: rootPkg.name ?? "mist-frozen", version: rootPkg.version ?? "1.0.0", private: true,
    dependencies: rootPkg.dependencies ?? {}, devDependencies: rootPkg.devDependencies ?? {},
  }, null, 2) + "\n");

  try {
    execFileSync("npm", ["ci", "--offline", "--no-audit", "--no-fund", "--ignore-scripts"],
      { cwd: into, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_registry: "http://127.0.0.1:1/" } });
  } catch (e) {
    return { ok: false, why: `npm ci --offline failed: ${(e.stderr ?? e.stdout ?? "").toString().slice(0, 600)}` };
  }
  return { ok: true, rewritten, into };
}

function main(argv) {
  const cmd = argv[0];
  const dir = resolve(argv[1] ?? "decay/v1.0.0");
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

  if (!existsSync(join(dir, "manifest.json"))) { console.error(`vault: no manifest.json in ${dir}`); process.exit(2); }

  if (cmd === "build") {
    build(dir).then((r) => {
      console.error(`vault build: stored ${r.stored}/${r.attempted} (${(r.bytes / 1048576).toFixed(1)} MiB)`);
      for (const f of r.failed.slice(0, 10)) console.error(`  FAILED ${f}`);
      if (r.failed.length) { console.error(`vault build: ${r.failed.length} failure(s) -- the vault is INCOMPLETE`); process.exit(1); }
    });
    return;
  }
  if (cmd === "check") {
    const r = check(dir);
    if (r.missing.length || r.corrupt.length) {
      console.error(`vault check: ${r.missing.length} missing, ${r.corrupt.length} corrupt of ${r.total}`);
      for (const m of r.missing.slice(0, 5)) console.error(`  missing  ${m}`);
      for (const c of r.corrupt.slice(0, 5)) console.error(`  CORRUPT  ${c}`);
      process.exit(1);
    }
    console.error(`vault check: all ${r.total} tarball(s) present and matching the lockfile`);
    return;
  }
  if (cmd === "restore") {
    const into = resolve(arg("--into", "/tmp/mist-frozen"));
    const r = restore(dir, into);
    if (!r.ok) { console.error(`vault restore: ${r.why}`); process.exit(1); }
    console.error(`vault restore: reconstituted ${r.rewritten} package(s) offline into ${r.into}`);
    return;
  }
  console.error("usage: vault.mjs build|check|restore DIR [--into DIR]");
  process.exit(2);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
