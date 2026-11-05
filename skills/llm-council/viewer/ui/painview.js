// The pain tab: what hurts, why people would cancel, and what would make saying no feel stupid.
const NO_BRAINER_LINES = [
  ["dream", "Dream", "The bigger result they want", "believer"],
  ["likelihood", "Likelihood", "What would make them sure", "neutral"],
  ["time", "Time", "What would get the result sooner", "confused"],
  ["effort", "Effort", "What they would no longer do", "contrarian"],
  ["price", "Price", "What they would pay for all that", "executor"],
];
const peopleIn = (voices) => new Set(voices.map((v) => v.seat.id)).size;
// Most-said reason first, so a long list reads as a ranking.
const rankedClusters = (voices) => cluster(voices).sort((a, b) => peopleIn(b.voices) - peopleIn(a.voices));
const shortest = (voices) => [...voices].sort((a, b) => a.wrong.length - b.wrong.length)[0].wrong;

function lineCard(key, title, voices, data, open, keepWord, nature) {
  const isOpen = open.has(key);
  const clusters = rankedClusters(voices);
  const everyone = new Set(data.seats.map((s) => s.id)).size || 1;
  const people = peopleIn(voices);
  return `<article class="card issue line-card" ${nature ? `style="${hue(nature)}"` : ""}>
    <button class="issue-head" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">
      <span class="tally" ${tip(`${people} of ${count(everyone, "person", "people")}`)}>${people}<span class="reach"><i style="width:${(people / everyone) * 100}%"></i></span></span>
      <span class="issue-main"><span class="issue-title">${esc(title)}</span><span class="quiet line-lead">${esc(shortest(clusters[0].voices))}</span>
        <span class="meta">${breadth({ voices }, data)}</span></span>
      ${chevron(isOpen)}
    </button>
    ${isOpen ? `<div class="voices">${clusters.map((c) => voiceRows(c.voices, data, keepWord)).join("")}</div>` : ""}
  </article>`;
}

function cancelSection(seats, data, open) {
  const voices = seats.flatMap((seat) => seat.parsed.cancels.map((c) => ({ seat, wrong: c.why, fix: c.keep, offer: c.offer })));
  if (!voices.length) return "";
  const groups = [...groupBy(voices, (v) => v.offer)].sort((a, b) => peopleIn(b[1]) - peopleIn(a[1]));
  return `<section class="imp-group"><h2 class="imp-head"><span class="sec-icon">${UI.leave}</span>Why I cancel, by offer <span class="count">${groups.length}</span> ${info("Click an offer to hear each person, and what would keep them.")}</h2>
    ${groups.map(([offer, list]) => lineCard(`cancel:${offer}`, offerName(offer, data), list, data, open, "Keeps me: ")).join("")}</section>`;
}

function noBrainerSection(seats, data, open) {
  const cards = NO_BRAINER_LINES.map(([key, name, hint, nature]) => {
    const voices = seats.filter((s) => s.parsed.noBrainer[key]).map((seat) => ({ seat, wrong: seat.parsed.noBrainer[key], fix: "", offer: seat.parsed.firstPick }));
    return voices.length ? lineCard(`brainer:${key}`, `${name}: ${hint}`, voices, data, open, "", nature) : "";
  }).join("");
  return cards ? `<section class="imp-group"><h2 class="imp-head"><span class="sec-icon">${UI.spark}</span>No-brainer ${info("What would make them feel stupid to say no.")}</h2>${cards}</section>` : "";
}

function painBlock(own, data, nature) {
  const seats = own.filter((s) => s.parsed && !saysNothing(s.parsed.sections["The pain"]));
  if (!seats.length) return "";
  const stats = groupStats(own.filter(isAnswered));
  const tiles = `<div class="tiles hued" style="${hue(nature)}">
    ${tile("Really has the problem", shown(stats.scores.real_problem), "flat", "Median, out of 10")}
    ${tile("How much it hurts", shown(stats.scores.pain), "flat", "Median, out of 10")}
    ${tile("How much this fixes it", shown(stats.scores.solves_it), "flat", "Median, out of 10")}
  </div>`;
  return tiles + `<div class="quotes">${seats.map((s) => `<button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}"><span class="voice-head"><b>${esc(s.name || plain(s.persona))}</b>${engineMark(s, data)}<span class="quiet">${label(s.persona)}</span></span><pre>${esc(s.parsed.sections["The pain"])}</pre></button>`).join("")}</div>`;
}

function painView(seats, data, open) {
  const answered = seats.filter(isAnswered);
  const pain = natureBlocks(seats, data, open, "pain", (own, nature) => painBlock(own, data, nature));
  const rest = cancelSection(answered, data, open) + noBrainerSection(answered, data, open);
  if (!pain && !rest) return empty("Pain, cancel reasons and no-brainers appear as seats finish.");
  return `${pain ? `<section><h2 class="imp-head"><span class="sec-icon">${UI.pain}</span>The pain ${info(`Their own words, and whether the offer touches it. ${VALUE_NOTE}`)}</h2>${pain}</section>` : ""}${rest}`;
}

// Apart from offer findings: what seats looked up says more about the wider web than the offer.
function foundOutside(seats, data, open) {
  const found = seats.filter((s) => s.parsed && !saysNothing(s.parsed.sections["Found outside"]));
  if (!found.length) return "";
  const body = found.map((s) => `<button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}"><span class="voice-head"><b>${esc(s.name || plain(s.persona))}</b>${engineMark(s, data)}</span><pre>${esc(s.parsed.sections["Found outside"])}</pre></button>`).join("");
  return fold("found", `<span class="sec-icon">${UI.globe}</span> Found outside the offer <span class="quiet">${found.length}, never counted as issues</span>`, body, open);
}
