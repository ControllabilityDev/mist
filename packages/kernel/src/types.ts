/**
 * The domain's value types (EPIC-09 Phase 1a).
 *
 * On `main` this table names CALL SITES, because the provider's wire shape is
 * the model: `data.main.feels_like` is read straight out of an axios response
 * inside a React component. Here it names types. That difference IS the purity
 * partition -- not a stylistic preference about where to put interfaces.
 *
 * NO WIRE SHAPES APPEAR IN THIS FILE. `feels_like`, `dt` and `timezone` are the
 * provider's spelling; they live in parse.ts and stop there. If the provider
 * renames a field, exactly one file changes.
 *
 * EVERY TEMPERATURE HERE IS CELSIUS. The unit is in the type, not in a comment
 * and not in a convention. On `main` the comfort rule reads a raw metric value
 * while the display converts separately, one line apart -- correct today by the
 * order the two happen to appear in. Here mixing them is a type error.
 */

/** A temperature in degrees Celsius. The provider is always queried in metric. */
export type Celsius = number;

/** What the reader chose to see. A display concern, never a storage concern. */
export type Units = "metric" | "imperial";

/** A place someone asked about. */
export type Location = {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
};

/** Conditions now, as the provider observed them. */
export type Observation = {
  readonly temperature: Celsius;
  readonly feelsLike: Celsius;
  readonly description: string;
  /** Epoch seconds, UTC. Not a Date: a Date carries the reader's clock. */
  readonly observedAt: number;
  /** The LOCATION's offset from UTC, in seconds. Not the reader's. */
  readonly utcOffsetSeconds: number;
};

/** One point in the provider's three-hourly series. */
export type ForecastSlot = {
  readonly at: number;
  readonly temperature: Celsius;
};

export type Forecast = {
  readonly slots: readonly ForecastSlot[];
  readonly utcOffsetSeconds: number;
};

/**
 * One day's extremes.
 *
 * `dayIndex` is a NUMBER, not "Mon". Turning a day into a word needs locale
 * data, and locale data is I/O-shaped -- so the label is the shell's job. That
 * split is not a compromise; it is where the purity line actually falls.
 */
export type DailyBucket = {
  readonly dayIndex: number;
  readonly high: Celsius;
  readonly low: Celsius;
};

/**
 * A parse outcome.
 *
 * Parsing RETURNS a failure rather than throwing one. A thrown error can be
 * caught anywhere, which in practice means the catch lands in the view -- which
 * is exactly where `main` puts it (CurrentConditions.tsx:16), because there is
 * no layer in between to put it in.
 */
export type ParseError = {
  readonly ok: false;
  readonly field: string;
  readonly why: string;
};

export type Parsed<T> = { readonly ok: true; readonly value: T } | ParseError;
