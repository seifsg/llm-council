#!/usr/bin/env node
// Shows council rounds live in the browser, or writes them as one shareable HTML file.
// The folder can be one run, or a parent holding many rounds to list and compare.
// Usage: node serve.mjs <folder> [--port 4173] | --static <out.html> | --demo
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRun } from "./scan.mjs";
import { findRounds, roundDir } from "./rounds.mjs";
import { startDemo } from "./demo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = ["icons.js", "parse.js", "value.js", "issues.js", "views.js", "valueview.js", "painview.js", "compare.js", "compute.js", "rounds.js", "improving.js", "app.js"];
const ASSETS = { "/style.css": "text/css", ...Object.fromEntries(SCRIPTS.map((f) => [`/${f}`, "text/javascript"])) };
const asset = (name) => readFileSync(join(HERE, "ui", name), "utf8");

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1];
};
const demo = args.includes("--demo");
const root = demo ? mkdtempSync(join(tmpdir(), "llm-council-demo-")) : args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

if (!root || !existsSync(root)) {
  console.error("Usage: node serve.mjs <folder> [--port 4173] | --static <out.html> | --demo");
  process.exit(1);
}

// Inlines every asset and every round, so the file opens with no server.
function writeStatic(out) {
  const rounds = findRounds(root);
  const runs = Object.fromEntries(rounds.map((r) => [r.id, scanRun(roundDir(root, r.id))]));
  const data = JSON.stringify({ rounds, runs }).replace(/</g, "\\u003c");
  const scripts = SCRIPTS.map((f) => `<script>${asset(f)}</script>`).join("\n");
  const html = asset("index.html")
    .replace(/<link[^>]*style\.css[^>]*>/, () => `<style>${asset("style.css")}</style>`)
    .replace(/<script src=[\s\S]*<\/script>/, () => `<script>window.__COUNCIL__=${data}</script>\n${scripts}`);
  writeFileSync(out, html);
  console.log(`Wrote ${out}. It holds every answer, so keep it private unless the materials are public.`);
}

const out = flag("--static");
if (out) {
  writeStatic(out);
  process.exit(0);
}
if (demo) startDemo(root);

// A page on another site must not read the answers by pointing its own domain here.
const isLocalHost = (host = "") => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
const sendJson = (res, value) => {
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
};

const server = createServer((req, res) => {
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(403);
    return res.end();
  }
  const [path, query = ""] = req.url.split("?");
  if (path === "/api/rounds") return sendJson(res, findRounds(root));
  if (path === "/api/run") {
    const rounds = findRounds(root);
    const id = new URLSearchParams(query).get("round") || rounds.at(-1)?.id;
    const dir = id && roundDir(root, id);
    if (!dir) {
      res.writeHead(404);
      return res.end();
    }
    return sendJson(res, scanRun(dir));
  }
  if (path === "/" || ASSETS[path]) {
    const name = path === "/" ? "index.html" : path.slice(1);
    // A checkout can change under a running server: a missing file must not take the viewer down.
    try {
      const body = asset(name);
      res.writeHead(200, { "content-type": ASSETS[path] || "text/html", "cache-control": "no-store" });
      return res.end(body);
    } catch {
      res.writeHead(404);
      return res.end();
    }
  }
  res.writeHead(404);
  res.end();
});

// Local only: the answers can hold private material.
let port = Number(flag("--port")) || 4173;
server.on("error", (err) => {
  if (err.code !== "EADDRINUSE") throw err;
  server.listen(++port, "127.0.0.1");
});
server.on("listening", () => console.log(`Council viewer: http://127.0.0.1:${port}`));
server.listen(port, "127.0.0.1");
