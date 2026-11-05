// Shows which LLMs ran, and where they differ on the same person, prompt and materials.
const LLM_LOOKS = [
  [/claude|anthropic|opus|sonnet|haiku|fable/i, "✳", "Claude"],
  [/codex|gpt|openai/i, "◎", "Codex"],
  [/gemini|google/i, "✦", "Gemini"],
  [/grok|xai/i, "✕", "Grok"],
  [/llama/i, "🦙", "Llama"],
  [/mistral/i, "▲", "Mistral"],
  [/deepseek/i, "🐋", "DeepSeek"],
  [/qwen/i, "◆", "Qwen"],
];

function llmInfo(engine, data) {
  const meta = data.llms?.[engine] || {};
  const look = LLM_LOOKS.find(([re]) => re.test(`${engine} ${meta.name || ""}`));
  const icon = /^data:image\/(png|jpeg|webp|gif);base64,[\w+/=]+$/.test(meta.icon || "") ? meta.icon : "";
  return { name: meta.name || look?.[2] || label(engine), mark: look?.[1] || String(engine)[0].toUpperCase(), icon };
}

function llmBadge(engine, data) {
  const { name, mark, icon } = llmInfo(engine, data);
  const face = icon ? `<img src="${esc(icon)}" alt="">` : esc(mark);
  return `<span class="llm"><span class="llm-mark" aria-hidden="true">${face}</span>${esc(name)}</span>`;
}

function llmStrip(data) {
  const count = data.engines.length;
  const lead = count === 1 ? "1 LLM in this run" : `${count} LLMs on the same people, prompt and materials`;
  const items = data.engines.map((engine) => {
    const own = data.seats.filter((s) => s.engine === engine);
    const writing = own.filter((s) => s.status === "thinking").length;
    const done = own.filter((s) => s.status === "done").length;
    return `<span class="llm-item">${llmBadge(engine, data)}<small>${done} of ${own.length} done${writing ? ` · <span class="pulse"></span>${writing} writing now` : ""}</small></span>`;
  }).join("");
  return `<b>${lead}</b>${items}`;
}

// Compares one person across LLMs. Findings count as shared when another LLM said something similar.
function seatDiff(group) {
  const overalls = group.map((s) => s.parsed.scores.overall).filter((n) => Number.isFinite(n));
  const picks = new Set(group.map((s) => s.parsed.firstPick).filter(Boolean));
  const keys = [...new Set(group.flatMap((s) => Object.keys(s.parsed.decisions)))];
  const differing = keys.filter((k) => new Set(group.map((s) => s.parsed.decisions[k])).size > 1);
  const rows = group.map((s) => {
    const others = group.filter((o) => o !== s).flatMap((o) => o.parsed.problems.map((p) => tokens(p.wrong)));
    const isShared = (p) => others.some((t) => similarity(tokens(p.wrong), t) >= MATCH);
    return { s, shared: s.parsed.problems.filter(isShared), only: s.parsed.problems.filter((p) => !isShared(p)) };
  });
  const spread = overalls.length > 1 ? Math.max(...overalls) - Math.min(...overalls) : 0;
  const onlyP1 = rows.flatMap((r) => r.only).filter((p) => p.p === "P1").length;
  const onlyAll = rows.flatMap((r) => r.only).length;
  return { rows, spread, picks, differing, keys, weight: spread * 2 + (picks.size > 1 ? 3 : 0) + differing.length * 2 + onlyP1 * 2 + onlyAll * 0.5 };
}

function llmTotals(seats, data) {
  const offerWords = ["act", "talk", "think", "no"];
  const rows = data.engines.map((engine) => {
    const own = seats.filter((s) => s.engine === engine && s.parsed);
    const scores = own.map((s) => s.parsed.scores.overall).filter((n) => Number.isFinite(n));
    const words = own.flatMap((s) => Object.values(s.parsed.decisions));
    const findings = own.reduce((sum, s) => sum + s.parsed.problems.length, 0);
    const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "·";
    return `<tr><td>${llmBadge(engine, data)}</td><td class="num">${own.length}</td><td class="num">${average}</td>
      ${offerWords.map((w) => `<td class="num">${words.filter((x) => x === w).length}</td>`).join("")}
      <td class="num">${own.length ? (findings / own.length).toFixed(1) : "·"}</td></tr>`;
  }).join("");
  const head = ["LLM", "Answers", "Avg overall", ...offerWords, "Findings each"].map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function onlyOneLlm(seats, data) {
  const lone = groupIssues(seats).filter((g) => g.llms.length === 1);
  if (!lone.length) return "";
  return `<h2 class="section-title">Raised by only one LLM. It may have seen something others missed, or be a quirk.</h2>` +
    lone.slice(0, 12).map((g) => `<article class="card lone">${llmBadge(g.llms[0], data)} <b>${g.people}</b> ${g.people === 1 ? "person" : "people"}: ${esc(g.title)} <span class="tag ${g.topP === "P1" ? "p1" : ""}">${esc(g.topP)}</span></article>`).join("");
}

function versusColumn({ s, shared, only }, diff, data) {
  const p = s.parsed;
  const score = Number.isFinite(p.scores.overall) ? `<span class="big-score">${p.scores.overall}<small>/10</small></span>` : "";
  const pick = p.firstPick ? `<span class="tag ${diff.picks.size > 1 ? "differs" : ""}">First pick: ${esc(p.firstPick)}</span>` : "";
  const decisions = diff.keys.map((k) => `<span class="tag ${diff.differing.includes(k) ? "differs" : ""}">${esc(k)}: ${esc(p.decisions[k] || "·")}</span>`).join("");
  const onlyList = only.map((f) => `<li><b>${esc(f.p)}</b> ${esc(f.wrong)}</li>`).join("");
  return `<button class="versus-col" type="button" data-open="${esc(s.key)}">
    <span class="versus-head">${llmBadge(s.engine, data)}${score}</span>
    <span class="meta">${pick}${decisions}</span>
    <span class="versus-text">${esc(p.sections.Verdict || "")}</span>
    ${onlyList ? `<strong>Only this LLM found</strong><ul>${onlyList}</ul>` : ""}
    ${shared.length ? `<small>${shared.length} shared with another LLM</small>` : ""}
  </button>`;
}

function compareView(seats, data) {
  if (data.engines.length < 2) return empty(`Only one LLM ran: ${llmInfo(data.engines[0], data).name}. Run a second to compare opinions here.`);
  const byId = groupById(seats.filter((s) => s.parsed));
  const cards = [...byId.values()].filter((g) => g.length > 1).map((g) => ({ g, diff: seatDiff(g) })).sort((a, b) => b.diff.weight - a.diff.weight);
  const twins = cards.filter((c) => c.diff.picks.size > 0);
  const samePick = twins.filter((c) => c.diff.picks.size === 1).length;
  const agree = twins.length ? `<p class="section-title">Same first pick on ${samePick} of ${twins.length} people answered by more than one LLM.</p>` : "";
  const list = cards.length
    ? `<h2 class="section-title">Same person, side by side. Biggest disagreement first. A heavy outline marks where LLMs differ.</h2>` + cards.map(({ g, diff }) => `<article class="card" style="${hue(g[0].nature)}">
        <div class="versus-title"><span class="dot"></span> <b>${who(g[0])}</b> · ${icon(g[0].nature)} ${label(g[0].nature)}${diff.spread ? ` <span class="tag differs">${diff.spread} points apart</span>` : ""}</div>
        <div class="versus">${diff.rows.map((r) => versusColumn(r, diff, data)).join("")}</div></article>`).join("")
    : empty("Comparisons appear once two LLMs have answered as the same person.");
  return llmTotals(seats, data) + agree + onlyOneLlm(seats, data) + list;
}

function groupById(seats) {
  const map = new Map();
  for (const s of seats) map.set(s.id, [...(map.get(s.id) || []), s]);
  return map;
}
