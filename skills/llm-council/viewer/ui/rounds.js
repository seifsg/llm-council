// Details level: every round, and any two compared in full. The first screen reads the same choice of rounds.
const shortDate = (d) => (d ? String(d).slice(0, 10) : "·");
const roundLabel = (r) => `${roundName(r)} · ${r.draft} · ${r.size}`;

function roundsTable(rounds, current) {
  const rows = rounds.map((r) => `<tr class="${r.id === current ? "is-current" : ""}">
    <td><button class="plain-btn" type="button" data-round="${esc(r.id)}">${esc(roundName(r))}</button>${r.baseline ? ` <span class="fine-text">baseline</span>` : ""}</td>
    <td>${esc(shortDate(r.date))}</td><td>${esc(r.draft)}</td><td>${esc(r.size)}</td><td>${esc(r.engines.map((e) => llmName(e, r)).join(", "))}</td><td class="num">${r.answered}/${r.total}</td></tr>`).join("");
  return `<div class="scroll"><table><thead><tr><th scope="col">Round</th><th scope="col">Date</th><th scope="col">Draft</th><th scope="col">Size</th><th scope="col">LLMs</th><th scope="col" class="num">Answered</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function offerRows(c, nameA, nameB) {
  const { A, B, same } = c;
  const names = new Map([...A.meta.offers, ...B.meta.offers].map((o) => [o.key, o.name]));
  const has = (R, key) => R.meta.offers.some((o) => o.key === key);
  const tally = (side, key) => {
    const words = same.map((p) => p[side].parsed.decisions[key]).filter(Boolean);
    return ["act", "talk", "think", "no"].map((w) => `${w} ${words.filter((x) => x === w).length}`).join(", ");
  };
  const rows = [...names].map(([key, name]) => (has(A, key) && has(B, key)
    ? `<tr><td>${esc(name)}</td><td>${esc(tally("a", key))}</td><td>${esc(tally("b", key))}</td></tr>`
    : `<tr><td>${esc(name)}</td><td colspan="2" class="fine-text">Only in ${esc(has(A, key) ? nameA : nameB)}, not compared</td></tr>`)).join("");
  return rows ? `<h2 class="sub">Decisions per offer</h2><div class="scroll"><table><thead><tr><th scope="col">Offer</th><th scope="col">${esc(nameA)}</th><th scope="col">${esc(nameB)}</th></tr></thead><tbody>${rows}</tbody></table></div>` : "";
}

function personRows(c, nameA, nameB) {
  if (!c.same.length) return "";
  const moved = c.same.map((p) => ({ ...p, delta: p.b.parsed.scores.overall - p.a.parsed.scores.overall })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const rows = moved.map(({ a, b, delta }) => {
    const shift = a.parsed.firstPick === b.parsed.firstPick ? esc(b.parsed.firstPick || "·") : `${esc(a.parsed.firstPick || "·")} → ${esc(b.parsed.firstPick || "·")}`;
    return `<tr><td>${esc(seatName(b))} <span class="fine-text">${esc(llmName(b.engine, c.B))}</span></td><td class="num">${a.parsed.scores.overall}</td><td class="num">${b.parsed.scores.overall}</td><td class="num ${delta > 0 ? "up" : delta < 0 ? "down" : ""}">${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}</td><td>${shift}</td></tr>`;
  }).join("");
  return `<h2 class="sub">Score change per person</h2><div class="scroll"><table><thead><tr><th scope="col">Person</th><th scope="col" class="num">${esc(nameA)}</th><th scope="col" class="num">${esc(nameB)}</th><th scope="col" class="num">Change</th><th scope="col">First pick</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function offerChanges(c, nameA, nameB) {
  const { A, B } = c;
  if (!A.meta.offerText || !B.meta.offerText) return "";
  const changes = lineDiff(A.meta.offerText, B.meta.offerText);
  const body = changes.length ? changes.map(([side, line]) => `<p class="diff"><span class="${side === "add" ? "up" : "down"}">${side === "add" ? "Added" : "Removed"}</span> ${esc(line)}</p>`).join("") : `<p class="fine-text">The offer text is identical.</p>`;
  const stale = !A.meta.offerOwn || !B.meta.offerOwn ? `<p class="fine-text">A round without its own saved copy shows its draft's current file.</p>` : "";
  return `<h2 class="sub">What changed in the offer, ${esc(nameA)} to ${esc(nameB)}</h2>${stale}${body}`;
}

function roundsView(state, keep) {
  const { rounds, roundId, cmpA, cmpB, cache, open } = state;
  const list = roundsTable(rounds, roundId);
  if (rounds.length < 2) return `${list}<p class="fine-text">Comparison starts with a second round.</p>`;
  const select = (id, value, title) => `<select id="${id}" aria-label="${title}">${rounds.map((r) => `<option value="${esc(r.id)}"${r.id === value ? " selected" : ""}>${esc(roundLabel(r))}</option>`).join("")}</select>`;
  const pick = `<p class="pick">Compare ${select("cmp-b", cmpB, "Later round")} against ${select("cmp-a", cmpA ?? cmpB, "Earlier round")}</p>`;
  const [A, B] = [cache[cmpA], cache[cmpB]];
  if (!cmpA || cmpA === cmpB) return `${list}${pick}<p class="fine-text">Pick two different rounds.</p>`;
  if (!A || !B) return `${list}${pick}<p class="fine-text">Loading…</p>`;
  const [nameA, nameB] = [cmpA, cmpB].map((id) => roundName(rounds.find((r) => r.id === id)));
  const c = compareRounds(A, B, keep);
  const notes = [
    c.check.reason && `Findings only. ${c.check.reason}.`,
    c.blocked.length && !c.check.reason && `${count(c.blocked.length, "answer")} left out: that persona changed.`,
    [A, B].some((R) => R.meta.kind === "pilot") && "One of these is a pilot. It tested the bench, not an offer.",
    ...new Set([A.meta.hashesNote, B.meta.hashesNote].filter(Boolean)),
  ].filter(Boolean);
  const reports = [[A, nameA], [B, nameB]].flatMap(([R, name]) => [
    R.meta.why && [`why:${name}`, `Why ${name} ran`, R.meta.why],
    R.meta.report && [`report:${name}`, `${name} report`, R.meta.report],
  ]).filter(Boolean).map(([key, title, text]) => `<button class="plain-btn fold" type="button" data-toggle="${esc(key)}" aria-expanded="${open.has(key)}">${esc(title)}</button>${open.has(key) ? `<pre class="long">${esc(text)}</pre>` : ""}`).join("");
  return `${list}${pick}${notes.length ? `<ul class="fine">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}${c.same.length ? offerRows(c, nameA, nameB) + personRows(c, nameA, nameB) : ""}${offerChanges(c, nameA, nameB)}${reports}`;
}
