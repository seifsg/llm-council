// The first screen: is this improving? A verdict, a few numbers and one list of problems. Nothing else competes.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plain = (slug) => String(slug).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const empty = (msg) => `<p class="empty">${esc(msg)}</p>`;
const roundName = (r) => (r.round !== null ? `Round ${r.round}` : r.kind === "pilot" ? "Pilot" : r.title);
const signed = (n) => (n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${Math.abs(n).toFixed(1)}` : "0.0");
const tone = (n) => (n >= 0.05 ? "up" : n <= -0.05 ? "down" : "");
const LIST_START = 6;

const VERDICTS = {
  better: ["Better", "up"], worse: ["Worse", "down"], same: ["No real change", ""], few: ["Too few to call", ""],
  waiting: ["Nothing to compare yet", ""], findings: ["Findings only", ""],
};

function verdictSentence(c, nameA, nameB) {
  const o = c.metrics.overall;
  const { fixed, fresh } = c.problems;
  const topNew = fresh.filter((p) => p.tier === "A" || p.topP === "P1").length;
  const topFixed = fixed.filter((p) => p.tier === "A" || p.topP === "P1").length;
  const lean = c.metrics.lean;
  const notes = [
    c.verdict === "better" && topNew > topFixed && `${count(topNew, "new top problem")} arrived, more than were fixed.`,
    c.verdict === "better" && lean.away > lean.toward && "More decisions moved away from act or talk than toward them.",
    c.verdict === "worse" && lean.toward > lean.away && "More decisions moved toward act or talk than away, so read the answers.",
  ].filter(Boolean);
  const tension = notes.length ? ` But ${notes.join(" ").replace(/^./, (ch) => ch.toLowerCase())}` : "";
  const soFar = c.B.seats.some((s) => s.status === "thinking") ? " so far" : "";
  if (c.verdict === "findings") return `${c.check.reason}, so scores would only measure that. Compare the problems below instead.`;
  if (c.verdict === "waiting") return `${nameB} has no answers that pair with ${nameA} yet.`;
  if (c.verdict === "few") return `Only ${count(o.n, "paired answer")}, which is not enough to say.`;
  const size = `${Math.abs(o.average).toFixed(1)} points across ${count(o.n, "paired answer")}${soFar}.`;
  if (c.verdict === "same") return `Average score moved ${size} That is within what the answers vary by.${tension}`;
  return `Average score ${o.average > 0 ? "rose" : "fell"} ${size}${tension}`;
}

function stat(label, value, cls = "", wide = false) {
  return `<div class="stat${wide ? " wide" : ""}"><dt>${esc(label)}</dt><dd class="${cls}">${esc(value)}</dd></div>`;
}

function statsRow(c) {
  const m = c.metrics;
  const { fixed, fresh, open } = c.problems;
  const scoreStats = c.verdict === "findings" || !m.overall ? "" : [
    stat("Overall", signed(m.overall.average), tone(m.overall.average)),
    m.clarity ? stat("Clarity", signed(m.clarity.average), tone(m.clarity.average)) : "",
    m.belief ? stat("Belief", signed(m.belief.average), tone(m.belief.average)) : "",
    stat("Toward act or talk", `${m.lean.toward} up, ${m.lean.away} down`, tone(m.lean.toward - m.lean.away), true),
  ].join("");
  return `<div class="numbers">${scoreStats ? `<dl class="stats">${scoreStats}</dl>` : ""}<dl class="stats">${stat("Fixed", fixed.length, fixed.length ? "up" : "")}${stat("New", fresh.length, fresh.length ? "down" : "")}${stat("Still open", open.length)}</dl></div>`;
}

function fineLines(c, nameA, nameB) {
  const lines = [];
  const named = (only) => c.leftOut.filter((l) => l.only === only).map((l) => l.name).join(", ");
  if (named("A")) lines.push(`${named("A")} left out: not in ${nameB}.`);
  if (named("B")) lines.push(`${named("B")} left out: not in ${nameA}.`);
  if (c.blocked.length && !c.check.reason) lines.push(`${count(c.blocked.length, "answer")} left out: that persona changed.`);
  if (c.offersOneSided.length) lines.push(`Not compared, in one round only: ${c.offersOneSided.map((o) => o.name).join(", ")}.`);
  if (c.metrics.overall && c.metrics.overall.n < SMALL_SAMPLE && c.verdict !== "few" && c.verdict !== "findings") lines.push(`Small sample: ${count(c.metrics.overall.n, "paired answer")}. Treat this as a hint.`);
  if (!c.ranked) lines.push("Not ranked yet: problems are grouped by wording, so this is rough.");
  return lines.length ? `<ul class="fine">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
}

function problemRow(item, status, index) {
  const meta = [item.tier && `Tier ${item.tier}`, item.topP, item.seats?.length && count(item.seats.length, "person", "people"), item.offer && item.offer !== "all" && item.offer, item.real === "confirmed" && "Confirmed by a real buyer", item.real === "contradicted" && "Contradicted by a real buyer"].filter(Boolean).join(" · ");
  return `<li><button class="problem" type="button" data-problem="${status}:${index}"><span class="problem-title">${esc(item.title)}</span><span class="fine-text">${esc(meta)}</span></button></li>`;
}

function problemGroup(label, cls, list, status, state, q) {
  const shown = list.map((item, i) => [item, i]).filter(([item]) => !q || item.title.toLowerCase().includes(q));
  if (!shown.length) return "";
  const key = `more:${status}`;
  const visible = state.open.has(key) || q ? shown : shown.slice(0, LIST_START);
  const rest = shown.length - visible.length;
  return `<section class="group"><h2><span class="${cls}">${esc(label)}</span> <span class="quiet">${shown.length}</span></h2>
    <ol class="problems">${visible.map(([item, i]) => problemRow(item, status, i)).join("")}</ol>
    ${rest ? `<button class="link" type="button" data-toggle="${key}">Show ${rest} more</button>` : ""}</section>`;
}

function liveLine(R, name) {
  const writing = R.seats.filter((s) => s.status === "thinking").length;
  if (!writing) return "";
  const done = R.seats.filter((s) => s.status === "done").length;
  return `<p class="live-line">${esc(name)} is running: ${done} answered, ${writing} writing now. <button class="link" type="button" data-details="live">Watch live</button></p>`;
}

const FOOT = "Simulated people find problems. They do not prove demand. Fixed means seats stopped raising it, matched by wording, so check before trusting.";

function singleRound(R, name, state, q) {
  const { list, ranked } = problemsOf(R);
  state.problemList = { open: rankProblems(list) };
  const body = problemGroup("Top problems", "", state.problemList.open, "open", state, q) || empty("No problems recorded yet.");
  return `${liveLine(R, name)}<div class="verdict"><h1>One round so far</h1><p class="sentence">${esc(name)} has nothing to compare with yet. These are its top problems.</p></div>
    ${ranked ? "" : `<ul class="fine"><li>Not ranked yet: problems are grouped by wording, so this is rough.</li></ul>`}${body}<p class="foot">${esc(FOOT)}</p>`;
}

function focusView(state) {
  const { rounds, cmpA, cmpB, cache, q } = state;
  const [A, B] = [cache[cmpA], cache[cmpB]];
  const [ra, rb] = [rounds.find((r) => r.id === cmpA), rounds.find((r) => r.id === cmpB)];
  if (!rb || !B) return empty("Loading…");
  const search = (q || "").toLowerCase();
  if (!ra) return singleRound(B, roundName(rb), state, search);
  if (!A) return empty("Loading…");
  if (cmpA === cmpB) return empty("Pick two different rounds in Details, under Rounds.");
  const [nameA, nameB] = [roundName(ra), roundName(rb)];
  const c = compareRounds(A, B);
  state.problemList = { fixed: c.problems.fixed, fresh: c.problems.fresh, open: c.problems.open };
  state.compared = c;
  const [word, cls] = VERDICTS[c.verdict];
  const groups = problemGroup("Fixed", "up", c.problems.fixed, "fixed", state, search) + problemGroup("New", "down", c.problems.fresh, "fresh", state, search) + problemGroup("Still open", "", c.problems.open, "open", state, search);
  return `${liveLine(B, nameB)}${liveLine(A, nameA)}<div class="verdict"><p class="against">${esc(nameB)} against ${esc(nameA)}</p>
      <h1 class="${cls}">${esc(word)}</h1><p class="sentence">${esc(verdictSentence(c, nameA, nameB))}</p></div>
    ${statsRow(c)}${fineLines(c, nameA, nameB)}${groups || empty(search ? "No problem matches that search." : "No problems recorded in either round.")}
    <p class="foot">${esc(FOOT)}</p>`;
}

// The seat's own line closest to this problem, else its verdict.
function closestLine(seat, title) {
  const best = bestMatch(seat, title);
  if (best) return `${best.wrong}${best.fix ? ` → ${best.fix}` : ""}`;
  return seat.parsed.sections.Verdict || "";
}

function bestMatch(seat, title) {
  const wanted = tokens(title);
  const ranked = seat.parsed.problems.map((p) => ({ p, score: similarity(tokens(p.wrong), wanted) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.08 ? ranked[0].p : null;
}

function seatRow(seat, title, state, data) {
  const key = `read:${seat.key}`;
  const isOpen = state.open.has(key);
  const engines = data.engines.filter((e) => hasAnswers(data, e));
  const who = [plain(seat.nature), plain(seat.persona), engines.length > 1 && llmName(seat.engine, data)].filter(Boolean).join(" · ");
  return `<li class="seat-note"><button class="plain-btn" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}"><b>${esc(seat.name || seat.id)}</b> <span class="fine-text">${esc(who)}</span><span class="note">${esc(closestLine(seat, title))}</span></button>
    ${isOpen ? `<div class="full">${answerSections(seat, state.open)}</div>` : ""}</li>`;
}

function problemPanel(state, status, index) {
  const item = state.problemList?.[status]?.[index];
  if (!item) return "";
  const word = { fixed: "Fixed", fresh: "New", open: state.compared && state.cmpA ? "Still open" : "Problem" }[status];
  const cls = { fixed: "up", fresh: "down" }[status] || "";
  const round = state.cache[status === "fixed" ? state.cmpA : state.cmpB];
  const ids = new Set(item.seats || []);
  const named = round.seats.filter((s) => ids.has(s.id) && s.parsed);
  // A ranking names people, not LLMs. An LLM added later may not have raised this, so keep answers that did.
  const matching = named.filter((s) => bestMatch(s, item.title));
  const seats = matching.length ? matching : named;
  const was = item.was && item.was.title !== item.title ? `<p class="fine-text">Earlier wording: ${esc(item.was.title)}</p>` : "";
  return `<div class="panel-head"><p class="against ${cls}">${esc(word)}</p><button class="link" type="button" data-close>Close</button></div>
    <h2 class="panel-title">${esc(item.title)}</h2>${was}
    ${item.do ? `<p><b>Do this:</b> ${esc(item.do)}</p>` : ""}${item.money ? `<p><b>Why it pays:</b> ${esc(item.money)}</p>` : ""}
    <h3>${count(new Set(seats.map((s) => s.id)).size, "person", "people")} raised this</h3>
    <ul class="seat-notes">${seats.map((s) => seatRow(s, item.title, state, round)).join("") || `<li class="fine-text">No answers saved for these seats.</li>`}</ul>`;
}
