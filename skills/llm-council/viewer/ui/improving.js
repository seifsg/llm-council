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
  fixed: ["good", "▲ Fixed", "The ranking says these are gone."],
  reduced: ["good", "▲ Reduced", "Still raised, but less, or answered in part."],
  worse: ["bad", "▼ Worse", "These grew since last round."],
  fresh: ["bad", "▼ New", "First raised this round."],
  open: ["flat", "● Still open", "No real change since last round."],
  top: ["flat", "Top problems", "The biggest problems in this round, most people first."],
};

function headlineSentence(c) {
  const o = c.metrics.overall;
  const lean = c.metrics.lean;
  const isTop = (p) => p.tier === "A" || p.topP === "P1";
  const topNew = c.link.linked ? c.link.fresh.filter(isTop).length : 0;
  const topFixed = c.link.linked ? c.link.fixed.filter(isTop).length : 0;
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
  const scores = c.verdict === "findings" || !m.overall ? "" : [
    tile("Overall score", signed(m.overall.average), toneOf(m.overall.average), "How close to an easy yes"),
    m.clarity ? tile("Clarity", signed(m.clarity.average), toneOf(m.clarity.average), "How clear the offer is") : "",
    m.belief ? tile("Belief", signed(m.belief.average), toneOf(m.belief.average), "Do they think it would work") : "",
    tile("Closer to buying", `${m.lean.toward} up, ${m.lean.away} down`, toneOf(m.lean.toward - m.lean.away), "Decisions moved toward act or talk"),
  ].join("");
  if (!c.link.linked) return scores ? `<div class="tiles">${scores}</div>` : "";
  const { fixed, reduced, worse, fresh, open } = c.link;
  const unchecked = open.filter((i) => i.judged === false).length;
  const problems = [
    tile("Fixed", fixed.length, fixed.length ? "good" : "flat", "Problems gone"),
    tile("Reduced", reduced.length, reduced.length ? "good" : "flat", "Smaller or partly answered"),
    worse.length ? tile("Worse", worse.length, "bad", "Problems that grew") : "",
    tile("New", fresh.length, fresh.length ? "bad" : "flat", "First raised this round"),
    tile("Still open", open.length, "flat", unchecked ? `${unchecked} not re-checked` : "No real change"),
  ].join("");
  return `${scores ? `<div class="tiles">${scores}</div>` : ""}<div class="tiles">${problems}</div>`;
}

const MOVE_TONES = { better: "good", worse: "bad", same: "flat", few: "flat" };
const MOVE_SIGNS = { better: "▲", worse: "▼", same: "●", few: "●" };

function moveTile(m) {
  if (m.call === "few") return tile(m.name, "Too few", "flat", `Only ${count(m.n, "matched answer")}`);
  const way = m.up > 0 ? "higher is better" : "lower is better";
  const unit = (n) => (m.unit === "$" ? `$${shown(n)}` : `${shown(n)}${m.unit || ""}`);
  return tile(m.name, `${MOVE_SIGNS[m.call]} ${signed(m.move)}`, MOVE_TONES[m.call], `${unit(m.before)} to ${unit(m.after)}, ${way}${m.call === "same" ? ", within normal variation" : ""}`);
}

function buyerTiles(c) {
  const { moves } = c.buyers;
  if (!moves.length) return "";
  return `<h2 class="section-title">Churn and price, medians of the same matched answers ${info(`Neutral seats only, same person on the same LLM. ${VALUE_NOTE}`)}</h2><div class="tiles">${moves.map(moveTile).join("")}</div>`;
}

function buyerNote(c, roundNames) {
  const { lacking, reason, unmatched } = c.buyers;
  const lead = "Churn, price and value not compared";
  if (lacking?.length) return `${lead}: ${lacking.map(roundNames).join(" and ")} ${lacking.length > 1 ? "have" : "has"} none of them, because those seats were not asked.`;
  if (reason) return `${lead}: ${reason.toLowerCase()}, so a change would only measure that.`;
  return unmatched ? `${lead}: no matched answers carry them.` : "";
}

function topLine(c, nameA) {
  const t = c.link.top;
  if (!c.link.linked || !t.size) return "";
  return `<p class="imp-top"><b>Of ${esc(nameA)}'s top ${t.size}:</b> ${t.fixed} fixed, ${t.reduced} reduced, ${t.open} still open, ${t.worse} worse.</p>`;
}

function notesFor(c, nameA, nameB) {
  const lines = [];
  const named = (only) => c.leftOut.filter((l) => l.only === only).map((l) => l.name).join(", ");
  if (named("A")) lines.push(`${named("A")} left out: not in ${nameB}.`);
  if (named("B")) lines.push(`${named("B")} left out: not in ${nameA}.`);
  if (c.blocked.length && !c.check.reason) lines.push(`${count(c.blocked.length, "answer")} left out: that person's facts or interview changed.`);
  if (c.offersOneSided.length) lines.push(`Not compared, in one round only: ${c.offersOneSided.map((o) => o.name).join(", ")}.`);
  if (c.metrics.overall && c.metrics.overall.n < SMALL_SAMPLE && !["few", "findings"].includes(c.verdict)) lines.push(`Small sample: ${count(c.metrics.overall.n, "matched answer")}. Treat this as a hint.`);
  if (!c.link.linked) lines.push("Problems are not linked between these rounds, so fixed and new are not shown.");
  const buyer = buyerNote(c, (R) => (R === c.A ? nameA : nameB));
  if (buyer) lines.push(buyer);
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

function problemCard(item, status, R, open) {
  const key = `imp:${status}:${item.key || item.title}`;
  const isOpen = open.has(key);
  const voices = voicesFor(item, R);
  const people = new Set(voices.map((v) => v.seat.id)).size;
  const blocker = voices.some((v) => v.seat.nature === "believer" && v.p === "P1");
  const everyone = new Set(R.seats.map((s) => s.id)).size || 1;
  const level = item.tier ? `Tier ${item.tier}` : item.topP;
  const top = item.tier === "A" || item.topP === "P1";
  const pills = [
    item.real === "confirmed" && `<span class="pill real">Confirmed by a real buyer</span>`,
    item.real === "contradicted" && `<span class="pill">Contradicted by a real buyer</span>`,
    item.judged === false && `<span class="pill" ${tip("Raised last round and not judged this round, so it counts as open, not fixed.")}>Not re-checked</span>`,
  ].filter(Boolean).join("");
  const meta = [item.type, item.offer || item.target].filter(Boolean).join(" · ");
  return `<article class="card issue ${top ? "is-p1" : ""}">
    <button class="issue-head" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">
      <span class="tally" ${tip(`${people} of ${count(everyone, "person", "people")} raised this`)}>${people}<span class="reach"><i style="width:${(people / everyone) * 100}%"></i></span></span>
      <span class="issue-main"><span class="issue-title">${esc(item.title)}</span>
        <span class="meta">${level ? `<span class="pill ${top ? "p1" : ""}">${esc(level)}</span>` : ""}${pills}
          ${blocker ? `<span class="nat flag" ${tip("Even a Believer balked: the seat trying to say yes stopped here")}>${UI.flag}</span>` : ""}${breadth({ voices }, R)}<span class="quiet">${esc(meta)}</span></span></span>
      ${chevron(isOpen)}
    </button>
    ${isOpen ? `<div class="voices">${item.do ? `<p class="imp-do"><b>Do this:</b> ${esc(item.do)}</p>` : ""}${item.money ? `<p class="imp-do"><b>Why it pays:</b> ${esc(item.money)}</p>` : ""}${voiceRows(voices, R)}</div>` : ""}
  </article>`;
}

// Fixed and carried problems were last raised in the earlier round, so their people are read from there.
function problemGroup(status, list, sourceOf, open) {
  if (!list.length) return "";
  const [tone, title, hint] = GROUPS[status];
  const key = `imp-more:${status}`;
  const shown = open.has(key) ? list : list.slice(0, SHOWN);
  const more = list.length - shown.length;
  return `<section class="imp-group"><h2 class="imp-head"><span class="${tone}">${esc(title)}</span> <span class="count">${list.length}</span> <span class="quiet">${esc(hint)}</span></h2>
    ${shown.map((item) => problemCard(item, status, sourceOf(item), open)).join("")}
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
  if (!ra) {
    const { list, ranked } = problemsOf(B);
    return `${live(B, roundName(rb))}<section class="hero flat"><p class="eyebrow">Am I improving?</p><h1>One round so far</h1><p class="hero-text">${esc(roundName(rb))} has nothing to compare with yet. Run another round to see the change. Here are its top problems.</p></section>
      ${ranked ? "" : `<ul class="imp-notes"><li>Not ranked yet: problems are grouped by wording, so this is rough.</li></ul>`}${problemGroup("top", rankProblems(list), () => B, state.open) || empty("No problems recorded yet.")}`;
  }
  const A = state.cache[ra.id];
  if (!A) return empty("Loading rounds…");
  const c = compareRounds(A, B);
  const [nameA, nameB] = [roundName(ra), roundName(rb)];
  const [sign, word, tone] = HEADLINES[c.verdict];
  const fromB = () => B;
  const fromA = () => A;
  const openSource = (item) => (item.judged === false ? A : B);
  const groups = c.link.linked
    ? problemGroup("fixed", c.link.fixed, fromA, state.open) + problemGroup("reduced", c.link.reduced, fromB, state.open) + problemGroup("worse", c.link.worse, fromB, state.open) + problemGroup("fresh", c.link.fresh, fromB, state.open) + problemGroup("open", c.link.open, openSource, state.open)
    : problemGroup("top", rankProblems(problemsOf(B, c.inBoth).list), fromB, state.open);
  const foot = c.link.linked ? `<p class="imp-foot">Fixed, reduced and worse are the ranker's judgment, linked by key across rounds, not proof.</p>` : "";
  return `${live(B, nameB)}${live(A, nameA)}<section class="hero ${tone}"><p class="eyebrow">Am I improving? ${esc(nameB)} against ${esc(nameA)}</p><h1><span aria-hidden="true">${sign}</span> ${esc(word)}</h1><p class="hero-text">${esc(headlineSentence(c))}</p></section>
    ${tilesFor(c)}${buyerTiles(c)}${topLine(c, nameA)}${notesFor(c, nameA, nameB)}${groups}${foot}`;
}
