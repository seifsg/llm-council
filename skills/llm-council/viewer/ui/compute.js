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

function change(pairs, field) {
  const deltas = pairs.map(({ a, b }) => b.parsed.scores[field] - a.parsed.scores[field]).filter(Number.isFinite);
  if (!deltas.length) return null;
  const average = mean(deltas);
  const spread = Math.sqrt(mean(deltas.map((d) => (d - average) ** 2)) / deltas.length);
  return { average, spread, n: deltas.length };
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

// Pairs each problem with its closest match by wording. Each is used once.
function standing(listA, listB) {
  const open = [], fresh = [], unused = new Set(listA);
  for (const b of listB) {
    let best = null, bestScore = 0.25;
    for (const a of unused) {
      const score = similarity(tokens(a.title), tokens(b.title));
      if (score >= bestScore) { best = a; bestScore = score; }
    }
    if (best) { unused.delete(best); open.push({ ...b, was: best }); } else fresh.push(b);
  }
  return { fixed: rankProblems([...unused]), fresh: rankProblems(fresh), open: rankProblems(open) };
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
  const [pa, pb] = [problemsOf(A, inBoth), problemsOf(B, inBoth)];
  const hasKey = (R, key) => R.meta.offers.some((o) => o.key === key);
  const offersOneSided = [...A.meta.offers.filter((o) => !hasKey(B, o.key)), ...B.meta.offers.filter((o) => !hasKey(A, o.key))];
  return {
    A, B, inBoth, leftOut, check, same, blocked, metrics, offersOneSided,
    verdict: check.reason ? "findings" : verdictFrom(metrics.overall),
    problems: standing(pa.list, pb.list),
    ranked: pa.ranked && pb.ranked,
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
