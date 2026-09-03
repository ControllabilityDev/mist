/**
 * Loads synthetic seed rows into the database (EPIC-02 Phase 2f).
 *
 * It does NOT generate anything. scripts/seed-synthetic.ts (EPIC-01 Phase 5c)
 * is the only generator, and its rules -- numbered test subjects, addresses at
 * example.invalid, coordinates drawn only from deploy/synthetic-locations.txt --
 * are the policy. This file reads that generator's output and writes it, so
 * there is no second place where a "realistic" name or a real coordinate could
 * be introduced.
 *
 * Usage:  npm run seed
 */

import { readFileSync } from 'node:fs';
import { prisma } from '../apps/api/src/db';

type SyntheticUser = {
  id: number;
  name: string;
  email: string;
  home: { lat: number; lon: number; label: string };
  units: 'metric' | 'imperial';
};

async function main() {
  const file = process.argv[2] ?? 'fixtures/seed.json';
  const users: SyntheticUser[] = JSON.parse(readFileSync(file, 'utf8'));

  for (const user of users) {
    const existing = await prisma.location.findFirst({ where: { label: user.home.label } });
    if (existing) continue;
    await prisma.location.create({
      data: {
        label: user.home.label,
        latitude: user.home.lat,
        longitude: user.home.lon,
        prefs: { create: { units: user.units, locale: 'en', theme: 'system' } },
      },
    });
  }

  const count = await prisma.location.count();
  console.log(`seeded: ${count} location(s) in the database`);
}

main().finally(() => prisma.$disconnect());
