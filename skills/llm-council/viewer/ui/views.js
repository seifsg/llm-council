// Each view takes the filtered seats and returns HTML. All seat text is escaped: it is model output.
const ICONS = { contrarian: "🗡️", believer: "🌟", neutral: "⚖️", confused: "❓", "first-principles": "🔬", executor: "🛠️" };
const KNOWN = Object.keys(ICONS);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const label = (slug) => esc(String(slug).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));
const hue = (nature) => `--c:var(--${KNOWN.includes(nature) ? nature : "other"})`;
const icon = (nature) => ICONS[nature] || "🔹";
const natureChip = (n) => `<span class="chip" style="${hue(n)}"><span class="dot"></span>${icon(n)} ${label(n)}</span>`;
const who = (s) => `${s.name ? `${esc(s.name)} · ` : ""}${label(s.persona)}`;
const engineTag = (s, data) => (data.engines.length > 1 ? `<span class="tag">${esc(s.engine)}</span>` : "");
const empty = (msg) => `<p class="empty">${esc(msg)}</p>`;

function issueCard(issue, data, open) {
  const key = issue.title;
  const voices = issue.voices.map((v) => `
    <button class="voice" type="button" data-open="${esc(v.seat.key)}" style="${hue(v.seat.nature)}">
      <small>${icon(v.seat.nature)} ${label(v.seat.nature)} · ${who(v.seat)} · ${esc(v.p)} · ${esc(v.offer)}${data.engines.length > 1 ? ` · ${esc(v.seat.engine)}` : ""}</small><br>
      ${esc(v.wrong)}${v.fix ? `<em>Would resolve it: ${esc(v.fix)}</em>` : ""}
    </button>`).join("");
  return `<article class="card">
    <button class="issue-head" type="button" data-toggle="${esc(key)}" aria-expanded="${open.has(key)}">
      <span class="tally"><b>${issue.people}</b><span>${issue.people === 1 ? "person" : "people"}</span></span>
      <span>
        <span class="issue-title">${esc(issue.title)}</span>
        <span class="meta">
          <span class="tag ${issue.topP === "P1" ? "p1" : ""}">${esc(issue.topP)}</span>
          ${issue.believerBlocker ? `<span class="tag star">🌟 Even a Believer balked</span>` : ""}
          ${issue.types.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          ${issue.offers.map((o) => `<span class="tag">${esc(o)}</span>`).join("")}
          ${orderNatures(issue.natures, data).map(natureChip).join("")}
        </span>
      </span>
    </button>
    ${open.has(key) ? `<div class="voices">${voices}</div>` : ""}
  </article>`;
}

function heldUp(seats) {
  const quotes = seats.filter((s) => s.nature === "contrarian" && s.parsed && !isNothing(s.parsed.sections["Against type"]));
  if (!quotes.length) return "";
  return `<h2 class="section-title">🗡️ What held up, even for a Contrarian</h2>` + quotes.map((s) => `
    <button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}"><small>${who(s)}</small><br>${esc(s.parsed.sections["Against type"])}</button>`).join("");
}

function ranked(list, seats, data, open) {
  if (!Array.isArray(list) || !list.length) return "";
  const byId = new Map(seats.map((s) => [s.id, s]));
  return `<h2 class="section-title">Ranked issues from the final report</h2>` + list.map((item) => {
    const present = (item.seats || []).map((id) => byId.get(id)).filter(Boolean);
    return `<article class="card"><span class="issue-title">${esc(item.title)}</span>
      <div class="meta">${[item.tier && `Tier ${item.tier}`, item.real, item.type, item.offer || item.target].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${[...new Set(present.map((s) => s.nature))].map(natureChip).join("")}</div>
      ${item.do ? `<p><b>Do this:</b> ${esc(item.do)}</p>` : ""}${item.money ? `<p><b>Payoff:</b> ${esc(item.money)}</p>` : ""}</article>`;
  }).join("");
}

function issuesView(seats, data, open) {
  const groups = groupIssues(seats);
  const auto = groups.length
    ? `<h2 class="section-title">Common issues, most people first. Auto-grouped by wording, so check before acting.</h2>` + groups.map((g) => issueCard(g, data, open)).join("")
    : empty("No findings yet. They appear here as seats write them.");
  return ranked(data.issues, seats, data, open) + auto + heldUp(seats);
}

function seatButton(s, data) {
  const p = s.parsed;
  let line = { queued: "Waiting", thinking: "Writing now…", failed: "Failed" }[s.status] || "";
  if (s.status === "done" && p) {
    line = p.scores.overall !== undefined
      ? `${p.scores.overall}/10 · ${esc(p.firstPick || p.decision || "no pick")}`
      : `${p.problems.length} ${p.problems.length === 1 ? "finding" : "findings"}`;
  }
  return `<button class="seat ${s.status}" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}">
    <b>${s.status === "thinking" ? `<span class="pulse"></span>` : ""}${esc(s.name || s.id)}</b>
    <small>${line}${data.engines.length > 1 ? ` · ${esc(s.engine)}` : ""}</small></button>`;
}

function roomView(seats, data) {
  if (!seats.length) return empty("No seats match these filters.");
  const natures = orderNatures([...new Set(seats.map((s) => s.nature))], data);
  const personas = [...new Set(seats.map((s) => s.persona))];
  const heads = natures.map((n) => `<div class="room-head" style="${hue(n)}">${icon(n)} ${label(n)}</div>`).join("");
  const rows = personas.map((p) => `<div class="room-row">${label(p)}</div>` + natures.map((n) =>
    `<div>${seats.filter((s) => s.persona === p && s.nature === n).map((s) => seatButton(s, data)).join("")}</div>`).join("")).join("");
  return `<div class="room-wrap"><div class="room" style="grid-template-columns:130px repeat(${natures.length},minmax(150px,1fr))"><div></div>${heads}${rows}</div></div>`;
}

// Makes raw notes easy to read: bold headings, plain sentences instead of pipe-separated findings.
const pretty = (text) => esc(text)
  .replace(/^## (.*)$/gm, "<b>$1</b>")
  .replace(/^\s*-?\s*(P[123])\|(\w+)\|([^|\n]*)\|([^|\n]*)\|?(.*)$/gm, (_, p, type, offer, wrong, fix) =>
    `<b>${p}</b> ${type}, ${offer}: ${wrong}${fix ? ` → ${fix}` : ""}`);

function feedView(seats, data) {
  const posts = seats.filter((s) => s.text).sort((a, b) => b.mtime - a.mtime).slice(0, 60);
  if (!posts.length) return empty("Nothing yet. Thoughts stream here as seats write them.");
  return `<div class="feed">${posts.map((s) => {
    const body = s.status === "thinking" ? s.text.slice(-500) : s.parsed?.sections.Verdict || s.text.slice(0, 400);
    return `<button class="post" type="button" data-open="${esc(s.key)}" style="${hue(s.nature)}">
      <header>${natureChip(s.nature)}<b>${who(s)}</b>${engineTag(s, data)}<small>${s.status === "thinking" ? "writing now" : esc(s.status)}</small></header>
      <pre>${pretty(body)}${s.status === "thinking" ? `<span class="caret"></span>` : ""}</pre></button>`;
  }).join("")}</div>`;
}

// Each nature's own closing: ideas, better questions, first steps, what they still need to know.
const STANDARD = new Set(["Verdict", "Problems", "Findings", "Retell", "Right now", "Not read", "Sources"]);

function ideasView(seats, data) {
  const natures = orderNatures([...new Set(seats.map((s) => s.nature))], data);
  const blocks = natures.map((n) => {
    const notes = seats.filter((s) => s.nature === n && s.parsed).flatMap((s) =>
      Object.entries(s.parsed.sections).filter(([name, body]) => !STANDARD.has(name) && !isNothing(body)).map(([name, body]) => ({ s, name, body })));
    if (!notes.length) return "";
    return `<h2 class="section-title">${icon(n)} ${label(n)}</h2>` + notes.map(({ s, name, body }) => `
      <button class="voice" type="button" data-open="${esc(s.key)}" style="${hue(n)}"><small>${who(s)} · ${esc(name)}${data.engines.length > 1 ? ` · ${esc(s.engine)}` : ""}</small><pre>${pretty(body)}</pre></button>`).join("");
  }).join("");
  return blocks || empty("Ideas and questions appear as seats finish their notes.");
}

const decisionCell = (d) => (d ? `<td class="d-${esc(d)}">${esc(d)}</td>` : "<td>·</td>");

function scoresView(seats, data) {
  const rows = seats.filter((s) => s.parsed && Object.keys(s.parsed.scores).length);
  if (!rows.length) return empty("Scores appear as Neutral seats finish. Other natures have a job, not a score.");
  const offers = [...new Set(rows.flatMap((s) => Object.keys(s.parsed.decisions)))];
  const showDecision = rows.some((s) => s.parsed.decision);
  const head = ["Person", "Overall", "Clarity", "Belief", ...(showDecision ? ["Decision"] : []), "First pick", ...offers, "If introduced"].map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const body = rows.map((s) => {
    const p = s.parsed;
    return `<tr><td><button type="button" data-open="${esc(s.key)}">${who(s)}</button> ${engineTag(s, data)}</td>
      <td class="num">${esc(p.scores.overall ?? "·")}</td><td class="num">${esc(p.scores.clarity ?? "·")}</td><td class="num">${esc(p.scores.belief ?? "·")}</td>
      ${showDecision ? decisionCell(p.decision) : ""}<td>${esc(p.firstPick || "·")}</td>${offers.map((o) => decisionCell(p.decisions[o])).join("")}${decisionCell(DECISION_WORDS.has(p.introduced) ? p.introduced : "")}</tr>`;
  }).join("");
  return `<p class="section-title">Only Neutral seats score. act = do it now, talk = take a small next step, think = must think, ask or compare, no = would not.</p>
    <div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function drawerView(s, data) {
  const c = hue(s.nature);
  const sections = s.parsed && Object.keys(s.parsed.sections).length
    ? Object.entries(s.parsed.sections).map(([name, body]) => `<h3>${esc(name)}</h3><pre>${pretty(body)}</pre>`).join("")
    : `<pre>${pretty(s.text || "No text yet.")}</pre>`;
  return `<div class="drawer-head" style="${c}"><div><h2>${esc(s.name || s.id)}</h2>
      <p class="sub">${icon(s.nature)} ${label(s.nature)} · ${label(s.persona)} · ${esc(s.engine)} · ${esc(s.status)}</p></div>
      <button class="ghost" type="button" data-close aria-label="Close">✕</button></div>
    <div class="full">${sections}</div>`;
}

function orderNatures(list, data) {
  const order = data.natures || KNOWN;
  return list.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}
