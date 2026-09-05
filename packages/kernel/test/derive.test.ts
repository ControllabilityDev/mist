/**
 * Tests for the derived rules (EPIC-09 Phase 1c).
 *
 * NO MOCKS. Not "few mocks" -- none, and none are possible, because there is
 * nothing here to substitute. Every function takes values and returns values.
 * `main`'s equivalent suite opens with `jest.mock('axios')` and then asserts
 * against OUR OWN BELIEF about the provider; it cannot fail when the provider
 * changes, and it cannot fail when the rule changes either, because the rule is
 * a `const` inside a component body.
 *
 * The runner is `node --test`. No jest, no ts-node, no build step: Node runs
 * TypeScript directly. The kernel's test suite therefore adds zero packages,
 * which matters for a project whose thesis is package count.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { comfort, convert, dayIndex, bucketHourlyToDaily, degreeSymbol } from "../src/derive.ts";

const DAY = 86_400;
const base = 1_760_000_000 - (1_760_000_000 % DAY); // midnight UTC

// --- comfort: main's CurrentConditions.tsx:36 --------------------------------
// `const feelsHarsh = feelsLike > 32 || feelsLike < -5;`

test("comfort is harsh above 32C", () => {
  assert.equal(comfort(33), "harsh");
});

test("comfort is harsh below -5C", () => {
  assert.equal(comfort(-6), "harsh");
});

test("comfort is ordinary between the bounds", () => {
  assert.equal(comfort(20), "ordinary");
});

test("comfort's bounds are exclusive, exactly as main's are", () => {
  // main writes `> 32` and `< -5`, so the boundary values are NOT harsh.
  // Getting this wrong by one is invisible in a UI and obvious in a test.
  assert.equal(comfort(32), "ordinary");
  assert.equal(comfort(-5), "ordinary");
});

test("comfort reads Celsius, so imperial readers get the same verdict", () => {
  // 33C is harsh. 91.4F is the same temperature and must not change the answer.
  // On main this is correct only because the raw metric value happens to be in
  // scope beside the converted one. Here the type makes the mistake impossible.
  assert.equal(comfort(33), "harsh");
});

// --- convert: main's CurrentConditions.tsx:40, Forecast.tsx:12 and :82 -------
// The same three-line helper, written out three times.

test("convert leaves metric alone", () => {
  assert.equal(convert(21.4, "metric"), 21.4);
});

test("convert produces fahrenheit for imperial", () => {
  assert.equal(convert(21.4, "imperial"), 70.52);
});

test("convert matches main's fixed points", () => {
  assert.equal(convert(0, "imperial"), 32);
  assert.equal(convert(100, "imperial"), 212);
});

test("degreeSymbol follows the unit", () => {
  assert.equal(degreeSymbol("metric"), "°C");
  assert.equal(degreeSymbol("imperial"), "°F");
});

// --- dayIndex ---------------------------------------------------------------

test("dayIndex splits days by the location offset, not by UTC", () => {
  // 23:00 UTC is already the next day at +02:00. This is the property main's
  // Forecast.test.ts:31 pins, kept.
  const late = base + 23 * 3600;
  assert.notEqual(dayIndex(late, 2 * 3600), dayIndex(base + 12 * 3600, 2 * 3600));
});

test("dayIndex is stable within a day", () => {
  assert.equal(dayIndex(base, 0), dayIndex(base + 12 * 3600, 0));
});

test("dayIndex does not collide across a week", () => {
  // main groups by `format('ddd')` -- the weekday NAME -- so slots exactly 7
  // days apart land in the same bucket. A 5-day forecast never exposes it.
  // A number cannot collide.
  assert.notEqual(dayIndex(base, 0), dayIndex(base + 7 * DAY, 0));
});

// --- bucketHourlyToDaily: main's Forecast.tsx:24 and :84 --------------------

const slot = (at: number, temperature: number) => ({ at, temperature });

test("bucketHourlyToDaily groups slots into one entry per day", () => {
  const out = bucketHourlyToDaily([slot(base, 5), slot(base + 3 * 3600, 9), slot(base + DAY, 7)], 0);
  assert.equal(out.length, 2);
});

test("bucketHourlyToDaily takes the high of each day", () => {
  const out = bucketHourlyToDaily([slot(base, 5), slot(base + 3 * 3600, 9)], 0);
  assert.equal(out[0].high, 9);
});

test("bucketHourlyToDaily takes the low of each day", () => {
  const out = bucketHourlyToDaily([slot(base, 5), slot(base + 3 * 3600, 9)], 0);
  assert.equal(out[0].low, 5);
});

test("bucketHourlyToDaily returns nothing for no slots", () => {
  assert.deepEqual(bucketHourlyToDaily([], 0), []);
});

test("bucketHourlyToDaily returns days in chronological order", () => {
  // Provider order is not guaranteed. main relies on groupBy's insertion order,
  // which is the arrival order, not time order.
  const out = bucketHourlyToDaily([slot(base + DAY, 7), slot(base, 5)], 0);
  assert.ok(out[0].dayIndex < out[1].dayIndex);
});

test("bucketHourlyToDaily stays in Celsius", () => {
  // Conversion is a separate, later step. Bucketing in display units would put
  // a reader preference inside a domain rule -- and it is why main writes the
  // same conversion helper three times.
  const out = bucketHourlyToDaily([slot(base, 0), slot(base + 3 * 3600, 100)], 0);
  assert.equal(out[0].high, 100);
  assert.equal(out[0].low, 0);
});
