/**
 * "Was this script run directly, or imported?"
 *
 * The obvious version of this check is wrong on macOS, and it fails SILENTLY:
 *
 *   resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
 *
 * /tmp is a symlink to /private/tmp, so argv[1] keeps the path you typed while
 * import.meta.url has already been resolved to the real one. They differ, main()
 * never runs, the process exits 0, and the caller sees an empty file and a green
 * tick. scripts/test-scan.mjs found exactly that: an assembler that "passed" by
 * producing nothing at all.
 *
 * Comparing realpaths fixes it. The silent-success failure mode is why this is
 * a shared helper instead of a line repeated in seven scripts.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };

export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  return real(process.argv[1]) === real(fileURLToPath(importMetaUrl));
}
