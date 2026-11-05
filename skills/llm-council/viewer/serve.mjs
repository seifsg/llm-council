#!/usr/bin/env node
// Shows a council run live in the browser, or writes it as one shareable HTML file.
// Usage: node serve.mjs <run-folder> [--port 4173] | --static <out.html> | --demo
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRun } from "./scan.mjs";
import { startDemo } from "./demo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = { "/style.css": "text/css", "/parse.js": "text/javascript", "/issues.js": "text/javascript", "/views.js": "text/javascript", "/compare.js": "text/javascript", "/app.js": "text/javascript" };
const asset = (name) => readFileSync(join(HERE, "ui", name), "utf8");

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1];
};
const demo = args.includes("--demo");
const root = demo ? mkdtempSync(join(tmpdir(), "llm-council-demo-")) : args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

if (!root || !existsSync(root)) {
  console.error("Usage: node serve.mjs <run-folder> [--port 4173] | --static <out.html> | --demo");
  process.exit(1);
}

// Inlines every asset and the data, so the file opens with no server.
function writeStatic(out) {
  const data = JSON.stringify(scanRun(root)).replace(/</g, "\\u003c");
  const scripts = ["parse.js", "issues.js", "views.js", "compare.js", "app.js"].map((f) => `<script>${asset(f)}</script>`).join("\n");
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

const server = createServer((req, res) => {
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(403);
    return res.end();
  }
  const path = req.url.split("?")[0];
  if (path === "/api/run") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(scanRun(root)));
  }
  if (path === "/" || ASSETS[path]) {
    const name = path === "/" ? "index.html" : path.slice(1);
    res.writeHead(200, { "content-type": ASSETS[path] || "text/html", "cache-control": "no-store" });
    return res.end(asset(name));
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
