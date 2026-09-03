// The prisma client is a module-scope singleton with no seam, so the only way
// to keep a test off the real database is to replace the module. That is not a
// choice this suite made; it is the only door in the building.
jest.mock('../src/db', () => ({
  prisma: {
    location: { findMany: jest.fn(), create: jest.fn() },
    preference: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  },
}));

import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/db';

const db = prisma as unknown as {
  location: { findMany: jest.Mock; create: jest.Mock };
  preference: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
};

beforeEach(() => {
  db.location.findMany.mockReset();
  db.location.create.mockReset();
  db.preference.findFirst.mockReset();
  db.preference.update.mockReset();
  db.preference.create.mockReset();
});

describe('GET /locations', () => {
  it('returns what prisma returns', async () => {
    db.location.findMany.mockResolvedValue([{ id: 1, label: 'Test Place', prefs: [] }]);
    const res = await request(app).get('/locations');
    expect(res.status).toBe(200);
    expect(res.body[0].label).toBe('Test Place');
  });

  it('asks prisma to include the preferences', async () => {
    db.location.findMany.mockResolvedValue([]);
    await request(app).get('/locations');
    // A conversation test: it asserts the call, not the effect. It would keep
    // passing if `include` stopped meaning what we think it means.
    expect(db.location.findMany).toHaveBeenCalledWith({ include: { prefs: true } });
  });
});

describe('POST /locations', () => {
  it('creates a location with a default preference row', async () => {
    db.location.create.mockResolvedValue({ id: 7 });
    const res = await request(app)
      .post('/locations')
      .send({ label: 'Test Place', latitude: 1, longitude: 2 });
    expect(res.status).toBe(201);
    expect(db.location.create).toHaveBeenCalledWith({
      data: { label: 'Test Place', latitude: 1, longitude: 2, prefs: { create: {} } },
    });
  });

  it('rejects a body with no coordinates', async () => {
    const res = await request(app).post('/locations').send({ label: 'Test Place' });
    expect(res.status).toBe(400);
    expect(db.location.create).not.toHaveBeenCalled();
  });
});

describe('PUT /locations/:id/preferences', () => {
  it('updates the existing preference row when there is one', async () => {
    db.preference.findFirst.mockResolvedValue({ id: 3 });
    db.preference.update.mockResolvedValue({ id: 3, units: 'imperial' });
    const res = await request(app).put('/locations/1/preferences').send({ units: 'imperial' });
    expect(res.status).toBe(200);
    expect(db.preference.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { units: 'imperial', locale: undefined, theme: undefined },
    });
  });

  it('creates a preference row when there is none', async () => {
    db.preference.findFirst.mockResolvedValue(null);
    db.preference.create.mockResolvedValue({ id: 9 });
    await request(app).put('/locations/1/preferences').send({ units: 'metric' });
    expect(db.preference.create).toHaveBeenCalled();
  });
});

describe('GET /health', () => {
  it('is ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ ok: true });
  });
});
