/**
 * The ports (EPIC-09 Phase 1d). INTERFACES ONLY -- no implementation reaches
 * this file, and nothing here imports anything but types.
 *
 * THIS IS THE FAKEABILITY EXHIBIT. On `main` the only way to test
 * CurrentConditions without a network is `jest.mock('axios')`
 * (CurrentConditions.test.tsx:5): you replace a MODULE in the registry and then
 * assert against your own belief about what the provider returns. Such a test
 * cannot fail when the provider changes its wire shape, and it cannot fail when
 * the rule changes either, because the rule is a `const` inside the component
 * body. It is a test of the mock.
 *
 * Here a caller supplies a ProviderPort that returns a known Observation. No
 * module registry, no mocking library, no `jest.mock` -- a plain object that
 * satisfies an interface. The difference is not stylistic. One of the two can
 * fail when the code is wrong; the other cannot.
 *
 * WHAT A PORT DOES NOT DO: it does not parse. Adapters hand back domain values,
 * so the wire shape stops at parse.ts and never travels through the interface.
 * A port typed in the provider's spelling would move the coupling rather than
 * remove it -- the `moved` category in the violation elimination table exists
 * because that is the usual honest outcome, and it is worth not choosing it
 * here on purpose.
 */

import type { Location, Observation, Forecast, Units } from "./types.ts";

/** What the reader has chosen. Stored somewhere; the kernel does not care where. */
export type Preferences = {
  readonly units: Units;
  readonly locale: string;
  readonly theme: string;
};

/**
 * Where weather comes from. The HTTP adapter, a recorded-payload fake and an
 * in-memory stub are all the same shape to the kernel.
 *
 * Failure is a RETURNED value, not a thrown one, for the same reason parse.ts
 * returns its errors: a caller must decide what an unreachable provider means,
 * and on `main` that decision lands in the view because there is nowhere else.
 */
export type ProviderFailure =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unreachable"; readonly why: string };

export type ProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ProviderFailure };

export interface ProviderPort {
  observation(at: Pick<Location, "latitude" | "longitude">): Promise<ProviderResult<Observation>>;
  forecast(at: Pick<Location, "latitude" | "longitude">): Promise<ProviderResult<Forecast>>;
  search(query: string): Promise<ProviderResult<readonly Location[]>>;
}

/** Where locations and preferences live. Prisma is one implementation of this, not the shape of it. */
export interface PreferenceStore {
  locations(): Promise<readonly (Location & { readonly id: number })[]>;
  addLocation(location: Location): Promise<Location & { readonly id: number }>;
  preferences(locationId: number): Promise<Preferences | null>;
  savePreferences(locationId: number, prefs: Preferences): Promise<void>;
}

/**
 * The clock, as a port.
 *
 * `Date.now()` inside a rule is an unfakeable dependency on the moment the test
 * runs, which is why "flaky at midnight" is a genre. Nothing in the kernel calls
 * it; anything that needs the time is handed one.
 */
export interface ClockPort {
  nowSeconds(): number;
}
