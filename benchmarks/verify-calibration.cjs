const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Chess } = require('chess.js');
const { CustomTurnRules: Rules } = require('../src/rules.cjs');
const { analyzeRow } = require('./rating-statistics.cjs');
const reportFile = path.join(__dirname, 'calibration-games.json');
const report = JSON.parse(fs.readFileSync(reportFile)), previous = require('./relative-ratings.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(report.schema, 1); assert.equal(report.status, 'completed'); assert.equal(report.rows.length, 32);
assert.equal(report.rulesSha256, hash(path.join(__dirname, '../src/rules.cjs')));
assert.equal(report.inputSha256, hash(path.join(__dirname, 'relative-ratings.json')));
assert.equal(report.protocol.moveBudgetMs, 150); assert.equal(report.protocol.maxPlies, 400);
assert.deepEqual(report.protocol.referenceElos, [1320, 1500, 1800]);
const newPairs = [
  { id: 'french-held-out', opening: ['e4', 'e6', 'd4', 'd5'], referenceElo: 1500 },
  { id: 'nimzo-held-out', opening: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], referenceElo: 1800 },
  { id: 'french-held-out-1800', opening: ['e4', 'e6', 'd4', 'd5'], referenceElo: 1800 },
  { id: 'nimzo-held-out-1500', opening: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], referenceElo: 1500 },
];
assert.deepEqual(report.protocol.newPairs, newPairs);
let plies = 0, games = 0, continued = 0, newlyResolved = 0;
report.rows.forEach((row, rowIndex) => {
  assert.equal(row.target, 400 + rowIndex * 100); assert.equal(row.games.length, 18);
  const oldRow = previous.rows[rowIndex];
  row.games.forEach((game, index) => {
    games++; assert.equal(game.target, row.target); assert.equal(game.engineColor, ['w', 'b'][index % 2]);
    if (index < 10) {
      const old = oldRow.games[index];
      assert.equal(game.origin, 'previous-sample'); assert.equal(game.sourceGameIndex, index);
      assert.equal(game.pairId, `previous-${Math.floor(index / 2)}`); assert.equal(game.referenceElo, 1320);
      assert.deepEqual(game.opening, old.opening); assert.equal(game.initialFen, old.initialFen);
      assert.equal(game.resumedAtPly, old.moves.length); assert.deepEqual(game.moves.slice(0, old.moves.length), old.moves);
      assert.equal(game.continuationSeed, 900000 + row.target + Math.floor(index / 2) * 10000 + index % 2);
      if (old.score !== null) { assert.equal(game.moves.length, old.moves.length); assert.equal(game.score, old.score); assert.deepEqual(game.outcome, old.outcome); }
      else { continued++; if (game.score !== null) newlyResolved++; }
    } else {
      const pairIndex = Math.floor((index - 10) / 2), pair = newPairs[pairIndex];
      assert.equal(game.origin, 'held-out'); assert.equal(game.pairId, pair.id); assert.deepEqual(game.opening, pair.opening);
      assert.equal(game.referenceElo, pair.referenceElo); assert.equal(game.resumedAtPly, 0);
      assert.equal(game.continuationSeed, 1900000 + row.target + pairIndex * 10000 + index % 2);
    }
    const opening = new Chess(); for (const move of game.opening) opening.move(move);
    assert.equal(game.initialFen, opening.fen());
    const state = new Rules(Chess, ['w', 'b'], game.initialFen), independent = new Chess(game.initialFen);
    assert.ok(game.moves.length <= 400);
    for (const move of game.moves) {
      assert.equal(state.result, null); assert.equal(independent.isGameOver(), false);
      assert.equal(move.color, state.side); assert.equal(move.color, independent.turn());
      const parsed = { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), ...(move.uci.length > 4 ? { promotion: move.uci[4] } : {}) };
      const played = state.play(parsed), reference = independent.move(parsed);
      assert.ok(played && reference); assert.equal(played.san, move.san); assert.equal(reference.san, move.san);
      assert.equal(state.game.fen(), independent.fen()); assert.ok(Number.isInteger(move.elapsedMs) && move.elapsedMs >= 0); plies++;
    }
    assert.equal(game.finalFen, independent.fen()); assert.deepEqual(game.outcome, state.result || { type: 'unfinished', reason: 'ply-limit' });
    if (!state.result) { assert.equal(game.moves.length, 400); assert.equal(independent.isGameOver(), false); }
    else {
      const predicates = { checkmate: 'isCheckmate', stalemate: 'isStalemate', 'insufficient-material': 'isInsufficientMaterial', 'fifty-move': 'isDrawByFiftyMoves', 'threefold-repetition': 'isThreefoldRepetition' };
      assert.ok(predicates[state.result.type]); assert.equal(independent[predicates[state.result.type]](), true);
      if (state.result.winner) assert.equal(state.result.winner, independent.turn() === 'w' ? 'b' : 'w');
    }
    assert.equal(game.score, !state.result ? null : state.result.winner ? (state.result.winner === game.engineColor ? 1 : 0) : .5);
  });
  const analysis = analyzeRow(row); assert.equal(analysis.games, 18); assert.equal(analysis.pairs, 9); assert.equal(analysis.independentOpeningGroups, 7);
  if ((rowIndex + 1) % 8 === 0) console.log(`Replay-verified ${rowIndex + 1}/32 settings`);
});
const receipt = { status: 'passed', verifiedAtUTC: new Date().toISOString(), calibrationSha256: hash(reportFile), rulesSha256: report.rulesSha256, verifierSha256: hash(__filename), games, plies, continued, newlyResolved };
fs.writeFileSync(path.join(__dirname, 'calibration-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(`Verified ${games} games / ${plies} plies; resolved ${newlyResolved}/${continued} previous unfinished games.`);
