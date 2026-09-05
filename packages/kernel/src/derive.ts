/**
 * The domain's rules (EPIC-09 Phase 1c).
 *
 * Every function here is PURE: values in, values out. No clock, no environment,
 * no network, no filesystem, no locale data. Each one replaces a rule that lives
 * inside a React component on `main`, and each cites the line it replaces.
 *
 * WHAT THIS FILE ACTUALLY REMOVED. `toDisplay` is written out three times on
 * `main` -- CurrentConditions.tsx:40, Forecast.tsx:12 and Forecast.tsx:82 -- and
 * the day-bucketing twice, Forecast.tsx:24 and Forecast.tsx:84. Both were copied
 * rather than shared BY DESIGN: extracting either would have created the seam
 * EPIC-02 is specified not to have (Forecast.tsx:79-81 says so out loud). The
 * kernel does not merely relocate that logic. The duplication disappears as a
 * side effect of there finally being somewhere to put it.
 */

import type { Celsius, Units, ForecastSlot, DailyBucket } from "./types.ts";

/** How the temperature reads to a person, as a domain verdict rather than a colour. */
export type Comfort = "harsh" | "ordinary";

/**
 * Replaces `main`'s CurrentConditions.tsx:36
 *   `const feelsHarsh = feelsLike > 32 || feelsLike < -5;`
 *
 * Takes CELSIUS, always. On `main` this is correct only because the raw metric
 * value happens to be in scope one line above the converted one; swap those two
 * lines and every imperial reader silently gets the wrong warning. Here the
 * parameter type says which scale it is, so the mistake is not available.
 *
 * The bounds are EXCLUSIVE, matching `main` exactly. A refactor that quietly
 * turned `> 32` into `>= 32` would be invisible in a screenshot.
 */
export function comfort(feelsLike: Celsius): Comfort {
  return feelsLike > 32 || feelsLike < -5 ? "harsh" : "ordinary";
}

/**
 * Replaces `main`'s three copies of
 *   `const toDisplay = (c) => (units === 'imperial' ? c * 9 / 5 + 32 : c);`
 * at CurrentConditions.tsx:40, Forecast.tsx:12 and Forecast.tsx:82.
 *
 * The rounding stays OUT of here. `main` calls `.toFixed(1)` at each render
 * site, and how many decimals to show is a presentation decision, not a domain
 * one. Rounding inside a conversion also compounds: convert-then-round-then-
 * compare is not the same as compare-then-convert-then-round.
 */
export function convert(celsius: Celsius, units: Units): number {
  return units === "imperial" ? (celsius * 9) / 5 + 32 : celsius;
}

/** Replaces the inline `degrees` const at CurrentConditions.tsx:41 and Forecast.tsx:13. */
export function degreeSymbol(units: Units): string {
  return units === "imperial" ? "°F" : "°C";
}

/**
 * Which local day an instant falls in, as an integer day number.
 *
 * Replaces the timezone half of `main`'s `at(dt).format('ddd')`
 * (Forecast.tsx:14, :83). The other half -- turning a day into the word "Mon" --
 * is NOT here and cannot be: it needs locale data, which is I/O-shaped. The
 * shell formats; the kernel counts. That is where the purity line actually
 * falls, and drawing it anywhere else would be pretending.
 *
 * It also fixes a latent defect. `format('ddd')` groups by the weekday NAME, so
 * slots exactly seven days apart collapse into one bucket. A five-day forecast
 * never reveals it. An integer cannot collide. Recorded as a behavioural
 * difference from `main`, not smuggled in as an equivalence.
 */
export function dayIndex(atSeconds: number, utcOffsetSeconds: number): number {
  return Math.floor((atSeconds + utcOffsetSeconds) / 86_400);
}

/**
 * Replaces `main`'s Forecast.tsx:24-32, duplicated at :84-88.
 *
 * Returns CELSIUS. `main` converts before comparing; conversion is monotonic so
 * the extremes come out the same either way, but doing it here would push a
 * reader's display preference into a domain rule -- which is precisely what
 * forced the helper to be written three times.
 *
 * Chronological, not arrival order. `main` relies on `groupBy` insertion order,
 * which is whatever sequence the provider happened to send.
 */
export function bucketHourlyToDaily(
  slots: readonly ForecastSlot[],
  utcOffsetSeconds: number,
): DailyBucket[] {
  const byDay = new Map<number, { high: Celsius; low: Celsius }>();
  for (const s of slots) {
    const day = dayIndex(s.at, utcOffsetSeconds);
    const seen = byDay.get(day);
    if (!seen) byDay.set(day, { high: s.temperature, low: s.temperature });
    else {
      if (s.temperature > seen.high) seen.high = s.temperature;
      if (s.temperature < seen.low) seen.low = s.temperature;
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayIndex, { high, low }]) => ({ dayIndex, high, low }));
}
