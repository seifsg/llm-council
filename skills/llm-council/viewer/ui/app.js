// Holds the state, polls the open round while it is live, and redraws only what changed.
const TABS = [
  ["improving", "Am I improving?", () => improvingView(state)],
  ["issues", "Common issues", issuesView],
  ["feed", "Live", feedView],
  ["compare", "LLMs", compareView],
  ["ideas", "Ideas", ideasView],
  ["room", "Room", roomView],
  ["scores", "Scores", scoresView],
  ["rounds", "Rounds", () => roundsView(state, keep)],
];
const state = {
  tab: "issues", data: null, raw: "", open: new Set(), seat: null, off: new Set(), persona: "", engine: "", q: "", optionsKey: "", filtersOpen: false,
  rounds: [], roundId: null, cmpA: null, cmpB: null, cache: {}, tick: 0,
};
const STATIC = window.__COUNCIL__ || null;
const $ = (id) => document.getElementById(id);
const tabsNow = () => TABS.filter(([id]) => (id !== "rounds" || state.rounds.length > 1) && (id !== "improving" || numberedRounds(state.rounds).length > 0));

// Touches the page only when the markup changed, so polling never resets hover or animations.
function setHtml(el, html) {
  if (el.dataset.drawn !== String(hash(html))) {
    el.dataset.drawn = hash(html);
    el.innerHTML = html;
  }
}
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

function parsedRun(data) {
  for (const s of data.seats) s.parsed = s.text ? parseAnswer(s.text) : null;
  return data;
}

async function loadRound(id) {
  const data = STATIC ? STATIC.runs[id] : await (await fetch(`api/run?round=${encodeURIComponent(id)}`, { cache: "no-store" })).json();
  state.cache[id] = parsedRun(data);
  return state.cache[id];
}

const keep = (s) =>
  !state.off.has(s.nature) &&
  (!state.persona || s.persona === state.persona) &&
  (!state.engine || s.engine === state.engine);

function filtered() {
  const q = state.q.toLowerCase();
  return state.data.seats.filter((s) => keep(s) && (!q || `${s.name} ${s.persona} ${s.nature} ${s.text}`.toLowerCase().includes(q)));
}

const activeFilters = () => state.off.size + (state.persona ? 1 : 0) + (state.engine ? 1 : 0) + (state.q ? 1 : 0);

function drawHeader() {
  const { data, rounds, roundId } = state;
  $("title").textContent = data.title;
  document.title = `${data.title} · Council Viewer`;
  $("decision").textContent = data.decision;
  $("decision").dataset.tip = data.decision;
  const pick = $("round-pick");
  pick.hidden = rounds.length < 2;
  setHtml(pick, rounds.map((r) => `<option value="${esc(r.id)}"${r.id === roundId ? " selected" : ""}>${esc(roundLabel(r))}</option>`).join(""));
  pick.value = roundId;
  const total = data.seats.length || 1;
  const n = (st) => data.seats.filter((s) => s.status === st).length;
  const [done, thinking, failed] = [n("done"), n("thinking"), n("failed")];
  setHtml($("progress"), `<i class="done" style="width:${(done / total) * 100}%"></i><i class="thinking" style="width:${(thinking / total) * 100}%"></i>`);
  $("progress").setAttribute("aria-label", `${done} of ${data.seats.length} done, ${thinking} writing`);
  setHtml($("counts"), `${thinking ? `<span class="pulse"></span>` : ""}<b>${done}</b>/${data.seats.length}${failed ? ` <span class="sig" ${tip(`${failed} failed`)}>${UI.alert} ${failed}</span>` : ""}`);
  $("counts").dataset.tip = `${done} of ${data.seats.length} done, ${thinking} writing now, ${data.seats.length - done - thinking - failed} waiting, ${failed} failed`;
  setHtml($("llms"), llmStrip(data));
  const issueCount = groupIssues(filtered()).length;
  setHtml($("tabs"), tabsNow().map(([id, name], i) => {
    const badge = id === "issues" && issueCount ? ` <span class="count">${issueCount}</span>` : id === "feed" && thinking ? ` <span class="pulse"></span>` : id === "rounds" ? ` <span class="count">${rounds.length}</span>` : "";
    return `<button type="button" role="tab" data-tab="${id}" aria-selected="${state.tab === id}" title="Press ${i + 1}">${name}${badge}</button>`;
  }).join(""));
  const active = activeFilters();
  setHtml($("filter-toggle"), `${UI.filter}Filter${active ? ` <span class="count-on">${active}</span>` : ""}`);
  $("filter-toggle").setAttribute("aria-expanded", state.filtersOpen);
  $("filters").hidden = !state.filtersOpen;
}

// Rebuilt only when the options change, so typing in the search box keeps its focus.
function drawFilters(force) {
  const { data } = state;
  const natures = allNatures(data);
  const personas = [...new Set(data.seats.map((s) => s.persona))];
  const key = JSON.stringify([natures, personas, data.engines]);
  if (key === state.optionsKey && !force) return;
  state.optionsKey = key;
  const opts = (list, all, current, show = plain) => `<option value="">${all}</option>` + list.map((v) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(show(v))}</option>`).join("");
  $("filters").innerHTML = natures.map((n) => `<button class="chip" type="button" data-nature="${esc(n)}" aria-pressed="${!state.off.has(n)}" style="${hue(n)}"><span class="nat bare">${icon(n)}</span>${label(n)}</button>`).join("") +
    `<select id="persona" aria-label="Persona">${opts(personas, "All personas", state.persona)}</select>` +
    (data.engines.length > 1 ? `<select id="engine" aria-label="LLM">${opts(data.engines, "All LLMs", state.engine, (e) => llmInfo(e, data).name)}</select>` : "") +
    `<input id="search" type="search" placeholder="Search every answer ( / )" aria-label="Search every answer" value="${esc(state.q)}">` +
    `<button class="ghost" type="button" data-clear>Clear</button>`;
}

function drawView() {
  setHtml($("view"), TABS.find(([id]) => id === state.tab)[2](filtered(), state.data, state.open));
  if (state.tab === "rounds") loadCompared([state.cmpA, state.cmpB]);
  if (state.tab === "improving") loadCompared(latestPair(state.rounds).map((r) => r?.id));
}

// Fetches a compared round once, then redraws. The open round stays fresh through polling.
async function loadCompared(ids) {
  const missing = ids.filter((id) => id && !state.cache[id]);
  if (!missing.length) return;
  await Promise.all(missing.map(loadRound));
  drawView();
}

function drawDrawer() {
  const seat = state.seat && state.data.seats.find((s) => s.key === state.seat);
  const el = $("drawer");
  el.hidden = !seat;
  $("scrim").hidden = !seat;
  if (seat) setHtml(el, drawerView(seat, state.data, state.open));
}

function drawAll() {
  hideTip();
  drawHeader();
  drawFilters();
  drawView();
  drawDrawer();
}

// One floating tooltip, so it never clips inside scrolling tables or cards.
function showTip(el) {
  const box = $("tip");
  box.textContent = el.dataset.tip;
  box.hidden = false;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - b.width / 2, innerWidth - b.width - 8))}px`;
  box.style.top = `${r.top - b.height - 6 < 4 ? r.bottom + 6 : r.top - b.height - 6}px`;
}
function hideTip() {
  $("tip").hidden = true;
}
const tipTarget = (e) => e.target.closest?.("[data-tip]");
document.addEventListener("mouseover", (e) => (tipTarget(e)?.dataset.tip ? showTip(tipTarget(e)) : hideTip()));
document.addEventListener("focusin", (e) => tipTarget(e)?.dataset.tip && showTip(tipTarget(e)));
document.addEventListener("focusout", hideTip);
document.addEventListener("scroll", hideTip, true);

async function openRound(id) {
  if (!state.rounds.some((r) => r.id === id)) return;
  state.roundId = id;
  state.seat = null;
  state.raw = "";
  history.replaceState(null, "", `?round=${encodeURIComponent(id)}`);
  state.data = state.cache[id] || (await loadRound(id));
  drawAll();
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-toggle],[data-open],[data-close],[data-nature],[data-clear],[data-round],#filter-toggle");
  if (!t) {
    // Touch screens have no hover: a tap shows the tooltip.
    if (tipTarget(e)?.dataset.tip) showTip(tipTarget(e));
    return;
  }
  if (t.dataset.round) return openRound(t.dataset.round);
  if (t.dataset.tab) {
    state.tab = t.dataset.tab;
    // A compared round may have moved on since it was fetched.
    if (state.tab === "rounds") state.cache = { [state.roundId]: state.data };
  }
  if (t.dataset.toggle !== undefined) state.open.has(t.dataset.toggle) ? state.open.delete(t.dataset.toggle) : state.open.add(t.dataset.toggle);
  if (t.dataset.open) state.seat = t.dataset.open;
  if ("close" in t.dataset) state.seat = null;
  if (t.id === "filter-toggle") state.filtersOpen = !state.filtersOpen;
  if (t.dataset.nature) {
    state.off.has(t.dataset.nature) ? state.off.delete(t.dataset.nature) : state.off.add(t.dataset.nature);
    t.setAttribute("aria-pressed", !state.off.has(t.dataset.nature));
  }
  if ("clear" in t.dataset) {
    state.off.clear();
    Object.assign(state, { persona: "", engine: "", q: "" });
    drawFilters(true);
  }
  hideTip();
  drawHeader();
  drawView();
  drawDrawer();
});
document.addEventListener("input", (e) => {
  if (e.target.id === "round-pick") return openRound(e.target.value);
  if (e.target.id === "search") state.q = e.target.value;
  if (e.target.id === "persona") state.persona = e.target.value;
  if (e.target.id === "engine") state.engine = e.target.value;
  if (e.target.id === "cmp-a") state.cmpA = e.target.value;
  if (e.target.id === "cmp-b") state.cmpB = e.target.value;
  drawHeader();
  drawView();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.seat) {
    state.seat = null;
    drawDrawer();
  }
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "/") {
    e.preventDefault();
    state.filtersOpen = true;
    drawHeader();
    $("search")?.focus();
  }
  const tab = tabsNow()[Number(e.key) - 1];
  if (tab && state.data) {
    state.tab = tab[0];
    drawHeader();
    drawView();
  }
});

// The chosen theme is a per-viewer convenience: the page still works if storage is blocked.
const remember = {
  get: () => { try { return localStorage.getItem("council-theme"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem("council-theme", v); } catch { /* not saved */ } },
};
if (remember.get()) document.documentElement.dataset.theme = remember.get();
$("theme").innerHTML = UI.theme;
$("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  remember.set(root.dataset.theme);
});

// Opens the round named in the link, else the newest numbered one, compared with the one before it.
function chooseRounds(rounds) {
  state.rounds = rounds;
  if (state.roundId) return;
  if (numberedRounds(rounds).length) state.tab = "improving";
  const asked = new URLSearchParams(location.search).get("round");
  const numbered = rounds.filter((r) => r.round !== null);
  const latest = numbered.at(-1) || rounds.at(-1);
  state.roundId = rounds.some((r) => r.id === asked) ? asked : latest?.id ?? null;
  const open = rounds.findIndex((r) => r.id === state.roundId);
  const earlier = rounds.slice(0, open).reverse().find((r) => r.round !== null) || rounds.find((r) => r.id !== state.roundId);
  state.cmpB = state.roundId;
  state.cmpA = earlier?.id ?? state.roundId;
}

async function poll() {
  try {
    if (state.tick++ % 4 === 0 || !state.roundId) chooseRounds(await (await fetch("api/rounds", { cache: "no-store" })).json());
    if (!state.roundId) {
      $("view").innerHTML = empty("No rounds found in this folder yet.");
      return;
    }
    const raw = await (await fetch(`api/run?round=${encodeURIComponent(state.roundId)}`, { cache: "no-store" })).text();
    if (raw !== state.raw) {
      state.raw = raw;
      state.data = parsedRun(JSON.parse(raw));
      state.cache[state.roundId] = state.data;
      drawAll();
    }
    // The other compared round can gain an LLM while this one is open.
    if (state.tab === "improving" && state.tick % 4 === 1) {
      const others = latestPair(state.rounds).map((r) => r?.id).filter((id) => id && id !== state.roundId);
      await Promise.all(others.map(loadRound));
      if (others.length) drawView();
    }
    $("offline").hidden = true;
  } catch {
    $("offline").hidden = false;
  }
}

// A static export carries its data; a served page polls for it.
if (STATIC) {
  chooseRounds(STATIC.rounds);
  if (state.roundId) loadRound(state.roundId).then((data) => {
    state.data = data;
    drawAll();
  });
} else {
  poll();
  setInterval(poll, 1500);
}
