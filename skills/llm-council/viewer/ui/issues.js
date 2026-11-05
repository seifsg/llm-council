// Groups similar findings across seats, so common issues surface while answers arrive.
const STOP = new Set("a an the and or but if so to of in on for with at by from is are was be it its this that i my me you your we our they their not no do does did can cannot will would should have has had what who how when why there here about as nobody say says".split(" "));
const MATCH = 0.34;

const tokens = (text) =>
  new Set(text.toLowerCase().replace(/[^a-z0-9$ ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, "")));

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

// Greedy: each finding joins the closest group above the threshold, or starts one.
function groupIssues(seats) {
  const groups = [];
  for (const seat of seats) {
    if (!seat.parsed) continue;
    for (const problem of seat.parsed.problems) {
      const own = tokens(problem.wrong);
      let best = null;
      let bestScore = MATCH;
      for (const g of groups) {
        const score = similarity(own, g.tokens);
        if (score >= bestScore) { best = g; bestScore = score; }
      }
      if (!best) { best = { tokens: new Set(own), voices: [] }; groups.push(best); }
      own.forEach((w) => best.tokens.add(w));
      best.voices.push({ seat, ...problem });
    }
  }
  return groups.map(summarize).sort((a, b) => b.people - a.people || a.topP.localeCompare(b.topP) || b.natures.length - a.natures.length);
}

function summarize(group) {
  const voices = group.voices;
  const topP = voices.map((v) => v.p).sort()[0];
  const lead = voices.filter((v) => v.p === topP).sort((a, b) => a.wrong.length - b.wrong.length)[0];
  const unique = (list) => [...new Set(list)];
  return {
    title: lead.wrong, topP, voices,
    people: unique(voices.map((v) => v.seat.id)).length,
    natures: unique(voices.map((v) => v.seat.nature)),
    personas: unique(voices.map((v) => v.seat.persona)),
    llms: unique(voices.map((v) => v.seat.engine)),
    offers: unique(voices.map((v) => v.offer)),
    types: unique(voices.map((v) => v.type)),
    believerBlocker: voices.some((v) => v.seat.nature === "believer" && v.p === "P1"),
  };
}
