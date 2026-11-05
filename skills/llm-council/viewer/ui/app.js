// Holds the state, polls the run while it is live, and redraws only what changed.
const TABS = [
  ["issues", "Common issues", issuesView],
  ["feed", "Live", feedView],
  ["compare", "LLMs", compareView],
  ["ideas", "Ideas", ideasView],
  ["room", "Room", roomView],
  ["scores", "Scores", scoresView],
];
const state = { tab: "issues", data: null, raw: "", open: new Set(), seat: null, off: new Set(), persona: "", engine: "", q: "", optionsKey: "", filtersOpen: false };
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

const activeFilters = () => state.off.size + (state.persona ? 1 : 0) + (state.engine ? 1 : 0) + (state.q ? 1 : 0);

function drawHeader() {
  const { data } = state;
  $("title").textContent = data.title;
  document.title = `${data.title} · Council Viewer`;
  $("decision").textContent = data.decision;
  $("decision").dataset.tip = data.decision;
  const total = data.seats.length || 1;
  const n = (st) => data.seats.filter((s) => s.status === st).length;
  const [done, thinking, failed] = [n("done"), n("thinking"), n("failed")];
  $("progress").innerHTML = `<i class="done" style="width:${(done / total) * 100}%"></i><i class="thinking" style="width:${(thinking / total) * 100}%"></i>`;
  $("progress").setAttribute("aria-label", `${done} of ${data.seats.length} done, ${thinking} writing`);
  $("counts").innerHTML = `${thinking ? `<span class="pulse"></span>` : ""}${done}/${data.seats.length}${failed ? ` <span ${tip(`${failed} failed`)}>⚠ ${failed}</span>` : ""}`;
  $("counts").dataset.tip = `${done} of ${data.seats.length} done, ${thinking} writing now, ${data.seats.length - done - thinking - failed} waiting, ${failed} failed`;
  $("llms").innerHTML = llmStrip(data);
  const issueCount = groupIssues(filtered()).length;
  $("tabs").innerHTML = TABS.map(([id, name]) => {
    const badge = id === "issues" && issueCount ? ` <span class="count">${issueCount}</span>` : id === "feed" && thinking ? ` <span class="pulse"></span>` : "";
    return `<button type="button" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${name}${badge}</button>`;
  }).join("");
  const active = activeFilters();
  $("filter-toggle").innerHTML = `Filter${active ? ` <span class="count-on">${active}</span>` : ""}`;
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
  $("filters").innerHTML = natures.map((n) => `<button class="chip" type="button" data-nature="${esc(n)}" aria-pressed="${!state.off.has(n)}" style="${hue(n)}">${icon(n)} ${label(n)}</button>`).join("") +
    `<select id="persona" aria-label="Persona">${opts(personas, "All personas", state.persona)}</select>` +
    (data.engines.length > 1 ? `<select id="engine" aria-label="LLM">${opts(data.engines, "All LLMs", state.engine, (e) => llmInfo(e, data).name)}</select>` : "") +
    `<input id="search" type="search" placeholder="Search every answer ( / )" aria-label="Search every answer" value="${esc(state.q)}">` +
    `<button class="ghost" type="button" data-clear>Clear</button>`;
}

function drawView() {
  $("view").innerHTML = TABS.find(([id]) => id === state.tab)[2](filtered(), state.data, state.open);
}

function drawDrawer() {
  const seat = state.seat && state.data.seats.find((s) => s.key === state.seat);
  const el = $("drawer");
  el.hidden = !seat;
  if (seat) {
    const top = el.scrollTop;
    el.innerHTML = drawerView(seat, state.data, state.open);
    el.scrollTop = top;
  }
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

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-toggle],[data-open],[data-close],[data-nature],[data-clear],#filter-toggle");
  if (!t) {
    // Touch screens have no hover: a tap shows the tooltip.
    if (tipTarget(e)?.dataset.tip) showTip(tipTarget(e));
    return;
  }
  if (t.dataset.tab) state.tab = t.dataset.tab;
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
  if (e.target.id === "search") state.q = e.target.value;
  if (e.target.id === "persona") state.persona = e.target.value;
  if (e.target.id === "engine") state.engine = e.target.value;
  drawHeader();
  drawView();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.seat) {
    state.seat = null;
    drawDrawer();
  }
  if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
    e.preventDefault();
    state.filtersOpen = true;
    drawHeader();
    $("search")?.focus();
  }
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
    $("offline").hidden = true;
  } catch {
    $("offline").hidden = false;
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
