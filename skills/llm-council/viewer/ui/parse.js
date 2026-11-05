// Turns one seat's answer text into scores, sections and findings. Tolerates half-written text.
const DECISION_WORDS = new Set(["act", "talk", "think", "no"]);
const SCORE_FIELDS = new Set(["overall", "clarity", "belief"]);
const NOT_OFFERS = new Set(["decision", "first_pick_if_introduced"]);

function parseAnswer(text) {
  const firstHeading = text.search(/^## /m);
  const head = firstHeading < 0 ? text : text.slice(0, firstHeading);
  const out = { scores: {}, decisions: {}, firstPick: "", introduced: "", decision: "", sections: {}, problems: [] };

  for (const line of head.split("\n")) {
    const m = line.match(/^\s*([\w-]+):\s*(\S.*?)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (SCORE_FIELDS.has(key)) out.scores[key] = Number(value);
    else if (key === "first_pick") out.firstPick = value;
    else if (key === "first_pick_if_introduced") out.introduced = value;
    else if (key === "decision") out.decision = value;
    else if (DECISION_WORDS.has(value) && !NOT_OFFERS.has(key)) out.decisions[key] = value;
  }

  if (firstHeading >= 0) {
    for (const part of text.slice(firstHeading).split(/^## /m).filter(Boolean)) {
      const nl = part.indexOf("\n");
      const name = (nl < 0 ? part : part.slice(0, nl)).trim();
      out.sections[name] = nl < 0 ? "" : part.slice(nl + 1).trim();
    }
  }

  for (const line of text.split("\n")) {
    const m = line.match(/^\s*-?\s*(P[123])\s*\|\s*(fix|add|improve)\s*\|([^|]*)\|([^|]*)\|?(.*)$/i);
    if (m) out.problems.push({ p: m[1].toUpperCase(), type: m[2].toLowerCase(), offer: m[3].trim() || "all", wrong: m[4].trim(), fix: m[5].trim() });
  }
  return out;
}

// The closing section where a seat goes against its own nature.
const isNothing = (s) => !s || /^["'\s]*(nothing|none)\b/i.test(s);
