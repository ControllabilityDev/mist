/**
 * Anchor interpolation -- the one scoring function every axis shares.
 *
 * A raw measure maps to 0-100 through the published anchor points in
 * anchors.json, linearly between them and clamped outside them. Fixed anchors
 * rather than percentiles: a percentile says "more entangled than 60% of npm",
 * which is a statement about npm and drifts as npm drifts. An anchor says "you
 * execute install scripts from 6 packages", which stays true next year.
 *
 * A5 is inverted -- a LONGER gap between red states is better -- and its anchor
 * table is written descending. The interpolation handles both directions by
 * reading the table rather than by carrying a special case.
 *
 * Zero dependencies.
 */

/** @returns {number} 0-100, rounded to one decimal. */
export function interpolate(raw, points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("anchor table needs at least two points");
  const xs = points.map(([x]) => x);
  for (let i = 1; i < xs.length; i++)
    if (xs[i] <= xs[i - 1]) throw new Error(`anchor x values must strictly increase; got ${xs[i - 1]} then ${xs[i]}`);

  const first = points[0], last = points[points.length - 1];
  if (raw <= first[0]) return first[1];
  if (raw >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (raw <= x1) {
      const t = (raw - x0) / (x1 - x0);
      return Math.round((y0 + t * (y1 - y0)) * 10) / 10;
    }
  }
  return last[1];
}

/**
 * An axis result. `state` is the load-bearing field.
 *
 *   measured               raw is a real number and score is meaningful
 *   not-measured           no instrument exists for this axis in this repository
 *   insufficient-history   the instrument exists but the window is not covered
 *   unavailable            the data source does not exist at all
 *
 * The three non-measured states are kept distinct on purpose. "We cannot see
 * this" and "we could see it but not yet" are different claims, and collapsing
 * them into one would let a reader assume the wrong one. None of them ever
 * carries a score: a missing axis scored 0 would assert the best possible
 * result for something nobody checked.
 */
export const measured = (raw, score, detail) => ({ state: "measured", raw, score, detail });
export const missing = (state, detail) => ({ state, raw: null, score: null, detail });
