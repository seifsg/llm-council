// Lists rounds and compares any two. Scores compare only for the same person, LLM, prompt, facts and interview.
const roundName = (r) => (r.round !== null ? `Round ${r.round}` : r.kind === "pilot" ? "Pilot" : r.title);
const roundLabel = (r) => `${roundName(r)} · ${r.draft} · ${r.size}`;
const shortDate = (d) => (d ? String(d).slice(0, 10) : "·");
const STANDING = { open: "Still open", fixed: "No longer raised", fresh: "New" };

function roundsTable(rounds, current) {
  const rows = rounds.map((r) => `<tr class="${r.id === current ? "is-current" : ""}">
    <td><button type="button" data-round="${esc(r.id)}">${esc(roundName(r))}</button>${r.baseline ? ` <span class="pill">Baseline</span>` : ""}${r.kind === "pilot" ? ` ${info("A pilot tests the bench itself. It is not a round.")}` : ""}</td>
    <td>${esc(shortDate(r.date))}</td><td>${esc(r.draft)}</td><td>${esc(r.size)}</td>
    <td><span class="marks">${r.engines.map((e) => llmMark(e, r, llmInfo(e, r).name)).join("")}</span></td>
    <td class="num" ${tip(`${r.answered} of ${r.total} seats answered`)}>${r.answered}/${r.total}</td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Round</th><th scope="col">Date</th><th scope="col">Draft</th><th scope="col">Size</th><th scope="col">LLMs</th><th scope="col" class="num">Answered</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function scoreSummary(same) {
  const average = (same.reduce((sum, p) => sum + p.b.parsed.scores.overall - p.a.parsed.scores.overall, 0) / same.length).toFixed(1);
  const shifted = same.filter((p) => p.a.parsed.firstPick !== p.b.parsed.firstPick).length;
  return `<p class="summary"><b>${delta0(average)}</b> average score change, <b>${count(shifted, "first pick")}</b> moved, across ${count(same.length, "matched answer")} (same person, same LLM).</p>`;
}

function scoreRows(same, nameA, nameB, open) {
  const moved = same.map((p) => ({ ...p, delta: p.b.parsed.scores.overall - p.a.parsed.scores.overall })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const rows = moved.map(({ a, b, delta }) => {
    const shift = a.parsed.firstPick === b.parsed.firstPick ? `<span class="quiet">${esc(b.parsed.firstPick || "·")}</span>` : `<b>${esc(a.parsed.firstPick || "·")} → ${esc(b.parsed.firstPick || "·")}</b>`;
    return `<tr><td><span class="nat-cell">${natureIcon(b.nature)}<span ${tip(whoPlain(b))}>${esc(b.name || plain(b.persona))}</span></span> ${llmMark(b.engine, b.llmSource)}</td>
      <td class="num">${a.parsed.scores.overall}</td><td class="num">${b.parsed.scores.overall}</td><td class="num delta">${delta > 0 ? "+" : ""}${delta}</td><td>${shift}</td></tr>`;
  }).join("");
  const body = `<div class="table-wrap"><table><thead><tr><th scope="col">Person</th><th scope="col" class="num">${esc(nameA)}</th><th scope="col" class="num">${esc(nameB)}</th><th scope="col" class="num">Change</th><th scope="col">First pick</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return fold("score-rows", `Score change per person, largest moves first <span class="quiet">${moved.length}</span>`, body, open);
}
const delta0 = (n) => (Number(n) > 0 ? `+${n}` : n);

function offerRows(A, B, same, nameA, nameB) {
  const names = new Map([...A.meta.offers, ...B.meta.offers].map((o) => [o.key, o.name]));
  const inA = new Set(A.meta.offers.map((o) => o.key));
  const inB = new Set(B.meta.offers.map((o) => o.key));
  const words = (side, key) => same.map((p) => p[side].parsed.decisions[key]).filter(Boolean);
  const tally = (list) => ["act", "talk", "think", "no"].map((w) => `${w} ${list.filter((x) => x === w).length}`).join(", ");
  const rows = [...names].map(([key, name]) => {
    if (!inA.has(key) || !inB.has(key)) return `<tr><td>${esc(name)}</td><td colspan="2"><span class="pill">Only in ${esc(inA.has(key) ? nameA : nameB)}, not compared</span></td></tr>`;
    const [a, b] = [words("a", key), words("b", key)];
    return `<tr><td>${esc(name)}</td><td>${stackBar(a)}<small class="quiet">${esc(tally(a))}</small></td><td>${stackBar(b)}<small class="quiet">${esc(tally(b))}</small></td></tr>`;
  }).join("");
  if (!rows) return "";
  return `<h2 class="section-title">Decisions per offer, same matched answers</h2><div class="table-wrap"><table><thead><tr><th scope="col">Offer</th><th scope="col">${esc(nameA)}</th><th scope="col">${esc(nameB)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function pickRows(same, nameA, nameB) {
  const count0 = (side, pick) => same.filter((p) => p[side].parsed.firstPick === pick).length;
  const picks = [...new Set(same.flatMap((p) => [p.a.parsed.firstPick, p.b.parsed.firstPick]).filter(Boolean))];
  if (!picks.length) return "";
  const rows = picks.map((k) => `<tr><td>${esc(k)}</td><td class="num">${count0("a", k)}</td><td class="num">${count0("b", k)}</td></tr>`).join("");
  return `<h2 class="section-title">First picks, same matched answers</h2><div class="table-wrap"><table><thead><tr><th scope="col">Pick</th><th scope="col" class="num">${esc(nameA)}</th><th scope="col" class="num">${esc(nameB)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Pairs each issue with its closest match by wording. Each issue is used once.
function issueStanding(listA, listB) {
  const open = [], fresh = [], unused = new Set(listA);
  for (const b of listB) {
    let best = null, bestScore = 0.25;
    for (const a of unused) {
      const score = similarity(tokens(a.title), tokens(b.title));
      if (score >= bestScore) { best = a; bestScore = score; }
    }
    if (best) { unused.delete(best); open.push({ a: best, b }); } else fresh.push(b);
  }
  return { open, fresh, fixed: [...unused] };
}

function issueList(title, items, line, open) {
  if (!items.length) return "";
  return fold(`std:${title}`, `${esc(title)} <span class="quiet">${items.length}</span>`, items.map(line).join(""), open);
}

function issuesCompared(A, B, nameA, nameB, open) {
  const [a, b] = [A.issues, B.issues].map((l) => (Array.isArray(l) ? l : null));
  if (!a || !b) return `<p class="summary">Issue changes appear once both rounds have a ranked list: ${esc(!a ? nameA : nameB)} has none yet.</p>`;
  const { open: still, fresh, fixed } = issueStanding(a, b);
  const row = (i) => `<div class="lone"><span class="pill">${esc(i.tier ? `Tier ${i.tier}` : "·")}</span>${esc(i.title)} <span class="quiet">${esc([i.type, i.offer || i.target].filter(Boolean).join(" · "))}</span></div>`;
  return `<h2 class="section-title">Ranked issues <span class="quiet">${still.length} still open, ${fixed.length} no longer raised, ${fresh.length} new</span> ${info("Matched by wording, so check before trusting. No longer raised does not prove a fix: it means seats stopped saying it.")}</h2>` +
    issueList(STANDING.fixed, fixed, row, open) + issueList(STANDING.fresh, fresh, row, open) + issueList(STANDING.open, still, ({ b: i }) => row(i), open);
}

function offerChanges(A, B, nameA, nameB, open) {
  if (!A.meta.offerText || !B.meta.offerText) return `<p class="summary">One of these rounds has no saved offer to compare.</p>`;
  const changes = lineDiff(A.meta.offerText, B.meta.offerText);
  const shared = !A.meta.offerOwn || !B.meta.offerOwn ? `<p class="quiet">A round without its own saved copy shows its draft's current file, which may have changed since it ran.</p>` : "";
  const body = changes.length
    ? changes.map(([side, line]) => `<div class="diff ${side}"><span class="quiet">${side === "add" ? "+" : "−"}</span> ${esc(line)}</div>`).join("")
    : `<p class="quiet">The offer text is identical.</p>`;
  return fold("offer-diff", `What changed in the offer, ${esc(nameA)} to ${esc(nameB)} <span class="quiet">${changes.length} lines</span>`, shared + body, open);
}

function extras(R, name, open) {
  const parts = [R.meta.why && fold(`why:${name}`, `Why ${esc(name)} ran`, `<pre class="plain">${esc(R.meta.why)}</pre>`, open), R.meta.report && fold(`report:${name}`, `${esc(name)} report`, `<pre class="plain">${esc(R.meta.report)}</pre>`, open)];
  return parts.filter(Boolean).join("");
}

function roundsView(state, keep) {
  const { rounds, roundId, cmpA, cmpB, cache, open } = state;
  const list = roundsTable(rounds, roundId);
  const select = (id, value) => `<select id="${id}" aria-label="${id === "cmp-a" ? "Earlier round" : "Later round"}">${rounds.map((r) => `<option value="${esc(r.id)}"${r.id === value ? " selected" : ""}>${esc(roundLabel(r))}</option>`).join("")}</select>`;
  const head = `<h2 class="section-title cmp-pick">Compare ${select("cmp-a", cmpA)} with ${select("cmp-b", cmpB)}</h2>`;
  if (cmpA === cmpB) return `${list}${head}<p class="empty">Pick two different rounds.</p>`;
  const [A, B] = [cache[cmpA], cache[cmpB]];
  if (!A || !B) return `${list}${head}<p class="empty">Loading rounds…</p>`;
  const [nameA, nameB] = [rounds.find((r) => r.id === cmpA), rounds.find((r) => r.id === cmpB)].map(roundName);
  B.seats.forEach((s) => { s.llmSource = B; });
  const { check, same, blocked } = pairUp(A, B, keep);
  const pilot = [A, B].some((R) => R.meta.kind === "pilot") ? ["One of these is a pilot. It tested the bench, not an offer, so read any change as a sanity check only."] : [];
  const notes = [...pilot, ...new Set([A.meta.hashesNote, B.meta.hashesNote].filter(Boolean))];
  const allNote = check.reason
    ? `<div class="notice"><b>Findings only.</b> Scores are hidden because ${esc(check.reason.toLowerCase())}. A score change would only measure that.</div>`
    : blocked.length ? `<div class="notice"><b>${count(blocked.length, "answer")} shown as findings only:</b> that person's facts or interview changed between rounds.</div>` : "";
  const numbers = same.length ? scoreSummary(same) + offerRows(A, B, same, nameA, nameB) + pickRows(same, nameA, nameB) : "";
  const perPerson = same.length ? scoreRows(same, nameA, nameB, open) : "";
  return `${list}${head}${allNote}${notes.map((n) => `<p class="quiet note-line">${esc(n)}</p>`).join("")}${numbers}${issuesCompared(A, B, nameA, nameB, open)}${perPerson}${offerChanges(A, B, nameA, nameB, open)}${extras(A, nameA, open)}${extras(B, nameB, open)}`;
}
