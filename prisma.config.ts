// Prisma 7 moved the connection URL out of schema.prisma and into here.
// Nobody asked for this file; `npm install prisma` resolved to the 7.x line and
// the schema stopped validating. It exists because the tool changed underneath
// the project, which is counter-invariant CI-1 in its plainest form.
import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'migrations') },
  datasource: { url: process.env.DATABASE_URL ?? 'file:./dev.db' },
});
