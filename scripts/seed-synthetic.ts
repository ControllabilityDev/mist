/**
 * Synthetic fixture generator (EPIC-01 Work Item 5c).
 *
 * Produces seed rows that are obviously fake and provably harmless:
 *
 *   - names   -- numbered test subjects, not name-generator output. A generated
 *                "realistic" name is somebody's real name; "Test Subject 7" is
 *                nobody's.
 *   - emails  -- at example.invalid, reserved by RFC 2606 and undeliverable by
 *                definition. Not a typo'd real domain.
 *   - coords  -- drawn ONLY from deploy/synthetic-locations.txt, a curated list
 *                of low-population public places. The generator cannot invent a
 *                coordinate, so it cannot accidentally land on a contributor's
 *                street.
 *
 * scripts/check-containment.sh enforces all three on committed data. This file
 * is the other half: it makes complying the path of least resistance.
 *
 * NOT YET RUNNABLE. There is no Node toolchain in this repository -- EPIC-02
 * owns package.json and .tool-versions. Written now because the POLICY it
 * encodes is EPIC-01's, and EPIC-02 should inherit it rather than reinvent it.
 *
 * Usage, once EPIC-02 lands a toolchain:
 *   node --experimental-strip-types scripts/seed-synthetic.ts > fixtures/seed.json
 */

import { readFileSync } from "node:fs";

type Location = { lat: number; lon: number; label: string };

type SyntheticUser = {
  id: number;
  name: string;
  email: string;
  home: Location;
  units: "metric" | "imperial";
};

/** Parse deploy/synthetic-locations.txt. This is the ONLY source of coordinates. */
function loadLocations(path = "deploy/synthetic-locations.txt"): Location[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => {
      const [data, label = ""] = line.split("#", 2);
      const body = data.trim();
      if (!body) return null;
      const [lat, lon] = body.split(",").map((n) => Number(n.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon, label: label.trim() };
    })
    .filter((l): l is Location => l !== null);
}

function generate(count: number): SyntheticUser[] {
  const locations = loadLocations();
  if (locations.length === 0) {
    throw new Error("deploy/synthetic-locations.txt is empty; refusing to invent coordinates");
  }

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Test Subject ${i + 1}`,
    email: `subject${i + 1}@example.invalid`,
    home: locations[i % locations.length],
    units: i % 2 === 0 ? "metric" : "imperial",
  }));
}

const count = Number(process.argv[2] ?? 10);
process.stdout.write(JSON.stringify(generate(count), null, 2) + "\n");
