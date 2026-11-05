// Turns one seat's answer text into scores, sections and findings. Tolerates half-written text,
// a SCORES block anywhere in the answer, markdown decoration and sections it has not seen before.
const DECISION_WORDS = new Set(["act", "talk", "think", "no"]);
const SCORE_FIELDS = new Set(["overall", "clarity", "belief"]);
const NOT_OFFERS = new Set(["decision", "first_pick_if_introduced", "first_pick"]);

const bare = (s) => s.replace(/[*`_]/g, (c) => (c === "_" ? c : "")).trim();
const firstWord = (s) => s.split(/[\s(,.]/)[0].toLowerCase();

// Finds the score lines and returns them with the text that remains once they are removed.
function splitScores(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#*\s*\**scores\**:?\s*$/i.test(l.trim()));
  if (start < 0) {
    const heading = lines.findIndex((l) => /^##\s/.test(l));
    return { scoreLines: heading < 0 ? lines : lines.slice(0, heading), body: heading < 0 ? "" : lines.slice(heading).join("\n") };
  }
  let end = start + 1;
  while (end < lines.length && !lines[end].trim()) end++;
  while (end < lines.length && lines[end].trim() && !/^##\s/.test(lines[end])) end++;
  return { scoreLines: lines.slice(start + 1, end), body: [...lines.slice(0, start), ...lines.slice(end)].join("\n") };
}

function parseAnswer(text) {
  const out = { scores: {}, decisions: {}, firstPick: "", introduced: "", decision: "", sections: {}, problems: [] };
  const { scoreLines, body } = splitScores(text);

  for (const line of scoreLines) {
    const m = bare(line).match(/^([\w-]+):\s*(\S.*)$/);
    if (!m) continue;
    const [, rawKey, value] = m;
    const key = rawKey.toLowerCase();
    if (SCORE_FIELDS.has(key)) out.scores[key] = parseFloat(value);
    else if (key === "first_pick") out.firstPick = firstWord(value);
    else if (key === "first_pick_if_introduced") out.introduced = firstWord(value);
    else if (key === "decision") out.decision = firstWord(value);
    else if (DECISION_WORDS.has(firstWord(value)) && !NOT_OFFERS.has(key)) out.decisions[key] = firstWord(value);
  }

  const heading = body.search(/^##\s/m);
  if (heading >= 0) {
    for (const part of body.slice(heading).split(/^##\s+/m).filter(Boolean)) {
      const nl = part.indexOf("\n");
      const name = (nl < 0 ? part : part.slice(0, nl)).trim();
      out.sections[name] = nl < 0 ? "" : part.slice(nl + 1).trim();
    }
  }

  for (const line of body.split("\n")) {
    const m = bare(line).match(/^[-•]?\s*(P[123])\s*\|\s*(fix|add|improve)\s*\|([^|]*)\|([^|]*)\|?(.*)$/i);
    if (m) out.problems.push({ p: m[1].toUpperCase(), type: m[2].toLowerCase(), offer: m[3].trim() || "all", wrong: m[4].trim(), fix: m[5].trim() });
  }
  return out;
}

// A nature's closing section where it says nothing goes against type.
const isNothing = (s) => !s || /^["'\s]*(nothing|none)\b/i.test(s);
