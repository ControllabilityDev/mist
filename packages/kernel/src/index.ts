/**
 * The kernel's public surface (EPIC-09 Phase 1).
 *
 * Pure, delivery-agnostic, zero runtime dependencies. Values in, values out.
 * Everything that touches the network, a database, the clock, the environment
 * or locale data lives in the shell and arrives here as an argument.
 */

export type {
  Celsius, Units, Location, Observation, ForecastSlot, Forecast,
  DailyBucket, ParseError, Parsed,
} from "./types.ts";

export type {
  Preferences, ProviderPort, ProviderFailure, ProviderResult,
  PreferenceStore, ClockPort,
} from "./ports.ts";

export { parseObservation, parseForecast } from "./parse.ts";
export { comfort, convert, degreeSymbol, dayIndex, bucketHourlyToDaily } from "./derive.ts";
export type { Comfort } from "./derive.ts";
