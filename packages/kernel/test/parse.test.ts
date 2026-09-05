/**
 * Tests for the wire boundary (EPIC-09 Phase 1b).
 *
 * Driven by the provider payloads recorded in `main`'s own suite
 * (apps/web/__tests__/CurrentConditions.test.tsx:10 and Forecast.test.ts:4), so
 * the two sides are parsing the same bytes.
 *
 * NO MOCKS, AND NO NETWORK. `main` cannot test its parsing separately at all:
 * the fetch, the parse and the render are one function, so its suite must
 * `jest.mock('axios')` and assert on rendered HTML. That suite passes whether
 * or not the parsing is right, because the payload it parses is one we wrote.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseObservation, parseForecast } from "../src/parse.ts";

// Verbatim from apps/web/__tests__/CurrentConditions.test.tsx:10.
const wire = () => ({
  main: { temp: 21.4, feels_like: 20.9 },
  weather: [{ description: "clear sky" }],
  dt: 1_760_000_000,
  timezone: 3600,
});

test("parseObservation lifts the wire into domain values", () => {
  const r = parseObservation(wire());
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, {
    temperature: 21.4,
    feelsLike: 20.9,
    description: "clear sky",
    observedAt: 1_760_000_000,
    utcOffsetSeconds: 3600,
  });
});

test("parseObservation output carries no provider spelling", () => {
  const r = parseObservation(wire());
  const keys = Object.keys((r.ok && r.value) || {});
  for (const wireName of ["feels_like", "dt", "timezone", "main", "weather"])
    assert.ok(!keys.includes(wireName), `${wireName} leaked into the domain value`);
});

test("parseObservation reports the missing field by name", () => {
  const w = wire() as Record<string, unknown>;
  delete (w.main as Record<string, unknown>).temp;
  const r = parseObservation(w);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.field, "main.temp");
});

test("parseObservation refuses a non-numeric temperature", () => {
  // main renders `NaN°C` here: `data.main.temp as number` is a cast, not a
  // check, and `.toFixed(1)` on NaN is the string "NaN".
  const r = parseObservation({ ...wire(), main: { temp: "warm", feels_like: 20.9 } });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.field, "main.temp");
});

test("parseObservation requires the location's utc offset", () => {
  // Defaulting to 0 would show UTC as though it were the reader's local time --
  // a wrong clock, presented with full confidence. main passes the missing
  // value straight into moment and renders an invalid time instead.
  const w = wire() as Record<string, unknown>;
  delete w.timezone;
  const r = parseObservation(w);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.field, "timezone");
});

test("parseObservation falls back when the description is absent", () => {
  // Parity with main's `data.weather?.[0]?.description ?? 'no description'`.
  const w = wire() as Record<string, unknown>;
  delete w.weather;
  const r = parseObservation(w);
  assert.equal(r.ok && r.value.description, "no description");
});

test("parseObservation falls back when the description is present but EMPTY", () => {
  // `??` does not catch "". That exact gap took the scan battery down on
  // 2026-09-04: gitleaks shipped a built-in rule with an empty Description and
  // `f.Description ?? f.RuleID` kept the empty string. Foreign text has three
  // states -- present, absent, present-but-empty -- and only two carry meaning.
  const r = parseObservation({ ...wire(), weather: [{ description: "   " }] });
  assert.equal(r.ok && r.value.description, "no description");
});

test("parseObservation rejects a non-object payload", () => {
  assert.equal(parseObservation(null).ok, false);
  assert.equal(parseObservation("nope").ok, false);
});

// --- forecast ----------------------------------------------------------------

const slotWire = (dt: number, temp: number) => ({ dt, main: { temp }, weather: [{ description: "x" }] });

test("parseForecast lifts the slot list", () => {
  const r = parseForecast({ list: [slotWire(1, 5), slotWire(2, 9)], city: { timezone: 7200 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value.slots, [{ at: 1, temperature: 5 }, { at: 2, temperature: 9 }]);
  assert.equal(r.ok && r.value.utcOffsetSeconds, 7200);
});

test("parseForecast defaults a missing city offset to zero, as main does", () => {
  // Parity, deliberately: main writes `data.city?.timezone ?? 0` at page.tsx:46.
  // Kept even though parseObservation refuses the same absence, because the two
  // call sites genuinely differ on main and parity outranks tidiness.
  const r = parseForecast({ list: [slotWire(1, 5)] });
  assert.equal(r.ok && r.value.utcOffsetSeconds, 0);
});

test("parseForecast treats an absent list as an empty forecast", () => {
  // main: `slots = data.list ?? []`, then renders nothing when empty.
  const r = parseForecast({ city: { timezone: 0 } });
  assert.deepEqual(r.ok && r.value.slots, []);
});

test("parseForecast names the index of a bad slot", () => {
  const r = parseForecast({ list: [slotWire(1, 5), { dt: 2, main: {} }] });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.field, "list[1].main.temp");
});
