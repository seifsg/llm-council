// The first tab: am I improving? Latest round against the one before it, in plain words.
const numberedRounds = (rounds) => rounds.filter((r) => r.round !== null && r.kind !== "pilot");
const latestPair = (rounds) => {
  const list = numberedRounds(rounds);
  return [list.at(-2) || null, list.at(-1) || null];
};
const SHOWN = 6;
const signed = (n) => (n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${Math.abs(n).toFixed(1)}` : "0.0");
const toneOf = (n) => (n >= 0.05 ? "good" : n <= -0.05 ? "bad" : "flat");
const HEADLINES = {
  better: ["▲", "Yes, better", "good"], worse: ["▼", "No, worse", "bad"], same: ["●", "No real change", "flat"], few: ["●", "Too few answers to call", "flat"],
  waiting: ["●", "Nothing to compare yet", "flat"], findings: ["●", "Scores can't be compared", "flat"],
};
const GROUPS = {
  fixed: ["good", "▲ Fixed", "People stopped raising these."],
  fresh: ["bad", "▼ New", "Raised this round, not last round."],
  open: ["flat", "● Still open", "Raised in both rounds."],
  top: ["flat", "Top problems", "The biggest problems in this round."],
};

function headlineSentence(c) {
  const o = c.metrics.overall;
  const lean = c.metrics.lean;
  const topNew = c.problems.fresh.filter((p) => p.tier === "A" || p.topP === "P1").length;
  const topFixed = c.problems.fixed.filter((p) => p.tier === "A" || p.topP === "P1").length;
  const soFar = c.B.seats.some((s) => s.status === "thinking") ? " so far" : "";
  const buts = [
    c.verdict === "better" && topNew > topFixed && `${count(topNew, "new top problem")} arrived, more than were fixed.`,
    c.verdict === "better" && lean.away > lean.toward && "more decisions moved away from buying than toward it.",
    c.verdict === "worse" && lean.toward > lean.away && "more decisions moved toward buying than away, so read the answers.",
  ].filter(Boolean);
  const but = buts.length ? ` But ${buts.join(" ")}` : "";
  if (c.verdict === "findings") return `${c.check.reason}, so a score change would only measure that. Compare the problems below instead.`;
  if (c.verdict === "waiting") return "This round has no answers that pair with the last one yet.";
  if (c.verdict === "few") return `Only ${count(o.n, "matched answer")} so far, which is not enough to say.`;
  const size = `${Math.abs(o.average).toFixed(1)} out of 10, across ${count(o.n, "matched answer")}${soFar}.`;
  if (c.verdict === "same") return `The average score moved ${size} That is within how much answers normally vary.${but}`;
  return `The average score ${o.average > 0 ? "rose" : "fell"} ${size}${but}`;
}

function tile(label, value, tone, hint) {
  return `<div class="tile"><span class="tile-label">${esc(label)}</span><span class="tile-value ${tone}">${esc(value)}</span><span class="tile-hint">${esc(hint)}</span></div>`;
}

function tilesFor(c) {
  const m = c.metrics;
  const { fixed, fresh, open } = c.problems;
  const scores = c.verdict === "findings" || !m.overall ? "" : [
    tile("Overall score", signed(m.overall.average), toneOf(m.overall.average), "How close to an easy yes"),
    m.clarity ? tile("Clarity", signed(m.clarity.average), toneOf(m.clarity.average), "How clear the offer is") : "",
    m.belief ? tile("Belief", signed(m.belief.average), toneOf(m.belief.average), "Do they think it would work") : "",
    tile("Closer to buying", `${m.lean.toward} up, ${m.lean.away} down`, toneOf(m.lean.toward - m.lean.away), "Decisions moved toward act or talk"),
  ].join("");
  const problems = [tile("Fixed", fixed.length, fixed.length ? "good" : "flat", "Problems gone"), tile("New", fresh.length, fresh.length ? "bad" : "flat", "Problems added"), tile("Still open", open.length, "flat", "Problems left")].join("");
  return `${scores ? `<div class="tiles">${scores}</div>` : ""}<div class="tiles">${problems}</div>`;
}

function notesFor(c, nameA, nameB) {
  const lines = [];
  const named = (only) => c.leftOut.filter((l) => l.only === only).map((l) => l.name).join(", ");
  if (named("A")) lines.push(`${named("A")} left out: not in ${nameB}.`);
  if (named("B")) lines.push(`${named("B")} left out: not in ${nameA}.`);
  if (c.blocked.length && !c.check.reason) lines.push(`${count(c.blocked.length, "answer")} left out: that person's facts or interview changed.`);
  if (c.offersOneSided.length) lines.push(`Not compared, in one round only: ${c.offersOneSided.map((o) => o.name).join(", ")}.`);
  if (c.metrics.overall && c.metrics.overall.n < SMALL_SAMPLE && !["few", "findings"].includes(c.verdict)) lines.push(`Small sample: ${count(c.metrics.overall.n, "matched answer")}. Treat this as a hint.`);
  if (!c.ranked) lines.push("Not ranked yet: problems are grouped by wording, so this is rough.");
  return lines.length ? `<ul class="imp-notes">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
}

function matchedLine(seat, title) {
  const wanted = tokens(title);
  const ranked = seat.parsed.problems.map((p) => ({ p, score: similarity(tokens(p.wrong), wanted) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.08 ? ranked[0].p : null;
}

// A ranking names people, not LLMs. An LLM added later may not have raised this, so keep answers that did.
function voicesFor(item, R) {
  if (item.voices) return item.voices;
  const ids = new Set(item.seats || []);
  const named = R.seats.filter((s) => ids.has(s.id) && s.parsed);
  const matched = named.map((seat) => ({ seat, line: matchedLine(seat, item.title) })).filter((v) => v.line);
  if (matched.length) return matched.map(({ seat, line }) => ({ seat, ...line }));
  return named.map((seat) => ({ seat, p: item.tier === "A" ? "P1" : "P2", type: item.type || "fix", offer: item.offer || "all", wrong: seat.parsed.sections.Verdict || "", fix: "" }));
}

function problemCard(item, status, R, data, open) {
  const key = `imp:${status}:${item.title}`;
  const isOpen = open.has(key);
  const voices = voicesFor(item, R);
  const people = new Set(voices.map((v) => v.seat.id)).size;
  const issue = { voices };
  const blocker = voices.some((v) => v.seat.nature === "believer" && v.p === "P1");
  const everyone = new Set(R.seats.map((s) => s.id)).size || 1;
  const level = item.tier ? `Tier ${item.tier}` : item.topP;
  const confirmed = item.real === "confirmed" ? `<span class="pill real">Confirmed by a real buyer</span>` : item.real === "contradicted" ? `<span class="pill">Contradicted by a real buyer</span>` : "";
  const meta = [item.type, item.offer || item.target].filter(Boolean).join(" · ");
  return `<article class="card issue ${item.tier === "A" || item.topP === "P1" ? "is-p1" : ""}">
    <button class="issue-head" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">
      <span class="tally" ${tip(`${people} of ${count(everyone, "person", "people")} raised this`)}>${people}<span class="reach"><i style="width:${(people / everyone) * 100}%"></i></span></span>
      <span class="issue-main"><span class="issue-title">${esc(item.title)}</span>
        <span class="meta">${level ? `<span class="pill ${item.tier === "A" || item.topP === "P1" ? "p1" : ""}">${esc(level)}</span>` : ""}${confirmed}
          ${blocker ? `<span class="nat flag" ${tip("Even a Believer balked: the seat trying to say yes stopped here")}>${UI.flag}</span>` : ""}${breadth(issue, data)}<span class="quiet">${esc(meta)}</span></span></span>
      ${chevron(isOpen)}
    </button>
    ${isOpen ? `<div class="voices">${item.do ? `<p class="imp-do"><b>Do this:</b> ${esc(item.do)}</p>` : ""}${item.money ? `<p class="imp-do"><b>Why it pays:</b> ${esc(item.money)}</p>` : ""}${voiceRows(voices, data)}</div>` : ""}
  </article>`;
}

function problemGroup(status, list, R, data, open) {
  if (!list.length) return "";
  const [tone, title, hint] = GROUPS[status];
  const key = `imp-more:${status}`;
  const shown = open.has(key) ? list : list.slice(0, SHOWN);
  const more = list.length - shown.length;
  return `<section class="imp-group"><h2 class="imp-head"><span class="${tone}">${esc(title)}</span> <span class="count">${list.length}</span> <span class="quiet">${esc(hint)}</span></h2>
    ${shown.map((item) => problemCard(item, status, R, data, open)).join("")}
    ${more ? `<button class="ghost" type="button" data-toggle="${esc(key)}">Show ${more} more</button>` : ""}</section>`;
}

function improvingView(state) {
  const [ra, rb] = latestPair(state.rounds);
  const B = rb && state.cache[rb.id];
  if (!B) return empty("Loading rounds…");
  const live = (R, name) => {
    const writing = R.seats.filter((s) => s.status === "thinking").length;
    return writing ? `<p class="imp-live"><span class="pulse"></span>${esc(name)} is still running: ${writing} writing now. Numbers can still move.</p>` : "";
  };
  const foot = `<p class="imp-foot">Simulated people find problems. They do not prove anyone would pay. Fixed means they stopped raising it, matched by wording, so check before trusting.</p>`;
  if (!ra) {
    const { list, ranked } = problemsOf(B);
    return `${live(B, roundName(rb))}<section class="hero flat"><p class="eyebrow">Am I improving?</p><h1>One round so far</h1><p class="hero-text">${esc(roundName(rb))} has nothing to compare with yet. Run another round to see the change. Here are its top problems.</p></section>
      ${ranked ? "" : `<ul class="imp-notes"><li>Not ranked yet: problems are grouped by wording, so this is rough.</li></ul>`}${problemGroup("top", rankProblems(list), B, B, state.open) || empty("No problems recorded yet.")}${foot}`;
  }
  const A = state.cache[ra.id];
  if (!A) return empty("Loading rounds…");
  const c = compareRounds(A, B);
  const [nameA, nameB] = [roundName(ra), roundName(rb)];
  const [sign, word, tone] = HEADLINES[c.verdict];
  return `${live(B, nameB)}${live(A, nameA)}<section class="hero ${tone}"><p class="eyebrow">Am I improving? ${esc(nameB)} against ${esc(nameA)}</p><h1><span aria-hidden="true">${sign}</span> ${esc(word)}</h1><p class="hero-text">${esc(headlineSentence(c))}</p></section>
    ${tilesFor(c)}${notesFor(c, nameA, nameB)}
    ${problemGroup("fixed", c.problems.fixed, A, A, state.open)}${problemGroup("fresh", c.problems.fresh, B, B, state.open)}${problemGroup("open", c.problems.open, B, B, state.open)}${foot}`;
}
