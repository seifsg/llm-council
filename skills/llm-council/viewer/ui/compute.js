// Answers one question from two rounds: did this improve? No markup here.
// Only the same person, on the same LLM, with the same prompt and persona, is ever compared.
const SMALL_SAMPLE = 10;
const TOO_FEW = 4;
const REAL_CHANGE = 0.5;
const LEAN = { act: 3, talk: 2, think: 1, no: 0 };
const TIER_ORDER = { A: 0, B: 1, C: 2 };

const hasAnswers = (R, engine) => R.seats.some((s) => s.engine === engine && s.status === "done");
const llmName = (engine, R) => R.llms?.[engine]?.name || plain(engine);
const scored = (s) => s?.status === "done" && Number.isFinite(s.parsed?.scores.overall);
const mean = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1);

function comparability(A, B) {
  const [a, b] = [A.meta.hashes, B.meta.hashes];
  const promptSame = Boolean(a?.prompt && a.prompt === b?.prompt);
  const effortSame = !A.meta.effort || !B.meta.effort || A.meta.effort === B.meta.effort;
  const lifeSame = (persona) => (a?.lives?.[persona] ?? "") === (b?.lives?.[persona] ?? "");
  const reason = !a || !b ? "One round has no fingerprint" : !promptSame ? "The seat prompt changed" : !effortSame ? "The effort changed" : "";
  return { reason, allows: (persona) => !reason && lifeSame(persona) };
}

function pairUp(A, B, keep) {
  const before = new Map(A.seats.map((s) => [s.key, s]));
  const check = comparability(A, B);
  const all = B.seats.filter((s) => s.nature === "neutral" && scored(s) && keep(s)).map((b) => ({ b, a: before.get(b.key) })).filter(({ a }) => scored(a));
  return { check, same: all.filter(({ b }) => check.allows(b.persona)), blocked: all.filter(({ b }) => !check.allows(b.persona)) };
}

// Both sides of each matched answer that has this number. "none" and missing drop out.
const bothSides = (pairs, read) => pairs.map(({ a, b }) => [read(a), read(b)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

function spreadOf(deltas) {
  const average = mean(deltas);
  return { average, spread: Math.sqrt(mean(deltas.map((d) => (d - average) ** 2)) / deltas.length), n: deltas.length };
}

function change(pairs, field) {
  const deltas = bothSides(pairs, (s) => s.parsed.scores[field]).map(([x, y]) => y - x);
  return deltas.length ? spreadOf(deltas) : null;
}

// up: which way is good for the seller. real: the smallest move that can count, on this number's own scale.
const BUYER_MOVES = [
  { field: "value", name: "Value", up: 1, real: 0.5 },
  { field: "buy_chance", name: "Buy chance", up: 1, real: 5, unit: "%" },
  { field: "churn_month1", name: "Churn, month 1", up: -1, real: 5, unit: "%" },
  { field: "stay_12_months", name: "Stays 12 months", up: 1, real: 5, unit: "%" },
  { field: "hard_to_leave", name: "Hard to leave", up: 1, real: 0.5 },
];
const PRICE_MOVES = [["no_brainer_price", "No-brainer price"], ["too_expensive_price", "Too expensive"]];
const PRICE_REAL_SHARE = 0.1;

// Medians of the same matched answers, with the same test as the headline: a real move the spread cannot explain.
function moveOf(pairs, read, look) {
  const both = bothSides(pairs, read);
  if (!both.length) return null;
  const [before, after] = [0, 1].map((side) => median(both.map((pair) => pair[side])));
  const move = after - before;
  const { average, spread } = spreadOf(both.map(([x, y]) => y - x));
  const need = look.real ?? before * PRICE_REAL_SHARE;
  const call = both.length < TOO_FEW ? "few" : Math.abs(move) < need || average * move <= 0 || Math.abs(average) < 1.96 * spread ? "same" : move * look.up > 0 ? "better" : "worse";
  return { ...look, before, after, move, n: both.length, call };
}

// Prices move only within one cadence: monthly never compares with one-off.
function priceMoves(pairs) {
  return PRICE_MOVES.flatMap(([field, name]) => ["monthly", "once"].map((cadence) => {
    const read = (s) => (s.parsed.prices[field]?.cadence === cadence ? s.parsed.prices[field].amount : NaN);
    return moveOf(pairs, read, { name: `${name}, ${cadence}`, up: 1, unit: "$" });
  })).filter(Boolean);
}

// Compared only when both rounds carry these numbers and the fingerprints match. Otherwise says why not.
function buyerCompare(A, B, check, same) {
  const lacking = [A, B].filter((R) => !hasBuyerScores(R));
  if (lacking.length) return { moves: [], lacking };
  if (check.reason) return { moves: [], reason: check.reason };
  const moves = [...BUYER_MOVES.map((m) => moveOf(same, (s) => s.parsed.scores[m.field], m)).filter(Boolean), ...priceMoves(same)];
  return { moves, unmatched: !moves.length };
}

function leanings(pairs, A, B) {
  const offers = (R) => new Set(R.meta.offers.map((o) => o.key));
  const [inA, inB] = [offers(A), offers(B)];
  let toward = 0, away = 0, held = 0;
  for (const { a, b } of pairs) {
    for (const key of Object.keys(b.parsed.decisions)) {
      const [was, now] = [a.parsed.decisions[key], b.parsed.decisions[key]];
      if (!was || !now || (inA.size && !inA.has(key)) || (inB.size && !inB.has(key))) continue;
      if (LEAN[now] > LEAN[was]) toward++;
      else if (LEAN[now] < LEAN[was]) away++;
      else held++;
    }
  }
  return { toward, away, held };
}

// Better or worse needs a move of at least half a point that the spread of the answers cannot explain.
function verdictFrom(overall) {
  if (!overall) return "waiting";
  if (overall.n < TOO_FEW) return "few";
  if (Math.abs(overall.average) < REAL_CHANGE || Math.abs(overall.average) < 1.96 * overall.spread) return "same";
  return overall.average > 0 ? "better" : "worse";
}

function rankProblems(list) {
  const weight = (i) => (i.real === "confirmed" ? -1 : i.real === "contradicted" ? 9 : 0) * 10 + (TIER_ORDER[i.tier] ?? (i.topP ? Number(i.topP[1]) - 1 : 3));
  return [...list].sort((x, y) => weight(x) - weight(y) || (y.seats?.length || 0) - (x.seats?.length || 0));
}

// The ranked list when the round has one. Until then, findings grouped by wording, marked as rough.
function problemsOf(R, engines) {
  if (Array.isArray(R.issues) && R.issues.length) return { list: R.issues, ranked: true };
  const seats = R.seats.filter((s) => s.parsed && (!engines || engines.includes(s.engine)));
  const groups = groupIssues(seats).filter((g) => g.people > 1).map((g) => ({ ...g, seats: [...new Set(g.voices.map((v) => v.seat.id))], offer: g.offers[0], type: g.types[0] }));
  return { list: groups, ranked: false };
}

// Problems link across rounds only by the ranker's key and status. Word similarity cannot carry a claim like fixed.
const STATUSES = new Set(["fixed", "reduced", "open", "worse", "new"]);
const TOP_COUNT = 20;

function linkProblems(A, B) {
  const [a, b] = [A.issues, B.issues];
  if (!Array.isArray(a) || !a.length || !Array.isArray(b) || !b.length) return { linked: false, why: "unranked" };
  if (![...a, ...b].every((i) => i.key)) return { linked: false, why: "no keys" };
  const keysA = new Set(a.map((i) => i.key));
  const keysB = new Set(b.map((i) => i.key));
  const onlyKeys = { both: b.filter((i) => keysA.has(i.key)), onlyA: a.filter((i) => !keysB.has(i.key)), onlyB: b.filter((i) => !keysA.has(i.key)) };
  const adjacent = Number.isInteger(A.meta.round) && A.meta.round + 1 === B.meta.round;
  const consistent = b.every((i) => STATUSES.has(i.status) && (i.status === "new") !== keysA.has(i.key));
  if (!adjacent || !consistent) return { linked: false, why: adjacent ? "bad status" : "not adjacent", ...onlyKeys };
  const of = (status) => rankProblems(b.filter((i) => i.status === status));
  const statusOf = new Map(b.map((i) => [i.key, i.status]));
  const top = a.slice(0, TOP_COUNT).map((i) => statusOf.get(i.key));
  return { linked: true, fixed: of("fixed"), reduced: of("reduced"), worse: of("worse"), fresh: of("new"), open: of("open"), top: { size: top.length, fixed: top.filter((s) => s === "fixed").length, reduced: top.filter((s) => s === "reduced").length, open: top.filter((s) => s === "open").length, worse: top.filter((s) => s === "worse").length } };
}

function compareRounds(A, B, keep = () => true) {
  const engineList = (R) => R.engines.filter((e) => hasAnswers(R, e));
  const inBoth = engineList(B).filter((e) => engineList(A).includes(e));
  const leftOut = [
    ...engineList(A).filter((e) => !inBoth.includes(e)).map((e) => ({ name: llmName(e, A), only: "A" })),
    ...engineList(B).filter((e) => !inBoth.includes(e)).map((e) => ({ name: llmName(e, B), only: "B" })),
  ];
  const { check, same, blocked } = pairUp(A, B, keep);
  const metrics = { overall: change(same, "overall"), clarity: change(same, "clarity"), belief: change(same, "belief"), lean: leanings(same, A, B) };
  const hasKey = (R, key) => R.meta.offers.some((o) => o.key === key);
  const offersOneSided = [...A.meta.offers.filter((o) => !hasKey(B, o.key)), ...B.meta.offers.filter((o) => !hasKey(A, o.key))];
  return {
    A, B, inBoth, leftOut, check, same, blocked, metrics, offersOneSided,
    buyers: buyerCompare(A, B, check, same),
    verdict: check.reason ? "findings" : verdictFrom(metrics.overall),
    link: linkProblems(A, B),
  };
}

// Line diff by longest common subsequence: offers are short enough for this to stay instant.
function lineDiff(before, after) {
  const [a, b] = [before, after].map((t) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const best = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) best[i][j] = a[i] === b[j] ? best[i + 1][j + 1] + 1 : Math.max(best[i + 1][j], best[i][j + 1]);
  const out = [];
  let [i, j] = [0, 0];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i === a.length || best[i][j + 1] >= best[i + 1][j])) out.push(["add", b[j++]]);
    else out.push(["del", a[i++]]);
  }
  return out;
}
