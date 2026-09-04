/**
 * The five axis scorers. Each is PURE: (raw, anchors) => 0-100. No filesystem,
 * no git, no clock -- all of that lives in ../lib/measure.mjs, so these can be
 * unit-tested against their anchor tables directly.
 *
 * DEVIATION FROM EPIC-06's Key Files, recorded rather than quiet: the Design
 * asks for axes/a1.mjs .. a5.mjs, one module each. They are collected here
 * instead. Five files that each re-export the same interpolation with a
 * different table is more surface for no benefit, and this tool of all tools
 * should not add surface it does not need. The property the EPIC actually wants
 * -- each axis pure and independently testable against its anchors -- holds.
 *
 * Zero dependencies.
 */

import { interpolate } from "./score.mjs";

export const AXIS_IDS = ["A1", "A2", "A3", "A4", "A5"];

/**
 * @param {string} id     axis id
 * @param {number} raw    the raw measure
 * @param {object} anchors  parsed anchors.json
 * @returns {number} 0-100
 */
export function scoreAxis(id, raw, anchors) {
  const axis = anchors.axes[id];
  if (!axis) throw new Error(`unknown axis ${id}`);
  if (typeof raw !== "number" || Number.isNaN(raw)) throw new Error(`${id}: raw measure must be a number, got ${JSON.stringify(raw)}`);
  return interpolate(raw, axis.points);
}

/**
 * The composite, computed ONLY when every axis is measured.
 *
 * There is no re-normalisation over the measured subset. Scaling three axes up
 * to fill 100 would produce a number that looks like a Mist Index, is not one,
 * and would be quoted as one. When axes are missing the caller gets `null` and
 * a coverage figure instead.
 */
export function composite(scores, anchors) {
  const missing = AXIS_IDS.filter((id) => typeof scores[id] !== "number");
  if (missing.length) return { value: null, missing, measuredWeight: AXIS_IDS.filter((id) => typeof scores[id] === "number").reduce((s, id) => s + anchors.weights[id], 0) };
  const value = AXIS_IDS.reduce((s, id) => s + anchors.weights[id] * scores[id], 0);
  return { value: Math.round(value * 10) / 10, missing: [], measuredWeight: 1 };
}

/**
 * What the index structurally cannot see. Printed on EVERY run, in both output
 * modes. It is not a footnote; it is part of the result. A number without its
 * blind spots is the compensatory observability Mist exists to criticise.
 */
export const NOT_MEASURED = [
  "runtime egress (nothing here observes a running process)",
  "transitive maintainer trust (packages are counted, publishers are not)",
  "the CI/CD supply chain (workflows, actions, runner images)",
  "build-tool plugins and codegen",
  "non-npm dependencies (v1 is npm-only)",
  "vendored code -- copying a dependency in REMOVES it from every axis while removing none of the risk",
];
