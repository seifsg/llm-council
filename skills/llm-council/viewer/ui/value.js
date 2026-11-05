// The buyer numbers behind the Value tab: medians and the weakest factor. No markup here.
// Medians, since the value ratio is skewed. Callers pass one nature's seats: natures are never pooled.
const BEST_SCORE = { dream_outcome: 10, likelihood: 10, time_delay: 1, effort: 1 };
const BUYER_FIELDS = ["value", "buy_chance", "churn_month1", "stay_12_months", "hard_to_leave"];
const STAT_FIELDS = [...BUYER_FIELDS, ...VALUE_FACTORS, "real_problem", "pain", "solves_it"];

const isAnswered = (s) => s.status === "done" && Boolean(s.parsed);
const hasBuyerScores = (R) => Boolean(R?.seats?.some((s) => s.parsed && BUYER_FIELDS.some((f) => Number.isFinite(s.parsed.scores[f]))));

// Undefined for an empty list, so "no data" never reads as zero.
function median(list) {
  const sorted = list.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupBy(list, keyOf) {
  const map = new Map();
  for (const item of list) map.set(keyOf(item), [...(map.get(keyOf(item)) || []), item]);
  return map;
}

// The factor furthest from its best score. A tie names every factor that shares the gap.
function heldBackBy(scores) {
  const gaps = VALUE_FACTORS.filter((f) => Number.isFinite(scores[f])).map((f) => [f, Math.abs(BEST_SCORE[f] - scores[f])]);
  const widest = Math.max(0, ...gaps.map(([, gap]) => gap));
  return widest ? gaps.filter(([, gap]) => gap === widest).map(([f]) => f) : [];
}

// One entry per cadence: a monthly price and a one-off price never share a median.
function priceMedians(seats, field) {
  const priced = seats.map((s) => s.parsed.prices[field]).filter((p) => Number.isFinite(p?.amount));
  return [...groupBy(priced, (p) => p.cadence)].map(([cadence, list]) => ({ cadence, amount: median(list.map((p) => p.amount)), n: list.length }));
}

function groupStats(seats) {
  const scores = Object.fromEntries(STAT_FIELDS.map((f) => [f, median(seats.map((s) => s.parsed.scores[f]))]));
  return { n: seats.length, scores, weak: heldBackBy(scores), noBrainer: priceMedians(seats, "no_brainer_price"), tooMuch: priceMedians(seats, "too_expensive_price") };
}
