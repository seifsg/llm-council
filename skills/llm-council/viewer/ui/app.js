// Holds the state, polls the run while it is live, and redraws only what changed.
const TABS = [
  ["issues", "Common issues", (seats, d) => issuesView(seats, d, state.open)],
  ["feed", "Live thoughts", feedView],
  ["ideas", "Ideas and questions", ideasView],
  ["room", "The room", roomView],
  ["scores", "Scores", scoresView],
];
const state = { tab: "issues", data: null, raw: "", open: new Set(), seat: null, off: new Set(), persona: "", engine: "", q: "", optionsKey: "" };
const $ = (id) => document.getElementById(id);

function ingest(data) {
  for (const s of data.seats) s.parsed = s.text ? parseAnswer(s.text) : null;
  state.data = data;
}

function filtered() {
  const q = state.q.toLowerCase();
  return state.data.seats.filter((s) =>
    !state.off.has(s.nature) &&
    (!state.persona || s.persona === state.persona) &&
    (!state.engine || s.engine === state.engine) &&
    (!q || `${s.name} ${s.persona} ${s.nature} ${s.text}`.toLowerCase().includes(q)));
}

function drawHeader() {
  const { data } = state;
  $("title").textContent = data.title;
  document.title = `${data.title} · Council Viewer`;
  $("decision").textContent = data.decision;
  const total = data.seats.length || 1;
  const n = (st) => data.seats.filter((s) => s.status === st).length;
  const [done, thinking, failed] = [n("done"), n("thinking"), n("failed")];
  $("progress").className = "progress";
  $("progress").innerHTML = `<span>${done} of ${data.seats.length} done</span>
    ${thinking ? `<span><span class="pulse"></span>${thinking} writing now</span>` : ""}${failed ? `<span>${failed} failed</span>` : ""}
    <span class="bar" role="img" aria-label="${done} done, ${thinking} writing"><i class="done" style="width:${(done / total) * 100}%"></i><i class="thinking" style="width:${(thinking / total) * 100}%"></i></span>`;
  $("tabs").innerHTML = TABS.map(([id, name]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${name}</button>`).join("");
}

// Rebuilt only when the options change, so typing in the search box keeps its focus.
function drawFilters() {
  const { data } = state;
  const natures = orderNatures([...new Set(data.seats.map((s) => s.nature))], data);
  const personas = [...new Set(data.seats.map((s) => s.persona))];
  const key = JSON.stringify([natures, personas, data.engines]);
  if (key === state.optionsKey) return;
  state.optionsKey = key;
  const opts = (list, all, current) => `<option value="">${all}</option>` + list.map((v) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${label(v)}</option>`).join("");
  $("filters").innerHTML = natures.map((n) => `<button class="chip" type="button" data-nature="${esc(n)}" aria-pressed="${!state.off.has(n)}" style="${hue(n)}"><span class="dot"></span>${icon(n)} ${label(n)}</button>`).join("") +
    `<select id="persona" aria-label="Persona">${opts(personas, "All personas", state.persona)}</select>` +
    (data.engines.length > 1 ? `<select id="engine" aria-label="Engine">${opts(data.engines, "Both engines", state.engine)}</select>` : "") +
    `<input id="search" type="search" placeholder="Search every answer" aria-label="Search every answer" value="${esc(state.q)}">`;
}

function drawView() {
  const tab = TABS.find(([id]) => id === state.tab);
  $("view").innerHTML = tab[2](filtered(), state.data);
}

function drawDrawer() {
  const seat = state.seat && state.data.seats.find((s) => s.key === state.seat);
  const el = $("drawer");
  el.hidden = !seat;
  if (seat) {
    const top = el.scrollTop;
    el.innerHTML = drawerView(seat, state.data);
    el.scrollTop = top;
  }
}

function drawAll() {
  drawHeader();
  drawFilters();
  drawView();
  drawDrawer();
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-toggle],[data-open],[data-close],[data-nature]");
  if (!t) return;
  if (t.dataset.tab) state.tab = t.dataset.tab;
  if (t.dataset.toggle !== undefined) state.open.has(t.dataset.toggle) ? state.open.delete(t.dataset.toggle) : state.open.add(t.dataset.toggle);
  if (t.dataset.open) state.seat = t.dataset.open;
  if ("close" in t.dataset) state.seat = null;
  if (t.dataset.nature) {
    state.off.has(t.dataset.nature) ? state.off.delete(t.dataset.nature) : state.off.add(t.dataset.nature);
    t.setAttribute("aria-pressed", !state.off.has(t.dataset.nature));
  }
  drawHeader();
  drawView();
  drawDrawer();
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") state.q = e.target.value;
  if (e.target.id === "persona") state.persona = e.target.value;
  if (e.target.id === "engine") state.engine = e.target.value;
  drawView();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.seat) { state.seat = null; drawDrawer(); }
});
$("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
});

async function poll() {
  try {
    const raw = await (await fetch("api/run", { cache: "no-store" })).text();
    if (raw !== state.raw) {
      state.raw = raw;
      ingest(JSON.parse(raw));
      drawAll();
    }
  } catch (err) {
    $("decision").textContent = "Lost the connection to the viewer server. Retrying.";
  }
}

// A static export carries its data; a served page polls for it.
if (window.__COUNCIL__) {
  ingest(window.__COUNCIL__);
  drawAll();
} else {
  poll();
  setInterval(poll, 1500);
}
