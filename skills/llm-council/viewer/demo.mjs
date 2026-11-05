// Fills a temp folder with invented answers over time, so the viewer can be tried without a council.
import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NATURES = ["contrarian", "believer", "neutral", "confused", "first-principles", "executor"];
const CLOSING = {
  contrarian: "## Against type\nThe refund held up. I looked for the catch and found none.",
  believer: "## Against type\nStill no idea who fixes my bike if the van breaks.",
  neutral: "## Pros and cons\nPro: cheap and flexible. Con: thin coverage. Show me the van route.",
  confused: "## My questions\nWhat counts as a repair? Do I pay for parts? Who do I call?",
  "first-principles": "## Real question\nDo I need a subscription, or just a mechanic's number?",
  executor: "## Monday morning\n1. Sign up. 2. Book a slot. 3. Stall: the app has no slots near me.",
};
const PROBLEMS = [
  "P1|fix|plus|Nobody says if parts are included in the price|State what parts are included",
  "P1|add|all|No coverage map, so I cannot tell if the van reaches my street|Publish a coverage map",
  "P2|fix|basic|Parts cost is not clear on the basic plan|List the parts prices",
  "P2|add|all|Coverage area is not shown anywhere on the page|Show the coverage area",
  "P2|improve|plus|Same-day promise has no hours attached|Publish the hours",
  "P3|improve|basic|The word tune-up is never defined|Define what a tune-up covers",
];
const DECISIONS = ["act", "talk", "think", "no"];
const NAMES = "Ana Ben Cleo Dmitri Esi Farid Gwen Hugo Ines Jun Kofi Lea Mateo Nia Omar Pia Quinn Rui Sana Theo Uma Vik Wren Yara".split(" ");
const pick = (seed, list) => list[seed % list.length];

function answer(seed, nature) {
  const problems = [0, 1, 2].map((i) => `- ${pick(seed * 3 + i * 2 + 1, PROBLEMS)}`);
  const scores = nature === "neutral"
    ? `SCORES\noverall: ${3 + (seed % 6)}\nclarity: ${4 + (seed % 5)}\nbelief: ${3 + (seed % 5)}\nfirst_pick: ${pick(seed, ["basic", "plus", "none"])}\nbasic: ${pick(seed, DECISIONS)}\nplus: ${pick(seed + 1, DECISIONS)}\nfirst_pick_if_introduced: ${pick(seed + 2, DECISIONS)}\n\n`
    : "";
  return `${scores}## Verdict\nThis is invented demo text for a bike repair subscription. Seat ${seed} would look twice.\n\n## Problems\n${[...new Set(problems)].join("\n")}\n\n## Retell\nA van fixes your bike for a monthly fee, if it reaches your street.\n\n${CLOSING[nature]}\n\n## Not read\nThe terms.\n\n## Sources\nnone\n`;
}

// Streams each seat a few lines at a time, then moves it to answers, as a real runner would.
export function startDemo(root) {
  const personas = ["commuter", "parent", "courier", "shop-owner"];
  const engines = ["claude", "codex"];
  const seats = personas.flatMap((p) => NATURES.map((n) => `${p}--${n}`));
  const people = Object.fromEntries(seats.map((id, i) => [id, NAMES[i]]));
  writeFileSync(join(root, "run.json"), JSON.stringify({
    title: "DEMO: bike repair subscription", decision: "Invented data, to try the viewer.", demo: true, natures: NATURES, engines, people,
  }));
  const jobs = engines.flatMap((e) => seats.map((id, i) => ({ e, id, seed: i + (e === "codex" ? 7 : 0) })));
  engines.forEach((e) => ["live", "answers"].forEach((d) => mkdirSync(join(root, d, e), { recursive: true })));
  const running = new Map();
  const timer = setInterval(() => {
    while (running.size < 6 && jobs.length) {
      const job = jobs.splice(Math.floor(Math.random() * jobs.length), 1)[0];
      const text = answer(job.seed, job.id.split("--")[1]);
      running.set(job, text.match(/[^\n]*\n/g) || []);
    }
    for (const [job, lines] of running) {
      const live = join(root, "live", job.e, `${job.id}.txt`);
      if (lines.length) appendFileSync(live, lines.splice(0, 2).join(""));
      else {
        renameSync(live, join(root, "answers", job.e, `${job.id}.md`));
        running.delete(job);
      }
    }
    if (!jobs.length && !running.size) clearInterval(timer);
  }, 700);
}
