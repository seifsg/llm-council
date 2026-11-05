// Each view takes the filtered seats and returns HTML. All seat text is escaped: it is model output.
// Quiet by default: indicators and tooltips first, every detail one hover or click away.
const ICONS = { contrarian: "🗡️", believer: "🌟", neutral: "⚖️", confused: "❓", "first-principles": "🔬", executor: "🛠️" };
const KNOWN = Object.keys(ICONS);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plain = (slug) => String(slug).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const label = (slug) => esc(plain(slug));
const hue = (nature) => `--c:var(--${KNOWN.includes(nature) ? nature : "other"})`;
const icon = (nature) => ICONS[nature] || "🔹";
const tip = (text) => `data-tip="${esc(text)}" aria-label="${esc(text)}"`;
const info = (text) => `<span class="info" tabindex="0" ${tip(text)}>ⓘ</span>`;
const empty = (msg) => `<p class="empty">${esc(msg)}</p>`;
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const natureIcon = (n, tipText = plain(n), off = false) => `<span class="nat${off ? " off" : ""}" style="${hue(n)}" ${tip(tipText)}>${icon(n)}</span>`;
const allNatures = (data) => orderNatures([...new Set(data.seats.map((s) => s.nature))], data);
const who = (s) => `${s.name ? `${esc(s.name)} · ` : ""}${label(s.persona)}`;
const whoPlain = (s) => `${s.name ? `${s.name}, ` : ""}${plain(s.persona)}`;
const engineMark = (s, data, text) => (data.engines.length > 1 ? llmMark(s.engine, data, text) : "");

function orderNatures(list, data) {
  const order = data.natures || KNOWN;
  return list.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}

// Every nature keeps its place, so the pattern of who raised an issue scans at a glance.
function breadth(issue, data) {
  const peopleOf = (n) => new Set(issue.voices.filter((v) => v.seat.nature === n).map((v) => v.seat.id)).size;
  const natures = allNatures(data).map((n) => {
    const c = peopleOf(n);
    return natureIcon(n, `${plain(n)}: ${c ? count(c, "person", "people") : "did not raise this"}`, !c);
  }).join("");
  const llms = data.engines.length < 2 ? "" : `<span class="marks">${data.engines.map((e) => {
    const c = issue.voices.filter((v) => v.seat.engine === e).length;
    return llmMark(e, data, `${llmInfo(e, data).name}: ${c ? count(c, "mention") : "did not raise this"}`, c ? "" : "off");
  }).join("")}</span>`;
  return `<span class="natures">${natures}</span>${llms}`;
}

function voiceRow(v, data) {
  const s = v.seat;
  return `<button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}">
    <span class="voice-head">${natureIcon(s.nature)}<b>${esc(s.name || plain(s.persona))}</b>${engineMark(s, data)}<span class="quiet" ${tip(`${plain(s.nature)}, ${plain(s.persona)}, ${v.p}, ${v.type}, ${v.offer}`)}>${esc(v.p)}</span></span>
    ${esc(v.wrong)}${v.fix ? `<em>→ ${esc(v.fix)}</em>` : ""}</button>`;
}

function issueCard(issue, data, open) {
  const key = `issue:${issue.title}`;
  const isOpen = open.has(key);
  const meta = [...issue.types, ...issue.offers].join(" · ");
  return `<article class="card issue ${issue.topP === "P1" ? "is-p1" : ""}">
    <button class="issue-head" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">
      <span class="tally" ${tip(count(issue.people, "person", "people"))}>${issue.people}</span>
      <span class="issue-main">
        <span class="issue-title">${esc(issue.title)}</span>
        <span class="meta"><span class="pill ${issue.topP === "P1" ? "p1" : ""}" ${tip({ P1: "P1: stops someone", P2: "P2: slows someone", P3: "P3: nice to have" }[issue.topP])}>${esc(issue.topP)}</span>
          ${issue.believerBlocker ? `<span class="nat flag" ${tip("Even a Believer balked: the seat trying to say yes stopped here")}>🚩</span>` : ""}
          ${breadth(issue, data)}<span class="quiet">${esc(meta)}</span></span>
      </span>
      <span class="chev" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
    </button>
    ${isOpen ? `<div class="voices">${issue.voices.map((v) => voiceRow(v, data)).join("")}</div>` : ""}
  </article>`;
}

function fold(key, title, body, open) {
  const isOpen = open.has(key);
  return `<button class="fold" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}"><span class="chev" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>${title}</button>${isOpen ? body : ""}`;
}

function heldUp(seats, data, open) {
  const quotes = seats.filter((s) => s.nature === "contrarian" && s.parsed && !isNothing(s.parsed.sections["Against type"]));
  if (!quotes.length) return "";
  const body = quotes.map((s) => `<button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}"><span class="voice-head"><b>${esc(s.name || plain(s.persona))}</b>${engineMark(s, data)}</span>${esc(s.parsed.sections["Against type"])}</button>`).join("");
  return fold("held", `🗡️ What held up, even for a Contrarian <span class="quiet">${quotes.length}</span>`, body, open);
}

function ranked(list, seats, data) {
  if (!Array.isArray(list) || !list.length) return "";
  const byId = new Map(seats.map((s) => [s.id, s]));
  return `<h2 class="section-title">Ranked issues from the final report</h2>` + list.map((item) => {
    const present = [...new Set((item.seats || []).map((id) => byId.get(id)?.nature).filter(Boolean))];
    return `<article class="card"><span class="issue-title">${esc(item.title)}</span>
      <span class="meta">${[item.tier && `Tier ${item.tier}`, item.real, item.type, item.offer || item.target].filter(Boolean).map((t) => `<span class="pill">${esc(t)}</span>`).join("")}${present.map((n) => natureIcon(n)).join("")}</span>
      ${item.do ? `<p><b>Do this:</b> ${esc(item.do)}</p>` : ""}${item.money ? `<p><b>Payoff:</b> ${esc(item.money)}</p>` : ""}</article>`;
  }).join("");
}

function issuesView(seats, data, open) {
  const groups = groupIssues(seats);
  const stops = groups.filter((g) => g.topP === "P1").length;
  const auto = groups.length
    ? `<p class="summary"><b>${count(groups.length, "issue")}</b>, ${stops} stopping someone, most people first ${info("Grouped live by shared words, so similar wording can stay split. The final ranking merges them. Click an issue to hear each person.")}</p>` + groups.map((g) => issueCard(g, data, open)).join("")
    : empty("No findings yet. They appear here as seats write them.");
  return ranked(data.issues, seats, data) + auto + heldUp(seats, data, open);
}

const statusLine = (s) => {
  if (s.status === "done" && s.parsed) {
    const p = s.parsed;
    if (p.scores.overall !== undefined) return `${p.scores.overall}/10, ${p.firstPick || p.decision || "no pick"}`;
    return count(p.problems.length, "finding");
  }
  return { queued: "Waiting", thinking: "Writing now", failed: "Failed", done: "Done" }[s.status];
};

function seatCell(group, data) {
  const lead = group.find((s) => s.status === "done") || group.find((s) => s.text) || group[0];
  const scores = group.map((s) => s.parsed?.scores.overall).filter((n) => Number.isFinite(n));
  const writing = group.some((s) => s.status === "thinking");
  const line = scores.length ? `${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(scores.length > 1 ? 1 : 0)}/10` : statusLine(lead);
  const marks = data.engines.length < 2 ? "" : `<span class="marks">${group.map((s) =>
    `<button class="mark-btn" type="button" data-open="${esc(s.key)}">${llmMark(s.engine, data, `${llmInfo(s.engine, data).name}: ${statusLine(s)}`, s.status === "done" ? "" : s.status === "thinking" ? "live" : "off")}</button>`).join("")}</span>`;
  return `<div class="seat ${group.every((s) => s.status === "queued") ? "queued" : ""}" style="${hue(lead.nature)}">
    <button class="seat-main" type="button" data-open="${esc(lead.key)}">${writing ? `<span class="pulse"></span>` : ""}<b>${esc(lead.name || lead.id)}</b><small>${esc(line)}</small></button>${marks}</div>`;
}

function roomView(seats, data) {
  if (!seats.length) return empty("No seats match these filters.");
  const natures = orderNatures([...new Set(seats.map((s) => s.nature))], data);
  const personas = [...new Set(seats.map((s) => s.persona))];
  const heads = natures.map((n) => `<div class="room-head" style="${hue(n)}">${icon(n)} ${label(n)}</div>`).join("");
  const rows = personas.map((p) => `<div class="room-row">${label(p)}</div>` + natures.map((n) => {
    const group = seats.filter((s) => s.persona === p && s.nature === n);
    return `<div>${group.length ? seatCell(group, data) : ""}</div>`;
  }).join("")).join("");
  return `<div class="room-wrap"><div class="room" style="grid-template-columns:110px repeat(${natures.length},minmax(128px,1fr))"><div class="room-corner"></div>${heads}${rows}</div></div>`;
}

// Makes raw notes easy to read: bold headings, plain sentences instead of pipe-separated findings.
const pretty = (text) => esc(text)
  .replace(/^## (.*)$/gm, "<b>$1</b>")
  .replace(/^\s*-?\s*(P[123])\|(\w+)\|([^|\n]*)\|([^|\n]*)\|?(.*)$/gm, (_, p, type, offer, wrong, fix) =>
    `<b>${p}</b> ${wrong}${fix ? ` → ${fix}` : ""} <span class="quiet">${type}, ${offer}</span>`);

function feedView(seats, data) {
  const live = (s) => (s.status === "thinking" ? 1 : 0);
  const posts = seats.filter((s) => s.text).sort((a, b) => live(b) - live(a) || b.mtime - a.mtime).slice(0, 60);
  if (!posts.length) return empty("Nothing yet. Thoughts stream here as seats write them.");
  return `<div class="feed">${posts.map((s) => {
    const body = s.status === "thinking" ? s.text.trimEnd().split("\n").slice(-4).join("\n") : s.parsed?.sections.Verdict || s.text.slice(0, 300);
    return `<button class="post" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}">
      <span class="post-head">${natureIcon(s.nature)}<b>${esc(s.name || plain(s.persona))}</b><span class="quiet">${label(s.persona)}</span>${engineMark(s, data)}${s.status === "thinking" ? `<span class="pulse" ${tip("Writing now")}></span>` : ""}</span>
      <pre>${pretty(body)}${s.status === "thinking" ? `<span class="caret"></span>` : ""}</pre></button>`;
  }).join("")}</div>`;
}

// Each nature's own closing: ideas, better questions, first steps, what they still need to know.
const STANDARD = new Set(["Verdict", "Problems", "Findings", "Retell", "Right now", "Not read", "Sources", "Pros and cons"]);

function ideasView(seats, data, open) {
  const natures = orderNatures([...new Set(seats.map((s) => s.nature))], data);
  const blocks = natures.map((n) => {
    const notes = seats.filter((s) => s.nature === n && s.parsed).flatMap((s) =>
      Object.entries(s.parsed.sections).filter(([name, body]) => (!STANDARD.has(name) || name === "Pros and cons") && !isNothing(body)).map(([name, body]) => ({ s, name, body })));
    if (!notes.length) return "";
    const body = notes.map(({ s, name, body: text }) => `
      <button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(n)}"><span class="voice-head"><b>${esc(s.name || plain(s.persona))}</b>${engineMark(s, data)}<span class="quiet">${esc(name)}</span></span><pre>${pretty(text)}</pre></button>`).join("");
    return fold(`ideas:${n}`, `${icon(n)} ${label(n)} <span class="quiet">${notes.length}</span>`, body, open);
  }).join("");
  return blocks || empty("Ideas and questions appear as seats finish their notes.");
}

const decisionCell = (d) => (d ? `<td class="d-${esc(d)}">${esc(d)}</td>` : `<td class="quiet">·</td>`);

function scoresView(seats, data) {
  const rows = seats.filter((s) => s.parsed && Object.keys(s.parsed.scores).length);
  if (!rows.length) return empty("Scores appear as Neutral seats finish. Other natures have a job, not a score.");
  const offers = [...new Set(rows.flatMap((s) => Object.keys(s.parsed.decisions)))];
  const showDecision = rows.some((s) => s.parsed.decision);
  const heads = ["Person", "Score", ...(showDecision ? ["Decision"] : []), "Pick", ...offers, "Introduced"];
  const head = heads.map((h) => `<th scope="col">${h === "Introduced" ? `Introduced ${info("Decision on their first pick if someone they trust had introduced the seller")}` : esc(h)}</th>`).join("");
  const body = rows.map((s) => {
    const p = s.parsed;
    return `<tr><td><button type="button" data-open="${esc(s.key)}" ${tip(whoPlain(s))}>${esc(s.name || plain(s.persona))}</button> ${engineMark(s, data)}</td>
      <td class="num" ${tip(`Overall ${p.scores.overall ?? "?"}, clarity ${p.scores.clarity ?? "?"}, belief ${p.scores.belief ?? "?"}`)}>${esc(p.scores.overall ?? "·")}</td>
      ${showDecision ? decisionCell(p.decision) : ""}<td>${esc(p.firstPick || "·")}</td>${offers.map((o) => decisionCell(p.decisions[o])).join("")}${decisionCell(DECISION_WORDS.has(p.introduced) ? p.introduced : "")}</tr>`;
  }).join("");
  return `<p class="summary">Only Neutral seats score ${info("act: do it now. talk: small next step. think: must think, ask or compare. no: would not. Hover a score for clarity and belief.")}</p>
    <div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function drawerView(s, data, open) {
  const twins = data.seats.filter((t) => t.id === s.id);
  const p = s.parsed;
  const scoreRow = p && (Object.keys(p.scores).length || p.firstPick) ? `<div class="meta score-row">
    ${Object.entries(p.scores).map(([k, v]) => `<span class="pill"><b>${esc(v)}</b> ${esc(k)}</span>`).join("")}
    ${p.firstPick ? `<span class="pill">Pick: <b>${esc(p.firstPick)}</b></span>` : ""}
    ${Object.entries(p.decisions).map(([k, v]) => `<span class="pill d-${esc(v)}">${esc(k)}: ${esc(v)}</span>`).join("")}
    ${p.introduced ? `<span class="pill">If introduced: ${esc(p.introduced)}</span>` : ""}${p.decision ? `<span class="pill d-${esc(p.decision)}">${esc(p.decision)}</span>` : ""}</div>` : "";
  const entries = p ? Object.entries(p.sections) : [];
  const section = ([name, body]) => `<h3>${esc(name)}</h3><pre>${pretty(body)}</pre>`;
  const quiet = new Set(["Right now", "Not read", "Sources"]);
  const main = entries.filter(([n]) => !quiet.has(n)).map(section).join("");
  const rest = entries.filter(([n]) => quiet.has(n));
  const sections = entries.length
    ? main + (rest.length ? fold(`more:${s.key}`, "Context, what they skipped, sources", rest.map(section).join(""), open) : "")
    : `<pre>${pretty(s.text || "No text yet.")}</pre>`;
  return `<div class="drawer-head" style="${hue(s.nature)}"><div><h2>${esc(s.name || s.id)}</h2>
      <p class="sub">${icon(s.nature)} ${label(s.nature)} · ${label(s.persona)}${s.status === "done" ? "" : ` · ${esc(s.status)}`}</p></div>
      <button class="ghost" type="button" data-close aria-label="Close">✕</button></div>
    ${twins.length > 1 ? `<div class="switch" role="group" aria-label="Same person on each LLM">${twins.map((t) => `<button type="button" data-open="${esc(t.key)}" aria-pressed="${t.key === s.key}">${llmBadge(t.engine, data)}</button>`).join("")}</div>` : ""}
    ${scoreRow}<div class="full">${sections}</div>`;
}
