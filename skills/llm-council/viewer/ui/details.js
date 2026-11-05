// The quiet level under the first screen: every answer, score and comparison, as plain lists and tables.
const STANDARD = new Set(["Verdict", "Problems", "Findings", "Retell", "Right now", "Not read", "Sources", "Tools"]);
const QUIET_SECTIONS = new Set(["Right now", "Not read", "Sources", "Tools"]);
const NATURE_ORDER = ["contrarian", "believer", "neutral", "confused", "first-principles", "executor"];
const seatName = (s) => s.name || plain(s.persona);
const whoLine = (s, data) => [plain(s.nature), plain(s.persona), data.engines.length > 1 && llmName(s.engine, data)].filter(Boolean).join(" · ");
const orderNatures = (list, data) => [...list].sort((a, b) => ((data.natures || NATURE_ORDER).indexOf(a) + 1 || 99) - ((data.natures || NATURE_ORDER).indexOf(b) + 1 || 99));

// Plain sentences instead of pipe-separated findings and raw headings.
const pretty = (text) => esc(text)
  .replace(/^## (.*)$/gm, "<b>$1</b>")
  .replace(/^\s*-?\s*(P[123])\|(\w+)\|([^|\n]*)\|([^|\n]*)\|?(.*)$/gm, (_, p, type, offer, wrong, fix) => `<b>${p}</b> ${wrong}${fix ? ` → ${fix}` : ""} <span class="fine-text">${type}, ${offer}</span>`);

function answerSections(seat, open) {
  const entries = seat.parsed ? Object.entries(seat.parsed.sections) : [];
  if (!entries.length) return `<pre>${pretty(seat.text || "No text yet.")}</pre>`;
  const section = ([name, body]) => `<h3>${esc(name)}</h3><pre>${pretty(body)}</pre>`;
  const rest = entries.filter(([n]) => QUIET_SECTIONS.has(n));
  const key = `more:${seat.key}`;
  return entries.filter(([n]) => !QUIET_SECTIONS.has(n)).map(section).join("") +
    (rest.length ? `<button class="link" type="button" data-toggle="${esc(key)}">${open.has(key) ? "Hide" : "Show"} context, skipped parts and sources</button>${open.has(key) ? rest.map(section).join("") : ""}` : "");
}

function seatPanel(s, data, open) {
  const twins = data.seats.filter((t) => t.id === s.id && t.text);
  const p = s.parsed;
  const scoreBits = p ? [...Object.entries(p.scores).map(([k, v]) => `${k} ${v}`), p.firstPick && `pick ${p.firstPick}`, ...Object.entries(p.decisions).map(([k, v]) => `${k} ${v}`), p.introduced && `if introduced ${p.introduced}`, p.decision].filter(Boolean) : [];
  return `<div class="panel-head"><p class="against">${esc(whoLine(s, data))}</p><button class="link" type="button" data-close>Close</button></div>
    <h2 class="panel-title">${esc(s.name || s.id)}</h2>
    ${twins.length > 1 ? `<p class="switch">${twins.map((t) => `<button class="link" type="button" data-open="${esc(t.key)}" aria-pressed="${t.key === s.key}">${esc(llmName(t.engine, data))}</button>`).join(" ")}</p>` : ""}
    ${scoreBits.length ? `<p class="fine-text">${esc(scoreBits.join(" · "))}</p>` : ""}<div class="full">${answerSections(s, open)}</div>`;
}

function liveView(seats, data) {
  const live = (s) => (s.status === "thinking" ? 1 : 0);
  const posts = seats.filter((s) => s.text).sort((a, b) => live(b) - live(a) || b.mtime - a.mtime).slice(0, 60);
  if (!posts.length) return empty("Nothing yet. Answers stream here as seats write them.");
  return `<ul class="rows">${posts.map((s) => {
    const body = s.status === "thinking" ? s.text.trimEnd().split("\n").slice(-3).join("\n") : s.parsed?.sections.Verdict || s.text.slice(0, 300);
    return `<li><button class="plain-btn" type="button" data-open="${esc(s.key)}"><b>${esc(seatName(s))}</b> <span class="fine-text">${esc(whoLine(s, data))}${s.status === "thinking" ? " · writing now" : ""}</span><pre class="clamp">${pretty(body)}</pre></button></li>`;
  }).join("")}</ul>`;
}

function roomView(seats, data) {
  if (!seats.length) return empty("No seats match these filters.");
  const natures = orderNatures([...new Set(seats.map((s) => s.nature))], data);
  const personas = [...new Set(seats.map((s) => s.persona))];
  const cell = (group) => {
    if (!group.length) return "<td></td>";
    const lead = group.find((s) => s.status === "done") || group[0];
    const done = group.filter((s) => s.status === "done").length;
    const writing = group.some((s) => s.status === "thinking");
    return `<td><button class="plain-btn" type="button" data-open="${esc(lead.key)}"><b>${esc(seatName(lead))}</b><span class="fine-text block">${writing ? "writing" : `${done}/${group.length}`}</span></button></td>`;
  };
  const rows = personas.map((p) => `<tr><th scope="row">${esc(plain(p))}</th>${natures.map((n) => cell(seats.filter((s) => s.persona === p && s.nature === n))).join("")}</tr>`).join("");
  return `<div class="scroll"><table><thead><tr><th></th>${natures.map((n) => `<th scope="col">${esc(plain(n))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function ideasView(seats, data, open) {
  const natures = orderNatures([...new Set(seats.map((s) => s.nature))], data);
  const blocks = natures.map((n) => {
    const notes = seats.filter((s) => s.nature === n && s.parsed).flatMap((s) => Object.entries(s.parsed.sections).filter(([name, body]) => !STANDARD.has(name) && !isNothing(body)).map(([name, body]) => ({ s, name, body })));
    if (!notes.length) return "";
    const key = `ideas:${n}`;
    const isOpen = open.has(key);
    return `<button class="plain-btn fold" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">${esc(plain(n))} <span class="quiet">${notes.length}</span></button>
      ${isOpen ? `<ul class="rows">${notes.map(({ s, name, body }) => `<li><button class="plain-btn" type="button" data-open="${esc(s.key)}"><b>${esc(seatName(s))}</b> <span class="fine-text">${esc(name)}</span><pre>${pretty(body)}</pre></button></li>`).join("")}</ul>` : ""}`;
  }).join("");
  return blocks || empty("Ideas and questions appear as seats finish their notes.");
}

function scoresView(seats, data) {
  const rows = seats.filter((s) => s.parsed && Object.keys(s.parsed.scores).length);
  if (!rows.length) return empty("Scores appear as Neutral seats finish. Other natures have a job, not a score.");
  const offers = [...new Set(rows.flatMap((s) => Object.keys(s.parsed.decisions)))];
  const heads = ["Person", ...(data.engines.length > 1 ? ["LLM"] : []), "Overall", "Clarity", "Belief", "Pick", ...offers, "Introduced"];
  const body = rows.map((s) => {
    const p = s.parsed;
    return `<tr><td><button class="plain-btn" type="button" data-open="${esc(s.key)}">${esc(seatName(s))}</button></td>${data.engines.length > 1 ? `<td>${esc(llmName(s.engine, data))}</td>` : ""}
      <td class="num">${esc(p.scores.overall ?? "·")}</td><td class="num">${esc(p.scores.clarity ?? "·")}</td><td class="num">${esc(p.scores.belief ?? "·")}</td><td>${esc(p.firstPick || p.decision || "·")}</td>
      ${offers.map((o) => `<td>${esc(p.decisions[o] || "·")}</td>`).join("")}<td>${esc(p.introduced || "·")}</td></tr>`;
  }).join("");
  return `<p class="fine-text">Only Neutral seats score. act: do it now. talk: small next step. think: must think, ask or compare. no: would not.</p>
    <div class="scroll"><table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// The same person on each LLM, biggest disagreement first.
function llmsView(seats, data, open) {
  const engines = data.engines.filter((e) => hasAnswers(data, e));
  if (engines.length < 2) return empty(`Only one LLM answered in this round${engines[0] ? `: ${llmName(engines[0], data)}` : ""}.`);
  const totals = engines.map((e) => {
    const own = seats.filter((s) => s.engine === e && s.parsed);
    const scores = own.map((s) => s.parsed.scores.overall).filter(Number.isFinite);
    const findings = own.reduce((sum, s) => sum + s.parsed.problems.length, 0);
    return `<tr><td>${esc(llmName(e, data))}</td><td class="num">${own.length}</td><td class="num">${scores.length ? mean(scores).toFixed(1) : "·"}</td><td class="num">${own.length ? (findings / own.length).toFixed(1) : "·"}</td></tr>`;
  }).join("");
  const byId = new Map();
  for (const s of seats.filter((x) => x.parsed)) byId.set(s.id, [...(byId.get(s.id) || []), s]);
  const people = [...byId.values()].filter((g) => g.length > 1).map((g) => {
    const overalls = g.map((s) => s.parsed.scores.overall).filter(Number.isFinite);
    const picks = new Set(g.map((s) => s.parsed.firstPick).filter(Boolean));
    const gap = overalls.length > 1 ? Math.max(...overalls) - Math.min(...overalls) : 0;
    const only = g.map((s) => {
      const others = g.filter((o) => o !== s).flatMap((o) => o.parsed.problems.map((p) => tokens(p.wrong)));
      return { s, only: s.parsed.problems.filter((p) => !others.some((t) => similarity(tokens(p.wrong), t) >= MATCH)) };
    });
    return { g, gap, picks, only, weight: gap * 2 + (picks.size > 1 ? 3 : 0) };
  }).sort((a, b) => b.weight - a.weight);
  const rows = people.map(({ g, gap, picks, only }) => {
    const key = `llm:${g[0].id}`;
    const isOpen = open.has(key);
    const summary = [gap && `${gap} points apart`, picks.size > 1 && `picks differ: ${[...picks].join(", ")}`].filter(Boolean).join(" · ") || "In step";
    const columns = only.map(({ s, only: unique }) => `<div><b>${esc(llmName(s.engine, data))}</b>${Number.isFinite(s.parsed.scores.overall) ? ` <span class="fine-text">${s.parsed.scores.overall}/10, ${esc(s.parsed.firstPick || "no pick")}</span>` : ""}<p>${esc(s.parsed.sections.Verdict || "")}</p>${unique.length ? `<ul class="fine">${unique.map((p) => `<li>Only here: ${esc(p.wrong)}</li>`).join("")}</ul>` : ""}<button class="link" type="button" data-open="${esc(s.key)}">Read answer</button></div>`).join("");
    return `<li><button class="plain-btn" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}"><b>${esc(seatName(g[0]))}</b> <span class="fine-text">${esc(plain(g[0].nature))} · ${esc(plain(g[0].persona))} · ${esc(summary)}</span></button>${isOpen ? `<div class="columns">${columns}</div>` : ""}</li>`;
  }).join("");
  return `<div class="scroll"><table><thead><tr><th scope="col">LLM</th><th scope="col">Answers</th><th scope="col">Avg score</th><th scope="col">Findings each</th></tr></thead><tbody>${totals}</tbody></table></div>
    <h2 class="sub">Same person, biggest disagreement first</h2><ul class="rows">${rows}</ul>`;
}

// Everything seats wrote, grouped by wording, before any ranking.
function findingsView(seats, data, open) {
  const groups = groupIssues(seats);
  if (!groups.length) return empty("No findings yet.");
  const rows = groups.slice(0, 80).map((g) => {
    const key = `find:${g.title}`;
    const isOpen = open.has(key);
    const voices = g.voices.map((v) => `<li><button class="plain-btn" type="button" data-open="${esc(v.seat.key)}"><b>${esc(seatName(v.seat))}</b> <span class="fine-text">${esc(whoLine(v.seat, data))}</span><span class="note">${esc(v.wrong)}${v.fix ? ` → ${esc(v.fix)}` : ""}</span></button></li>`).join("");
    return `<li><button class="plain-btn" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">${esc(g.title)} <span class="fine-text">${esc(g.topP)} · ${count(g.people, "person", "people")}</span></button>${isOpen ? `<ul class="seat-notes">${voices}</ul>` : ""}</li>`;
  }).join("");
  return `<p class="fine-text">Grouped by shared words, most people first${groups.length > 80 ? `. Showing 80 of ${groups.length}` : ""}.</p><ul class="rows">${rows}</ul>`;
}
