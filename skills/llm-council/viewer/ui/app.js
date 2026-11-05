// Holds the state, keeps the compared rounds fresh, and redraws only what changed.
const SECTIONS = [
  ["live", "Live", liveView],
  ["room", "Room", roomView],
  ["ideas", "Ideas", ideasView],
  ["scores", "Scores", scoresView],
  ["llms", "LLMs", llmsView],
  ["findings", "All findings", findingsView],
  ["rounds", "Rounds", (seats, data) => roundsView(state, keep)],
];
const state = {
  screen: "focus", section: "live", open: new Set(), panel: null, q: "", searching: false, filtering: false,
  nature: "", persona: "", engine: "", rounds: [], roundId: null, cmpA: null, cmpB: null, pinned: false, cache: {}, raws: {}, tick: 0,
};
const STATIC = window.__COUNCIL__ || null;
const $ = (id) => document.getElementById(id);

// Touches the page only when the markup changed, so polling never moves focus or resets reading.
function setHtml(el, html) {
  const mark = hash(html);
  if (el.dataset.drawn !== String(mark)) {
    el.dataset.drawn = mark;
    el.innerHTML = html;
  }
}
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

function store(id, raw) {
  if (state.raws[id] === raw) return false;
  state.raws[id] = raw;
  const data = JSON.parse(raw);
  for (const s of data.seats) s.parsed = s.text ? parseAnswer(s.text) : null;
  state.cache[id] = data;
  return true;
}

async function loadRound(id) {
  if (STATIC) return store(id, JSON.stringify(STATIC.runs[id]));
  return store(id, await (await fetch(`api/run?round=${encodeURIComponent(id)}`, { cache: "no-store" })).text());
}

const keep = (s) => (!state.nature || s.nature === state.nature) && (!state.persona || s.persona === state.persona) && (!state.engine || s.engine === state.engine);

function filtered(data) {
  const q = state.q.toLowerCase();
  return data.seats.filter((s) => keep(s) && (!q || `${s.name} ${s.persona} ${s.nature} ${s.text}`.toLowerCase().includes(q)));
}

function drawTop() {
  const inDetails = state.screen === "details";
  setHtml($("top-left"), inDetails ? `<button class="link" type="button" data-screen="focus">Back to the comparison</button>` : "");
  $("details-link").hidden = inDetails;
  $("searchbar").hidden = !state.searching;
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("theme").textContent = dark ? "Light" : "Dark";
}

function drawFilters(data) {
  const natures = orderNatures([...new Set(data.seats.map((s) => s.nature))], data);
  const personas = [...new Set(data.seats.map((s) => s.persona))];
  const opts = (list, all, current, show = plain) => `<option value="">${all}</option>` + list.map((v) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(show(v))}</option>`).join("");
  const round = state.rounds.length > 1 ? `<select id="round-pick" aria-label="Round to read">${state.rounds.map((r) => `<option value="${esc(r.id)}"${r.id === state.roundId ? " selected" : ""}>${esc(roundLabel(r))}</option>`).join("")}</select>` : "";
  const active = [state.nature, state.persona, state.engine].filter(Boolean).length;
  const more = state.filtering || active ? `<select id="nature" aria-label="Nature">${opts(natures, "All natures", state.nature)}</select><select id="persona" aria-label="Persona">${opts(personas, "All personas", state.persona)}</select>${data.engines.length > 1 ? `<select id="engine" aria-label="LLM">${opts(data.engines, "All LLMs", state.engine, (e) => llmName(e, data))}</select>` : ""}` : `<button class="link" type="button" data-filter>Filter</button>`;
  return `<div class="filters">${round}${more}</div>`;
}

function drawView() {
  if (state.screen === "focus") return setHtml($("view"), focusView(state));
  const data = state.cache[state.roundId];
  if (!data) return setHtml($("view"), empty("Loading…"));
  const nav = SECTIONS.map(([id, name]) => `<button class="tab" type="button" data-section="${id}" aria-current="${state.section === id}">${name}</button>`).join("");
  const section = SECTIONS.find(([id]) => id === state.section);
  setHtml($("view"), `<nav class="tabs" aria-label="Details">${nav}</nav>${state.section === "rounds" ? "" : drawFilters(data)}${section[2](filtered(data), data, state.open)}`);
  if (state.section === "rounds") loadCompared();
}

async function loadCompared() {
  const missing = [state.cmpA, state.cmpB].filter((id) => id && !state.cache[id]);
  if (!missing.length) return;
  await Promise.all(missing.map(loadRound));
  drawView();
}

function drawPanel() {
  const el = $("panel");
  let html = "";
  if (state.panel?.problem) html = problemPanel(state, ...state.panel.problem);
  if (state.panel?.seat) {
    const data = state.cache[state.roundId];
    const seat = data?.seats.find((s) => s.key === state.panel.seat);
    if (seat) html = seatPanel(seat, data, state.open);
  }
  el.hidden = !html;
  $("scrim").hidden = !html;
  if (html) setHtml(el, html);
}

function drawAll() {
  drawTop();
  drawView();
  drawPanel();
}

function closePanel() {
  state.panel = null;
  drawPanel();
  $("view").querySelector("button:focus-visible")?.focus();
}

function openDetails(section) {
  state.screen = "details";
  if (section) state.section = section;
  scrollTo(0, 0);
  drawAll();
}

function moveInList(step) {
  const items = [...$("view").querySelectorAll(".problem, .rows .plain-btn")];
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  items[Math.max(0, Math.min(items.length - 1, at + step))].focus();
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-screen],[data-section],[data-details],[data-problem],[data-toggle],[data-open],[data-close],[data-round],[data-filter],#search-link,#theme,#details-link");
  if (!t) return;
  if ("filter" in t.dataset) state.filtering = true;
  if (t.id === "theme") return toggleTheme();
  if (t.id === "search-link") return openSearch();
  if (t.id === "details-link") return openDetails();
  if (t.dataset.screen) { state.screen = t.dataset.screen; scrollTo(0, 0); }
  if (t.dataset.details) return openDetails(t.dataset.details);
  if (t.dataset.section) state.section = t.dataset.section;
  if (t.dataset.problem) { const [status, i] = t.dataset.problem.split(":"); state.panel = { problem: [status, Number(i)] }; }
  if (t.dataset.toggle !== undefined) state.open.has(t.dataset.toggle) ? state.open.delete(t.dataset.toggle) : state.open.add(t.dataset.toggle);
  if (t.dataset.open) state.panel = { seat: t.dataset.open };
  if ("close" in t.dataset) return closePanel();
  if (t.dataset.round) return openRound(t.dataset.round);
  drawAll();
});

document.addEventListener("input", (e) => {
  const { id, value } = e.target;
  if (id === "search") state.q = value;
  if (id === "nature" || id === "persona" || id === "engine") state[id] = value;
  if (id === "round-pick") return openRound(value);
  if (id === "cmp-a" || id === "cmp-b") {
    state[id === "cmp-a" ? "cmpA" : "cmpB"] = value;
    state.pinned = true;
  }
  drawView();
});

function openSearch() {
  state.searching = true;
  drawTop();
  $("search").focus();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.panel) return closePanel();
    if (state.searching) {
      state.searching = false;
      state.q = "";
      $("search").value = "";
      return drawAll();
    }
    if (state.screen === "details") { state.screen = "focus"; return drawAll(); }
  }
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); openSearch(); }
  if (e.key === "d") state.screen === "focus" ? openDetails() : ((state.screen = "focus"), drawAll());
  if (e.key === "j") moveInList(1);
  if (e.key === "k") moveInList(-1);
});

// The chosen theme is a per-viewer convenience: the page still works if storage is blocked.
const remember = {
  get: () => { try { return localStorage.getItem("council-theme"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem("council-theme", v); } catch { /* not saved */ } },
};
function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  remember.set(root.dataset.theme);
  drawTop();
}
if (remember.get()) document.documentElement.dataset.theme = remember.get();

async function openRound(id) {
  if (!state.rounds.some((r) => r.id === id)) return;
  state.roundId = id;
  state.panel = null;
  history.replaceState(null, "", `?round=${encodeURIComponent(id)}`);
  if (!state.cache[id]) await loadRound(id);
  drawAll();
}

// The latest numbered round against the one before it, unless the reader picked otherwise.
function chooseRounds(rounds) {
  state.rounds = rounds;
  if (state.pinned) return;
  const numbered = rounds.filter((r) => r.round !== null && r.kind !== "pilot");
  const asked = new URLSearchParams(location.search).get("round");
  const latest = numbered.at(-1) || rounds.at(-1);
  state.cmpB = latest?.id ?? null;
  state.cmpA = numbered.length > 1 ? numbered.at(-2).id : null;
  if (!state.roundId || !rounds.some((r) => r.id === state.roundId)) state.roundId = rounds.some((r) => r.id === asked) ? asked : state.cmpB;
}

async function poll() {
  try {
    if (state.tick++ % 4 === 0 || !state.rounds.length) chooseRounds(await (await fetch("api/rounds", { cache: "no-store" })).json());
    if (!state.cmpB) return setHtml($("view"), empty("No rounds found in this folder yet."));
    // The newest round changes while it runs. Older ones can gain an LLM, so they refresh less often.
    const always = [state.cmpB, state.roundId];
    const ids = new Set(state.tick % 4 === 1 ? [...always, state.cmpA] : always);
    const changed = await Promise.all([...ids].filter(Boolean).map(loadRound));
    if (state.cmpA && !state.cache[state.cmpA]) changed.push(await loadRound(state.cmpA));
    if (changed.some(Boolean)) drawAll();
    $("offline").hidden = true;
  } catch {
    $("offline").hidden = false;
  }
}

drawTop();
// A static export carries its data; a served page polls for it.
if (STATIC) {
  chooseRounds(STATIC.rounds);
  Promise.all(STATIC.rounds.map((r) => loadRound(r.id))).then(drawAll);
} else {
  poll();
  setInterval(poll, 1500);
}
