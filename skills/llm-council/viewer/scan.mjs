// Reads a run folder into the one JSON object the viewer page draws.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const subdirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

const filesOf = (dir, ext) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)) : [];

// One seat's newest file decides its status: answer beats error beats live text.
function readSeat(root, engine, id, name) {
  const [persona, nature = "panel"] = id.split("--");
  const seat = { key: `${engine}/${id}`, id, engine, persona, nature, name: name || "", status: "queued", text: "", mtime: 0 };
  const sources = [
    ["done", join(root, "answers", engine, `${id}.md`)],
    ["failed", join(root, "answers", engine, `${id}.error`)],
    ["thinking", join(root, "live", engine, `${id}.txt`)],
  ];
  for (const [status, path] of sources) {
    // A runner can delete the live file at any moment, so a failed read just moves on.
    try {
      const text = readFileSync(path, "utf8");
      seat.mtime = statSync(path).mtimeMs;
      seat.status = status;
      seat.text = text;
      break;
    } catch {
      continue;
    }
  }
  return seat;
}

// Seats come from run.json when it lists them, plus any file already on disk.
export function scanRun(root) {
  const run = readJson(join(root, "run.json")) || {};
  const engines = new Set([...(run.engines || []), ...subdirs(join(root, "answers")), ...subdirs(join(root, "live"))]);
  if (!engines.size) engines.add("claude");
  const people = run.people || {};
  const ids = new Set(run.seats || Object.keys(people));
  for (const engine of engines) {
    for (const [dir, ext] of [["answers", ".md"], ["answers", ".error"], ["live", ".txt"]]) {
      filesOf(join(root, dir, engine), ext).forEach((id) => ids.add(id));
    }
  }
  const seats = [];
  for (const engine of engines) for (const id of ids) seats.push(readSeat(root, engine, id, people[id]));
  return {
    title: run.title || "Council",
    decision: run.decision || "",
    demo: Boolean(run.demo),
    natures: run.natures || null,
    engines: [...engines],
    llms: run.llms || {},
    seats,
    issues: readJson(join(root, "issues.json")),
  };
}
