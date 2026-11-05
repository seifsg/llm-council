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

const PAIN = ["My bike breaks on the way to work and I lose the morning.", "The shop keeps it for a week and I have no other way around.", "I never know what a repair will cost until it is done."];
const CANCEL = ["Nothing broke for two months, so why pay", "The van came late on the day I needed it", "Parts cost extra every single time"];
const KEEP = ["A free tune-up each quarter", "A named mechanic I can text", "Parts included in the price"];
const CLOSEST = ["A bike that is back the same day", "A real review from someone on my street", "Booking in under a minute", "I never carry the bike anywhere", "Less than one shop visit a month"];

// Every nature scores, about its first pick. One in five writes its scores last, as some LLMs do.
function answer(seed, nature, r) {
  const problems = [0, 1, 2].map((i) => `- ${pick(seed * 3 + i * 2 + 1, r.problems)}`);
  const decisions = r.keys.map((k, i) => `${k}: ${pick(seed + i + r.lift, DECISIONS)}`).join("\n");
  const first = pick(seed + r.lift, ["basic", "plus", "none"]);
  const monthly = first !== "none";
  const scores = `SCORES\nfirst_pick: ${first}\noverall: ${Math.min(10, 3 + (seed % 6) + r.lift)}\nclarity: ${4 + (seed % 5)}\nbelief: ${3 + (seed % 5)}\nreal_problem: ${4 + (seed % 6)}\npain: ${3 + (seed % 7)}\nsolves_it: ${Math.min(10, 3 + (seed % 5) + r.lift)}\ndream_outcome: ${5 + (seed % 5)}\nlikelihood: ${Math.min(10, 3 + (seed % 4) + r.lift)}\ntime_delay: ${2 + (seed % 5)}\neffort: ${Math.max(1, 3 + (seed % 4) - r.lift)}\nbuy_chance: ${Math.min(100, 15 + (seed % 7) * 5 + r.lift * 15)}\nno_brainer_price: ${monthly ? `$${9 + (seed % 3) * 5} monthly` : `${49 + (seed % 3) * 10} once`}\ntoo_expensive_price: ${monthly ? `$${45 + (seed % 3) * 15} monthly` : "about what a new bike costs"}\nchurn_month1: ${monthly ? Math.max(0, 30 + (seed % 5) * 5 - r.lift * 15) : "none"}\nstay_12_months: ${monthly ? Math.min(100, 30 + (seed % 5) * 5 + r.lift * 15) : "none"}\nhard_to_leave: ${Math.min(10, 1 + (seed % 4) + r.lift)}\n${decisions}\nfirst_pick_if_introduced: ${pick(seed + 2, DECISIONS)}\n\n`;
  const body = `## Verdict\nThis is invented demo text for a bike repair subscription. Seat ${seed} would look twice.\n\n## The pain\n${pick(seed, PAIN)}\n\n## Problems\n${[...new Set(problems)].join("\n")}\n\n## Why I cancel\n- ${first === "none" ? "basic" : first}|${pick(seed, CANCEL)}|${pick(seed, KEEP)}\n- ${pick(seed + 1, r.keys)}|${pick(seed + 1, CANCEL)}|${pick(seed + 1, KEEP)}\n\n## No-brainer\ndream: ${CLOSEST[0]}\nlikelihood: ${CLOSEST[1]}\ntime: ${CLOSEST[2]}\neffort: ${CLOSEST[3]}\nprice: ${CLOSEST[4]}\n\n## Retell\nA van fixes your bike for a monthly fee, if it reaches your street.\n\n${CLOSING[nature]}\n\n## Not read\nThe terms.\n\n## Found outside\n${seed % 3 ? "nothing" : "Looked up the van company. Invented result: a two-year-old listing, no reviews."}\n`;
  return seed % 5 === 0 ? `${body}\n${scores}` : `${scores}${body}`;
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
  const issue = (key, status, title, type, offer, seats) => ({ key, status, title, tier: "A", real: "untested", type, offer, do: "Invented demo action", money: "Invented demo payoff", seats });
  writeFileSync(join(dir, "issues.json"), JSON.stringify(r.round === 1
    ? [issue("coverage-map", "new", "No coverage map, so I cannot tell if the van reaches my street", "add", "all", SEATS.slice(0, 9)), issue("parts-included", "new", "Nobody says if parts are included in the price", "fix", "plus", SEATS.slice(3, 12)), issue("same-day-hours", "new", "Same-day promise has no hours attached", "improve", "plus", SEATS.slice(5, 9))]
    : [issue("coverage-map", "fixed", "No coverage map, so I cannot tell if the van reaches my street", "add", "all", SEATS.slice(0, 9)), issue("same-day-hours", "reduced", "Same-day hours are shown but not for weekends", "improve", "plus", SEATS.slice(5, 7)), issue("parts-included", "open", "Parts are still not stated in the price", "fix", "plus", SEATS.slice(2, 10)), issue("care-tune-up", "new", "Care does not say what a tune-up includes", "add", "care", SEATS.slice(8, 15))]));
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
