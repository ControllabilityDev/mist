#!/usr/bin/env node
/**
 * The public telemetry dashboard (EPIC-04).
 *
 * ZERO DEPENDENCIES. Node standard library only, no npm packages, ever.
 *
 * This is the sharpest design decision in the EPIC and it is not tidiness. The
 * dashboard is the INSTRUMENT, not the SPECIMEN. An instrument built out of the
 * thing it measures cannot be trusted twice over: its own supply chain becomes a
 * confound in every reading, and a compromise of the instrument corrupts the
 * record it exists to preserve. A thermometer is not made of fever.
 *
 * The charts are `<polyline points="...">` computed by hand below -- a few dozen
 * lines, deliberately small enough to audit in one sitting. Every chart carries a
 * <table> with the same numbers, so the data survives the SVG.
 *
 * The page is STATIC: no server, no runtime fetch. It must render correctly from
 * an archive years later with the deployment long gone.
 *
 * Usage:
 *   node site/build.mjs --telemetry ./telemetry --out ./site/dist
 *   node site/build.mjs --telemetry ./fixtures/telemetry --out /tmp/dash
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The framing sentence. Tested verbatim by dash-headline-framing. */
export const FRAMING = "THIS IS A BILL, NOT A RETURN VALUE.";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-GB"));

/** Load the record. Runs are returned oldest-first, as index.json lists them. */
export function loadRecord(telemetryDir) {
  const indexFile = join(telemetryDir, "index.json");
  if (!existsSync(indexFile)) throw new Error(`no index.json in ${telemetryDir}`);
  const index = JSON.parse(readFileSync(indexFile, "utf8"));
  const runs = (index.runs ?? []).map((entry) => ({
    entry,
    envelope: JSON.parse(readFileSync(join(telemetryDir, entry.path), "utf8")),
  }));
  // A decay series, if the record has one. Optional: EPIC-07 may not have run.
  const decayDir = join(telemetryDir, "decay");
  let decay = [];
  if (existsSync(decayDir)) {
    for (const tag of readdirSync(decayDir)) {
      const d = join(decayDir, tag);
      if (!statSync(d).isDirectory()) continue;
      for (const f of readdirSync(d).filter((x) => x.endsWith(".json")).sort())
        decay.push({ tag, file: f, record: JSON.parse(readFileSync(join(d, f), "utf8")) });
    }
  }
  return { index, runs, decay };
}

/** One run's headline facts. */
function digest(envelope) {
  const findings = envelope.scanners.flatMap((s) => s.findings);
  const byCi = {};
  for (const f of findings) byCi[f.counterInvariant ?? "unmapped"] = (byCi[f.counterInvariant ?? "unmapped"] ?? 0) + 1;
  return {
    at: envelope.startedAt,
    sha: envelope.commit,
    surface: envelope.surface,
    total: findings.length,
    second: findings.filter((f) => f.party === "second").length,
    first: findings.filter((f) => f.party === "first").length,
    byCi,
    // "Red" is a scanner that produced findings OR crashed. A crashed scanner is
    // not a clean one, and a dashboard that showed it as green would be the
    // false-green failure the envelope's `status` field exists to prevent.
    red: findings.length > 0 || envelope.scanners.some((s) => s.status === "crashed"),
    crashed: envelope.scanners.filter((s) => s.status === "crashed").map((s) => s.id),
    skipped: envelope.scanners.filter((s) => s.status === "skipped").map((s) => s.id),
  };
}

/** An inline SVG line chart plus its <table> fallback. */
function chart(title, series, { height = 150, width = 640 } = {}) {
  // Null points are GAPS. They are dropped from the polyline (so the line
  // breaks) and counted, never interpolated across.
  const all = series.points;
  const points = all.filter((p) => p.y !== null && p.y !== undefined);
  const gapCount = all.length - points.length;
  const pad = 28;
  const ys = points.map((p) => p.y);
  const max = Math.max(1, ...ys), min = Math.min(0, ...ys);
  const span = max - min || 1;
  const x = (i) => pad + (points.length < 2 ? 0 : (i * (width - pad * 2)) / (points.length - 1));
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);

  const poly = points.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3"><title>${esc(p.label)}: ${num(p.y)}</title></circle>`).join("");

  return `
<figure class="chart">
  <figcaption>${esc(title)}</figcaption>
  <svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${series.id}-t">
    <title id="${series.id}-t">${esc(title)}</title>
    <line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>
    <polyline class="line" points="${poly}"/>
    ${dots}
    <text class="tick" x="${pad}" y="${pad - 10}">${num(max)}</text>
    <text class="tick" x="${pad}" y="${height - pad + 16}">${esc(points[0]?.label ?? "")}</text>
    <text class="tick end" x="${width - pad}" y="${height - pad + 16}">${esc(points[points.length - 1]?.label ?? "")}</text>
    ${gapCount ? `<text class="tick gap" x="${width / 2}" y="${height - 4}" text-anchor="middle">▨ ${gapCount} month(s) with no data — not interpolated</text>` : ""}
  </svg>
  <details class="fallback-wrap">
    <summary>the same numbers, as a table</summary>
    <table class="chart-fallback">
      <caption>${esc(title)} — for when the chart does not render</caption>
      <thead><tr><th scope="col">run</th><th scope="col">${esc(series.unit)}</th></tr></thead>
      <tbody>${points.map((p) => `<tr><td>${esc(p.label)}</td><td>${num(p.y)}</td></tr>`).join("")}</tbody>
    </table>
  </details>
</figure>`;
}

/** A gated panel: honest about what is not measured yet. */
const gated = (title, epic, why) => `
<section class="panel gated">
  <h3>🔒 ${esc(title)}</h3>
  <p><strong>Not built yet — owned by ${esc(epic)}.</strong> ${esc(why)}</p>
  <p class="muted">This placeholder is deliberate. A dashboard that silently omitted a
  panel it cannot fill would be claiming completeness it does not have.</p>
</section>`;

const delta = (now, then) => {
  if (now === null || then === null || now === undefined || then === undefined) return `<span class="d flat">—</span>`;
  const d = now - then;
  if (d === 0) return `<span class="d flat">▬ 0</span>`;
  return `<span class="d ${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ "}${num(Math.abs(d) * (d > 0 ? 1 : 1))}</span>`;
};

/**
 * The decay panel (EPIC-07 Phase 4a/4b). Replaces the reserved placeholder once
 * a series exists; renders the placeholder until then.
 *
 * Two series, never merged: `pinned` is the pure disclosure signal (scanner
 * versions frozen at the freeze), `current` is disclosure plus detection
 * capability. Their divergence is how much of what we now know we could have
 * known with better tools.
 *
 * GAPS ARE DRAWN AS GAPS. A month that did not run is a break in the line and a
 * marker underneath, never an interpolated point. A gapless chart that is not
 * gapless would be a lie of exactly the kind this project is about.
 */
function decayPanel(decay) {
  if (!decay.length)
    return gated("Decay curve", "EPIC-07",
      "A frozen tree rescanned monthly, unchanged, charting how exposure grows through disclosure alone. The freeze exists (decay/v1.0.0, 826 packages, 635.5 MiB vaulted); no rescan has run yet.");

  const findingsOf = (r) => (r.scanners ?? []).reduce((n, s) => n + (s.findings?.length ?? 0), 0);
  const months = [...new Set(decay.map(({ record }) => (record.startedAt ?? "").slice(0, 7)))].sort();
  const cell = (month, mode) => {
    const hit = decay.find(({ record }) => (record.startedAt ?? "").slice(0, 7) === month && record.scannerMode === mode && record.status !== "gap");
    if (hit) return { y: findingsOf(hit.record), gap: false };
    const gap = decay.find(({ record }) => (record.startedAt ?? "").slice(0, 7) === month && record.status === "gap");
    return { y: null, gap: true, reason: gap?.record?.reason ?? "no record for this month" };
  };

  const series = (mode) => ({
    id: `decay-${mode}`, unit: "known findings",
    points: months.map((m) => ({ label: m, ...cell(m, mode) })),
  });
  const pinned = series("pinned"), current = series("current");
  const gaps = months.filter((m) => cell(m, "pinned").gap);
  const tag = decay[0]?.tag ?? "v1.0.0";

  return `
<section class="panel">
  <h2>Decay — known findings against an unchanged tree</h2>
  <p><strong>The tree has not changed since the freeze.</strong> No packages updated,
  no lines of code changed, no lockfile regenerated. Every finding below arrived
  because the world learned something, not because Mist did anything.</p>
  <p class="muted"><code>pinned</code> uses the scanner versions frozen at the freeze —
  the pure disclosure signal. <code>current</code> uses the latest scanners, so it
  carries disclosure <em>and</em> improved detection. The gap between them is how much
  of what we now know we could have known with better tools.</p>
  ${chart(`${tag} — pinned scanners (disclosure only)`, pinned)}
  ${chart(`${tag} — current scanners (disclosure + detection)`, current)}
  ${gaps.length ? `<p class="warn">${gaps.length} month(s) with no rescan: <code>${esc(gaps.join(", "))}</code>. Drawn as gaps, never interpolated.</p>` : ""}
</section>`;
}

export function render({ index, runs, decay = [] }) {
  if (!runs.length) throw new Error("the record is empty");
  const digests = runs.map((r) => digest(r.envelope));
  const now = digests[digests.length - 1];
  const prev = digests.length > 1 ? digests[digests.length - 2] : null;
  const label = (d) => d.at.slice(0, 10);

  const series = (id, pick, unit) => ({ id, unit, points: digests.map((d) => ({ label: label(d), y: pick(d) })) });

  const CI_ORDER = ["CI-1", "CI-2", "CI-3", "CI-4", "CI-5", "CI-6", "unmapped"];
  const ciMax = Math.max(1, ...CI_ORDER.map((c) => now.byCi[c] ?? 0));

  const row = (k, v, p) =>
    `<tr><th scope="row">${esc(k)}</th><td class="n">${num(v)}</td><td class="dlt">${delta(v, p)}</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mist — telemetry</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>

<div class="fold">
<header class="framing">
  <h1>Mist — telemetry</h1>
  <p class="bill">${FRAMING}</p>
  <p>Every number below was purchased after the fact, because Mist does not control
  its inputs. This is counter-invariant <strong>CI-2</strong>: in a controllable
  system telemetry is the return value of the transition function. Here it is an
  invoice from external tooling.</p>
  <p class="muted">Mist is a deliberately over-dependent weather dashboard built as a
  negative control. It is not a product. Nothing here is a vulnerability disclosure.</p>
</header>

<section class="panel status ${now.red ? "red" : "green"}">
  <h2>Current state <span class="dot" aria-hidden="true"></span><span class="state">${now.red ? "RED" : "GREEN"}</span></h2>
  <p class="muted">Last run <time datetime="${esc(now.at)}">${esc(now.at)}</time> at
  <code>${esc(now.sha.slice(0, 12))}</code> — run ${digests.length} of ${digests.length},
  record started ${esc((index.recordStarted ?? digests[0].at).slice(0, 10))}.</p>
  <table class="metrics">
    <caption>Surface and findings, with the change since the previous run</caption>
    <thead><tr><th scope="col">metric</th><th scope="col">now</th><th scope="col">change</th></tr></thead>
    <tbody>
      ${row("Transitive packages", now.surface.transitivePackages, prev?.surface.transitivePackages ?? null)}
      ${row("Install scripts", now.surface.packagesWithInstallScripts, prev?.surface.packagesWithInstallScripts ?? null)}
      ${row("Network at install", now.surface.packagesWithNetworkAtInstall, prev?.surface.packagesWithNetworkAtInstall ?? null)}
      ${row("Network at import", now.surface.packagesWithNetworkAtImport, prev?.surface.packagesWithNetworkAtImport ?? null)}
      ${row("Distinct maintainers", now.surface.distinctMaintainers, prev?.surface.distinctMaintainers ?? null)}
      ${row("Findings — second-party", now.second, prev?.second ?? null)}
      ${row("Findings — first-party", now.first, prev?.first ?? null)}
    </tbody>
  </table>
  ${now.crashed.length ? `<p class="warn">Scanner(s) crashed this run: <code>${esc(now.crashed.join(", "))}</code>. A crashed scanner is not a clean one.</p>` : ""}
  ${now.skipped.length ? `<p class="muted">Skipped: <code>${esc(now.skipped.join(", "))}</code> — a skipped scanner reports nothing, which is not the same as reporting zero.</p>` : ""}
</section>
</div>

<section class="panel">
  <h2>The split that matters</h2>
  <p>Mist's defects are <strong>second-party</strong> — they arrive in
  <code>node_modules</code> and no code review would catch them. The first-party
  count is shown beside it, honestly, because the claim is only falsifiable if
  both are visible.</p>
  <div class="split">
    <div class="half second"><span class="big">${num(now.second)}</span><span>second-party</span></div>
    <div class="half first"><span class="big">${num(now.first)}</span><span>first-party</span></div>
  </div>
  <div class="charts">
  ${chart("First-party findings over time", series("s-first", (d) => d.first, "findings"))}
  ${chart("Second-party findings over time", series("s-second", (d) => d.second, "findings"))}
  </div>
</section>

<section class="panel">
  <h2>Surface growth</h2>
  <p>What each convenience cost, charted. A rising line here is the price of a
  feature that was easy to add.</p>
  <div class="charts">
  ${chart("Transitive packages", series("s-tp", (d) => d.surface.transitivePackages, "packages"))}
  ${chart("Packages running install scripts", series("s-is", (d) => d.surface.packagesWithInstallScripts, "packages"))}
  ${chart("Packages reaching the network at import (upper bound)", series("s-ni", (d) => d.surface.packagesWithNetworkAtImport, "packages"))}
  ${chart("Distinct maintainers who can publish into this tree", series("s-dm", (d) => d.surface.distinctMaintainers, "accounts"))}
  </div>
</section>

<section class="panel">
  <h2>Findings by counter-invariant</h2>
  <p>Each finding joined back to the kernel invariant it inverts. The taxonomy is
  <a href="https://github.com/ControllabilityDev/mist/blob/main/docs/ANTI_KERNEL.md">docs/ANTI_KERNEL.md</a>.</p>
  <div class="bars">
    ${CI_ORDER.map((c) => {
      const v = now.byCi[c] ?? 0;
      return `<div class="bar"><span class="k">${esc(c)}</span><span class="track"><span class="fill" style="width:${((v / ciMax) * 100).toFixed(1)}%"></span></span><span class="v">${num(v)}</span></div>`;
    }).join("")}
  </div>
  <table class="chart-fallback">
    <caption>Findings by counter-invariant — the same numbers</caption>
    <thead><tr><th scope="col">counter-invariant</th><th scope="col">findings</th></tr></thead>
    <tbody>${CI_ORDER.map((c) => `<tr><td>${esc(c)}</td><td>${num(now.byCi[c] ?? 0)}</td></tr>`).join("")}</tbody>
  </table>
  <p class="muted"><code>unmapped</code> is not a gap in the data. Some finding types
  are genuine hazards that are not inversions of a controllability invariant —
  obfuscated source, licence obligations, secrets in history. Forcing them into a
  CI-* row would inflate a number.</p>
</section>

${decayPanel(decay)}
${gated("Mist Index", "EPIC-06", "The composite score. It exists and currently reports NOT COMPUTABLE: two of five axes have no instrument.")}

<footer>
  <p>Generated ${esc(new Date().toISOString().slice(0, 10))} from ${digests.length} run(s).
  Static page, no runtime data fetch. The record is append-only: a run that was red
  stays red, including runs that were red because of a Mist bug.</p>
  <p class="muted">There is deliberately no severity filter, no acknowledge control and no
  snooze. If a dashboard can be made to look better without the exposure changing,
  it is not an instrument.</p>
</footer>

</main>
</body>
</html>
`;
}

function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const telemetry = resolve(arg("--telemetry", "./telemetry"));
  const out = resolve(arg("--out", "./site/dist"));
  const record = loadRecord(telemetry);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), render(record));
  copyFileSync(join(HERE, "style.css"), join(out, "style.css"));
  console.error(`site/build: wrote ${join(out, "index.html")} from ${record.runs.length} run(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
