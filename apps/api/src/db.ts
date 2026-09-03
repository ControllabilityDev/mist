import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import 'dotenv/config';

// Module scope. Imported directly at every call site.
//
// No repository, no port, no injection -- this is the seam that does not exist
// (counter-invariant CI-6). Every route reaches straight through it, and a test
// that wants to avoid a real database has to reach into the module registry and
// replace this object. That is what makes the suite mock-heavy rather than
// fake-driven, and it is not an accident of style: there is nowhere else to put
// a substitute.
//
// The adapter argument is not a seam either. It is a Prisma 7 requirement
// (see prisma.config.ts) and it is hard-wired here, one line below the import.
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' });

export const prisma = new PrismaClient({ adapter });
