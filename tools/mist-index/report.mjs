/**
 * Human and JSON output for the Mist Index (EPIC-06 Phase 2b/2c).
 *
 * Two invariants this file exists to keep:
 *   1. the anchors version appears in every output, in both modes;
 *   2. the "Not measured" block appears in every output, in both modes.
 *
 * scripts/test-mist-index.mjs asserts both. A score without its anchors is not
 * comparable to anything, and a score without its blind spots is a claim
 * dressed as a measurement.
 *
 * Zero dependencies.
 */

import { AXIS_IDS, NOT_MEASURED } from "./axes/index.mjs";

const STATE_LABEL = {
  measured: "",
  "not-measured": "not measured",
  "insufficient-history": "insufficient history",
  unavailable: "unavailable",
};

export function human(result) {
  const L = [];
  const { anchors, axes, composite: c, target } = result;

  if (c.value === null) {
    L.push(`Mist Index: NOT COMPUTABLE   (anchors ${anchors.anchorsVersion})`);
    L.push(`  ${c.missing.length} of ${AXIS_IDS.length} axes could not be measured, covering ${Math.round((1 - c.measuredWeight) * 100)}% of the weight.`);
    L.push(`  No partial score is reported. Re-normalising the measured axes to fill 100 would`);
    L.push(`  produce a number that looks like a Mist Index and is not one.`);
  } else {
    L.push(`Mist Index: ${c.value} / 100   (anchors ${anchors.anchorsVersion})`);
  }
  L.push(`  target: ${target}`);
  L.push("");

  for (const id of AXIS_IDS) {
    const a = axes[id];
    const meta = anchors.axes[id];
    const w = anchors.weights[id].toFixed(2).replace(/^0/, "");
    if (a.state === "measured") {
      const raw = Number.isInteger(a.raw) ? String(a.raw) : a.raw.toFixed(1);
      L.push(`  ${id} ${meta.name.padEnd(20)} ${(raw + " " + meta.unit).padEnd(34)} -> ${String(a.score).padStart(5)}   (weight ${w})`);
    } else {
      L.push(`  ${id} ${meta.name.padEnd(20)} ${STATE_LABEL[a.state].padEnd(34)} ->     -   (weight ${w})`);
      L.push(`     ${a.detail}`);
    }
  }

  L.push("");
  L.push("  Not measured, by construction:");
  for (const n of NOT_MEASURED) L.push(`    - ${n}`);
  L.push("  See docs/MIST_INDEX.md#limits.");
  L.push("");
  return L.join("\n");
}

export function json(result) {
  return JSON.stringify({
    anchorsVersion: result.anchors.anchorsVersion,
    target: result.target,
    mistIndex: result.composite.value,
    computable: result.composite.value !== null,
    measuredWeight: result.composite.measuredWeight,
    unmeasuredAxes: result.composite.missing,
    axes: Object.fromEntries(AXIS_IDS.map((id) => [id, {
      name: result.anchors.axes[id].name,
      unit: result.anchors.axes[id].unit,
      weight: result.anchors.weights[id],
      state: result.axes[id].state,
      raw: result.axes[id].raw,
      score: result.axes[id].score,
      detail: result.axes[id].detail,
    }])),
    notMeasured: NOT_MEASURED,
  }, null, 2);
}
