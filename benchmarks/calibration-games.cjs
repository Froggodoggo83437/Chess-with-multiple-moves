const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { Chess } = require('chess.js');
const { CustomTurnRules: Rules, chooseMoveForElo } = require('../src/rules.cjs');
const Stockfish = require('./stockfish.cjs');
const input = path.join(__dirname, 'relative-ratings.json');
const output = path.join(__dirname, 'calibration-games.json');
const MAX_PLIES = 400, BUDGET = 150, WORKERS = 4;
const NEW_PAIRS = [
  { id: 'french-held-out', opening: ['e4', 'e6', 'd4', 'd5'], referenceElo: 1500 },
  { id: 'nimzo-held-out', opening: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], referenceElo: 1800 },
  { id: 'french-held-out-1800', opening: ['e4', 'e6', 'd4', 'd5'], referenceElo: 1800 },
  { id: 'nimzo-held-out-1500', opening: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], referenceElo: 1500 },
];
const TOTAL_GAMES = 10 + NEW_PAIRS.length * 2;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const save = (file, value) => {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
};
const uci = move => move.from + move.to + (move.promotion || '');
const parse = move => ({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move.length > 4 ? { promotion: move[4] } : {}) });
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
async function finishGame(sf, source, referenceElo, seed) {
  const result = JSON.parse(JSON.stringify(source));
  result.referenceElo = referenceElo;
  result.continuationSeed = seed;
  result.resumedAtPly = source.moves.length;
  const state = new Rules(Chess, ['w', 'b'], result.initialFen);
  for (const move of result.moves) {
    const played = state.play(parse(move.uci));
    if (!played || played.san !== move.san) throw Error('Invalid saved game');
  }
  if (!state.result) {
    await sf.setStrength(referenceElo);
    const random = rng(seed);
    for (let ply = state.history.length; ply < MAX_PLIES && !state.result; ply++) {
      const side = state.side, start = performance.now();
      const move = side === result.engineColor
        ? await chooseMoveForElo(state, result.target, side, { timeBudgetMs: BUDGET, yieldEvery: Number.MAX_SAFE_INTEGER, random })
        : parse((await sf.analyze(result.initialFen, 0, { movetime: BUDGET, moves: state.history.map(uci) })).move);
      const played = move && state.play(move);
      if (!played) throw Error('Illegal calibration move');
      result.moves.push({ color: side, uci: uci(played), san: played.san, elapsedMs: Math.round(performance.now() - start) });
    }
  }
  result.outcome = state.result || { type: 'unfinished', reason: 'ply-limit' };
  result.finalFen = state.game.fen();
  result.score = !state.result ? null : state.result.winner ? (state.result.winner === result.engineColor ? 1 : 0) : .5;
  return result;
}
function newGame(target, pair, color) {
  const chess = new Chess();
  for (const move of pair.opening) chess.move(move);
  return { target, engineColor: color, opening: pair.opening, initialFen: chess.fen(), moves: [], origin: 'held-out', pairId: pair.id };
}
async function worker(file, targets) {
  const previous = JSON.parse(fs.readFileSync(input)), sf = new Stockfish();
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { status: 'running', rows: [] };
  data.status = 'running';
  try {
    await sf.init(); data.referenceName = sf.name;
    for (const target of targets) {
      let row = data.rows.find(row => row.target === target);
      if (!row) { row = { target, games: [] }; data.rows.push(row); }
      const old = previous.rows.find(row => row.target === target);
      for (let index = row.games.length; index < TOTAL_GAMES; index++) {
        let source, referenceElo, seed;
        if (index < 10) {
          source = { ...old.games[index], origin: 'previous-sample', pairId: `previous-${Math.floor(index / 2)}`, sourceGameIndex: index };
          referenceElo = 1320;
          seed = 900000 + target + Math.floor(index / 2) * 10000 + (index % 2);
        } else {
          const pairIndex = Math.floor((index - 10) / 2), color = index % 2 ? 'b' : 'w', pair = NEW_PAIRS[pairIndex];
          source = newGame(target, pair, color); referenceElo = pair.referenceElo;
          seed = 1900000 + target + pairIndex * 10000 + (index % 2);
        }
        row.games.push(await finishGame(sf, source, referenceElo, seed));
        save(file, data);
        console.log(`Calibration progress: ${target}, ${row.games.length}/${TOTAL_GAMES}`);
      }
    }
    data.status = 'completed'; save(file, data);
  } catch (error) { data.status = 'failed'; data.error = error.stack; save(file, data); throw error; }
  finally { sf.close(); }
}
async function main() {
  const previous = JSON.parse(fs.readFileSync(input));
  if (previous.status !== 'completed' || previous.rows.length !== 32 || previous.rows.some(row => row.games.length !== 10)) throw Error('A completed 320-game sample is required');
  const sourceHash = hash(fs.readFileSync(path.join(__dirname, '../src/rules.cjs')));
  if (sourceHash !== previous.rulesSha256) throw Error('Game source changed since earlier matches');
  const inputHash = hash(fs.readFileSync(input));
  let report = {
    schema: 1, status: 'running', startedAtUTC: new Date().toISOString(), rulesSha256: sourceHash, inputSha256: inputHash,
    protocol: { moveBudgetMs: BUDGET, maxPlies: MAX_PLIES, workers: WORKERS, gamesPerTarget: TOTAL_GAMES, newPairs: NEW_PAIRS, referenceElos: [1320, 1500, 1800],
      resume: 'Retain all earlier terminal games. Resume each unfinished game from its saved position and history, using a declared new random seed. No draw/resignation adjudication.',
      scope: 'Stockfish-preset-relative standard chess at 150 ms/move. Not application default/full-budget or custom-turn Elo. The same Stockfish implementation supplies all anchors; presets are not an independently calibrated human pool.' },
    environment: { node: process.version, platform: process.platform, architecture: process.arch, cpu: require('node:os').cpus()[0]?.model }, rows: []
  };
  if (fs.existsSync(output) && (process.argv.includes('--resume') || process.argv.includes('--extend'))) {
    const existing = JSON.parse(fs.readFileSync(output));
    if (existing.inputSha256 !== inputHash || existing.rulesSha256 !== sourceHash) throw Error('Cannot resume different source/input');
    report = { ...existing, status: 'running', protocol: report.protocol };
    if (process.argv.includes('--extend')) {
      if (existing.status !== 'completed' || existing.rows.some(row => row.games.length !== 14)) throw Error('Extension requires a completed 14-game calibration');
      for (let index = 0; index < WORKERS; index++) save(path.join(__dirname, `calibration-worker-${index}.json`), { status: 'running', rows: existing.rows.filter((_, i) => i % WORKERS === index) });
    }
    if (existing.status === 'completed' && !process.argv.includes('--extend')) { console.log('Calibration already completed; run analysis/verification.'); return; }
  } else {
    for (let index = 0; index < WORKERS; index++) {
      const file = path.join(__dirname, `calibration-worker-${index}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  const outputs = [], children = []; let timer;
  const collect = () => {
    report.rows = outputs.flatMap(file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).rows : []).sort((a, b) => a.target - b.target);
    const first = outputs.find(file => fs.existsSync(file));
    if (first) report.referenceName = JSON.parse(fs.readFileSync(first)).referenceName;
    save(output, report);
  };
  try {
    save(output, report); const promises = [];
    for (let index = 0; index < WORKERS; index++) {
      const file = path.join(__dirname, `calibration-worker-${index}.json`); outputs.push(file);
      const targets = previous.rows.filter((_, i) => i % WORKERS === index).map(row => row.target);
      const child = fork(__filename, ['--worker', file, targets.join(',')], { stdio: 'inherit' }); children.push(child);
      promises.push(new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code, signal) => code === 0 ? resolve() : reject(Error(`Calibration worker ${index} exited ${code ?? signal}`))); }));
    }
    timer = setInterval(collect, 2000); await Promise.all(promises); clearInterval(timer); collect();
    if (report.rows.length !== 32 || report.rows.some(row => row.games.length !== TOTAL_GAMES)) throw Error('Incomplete calibration');
    report.status = 'completed'; report.finishedAtUTC = new Date().toISOString(); save(output, report);
    outputs.forEach(file => fs.unlinkSync(file)); console.log(`Calibration completed: ${32 * TOTAL_GAMES} games, including ${32 * (TOTAL_GAMES - 10)} fresh games.`);
  } catch (error) { clearInterval(timer); children.forEach(child => child.kill()); collect(); report.status = 'failed'; report.error = error.stack; save(output, report); throw error; }
}
if (process.argv[2] === '--worker') worker(process.argv[3], process.argv[4].split(',').map(Number)).catch(error => { console.error(error); process.exitCode = 1; });
else main().catch(error => { console.error(error); process.exitCode = 1; });
