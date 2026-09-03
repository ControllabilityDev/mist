import { bucketIntoDays, Slot } from '../app/dashboard/Forecast';

// Three-hourly slots spanning two days, in the provider's wire shape.
const slot = (dt: number, temp: number): Slot => ({ dt, main: { temp }, weather: [{ description: 'x' }] });

const DAY = 86_400;
const base = 1_760_000_000 - (1_760_000_000 % DAY); // midnight UTC

describe('bucketIntoDays', () => {
  it('groups slots into one entry per day', () => {
    const out = bucketIntoDays([slot(base, 5), slot(base + 3 * 3600, 9), slot(base + DAY, 7)], 0, 'metric');
    expect(out).toHaveLength(2);
  });

  it('takes the high of each day', () => {
    const out = bucketIntoDays([slot(base, 5), slot(base + 3 * 3600, 9)], 0, 'metric');
    expect(out[0].high).toBe(9);
  });

  it('takes the low of each day', () => {
    const out = bucketIntoDays([slot(base, 5), slot(base + 3 * 3600, 9)], 0, 'metric');
    expect(out[0].low).toBe(5);
  });

  it('converts to fahrenheit before comparing', () => {
    const out = bucketIntoDays([slot(base, 0), slot(base + 3 * 3600, 100)], 0, 'imperial');
    expect(out[0].high).toBe(212);
    expect(out[0].low).toBe(32);
  });

  it('splits days by the location offset, not by UTC', () => {
    // 23:00 UTC is the next day at +02:00.
    const late = base + 23 * 3600;
    const out = bucketIntoDays([slot(base + 12 * 3600, 5), slot(late, 6)], 2 * 3600, 'metric');
    expect(out).toHaveLength(2);
  });

  it('returns nothing for no slots', () => {
    expect(bucketIntoDays([], 0, 'metric')).toEqual([]);
  });
});
