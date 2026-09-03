/**
 * A purpose-built reader for GitHub Actions job structure (EPIC-03).
 *
 * NOT A YAML PARSER, and it must not grow into one. It answers four questions
 * about a workflow file and nothing else:
 *
 *   - what are the job ids?
 *   - does a job set continue-on-error: true at JOB level (not step level)?
 *   - what does a job's checkout set fetch-depth to?
 *   - what text is in a job's steps?
 *
 * The job/step distinction is the whole reason this exists. A regex for
 * /continue-on-error: true/ over the file would be satisfied by one on a single
 * STEP while the job itself still blocked merge -- which is precisely the
 * mistake scan-jobs-nonblocking is supposed to catch. Indentation is the only
 * thing that separates the two, so indentation is what this reads.
 *
 * Assumptions, stated because they are load-bearing: two-space indent, `jobs:`
 * at column 0, job ids at column 2, job keys at column 4. GitHub's own schema
 * effectively fixes the first three. scripts/test-scan.mjs asserts this reader
 * finds the jobs it should, so a reformat that breaks the assumption fails
 * loudly rather than silently returning an empty job list.
 */

/** Strip a trailing comment, but only when the # starts a comment. */
function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export function parseJobs(text) {
  const lines = text.split("\n");
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(stripComment(l)));
  if (jobsAt < 0) return { jobs: {}, order: [] };

  const jobs = {};
  const order = [];
  let current = null;

  for (let i = jobsAt + 1; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComment(raw);
    if (/^\S/.test(line) && line.trim() !== "") break; // back to column 0: jobs block is over

    const jobHead = line.match(/^  ([A-Za-z0-9_.-]+):\s*$/);
    if (jobHead) {
      current = jobHead[1];
      order.push(current);
      jobs[current] = { id: current, lines: [], continueOnError: false, needs: [], if: null, fetchDepth: null };
      continue;
    }
    if (!current) continue;
    jobs[current].lines.push(line);
  }

  for (const job of Object.values(jobs)) {
    const body = job.lines;
    // Job level == exactly four spaces of indent.
    job.continueOnError = body.some((l) => /^    continue-on-error:\s*true\s*$/.test(l));
    const needs = body.find((l) => /^    needs:/.test(l));
    if (needs) job.needs = (needs.match(/\[(.*)\]/)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    job.if = body.find((l) => /^    if:/.test(l))?.replace(/^\s*if:\s*/, "").trim() ?? null;
    const fd = body.find((l) => /^\s+fetch-depth:/.test(l));
    if (fd) job.fetchDepth = fd.split(":")[1].trim();
    job.text = body.join("\n");
  }
  return { jobs, order };
}
