// Finds every round under a folder, so runs can be listed and compared without moving them.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const SKIP = new Set(["answers", "live", "node_modules", ".git"]);
const MAX_DEPTH = 3;
const isRun = (dir) => existsSync(join(dir, "run.json")) || existsSync(join(dir, "answers"));

function readRunJson(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  } catch {
    return {};
  }
}

function countAnswers(dir) {
  const answers = join(dir, "answers");
  if (!existsSync(answers)) return { engines: [], answered: 0 };
  const engines = readdirSync(answers, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const answered = engines.reduce((sum, e) => sum + readdirSync(join(answers, e)).filter((f) => f.endsWith(".md")).length, 0);
  return { engines, answered };
}

function summarize(root, dir) {
  const run = readRunJson(dir);
  const { engines, answered } = countAnswers(dir);
  const all = [...new Set([...(run.engines || []), ...engines])];
  const seats = (run.seats || Object.keys(run.people || {})).length;
  const size = basename(resolve(dir));
  const kind = run.kind || (/pilot/i.test(size) ? "pilot" : "round");
  const stamp = existsSync(join(dir, "run.json")) ? statSync(join(dir, "run.json")).mtime.toISOString() : "";
  return {
    id: relative(root, dir).replace(/\\/g, "/") || ".",
    title: run.title || size,
    draft: basename(dirname(resolve(dir))),
    size, kind,
    round: Number.isInteger(run.round) ? run.round : null,
    date: run.date || stamp,
    engines: all,
    llms: run.llms || {},
    answered,
    total: seats ? seats * (all.length || 1) : answered,
    baseline: Boolean(run.baseline),
  };
}

// Numbered rounds in order, then anything unnumbered by date.
const inOrder = (a, b) => (a.round ?? Infinity) - (b.round ?? Infinity) || String(a.date).localeCompare(String(b.date));

// A folder that is itself a run stays a one-round view. Otherwise walk down to the runs inside it.
export function findRounds(root) {
  if (isRun(root)) return [summarize(root, root)];
  const found = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (isRun(child)) found.push(summarize(root, child));
      else if (depth < MAX_DEPTH) walk(child, depth + 1);
    }
  };
  walk(root, 1);
  return found.sort(inOrder);
}

// Only a folder the walk found can be read, so a crafted id cannot leave the root.
export function roundDir(root, id) {
  const known = findRounds(root).find((r) => r.id === id);
  return known ? join(root, known.id) : null;
}
