import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { prisma } from './db';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/locations', async (_req, res) => {
  // prisma is imported, not injected. There is nothing to substitute.
  const locations = await prisma.location.findMany({ include: { prefs: true } });
  res.json(locations);
});

app.post('/locations', async (req, res) => {
  const { label, latitude, longitude } = req.body ?? {};
  if (!label || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'label, latitude and longitude are required' });
  }
  const location = await prisma.location.create({
    data: { label, latitude, longitude, prefs: { create: {} } },
  });
  res.status(201).json(location);
});

app.put('/locations/:id/preferences', async (req, res) => {
  const locationId = Number(req.params.id);
  const { units, locale, theme } = req.body ?? {};
  const existing = await prisma.preference.findFirst({ where: { locationId } });
  const pref = existing
    ? await prisma.preference.update({ where: { id: existing.id }, data: { units, locale, theme } })
    : await prisma.preference.create({ data: { locationId, units, locale, theme } });
  res.json(pref);
});

const port = Number(process.env.PORT ?? 4000);

// Only listen when this file is the entry point. Importing it -- which the test
// suite does -- must not open a socket, or jest never exits.
if (require.main === module) {
  app.listen(port, () => console.log(`api listening on ${port}`));
}

export default app;
