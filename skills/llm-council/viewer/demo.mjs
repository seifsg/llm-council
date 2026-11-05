// Fills a temp folder with invented rounds, one finished and one running, so the viewer can be tried without a council.
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
const PERSONAS = ["commuter", "parent", "courier", "shop-owner"];
const ENGINES = ["claude", "codex", "gemini", "grok"];
const LLMS = { claude: { name: "Claude Sonnet 5.5" }, codex: { name: "Codex gpt-6.1-sol" }, gemini: { name: "Gemini" }, grok: { name: "Grok" } };
const SEATS = PERSONAS.flatMap((p) => NATURES.map((n) => `${p}--${n}`));
const PEOPLE = Object.fromEntries(SEATS.map((id, i) => [id, NAMES[i]]));
const HASHES = { prompt: "demo-prompt", lives: Object.fromEntries(PERSONAS.map((p) => [p, `demo-${p}`])) };
const pick = (seed, list) => list[seed % list.length];

const ROUNDS = [
  { name: "round-1", round: 1, offer: "# Bike repair subscription\n\nBasic: $19 a month.\n\nPlus: $39 a month, same-day repair.\n\nWe come to you.\n", offers: "basic|Basic\nplus|Plus\n", problems: PROBLEMS, keys: ["basic", "plus"], lift: 0 },
  { name: "round-2", round: 2, offer: "# Bike repair subscription\n\nBasic: $19 a month.\n\nPlus: $39 a month, same-day repair from 8am to 6pm.\n\nCare: $9 a month, tune-up only.\n\nWe come to you. See the coverage map.\n", offers: "basic|Basic\nplus|Plus\ncare|Care\n", problems: PROBLEMS.filter((p) => !p.includes("coverage") && !p.includes("Coverage") && !p.includes("hours")).concat("P2|add|care|Care does not say what a tune-up includes|List what Care covers"), keys: ["basic", "plus", "care"], lift: 1 },
];

function answer(seed, nature, r) {
  const problems = [0, 1, 2].map((i) => `- ${pick(seed * 3 + i * 2 + 1, r.problems)}`);
  const decisions = r.keys.map((k, i) => `${k}: ${pick(seed + i + r.lift, DECISIONS)}`).join("\n");
  const scores = nature === "neutral"
    ? `SCORES\noverall: ${Math.min(10, 3 + (seed % 6) + r.lift)}\nclarity: ${4 + (seed % 5)}\nbelief: ${3 + (seed % 5)}\nfirst_pick: ${pick(seed + r.lift, ["basic", "plus", "none"])}\n${decisions}\nfirst_pick_if_introduced: ${pick(seed + 2, DECISIONS)}\n\n`
    : "";
  return `${scores}## Verdict\nThis is invented demo text for a bike repair subscription. Seat ${seed} would look twice.\n\n## Problems\n${[...new Set(problems)].join("\n")}\n\n## Retell\nA van fixes your bike for a monthly fee, if it reaches your street.\n\n${CLOSING[nature]}\n\n## Not read\nThe terms.\n\n## Sources\nnone\n`;
}

function writeRound(root, r) {
  const dir = join(root, "bike-repair", r.name);
  ENGINES.forEach((e) => ["live", "answers"].forEach((d) => mkdirSync(join(dir, d, e), { recursive: true })));
  writeFileSync(join(dir, "run.json"), JSON.stringify({
    title: `DEMO: bike repair, round ${r.round}`, decision: "Invented data, to try the viewer.", demo: true, kind: "round", round: r.round, baseline: r.round === 1,
    date: `2026-01-0${r.round}T09:00:00.000Z`, effort: "medium", hashes: HASHES, natures: NATURES, engines: ENGINES, llms: LLMS, people: PEOPLE,
  }));
  writeFileSync(join(dir, "offer.md"), r.offer);
  writeFileSync(join(dir, "offers.txt"), r.offers);
  writeFileSync(join(dir, "why.md"), `Decision: invented, for trying round ${r.round}.\n`);
  const issue = (title, type, offer, seats) => ({ title, tier: "A", real: "untested", type, offer, do: "Invented demo action", money: "Invented demo payoff", seats });
  writeFileSync(join(dir, "issues.json"), JSON.stringify(r.round === 1
    ? [issue("No coverage map, so I cannot tell if the van reaches my street", "add", "all", SEATS.slice(0, 9)), issue("Nobody says if parts are included in the price", "fix", "plus", SEATS.slice(3, 12)), issue("Same-day promise has no hours attached", "improve", "plus", SEATS.slice(5, 9))]
    : [issue("Nobody says if parts are included in the price", "fix", "plus", SEATS.slice(2, 10)), issue("Care does not say what a tune-up includes", "add", "care", SEATS.slice(8, 15))]));
  return dir;
}

const jobsFor = () => ENGINES.flatMap((e, n) => SEATS.map((id, i) => ({ e, id, seed: i + n * 7 })));

// Streams each seat a few lines at a time, then moves it to answers, as a real runner would.
export function startDemo(root) {
  const first = writeRound(root, ROUNDS[0]);
  for (const { e, id, seed } of jobsFor()) writeFileSync(join(first, "answers", e, `${id}.md`), answer(seed, id.split("--")[1], ROUNDS[0]));
  const dir = writeRound(root, ROUNDS[1]);
  const jobs = jobsFor();
  const running = new Map();
  const timer = setInterval(() => {
    while (running.size < 12 && jobs.length) {
      const job = jobs.splice(Math.floor(Math.random() * jobs.length), 1)[0];
      running.set(job, answer(job.seed, job.id.split("--")[1], ROUNDS[1]).match(/[^\n]*\n/g) || []);
    }
    for (const [job, lines] of running) {
      const live = join(dir, "live", job.e, `${job.id}.txt`);
      if (lines.length) appendFileSync(live, lines.splice(0, 2).join(""));
      else {
        renameSync(live, join(dir, "answers", job.e, `${job.id}.md`));
        running.delete(job);
      }
    }
    if (!jobs.length && !running.size) clearInterval(timer);
  }, 700);
}
