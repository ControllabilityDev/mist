/**
 * The wire boundary (EPIC-09 Phase 1b).
 *
 * THE PROVIDER'S SPELLING STOPS HERE. `feels_like`, `dt`, `timezone`, `list`
 * and `city` appear in this file and nowhere else in the kernel. When the
 * provider renames a field, exactly one file changes -- and a test fails, which
 * on `main` is structurally impossible: the fetch, the parse and the render are
 * one function, so its suite mocks axios and asserts against a payload we wrote
 * ourselves. That suite passes whether or not the parsing is correct.
 *
 * FAILURE IS RETURNED, NOT THROWN. A thrown error can be caught anywhere, which
 * in practice means it is caught wherever there happens to be a boundary -- on
 * `main` that is the view (CurrentConditions.tsx:16), because no other layer
 * exists to hold it. A returned ParseError has to be dealt with by the caller
 * that asked, and the type says so.
 */

import type { Observation, Forecast, ForecastSlot, Parsed } from "./types.ts";

const err = (field: string, why: string) => ({ ok: false as const, field, why });
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A finite number, or null. `NaN` and `Infinity` are not measurements. */
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * The first candidate that still carries text.
 *
 * `??` falls back on null and undefined and NOT on "". That gap took Mist's own
 * scan battery down on 2026-09-04: gitleaks ships a built-in rule with an empty
 * Description, and `f.Description ?? f.RuleID` kept the empty string all the way
 * into a schema that required one character. Foreign text has three states --
 * present, absent, and present-but-empty -- and a provider's field is foreign
 * text. The lesson is cheaper to apply here than to learn twice.
 */
const text = (...candidates: unknown[]): string => {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (t) return t;
  }
  return "";
};

/** The provider's `/weather` response. */
export function parseObservation(wire: unknown): Parsed<Observation> {
  if (!isObject(wire)) return err("(root)", `expected an object, got ${wire === null ? "null" : typeof wire}`);

  const main = isObject(wire.main) ? wire.main : {};
  const temperature = num(main.temp);
  if (temperature === null) return err("main.temp", "not a finite number");

  const feelsLike = num(main.feels_like);
  if (feelsLike === null) return err("main.feels_like", "not a finite number");

  const observedAt = num(wire.dt);
  if (observedAt === null) return err("dt", "not a finite number");

  // Required, unlike the forecast's city offset. A missing offset defaulted to
  // zero would render UTC as though it were the location's local time: a wrong
  // clock shown with full confidence. main passes the absence into moment and
  // renders an invalid time, which at least looks broken.
  const utcOffsetSeconds = num(wire.timezone);
  if (utcOffsetSeconds === null) return err("timezone", "the location's utc offset is required; defaulting it to 0 would show UTC as local time");

  const first = Array.isArray(wire.weather) && isObject(wire.weather[0]) ? wire.weather[0] : {};
  // Parity with main's `?? 'no description'` (CurrentConditions.tsx:61).
  const description = text(first.description) || "no description";

  return { ok: true, value: { temperature, feelsLike, description, observedAt, utcOffsetSeconds } };
}

/** The provider's `/forecast` response. */
export function parseForecast(wire: unknown): Parsed<Forecast> {
  if (!isObject(wire)) return err("(root)", `expected an object, got ${wire === null ? "null" : typeof wire}`);

  // Parity with main's `data.city?.timezone ?? 0` (page.tsx:46). Kept even
  // though parseObservation refuses the same absence: the two call sites really
  // do differ on main, and matching the specimen outranks internal tidiness in
  // a comparison whose whole value is that only architecture changed.
  const utcOffsetSeconds = num(isObject(wire.city) ? wire.city.timezone : null) ?? 0;

  // Parity with main's `slots = data.list ?? []` (page.tsx:45): no forecast is
  // an empty forecast, and the UI renders nothing.
  if (!Array.isArray(wire.list)) return { ok: true, value: { slots: [], utcOffsetSeconds } };

  const slots: ForecastSlot[] = [];
  for (let i = 0; i < wire.list.length; i++) {
    const raw = wire.list[i];
    const slotMain = isObject(raw) && isObject(raw.main) ? raw.main : {};
    const temperature = num(slotMain.temp);
    if (temperature === null) return err(`list[${i}].main.temp`, "not a finite number");
    const at = num(isObject(raw) ? raw.dt : null);
    if (at === null) return err(`list[${i}].dt`, "not a finite number");
    slots.push({ at, temperature });
  }

  return { ok: true, value: { slots, utcOffsetSeconds } };
}
