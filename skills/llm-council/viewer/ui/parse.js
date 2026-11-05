// Turns one seat's answer text into scores, sections and findings. Tolerates half-written text,
// a SCORES block anywhere in the answer, markdown decoration and sections it has not seen before.
const DECISION_WORDS = new Set(["act", "talk", "think", "no"]);
// Allowed range per numeric score. A value outside it is wrong, so it is dropped.
const SCORE_RANGES = {
  overall: [0, 10], clarity: [0, 10], belief: [0, 10], real_problem: [0, 10], pain: [0, 10], solves_it: [0, 10], hard_to_leave: [0, 10],
  dream_outcome: [1, 10], likelihood: [1, 10], time_delay: [1, 10], effort: [1, 10],
  buy_chance: [0, 100], churn_month1: [0, 100], stay_12_months: [0, 100],
};
const NONE_ALLOWED = new Set(["churn_month1", "stay_12_months"]);
const PRICE_FIELDS = new Set(["no_brainer_price", "too_expensive_price"]);
const VALUE_FACTORS = ["dream_outcome", "likelihood", "time_delay", "effort"];
const NOT_OFFERS = new Set(["decision", "first_pick_if_introduced", "first_pick"]);
const KNOWN_SECTIONS = new Map(["The pain", "Why I cancel", "No-brainer", "Found outside"].map((n) => [n.toLowerCase(), n]));

const bare = (s) => s.replace(/[*`_]/g, (c) => (c === "_" ? c : "")).trim();
const firstWord = (s) => s.split(/[\s(,.]/)[0].toLowerCase();
const noBullet = (s) => bare(s).replace(/^[-•]\s*/, "");
const sectionName = (raw) => {
  const name = bare(raw).replace(/:$/, "").trim();
  return KNOWN_SECTIONS.get(name.toLowerCase()) || name;
};
// A section or line that says only "nothing". Longer sentences that start with the word still count.
const saysNothing = (s) => !s || /^["'\s]*(nothing|none)[\s.!"']*$/i.test(s);

// Finds every score block and returns its lines with the text that remains once they are removed.
function splitScores(text) {
  const lines = text.split(/\r?\n/);
  const scoreLines = [];
  const body = [];
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (!/^#*\s*\**scores\**:?\s*$/i.test(lines[i].trim())) {
      body.push(lines[i]);
      continue;
    }
    found = true;
    i++;
    while (i < lines.length && !lines[i].trim()) i++;
    while (i < lines.length && lines[i].trim() && !/^##\s/.test(lines[i])) scoreLines.push(lines[i++]);
    i--;
  }
  if (found) return { scoreLines, body: body.join("\n") };
  const heading = lines.findIndex((l) => /^##\s/.test(l));
  return { scoreLines: heading < 0 ? lines : lines.slice(0, heading), body: heading < 0 ? "" : lines.slice(heading).join("\n") };
}

function readScore(key, raw) {
  const n = parseFloat(raw.match(/\d+(?:\.\d+)?/)?.[0]);
  const [low, high] = SCORE_RANGES[key];
  return n >= low && n <= high ? n : undefined;
}

// "$2,400 monthly", "99 once" or free text. The raw words always stay. The first price named wins.
function parsePrice(raw) {
  const text = raw.trim();
  if (/^["'\s]*(none|nothing|n\/a)\b/i.test(text)) return { raw: text, amount: null, cadence: "", none: true };
  const clause = text.split(";")[0];
  const m = clause.match(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i);
  const amount = m ? parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1) : null;
  const cadence = /month|\/\s*mo\b|\bmo\b/i.test(clause) ? "monthly" : /year|annual|\/\s*yr\b/i.test(clause) ? "yearly" : /once|one[- ]?(time|off)|upfront|flat/i.test(clause) ? "once" : "";
  return { raw: text, amount, cadence, none: false };
}

function readScoreLine(out, line) {
  const m = noBullet(line).match(/^([\w-]+):\s*(\S.*)$/);
  if (!m) return;
  const key = m[1].toLowerCase();
  const value = m[2];
  if (Object.hasOwn(SCORE_RANGES, key)) {
    const n = NONE_ALLOWED.has(key) && /^none\b/i.test(value) ? null : readScore(key, value);
    if (n !== undefined) out.scores[key] = n;
  } else if (PRICE_FIELDS.has(key)) out.prices[key] = parsePrice(value);
  else if (key === "first_pick") out.firstPick = firstWord(value);
  else if (key === "first_pick_if_introduced") out.introduced = firstWord(value);
  else if (key === "decision") out.decision = firstWord(value);
  else if (DECISION_WORDS.has(firstWord(value)) && !NOT_OFFERS.has(key)) out.decisions[key] = firstWord(value);
}

// A repaired answer can carry a missing score as a bare line outside any block.
function readLooseScore(scores, text) {
  const m = text.match(/^([\w-]+):\s*(\d+(?:\.\d+)?)%?$/);
  const key = m?.[1].toLowerCase();
  if (!m || !Object.hasOwn(SCORE_RANGES, key) || key in scores) return;
  const n = readScore(key, m[2]);
  if (n !== undefined) scores[key] = n;
}

// The seat's own four numbers come first. The runner's value, from the header, is the fallback.
function seatValue(text, scores) {
  if (VALUE_FACTORS.every((f) => Number.isFinite(scores[f]))) return Math.round((scores.dream_outcome * scores.likelihood * 100) / (scores.time_delay * scores.effort)) / 100;
  const header = parseFloat(text.split(/\r?\n\s*\r?\n/)[0].match(/^value:\s*(\d+(?:\.\d+)?)\s*$/m)?.[1]);
  return header >= 0.01 && header <= 100 ? header : null;
}

function readCancels(text = "") {
  return text.split("\n").map(noBullet).filter((l) => !saysNothing(l)).map((line) => {
    const [offer, why, ...keep] = line.split("|").map((p) => p.trim());
    return why === undefined ? { offer: "all", why: line, keep: "" } : { offer: offer.toLowerCase() || "all", why, keep: keep.filter(Boolean).join(", ") };
  }).filter((c) => c.why);
}

function readNoBrainer(text = "") {
  const out = {};
  for (const line of text.split("\n")) {
    const m = noBullet(line).match(/^(dream|likelihood|time|effort|price):\s*(\S.*)$/i);
    if (m && !saysNothing(m[2])) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function parseAnswer(text) {
  const out = { scores: {}, prices: {}, decisions: {}, firstPick: "", introduced: "", decision: "", sections: {}, problems: [], cancels: [], noBrainer: {} };
  const { scoreLines, body } = splitScores(text);
  for (const line of scoreLines) readScoreLine(out, line);

  const heading = body.search(/^##\s/m);
  if (heading >= 0) {
    for (const part of body.slice(heading).split(/^##\s+/m).filter(Boolean)) {
      const nl = part.indexOf("\n");
      const name = sectionName(nl < 0 ? part : part.slice(0, nl));
      out.sections[name] = nl < 0 ? "" : part.slice(nl + 1).trim();
    }
  }

  // Found outside is about the wider web, not the offer, so it never counts as a finding.
  let inside = "";
  for (const line of body.split("\n")) {
    const head = line.match(/^##\s+(.*)$/);
    if (head) {
      inside = sectionName(head[1]);
      continue;
    }
    if (inside === "Found outside") continue;
    const m = bare(line).match(/^[-•]?\s*(P[123])\s*\|\s*(fix|add|improve)\s*\|([^|]*)\|([^|]*)\|?(.*)$/i);
    if (m) out.problems.push({ p: m[1].toUpperCase(), type: m[2].toLowerCase(), offer: m[3].trim() || "all", wrong: m[4].trim(), fix: m[5].trim() });
    else if (inside !== "No-brainer") readLooseScore(out.scores, noBullet(line));
  }

  const value = seatValue(text, out.scores);
  if (value !== null) out.scores.value = value;
  out.cancels = readCancels(out.sections["Why I cancel"]);
  out.noBrainer = readNoBrainer(out.sections["No-brainer"]);
  return out;
}

// A nature's closing section where it says nothing goes against type.
const isNothing = (s) => !s || /^["'\s]*(nothing|none)\b/i.test(s);
