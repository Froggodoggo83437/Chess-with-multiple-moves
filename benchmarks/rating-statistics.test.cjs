const test = require('node:test');
const assert = require('node:assert/strict');
const { invertExpectedScore, scoreBounds, analyzeRow } = require('./rating-statistics.cjs');
test('Elo inversion reproduces the expected-score formula and opponent shifts', () => {
  assert.ok(Math.abs(invertExpectedScore(.75, [1320]) - (1320 + 400 * Math.log10(3))) < 1e-8);
  assert.ok(Math.abs(invertExpectedScore(.4, [1320, 1500, 1800]) + 200 - invertExpectedScore(.4, [1520, 1700, 2000])) < 1e-8);
  assert.equal(invertExpectedScore(0, [1320]), -Infinity);
  assert.equal(invertExpectedScore(1, [1320]), Infinity);
});
test('all-loss/all-win tail bounds agree with the bounded-score limit', () => {
  const n = 7, alpha = .05;
  assert.ok(Math.abs(scoreBounds(0, 0, n, alpha)[1] - (1 - (alpha / 2) ** (1 / n))) < 1e-8);
  assert.ok(Math.abs(scoreBounds(1, 1, n, alpha)[0] - (alpha / 2) ** (1 / n)) < 1e-8);
});
test('more observations narrow bounds; simultaneous correction widens them', () => {
  const small = scoreBounds(.5, .5, 7, .05), large = scoreBounds(.5, .5, 100, .05);
  const corrected = scoreBounds(.5, .5, 100, .05 / 32);
  assert.ok(large[0] > small[0] && large[1] < small[1]);
  assert.ok(corrected[0] < large[0] && corrected[1] > large[1]);
});
const pair = (id, scores) => scores.map((score, i) => ({ pairId: id, referenceElo: 1320, engineColor: ['w', 'b'][i], score }));
test('unfinished games widen identification and confidence bounds without score imputation', () => {
  const result = analyzeRow({ target: 400, games: pair('a', [0, null]) });
  assert.equal(result.pointEstimate, null); assert.equal(result.estimateStatus, 'censored');
  assert.deepEqual(result.scoreRange, [0, .5]); assert.deepEqual(result.observedRatingRange, ['-infinity', 1320]);
  assert.equal(result.simultaneous95.elo[0], '-infinity');
});
test('all losses produce an upper bound, not a fabricated finite point estimate', () => {
  const result = analyzeRow({ target: 400, games: pair('a', [0, 0]) });
  assert.equal(result.pointEstimate, null); assert.equal(result.estimateStatus, 'all-losses');
  assert.equal(result.perSetting95.elo[0], '-infinity'); assert.equal(typeof result.perSetting95.elo[1], 'number');
});
test('balanced colors and matching reference strengths are required', () => {
  assert.throws(() => analyzeRow({ target: 400, games: [{ ...pair('a', [0, 0])[0] }] }));
  const games = pair('a', [0, 0]); games[1].referenceElo = 1500;
  assert.throws(() => analyzeRow({ target: 400, games }));
});

test('repeated openings across opponents form one equally weighted observation', () => {
  const games = [
    ...pair('a', [1, 1]).map(game => ({...game, initialFen: 'opening-A'})),
    ...pair('b', [1, 0]).map(game => ({...game, initialFen: 'opening-B'})),
    ...pair('c', [1, 0]).map(game => ({...game, initialFen: 'opening-B'}))
  ];
  const result = analyzeRow({target: 1500, games});
  assert.equal(result.pairs, 3); assert.equal(result.independentOpeningGroups, 2);
  assert.deepEqual(result.scoreRange, [.75, .75]);
  assert.equal(result.pointEstimate, Math.round(1320 + 400 * Math.log10(3)));
});

test('floating-point group weights do not invent finite ratings for all-win samples', () => {
  const games = Array.from({length: 7}, (_, i) => pair('pair-' + i, [1, 1])).flat();
  const result = analyzeRow({target: 3500, games});
  assert.equal(result.pointEstimate, null); assert.equal(result.estimateStatus, 'all-wins');
  assert.deepEqual(result.scoreRange, [1, 1]);
});
