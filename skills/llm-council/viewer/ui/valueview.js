// The Value tab: the value equation per seat, and as medians per offer and persona, one nature at a time.
const FACTOR_WORDS = {
  dream_outcome: ["Dream", "How much they want the result. Higher is better.", "believer"],
  likelihood: ["Likelihood", "How sure they are to get it. Higher is better.", "neutral"],
  time_delay: ["Time", "How long until the result. Lower is better.", "confused"],
  effort: ["Effort", "Work, hassle and sacrifice on them. Lower is better.", "contrarian"],
};
const VALUE_NOTE = "Stated by simulated people. Compare between drafts, never as a forecast of revenue or churn.";
const shown = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(2))) : "·");
const percent = (n) => (Number.isFinite(n) ? `${shown(n)}%` : "·");
const moneyText = ({ amount, cadence }) => `$${Number(amount.toFixed(2)).toLocaleString("en-US")}${cadence ? ` ${cadence}` : ""}`;
const pricesText = (list) => list.map(moneyText).join(" · ") || "·";
const scoreCell = (v, unit = "") => `<td class="num">${v === null ? `<span class="quiet">none</span>` : Number.isFinite(v) ? `${shown(v)}${unit}` : `<span class="quiet">·</span>`}</td>`;
const factorChip = (f, text = FACTOR_WORDS[f][0], weak = false) => `<span class="eq-f${weak ? " weak" : ""}" style="--c:var(--${FACTOR_WORDS[f][2]})" ${tip(`${FACTOR_WORDS[f][0]}: ${FACTOR_WORDS[f][1]}`)}>${esc(text)}</span>`;
const heldBackCell = (weak) => `<td>${weak.length ? weak.map((f) => factorChip(f)).join(" ") : `<span class="quiet">·</span>`}</td>`;
const offerName = (key, data) => data.meta?.offers?.find((o) => o.key === key)?.name || (key === "none" ? "No pick" : key === "all" ? "All offers" : plain(key));

// (dream x likelihood) / (time x effort), the factor holding this buyer back marked.
function equation(scores, weak = heldBackBy(scores)) {
  const part = (f) => factorChip(f, shown(scores[f]), weak.includes(f));
  return `<span class="eq">(${part("dream_outcome")} × ${part("likelihood")}) / (${part("time_delay")} × ${part("effort")})</span>`;
}

function statTiles(stats, nature) {
  const s = stats.scores;
  const held = stats.weak.map((f) => FACTOR_WORDS[f][0]).join(", ") || "·";
  return `<div class="tiles hued" style="${hue(nature)}">
    ${tile("Value", shown(s.value), "flat", "Median, 0.01 to 100")}
    ${tile("Held back most by", held, "flat", "Furthest from its best score")}
    ${tile("Buy chance", percent(s.buy_chance), "flat", "Would pay within 30 days")}
    ${tile("No-brainer price", pricesText(stats.noBrainer), "flat", "Pay without thinking")}
    ${tile("Too expensive", pricesText(stats.tooMuch), "flat", "Where they say no")}
    ${tile("Churn, month 1", percent(s.churn_month1), "flat", "Monthly offers only")}
    ${tile("Stays 12 months", percent(s.stay_12_months), "flat", "Monthly offers only")}
    ${tile("Hard to leave", shown(s.hard_to_leave), "flat", "Out of 10")}
  </div>`;
}

const GROUP_HEADS = ["People", "Value", "Dream", "Likelihood", "Time", "Effort", "Held back by", "Buy", "No-brainer", "Too expensive", "Churn", "Stays 12", "Hard to leave"];

function groupTable(title, groups, nameOf) {
  const rows = [...groups].map(([key, seats]) => ({ key, stats: groupStats(seats) })).sort((a, b) => (b.stats.scores.value ?? -1) - (a.stats.scores.value ?? -1));
  const body = rows.map(({ key, stats: { n, scores: s, weak, noBrainer, tooMuch } }) => `<tr><td><b>${esc(nameOf(key))}</b></td><td class="num">${n}</td>
    ${scoreCell(s.value)}${VALUE_FACTORS.map((f) => scoreCell(s[f])).join("")}${heldBackCell(weak)}${scoreCell(s.buy_chance, "%")}
    <td>${esc(pricesText(noBrainer))}</td><td>${esc(pricesText(tooMuch))}</td>${scoreCell(s.churn_month1, "%")}${scoreCell(s.stay_12_months, "%")}${scoreCell(s.hard_to_leave)}</tr>`).join("");
  return `<h3 class="sub-head">${esc(title)}</h3><div class="table-wrap"><table><thead><tr><th scope="col">${esc(plain(title.split(" ").at(-1)))}</th>${GROUP_HEADS.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function seatTable(seats, data) {
  const body = [...seats].sort((a, b) => (b.parsed.scores.value ?? -1) - (a.parsed.scores.value ?? -1)).map((s) => {
    const p = s.parsed;
    const price = (f) => `<td>${esc(p.prices[f]?.raw || "·")}</td>`;
    return `<tr><td><button type="button" data-open="${esc(s.key)}" ${tip(whoPlain(s))}>${esc(s.name || plain(s.persona))}</button> ${engineMark(s, data)}</td><td>${esc(p.firstPick || "·")}</td>
      ${scoreCell(p.scores.value)}<td>${equation(p.scores)}</td>${heldBackCell(heldBackBy(p.scores))}${["real_problem", "pain", "solves_it"].map((f) => scoreCell(p.scores[f])).join("")}${scoreCell(p.scores.buy_chance, "%")}
      ${price("no_brainer_price")}${price("too_expensive_price")}${scoreCell(p.scores.churn_month1, "%")}${scoreCell(p.scores.stay_12_months, "%")}${scoreCell(p.scores.hard_to_leave)}</tr>`;
  }).join("");
  const heads = ["Person", "Pick", "Value", "Equation", "Held back by", "Real problem", "Pain", "Solves it", "Buy", "No-brainer", "Too expensive", "Churn", "Stays 12", "Hard to leave"];
  return `<h3 class="sub-head">Each person</h3><div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function valueBlock(own, data, nature) {
  const seats = own.filter(isAnswered);
  if (!hasBuyerScores({ seats })) return "";
  return statTiles(groupStats(seats), nature)
    + groupTable("By offer", groupBy(seats, (s) => s.parsed.firstPick || "none"), (key) => offerName(key, data))
    + groupTable("By persona", groupBy(seats, (s) => s.persona), plain)
    + seatTable(seats, data);
}

function valueView(seats, data, open) {
  const blocks = natureBlocks(seats, data, open, "value", (own, nature) => valueBlock(own, data, nature));
  if (!blocks) return empty("Value appears as seats finish.");
  const chip = (f) => factorChip(f);
  return `<section class="formula"><b>Value</b> = (${chip("dream_outcome")} × ${chip("likelihood")}) / (${chip("time_delay")} × ${chip("effort")}) ${info(`Medians, since the ratio is skewed. Each buyer's scores are about their first pick. ${VALUE_NOTE}`)}</section>${blocks}`;
}
