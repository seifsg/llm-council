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
  return { name: meta.name || look?.[2] || plain(engine), mark: look?.[1] || String(engine)[0].toUpperCase(), icon };
}

function llmFace(engine, data) {
  const { mark, icon } = llmInfo(engine, data);
  return icon ? `<img src="${esc(icon)}" alt="">` : esc(mark);
}

// Icon alone, with the name and any extra detail in its tooltip.
function llmMark(engine, data, text, state = "") {
  return `<span class="llm-mark ${state}" ${tip(text || llmInfo(engine, data).name)}>${llmFace(engine, data)}</span>`;
}

function llmBadge(engine, data) {
  return `<span class="llm"><span class="llm-mark" aria-hidden="true">${llmFace(engine, data)}</span>${esc(llmInfo(engine, data).name)}</span>`;
}

// A ring around each mark fills as that LLM's seats finish.
function llmStrip(data) {
  const n = data.engines.length;
  const items = data.engines.map((engine) => {
    const own = data.seats.filter((s) => s.engine === engine);
    const writing = own.filter((s) => s.status === "thinking").length;
    const done = own.filter((s) => s.status === "done").length;
    const share = own.length ? Math.round((done / own.length) * 100) : 0;
    const text = `${llmInfo(engine, data).name}: ${done} of ${own.length} done${writing ? `, ${writing} writing now` : ""}`;
    return `<span class="ring ${writing ? "live" : ""}" style="--p:${share}%" tabindex="0" ${tip(text)}><span class="llm-mark">${llmFace(engine, data)}</span></span>`;
  }).join("");
  const names = data.engines.map((e) => llmInfo(e, data).name).join(", ");
  return `<span class="llm-count" tabindex="0" ${tip(`${count(n, "LLM")} in this run${n > 1 ? ", on the same people, prompt and materials" : ""}: ${names}`)}>${count(n, "LLM")}</span>${items}`;
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
  const onlyAll = rows.flatMap((r) => r.only);
  const onlyP1 = onlyAll.filter((p) => p.p === "P1").length;
  return { rows, spread, picks, differing, keys, onlyCount: onlyAll.length, weight: spread * 2 + (picks.size > 1 ? 3 : 0) + differing.length * 2 + onlyP1 * 2 + onlyAll.length * 0.5 };
}

function stackBar(words) {
  const order = ["act", "talk", "think", "no"];
  const total = words.length || 1;
  const counts = order.map((w) => [w, words.filter((x) => x === w).length]);
  const text = counts.map(([w, c]) => `${w} ${c}`).join(", ");
  return `<span class="stack" role="img" ${tip(text)}>${counts.filter(([, c]) => c).map(([w, c]) => `<i class="d-${w}" style="width:${(c / total) * 100}%"></i>`).join("")}</span>`;
}

function llmTotals(seats, data) {
  const rows = data.engines.map((engine) => {
    const own = seats.filter((s) => s.engine === engine && s.parsed);
    const scores = own.map((s) => s.parsed.scores.overall).filter((n) => Number.isFinite(n));
    const findings = own.reduce((sum, s) => sum + s.parsed.problems.length, 0);
    const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "·";
    return `<tr><td>${llmBadge(engine, data)}</td><td class="num" ${tip(`${own.length} answers so far`)}>${average}</td>
      <td>${stackBar(own.flatMap((s) => Object.values(s.parsed.decisions)))}</td>
      <td class="num">${own.length ? (findings / own.length).toFixed(1) : "·"}</td></tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead><tr><th scope="col">LLM</th><th scope="col">Avg score</th>
    <th scope="col">Decisions ${info("Share of act, talk, think and no across every option. Darkest is act. Hover a bar for counts.")}</th><th scope="col">Findings each</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function onlyOneLlm(seats, data, open) {
  const lone = groupIssues(seats).filter((g) => g.llms.length === 1);
  if (!lone.length) return "";
  const body = lone.map((g) => `<div class="lone">${llmMark(g.llms[0], data)}<span class="pill ${g.topP === "P1" ? "p1" : ""}">${esc(g.topP)}</span> ${esc(g.title)} <span class="quiet">${count(g.people, "person", "people")}</span></div>`).join("");
  return fold("lone", `Raised by only one LLM <span class="quiet">${lone.length}</span> ${info("It may have seen something the others missed, or it may be a quirk of that model.")}`, body, open);
}

// A 0 to 10 track with one mark per LLM: the gap is visible without reading a number.
function scoreTrack(group, data) {
  const scored = group.filter((s) => Number.isFinite(s.parsed.scores.overall));
  if (!scored.length) return "";
  return `<span class="track" ${tip("Score from 0 to 10, one mark per LLM")}>${scored.map((s) => `<span class="track-mark" style="left:${s.parsed.scores.overall * 10}%">${llmMark(s.engine, data, `${llmInfo(s.engine, data).name}: ${s.parsed.scores.overall}/10`)}</span>`).join("")}</span>`;
}

function versusColumn({ s, shared, only }, diff, data) {
  const p = s.parsed;
  const same = diff.keys.filter((k) => !diff.differing.includes(k));
  const score = Number.isFinite(p.scores.overall) ? `<span class="big-score">${p.scores.overall}<small>/10</small></span>` : "";
  const pick = p.firstPick ? `<span class="pill ${diff.picks.size > 1 ? "differs" : ""}">Pick: ${esc(p.firstPick)}</span>` : "";
  const decisions = diff.differing.map((k) => `<span class="pill differs">${esc(k)}: ${esc(p.decisions[k] || "·")}</span>`).join("");
  const agreed = same.length ? `<span class="quiet" ${tip(`LLMs agree: ${same.map((k) => `${k} ${p.decisions[k]}`).join(", ")}`)}>+${same.length} same</span>` : "";
  const sharedTip = shared.map((f) => f.wrong).join(" | ");
  return `<button class="versus-col" type="button" data-open="${esc(s.key)}">
    <span class="versus-head">${llmBadge(s.engine, data)}${score}</span>
    <span class="meta">${pick}${decisions}${agreed}</span>
    <span class="versus-text">${esc(p.sections.Verdict || "")}</span>
    ${only.length ? `<ul>${only.map((f) => `<li><b>${esc(f.p)}</b> ${esc(f.wrong)}</li>`).join("")}</ul>` : ""}
    ${shared.length ? `<span class="quiet" ${tip(sharedTip)}>${shared.length} shared with another LLM</span>` : ""}
  </button>`;
}

function compareCard({ g, diff }, data, open) {
  const key = `cmp:${g[0].id}`;
  const isOpen = open.has(key);
  const pills = [
    diff.picks.size > 1 ? `<span class="sig" ${tip(`Different first picks: ${[...diff.picks].join(", ")}`)}>⑂</span>` : "",
    diff.differing.length ? `<span class="sig" ${tip(`Decisions differ on: ${diff.differing.join(", ")}`)}>≠ ${diff.differing.length}</span>` : "",
    diff.onlyCount ? `<span class="sig" ${tip(count(diff.onlyCount, "finding") + " only one LLM raised")}>◇ ${diff.onlyCount}</span>` : "",
  ].join("");
  return `<article class="card cmp" style="${hue(g[0].nature)}">
    <button class="cmp-head" type="button" data-toggle="${esc(key)}" aria-expanded="${isOpen}">
      ${natureIcon(g[0].nature)}<span class="cmp-who"><b>${esc(g[0].name || plain(g[0].persona))}</b> <span class="quiet">${label(g[0].persona)}</span></span>
      ${scoreTrack(g, data)}<span class="sigs">${pills || `<span class="quiet">In step</span>`}</span><span class="chev" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
    </button>
    ${isOpen ? `<div class="versus">${diff.rows.map((r) => versusColumn(r, diff, data)).join("")}</div>` : ""}</article>`;
}

function compareView(seats, data, open) {
  if (data.engines.length < 2) return empty(`Only one LLM ran: ${llmInfo(data.engines[0], data).name}. Run a second to compare opinions here.`);
  const byId = groupById(seats.filter((s) => s.parsed));
  const cards = [...byId.values()].filter((g) => g.length > 1).map((g) => ({ g, diff: seatDiff(g) })).sort((a, b) => b.diff.weight - a.diff.weight);
  const twins = cards.filter((c) => c.diff.picks.size > 0);
  const samePick = twins.filter((c) => c.diff.picks.size === 1).length;
  const agree = twins.length ? `<p class="summary"><b>${samePick} of ${twins.length}</b> people got the same first pick from every LLM that answered.</p>` : "";
  const list = cards.length
    ? `<h2 class="section-title">Same person, biggest disagreement first ${info("Click a row to see each LLM side by side. ⑂ different first picks. ≠ decisions differ. ◇ findings only one LLM raised.")}</h2>` + cards.map((c) => compareCard(c, data, open)).join("")
    : empty("Comparisons appear once two LLMs have answered as the same person.");
  return llmTotals(seats, data) + agree + onlyOneLlm(seats, data, open) + list;
}

function groupById(seats) {
  const map = new Map();
  for (const s of seats) map.set(s.id, [...(map.get(s.id) || []), s]);
  return map;
}
