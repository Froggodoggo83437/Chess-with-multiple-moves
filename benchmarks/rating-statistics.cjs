// Conditional on the declared reference presets and expected-score Elo model.
// Distinct opening groups are independent bounded observations; all colors and
// reference strengths within an opening may be correlated. Unfinished scores are bounded by [0, 1], never imputed as draws.
const assert = require('node:assert/strict');
const probability = (rating, opponent) => 1 / (1 + Math.exp((opponent - rating) * Math.LN10 / 400));
function invertExpectedScore(score, opponents, weights = opponents.map(() => 1 / opponents.length)) {
  assert.ok(opponents.length && opponents.every(Number.isFinite));
  assert.ok(score >= 0 && score <= 1);
  assert.equal(weights.length, opponents.length);assert.ok(weights.every(weight => weight > 0));
  assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-8);
  if (score === 0) return -Infinity;
  if (score === 1) return Infinity;
  let low = Math.min(...opponents) - 16000, high = Math.max(...opponents) + 16000;
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2;
    const expected = opponents.reduce((sum, opponent, index) => sum + weights[index] * probability(middle, opponent), 0);
    if (expected < score) low = middle; else high = middle;
  }
  return (low + high) / 2;
}
function relativeEntropy(observed, expected) {
  if (observed === 0) return -Math.log1p(-expected);
  if (observed === 1) return -Math.log(expected);
  return observed * Math.log(observed / expected) + (1 - observed) * Math.log((1 - observed) / (1 - expected));
}
function scoreBounds(lower, upper, pairs, alpha) {
  // Hoeffding's relative-entropy bound for averages of independent [0,1]
  // variables, with two tails. The pair means need not be Bernoulli or identical.
  const cutoff = Math.log(2 / alpha) / pairs;
  let left = 0, right = lower;
  if (lower > 0) for (let i = 0; i < 100; i++) {
    const middle = (left + right) / 2;
    if (relativeEntropy(lower, middle) > cutoff) left = middle; else right = middle;
  }
  const minimum = lower === 0 ? 0 : (left + right) / 2;
  left = upper; right = 1;
  if (upper < 1) for (let i = 0; i < 100; i++) {
    const middle = (left + right) / 2;
    if (relativeEntropy(upper, middle) > cutoff) right = middle; else left = middle;
  }
  return [minimum, upper === 1 ? 1 : (left + right) / 2];
}
const bound = (value, round = Math.round) => Number.isFinite(value) ? round(value) : value < 0 ? '-infinity' : '+infinity';
function analyzeRow(row, simultaneousSettings = 32) {
  const games = row.games, groups = new Map(), openingGroups = new Map();
  for (const game of games) {
    assert.ok(game.score === null || game.score === 0 || game.score === .5 || game.score === 1);
    assert.ok(Number.isFinite(game.referenceElo));
    if (!groups.has(game.pairId)) groups.set(game.pairId, []);
    groups.get(game.pairId).push(game);
    const openingKey = game.initialFen ?? game.pairId;
    if (!openingGroups.has(openingKey)) openingGroups.set(openingKey, []);
    openingGroups.get(openingKey).push(game);
  }
  assert.ok(groups.size > 0);
  for (const pair of groups.values()) {
    assert.equal(pair.length, 2); assert.deepEqual(pair.map(game => game.engineColor).sort(), ['b', 'w']);
    assert.equal(pair[0].referenceElo, pair[1].referenceElo);
  }
  const score = games.reduce((sum, game) => sum + (game.score ?? 0), 0);
  const unfinished = games.filter(game => game.score === null).length;
  const weights = games.map(game => 1 / (openingGroups.size * openingGroups.get(game.initialFen ?? game.pairId).length));
  const scoreRange = [games.reduce((sum, game, i) => sum + weights[i] * (game.score ?? 0), 0), games.reduce((sum, game, i) => sum + weights[i] * (game.score ?? 1), 0)].map(value => value < 1e-12 ? 0 : value > 1 - 1e-12 ? 1 : value);
  const opponents = games.map(game => game.referenceElo);
  const interval = alpha => {
    const scores = scoreBounds(...scoreRange, openingGroups.size, alpha);
    return { score: scores, elo: scores.map((score, index) => bound(invertExpectedScore(score, opponents, weights), index === 0 ? Math.floor : Math.ceil)) };
  };
  const estimate = unfinished === 0 ? invertExpectedScore(scoreRange[0], opponents, weights) : null;
  return {
    target: row.target, games: games.length, pairs: groups.size, independentOpeningGroups: openingGroups.size,
    wins: games.filter(game => game.score === 1).length, draws: games.filter(game => game.score === .5).length,
    losses: games.filter(game => game.score === 0).length, unfinished, score,
    referenceElos: [...new Set(opponents)], scoreRange,
    pointEstimate: estimate === null || !Number.isFinite(estimate) ? null : Math.round(estimate),
    estimateStatus: unfinished ? 'censored' : estimate === -Infinity ? 'all-losses' : estimate === Infinity ? 'all-wins' : 'provisional',
    observedRatingRange: scoreRange.map(score => bound(invertExpectedScore(score, opponents, weights))),
    perSetting95: interval(.05), simultaneous95: interval(.05 / simultaneousSettings),
    actualEloStatus: 'unverified'
  };
}
module.exports = { probability, invertExpectedScore, relativeEntropy, scoreBounds, analyzeRow };
