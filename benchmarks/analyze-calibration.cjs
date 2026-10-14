const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { analyzeRow } = require('./rating-statistics.cjs');
const file = path.join(__dirname, 'calibration-games.json');
const report = JSON.parse(fs.readFileSync(file)), receipt = require('./calibration-verification.json');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
assert.equal(report.status, 'completed'); assert.equal(receipt.status, 'passed');
assert.equal(receipt.calibrationSha256, hash(fs.readFileSync(file)));
assert.equal(receipt.rulesSha256, hash(fs.readFileSync(path.join(__dirname, '../src/rules.cjs'))));
const rows = report.rows.map(row => analyzeRow(row));
const games = report.rows.flatMap(row => row.games);
const total = list => ({ games: list.length, wins: list.filter(game => game.score === 1).length, draws: list.filter(game => game.score === .5).length, losses: list.filter(game => game.score === 0).length, unfinished: list.filter(game => game.score === null).length });
const timings = side => {
  const times = games.flatMap(game => game.moves.filter(move => (move.color === game.engineColor) === (side === 'engine')).map(move => move.elapsedMs)).sort((a, b) => a - b);
  return { moves: times.length, meanMs: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length), medianMs: times[Math.floor((times.length - 1) * .5)], p95Ms: times[Math.floor((times.length - 1) * .95)], maxMs: times.at(-1), overRequestedBudget: times.filter(value => value > 150).length };
};
const censored = rows.filter(row => row.unfinished > 0).map(row => row.target);
const upper = value => value === '+infinity' ? Infinity : value;
const lower = value => value === '-infinity' ? -Infinity : value;
const analysis = {
  schema: 1, calibrationSha256: receipt.calibrationSha256, rulesSha256: receipt.rulesSha256,
  verification: receipt,
  method: { scale: 'Stockfish-17.1-preset-relative standard chess, 150 ms/move',
    point: 'Invert the equally weighted opening-group mean expected-score Elo logistic function over the declared opponents. No finite estimate for all-win/all-loss samples. No point estimate when games remain unfinished.',
    censoring: 'Unknown game scores range from 0 to 1; propagate both extremes to rating bounds.',
    confidence: 'Hoeffding relative-entropy bounds on seven independent bounded opening-group scores. Report per-setting 95% and Bonferroni simultaneous 95% over 32 settings. Conditional on independent opening groups and the expected-score model/reference presets.',
    scope: 'No verification of human Elo, custom turn orders, or default application thinking budgets. Shared Stockfish model/hardware, deterministic opening samples, and host load add systematic uncertainty outside the statistical bounds.' },
  actualMoveTimes: { requestedBudgetMs: 150, engine: timings('engine'), reference: timings('reference') },
  totals: total(games), freshGames: total(games.filter(game => game.origin === 'held-out')),
  byReference: report.protocol.referenceElos.map(referenceElo => ({ referenceElo, ...total(games.filter(game => game.referenceElo === referenceElo)) })),
  censoredSettings: censored,
  printedTargetsOutsideFastControlSimultaneousIntervals: rows.filter(row => row.target < lower(row.simultaneous95.elo[0]) || row.target > upper(row.simultaneous95.elo[1])).map(row => row.target),
  rows
};
fs.writeFileSync(path.join(__dirname, 'calibration-estimates.json'), JSON.stringify(analysis, null, 2) + '\n');
const display = value => value === '-infinity' ? 'unbounded below' : value === '+infinity' ? 'unbounded above' : String(value);
const range = values => values.map(display).join(' to ');
const lines = ['# Stockfish-relative rating calibration', '',
 'All 32 settings have 18 games: the earlier 10 games against the 1320 preset (unfinished games continued), plus eight fresh games crossing two held-out openings with both the 1500 and 1800 presets, with colors reversed. Both sides have a requested 150 ms search budget per move. Games run to a rule-defined result or 400 plies; there is no resignation/draw adjudication.', '',
 `**${games.length} games, ${receipt.plies.toLocaleString('en-US')} replay-verified plies:** ${analysis.totals.wins} wins, ${analysis.totals.draws} draws, ${analysis.totals.losses} losses, ${analysis.totals.unfinished} unfinished. Resolved ${receipt.newlyResolved} of the ${receipt.continued} earlier unfinished games.`, '',
 '**These are provisional estimates on a Stockfish-relative fast-control scale. Application/default-budget ratings and human Elo remain unverified.** The reference numbers are Stockfish presets, not independently established player ratings. No game labels or playing logic were changed.', '',
 '| Printed setting | W/D/L/unfinished | Point estimate | Per-setting 95% range | Simultaneous 95% range |',
 '| --- | --- | --- | --- | --- |'];
for (const row of rows) lines.push(`| ${row.target} | ${row.wins}/${row.draws}/${row.losses}/${row.unfinished} | ${row.pointEstimate ?? (row.estimateStatus === 'all-losses' ? 'upper bound only' : row.estimateStatus === 'all-wins' ? 'lower bound only' : 'censored')} | ${range(row.perSetting95.elo)} | ${range(row.simultaneous95.elo)} |`);
lines.push('', '## Interpretation', '',
 'Finite point estimates invert 1/(1+10^((opponent-rating)/400)), averaged equally over distinct opening groups; each group averages all its colors and reference opponents. Raw win/draw/loss totals are unweighted. Draws score one-half. No smoothing adds fictional wins or losses. An all-loss sample cannot establish a finite rating; its upper confidence bound is reported instead.', '',
 'All colors and reference strengths played from the same opening position form one bounded observation. There are nine color-reversed pairs but seven distinct opening groups per setting; the groups receive equal weight. This avoids treating repeated games from the same opening as independent. The relative-entropy concentration bound provides per-setting intervals; the wider simultaneous intervals account for all 32 comparisons. They assume independent opening groups and an expected-score Elo model against the given presets. They do not include systematic errors in the presets or opening selection.', '',
 'Remaining unfinished games are allowed every score from loss to win when computing bounds. They are neither discarded nor counted as draws. Their observed rating identification ranges are also retained in the JSON. Continuing old games uses their complete history and a declared new random seed; it is not a replay of the original RNG stream.', '',
 'The lowest labeled reference available is 1320. Results below it require extrapolation and cannot reliably distinguish every low slider label. A stronger/lower calibrated reference pool and many independent opening pairs are needed. Seven distinct opening groups per setting cannot support a narrow ±100 Elo claim. No data are pooled or forced into a monotonic slider curve.', '',
 `Actual wall-clock move timing (including protocol overhead): engine median ${analysis.actualMoveTimes.engine.medianMs} ms, 95th percentile ${analysis.actualMoveTimes.engine.p95Ms} ms, maximum ${analysis.actualMoveTimes.engine.maxMs} ms; reference median ${analysis.actualMoveTimes.reference.medianMs} ms, 95th percentile ${analysis.actualMoveTimes.reference.p95Ms} ms, maximum ${analysis.actualMoveTimes.reference.maxMs} ms. The requested 150 ms budget is a soft search limit, not a chess-clock forfeiture rule.`, '',
 'Four benchmark processes share the host. Wall-clock budgets, finite search, and unseeded Stockfish randomness affect depth; elapsed times are retained. The new 1500/1800 tests are fresh opening checks, but both new openings are crossed with both new reference strengths. The 1320 games use different openings, so residual opening/reference effects cannot be fully separated in this sample.', '',
 `Printed settings outside their simultaneous intervals at this fast control: ${analysis.printedTargetsOutsideFastControlSimultaneousIntervals.join(', ') || 'none'}. This does not test those settings at their application thinking budgets.`, '',
 '## Next calibration steps', '',
 'Test the actual application thinking budgets separately, with explicitly matched opponent budgets; never merge different time controls. Add many opening pairs crossed with all reference strengths, repeat fresh hold-out tests after any engine change, and include genuinely weaker calibrated opponents for low settings. Only then consider replacing target labels with measured ranges. Custom turn schedules require a separate scale per schedule.', '',
 'Raw games: [calibration-games.json](calibration-games.json). Estimates/method: [calibration-estimates.json](calibration-estimates.json). Verification receipt: [calibration-verification.json](calibration-verification.json). Earlier uncontinued sample: [RELATIVE_RATINGS.md](RELATIVE_RATINGS.md).');
fs.writeFileSync(path.join(__dirname, 'CALIBRATION.md'), lines.join('\n') + '\n');
console.log(JSON.stringify({ ...analysis.totals, censoredSettings: censored, outsideFastControlIntervals: analysis.printedTargetsOutsideFastControlSimultaneousIntervals }));
