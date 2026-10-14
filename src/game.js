import { Chess } from 'chess.js';
import { createEngineClient } from './engine-client.js';
import { createCelebration } from './celebration.js';
import rules from './rules.cjs';
import material from './material.cjs';
const { materialSummary } = material;
import ratingLabels from './rating-labels.cjs';
const { levelForSetting, ratingNote } = ratingLabels;
const { CustomTurnRules, strengthForElo } = rules;
const names = { w: 'White', b: 'Black' };
const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const $ = id => document.getElementById(id);
let order = ['w', 'w', 'b'];
let state, selected = null, legal = [], flipped = false, busy = false;
let generation = 0, aiTimer = null, pausedAI = false, aiError = '';
const squares = new Map();
const celebrate = createCelebration(document.querySelector('.boardWrap'), window.CHESS_PIECES);
const engineClient = createEngineClient();
const pvp = () => $('mode').value === 'pvp';
const player = () => pvp() ? 'w' : $('side').value;
const engine = () => player() === 'w' ? 'b' : 'w';

function cancelAI() {
  generation++;
  engineClient.cancel();
  clearTimeout(aiTimer);
  aiTimer = null;
  busy = false;
  aiError = '';
}
function reset() {
  cancelAI();
  state = new CustomTurnRules(Chess, order, undefined, { allowKingCapture: $('kingCapture').value === 'allowed' });
  selected = null;
  legal = [];
  pausedAI = false;
  render();
  queueAI();
}
function modifyOrder(next) {
  if (!next.length) return;
  order = [...next];
  reset();
}
function renderMaterial() {
  const summary = materialSummary(state);
  for (const [id, color] of [['playerTop', flipped ? 'w' : 'b'], ['playerBottom', flipped ? 'b' : 'w']]) {
    const strip = $(id), opponent = color === 'w' ? 'b' : 'w';
    strip.dataset.color = color;
    strip.replaceChildren();
    const name = document.createElement('strong');
    name.className = 'player-name'; name.textContent = names[color]; strip.append(name);
    const captures = document.createElement('div'); captures.className = 'captured-pieces';
    captures.setAttribute('aria-label', `Pieces captured by ${names[color]}`);
    for (const type of summary.captured[color]) {
      const image = document.createElement('img');
      image.src = window.CHESS_PIECES[opponent + type]; image.alt = `${names[opponent]} ${pieceNames[type]}`;
      image.draggable = false; captures.append(image);
    }
    if (summary.lead[color]) {
      const points = document.createElement('span'); points.className = 'material-lead';
      points.textContent = '+' + summary.lead[color];
      points.setAttribute('aria-label', `${names[color]} is ahead by ${summary.lead[color]} material points`);
      points.title = 'Material lead: pawn 1, knight/bishop 3, rook 5, queen 9. Kings have no point value.';
      captures.append(points);
    }
    strip.append(captures);
  }
}
function renderBoard() {
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const checked = new Set(state.result ? [] : ['w', 'b'].filter(side => state.inCheck(side)));
  let visualIndex = 0;
  for (const rank of ranks) for (const file of files) {
    const square = file + rank;
    let button = squares.get(square);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.square = square;
      button.addEventListener('click', () => clickSquare(square));
      squares.set(square, button);
    }
    const piece = state.game.get(square);
    const targetMoves = legal.filter(move => move.to === square);
    button.className = 'square ' + ((file.charCodeAt(0) - 97 + rank) % 2 === 0 ? 'light' : 'dark');
    button.classList.toggle('selected', selected === square);
    button.classList.toggle('last', !!state.lastMove && (state.lastMove.from === square || state.lastMove.to === square));
    button.classList.toggle('legal', targetMoves.length > 0 && !targetMoves.some(move => move.captured));
    button.classList.toggle('capture', targetMoves.some(move => move.captured));
    button.classList.toggle('in-check', piece?.type === 'k' && checked.has(piece.color));
    button.setAttribute('aria-label', `${square}${piece ? ' ' + names[piece.color] + ' ' + pieceNames[piece.type] : ''}`);
    button.setAttribute('aria-pressed', String(selected === square));
    const key = piece ? piece.color + piece.type : '';
    if (button.dataset.piece !== key) {
      button.replaceChildren();
      button.dataset.piece = key;
      if (piece) {
        const image = document.createElement('img');
        image.className = 'piece ' + (piece.color === 'w' ? 'white' : 'black');
        image.src = window.CHESS_PIECES[key];
        image.alt = names[piece.color] + ' ' + pieceNames[piece.type];
        image.draggable = false;
        button.append(image);
      }
    }
    let coordinate = button.querySelector('.file-coord');
    if (rank === ranks.at(-1)) {
      if (!coordinate) { coordinate = document.createElement('span'); coordinate.className = 'coord file-coord'; coordinate.setAttribute('aria-hidden', 'true'); button.append(coordinate); }
      coordinate.textContent = file;
    } else coordinate?.remove();
    let rankCoordinate = button.querySelector('.rank-coord');
    if (file === files[0]) {
      if (!rankCoordinate) { rankCoordinate = document.createElement('span'); rankCoordinate.className = 'coord rank-coord'; rankCoordinate.setAttribute('aria-hidden', 'true'); button.append(rankCoordinate); }
      rankCoordinate.textContent = rank;
    } else rankCoordinate?.remove();
    const board = $('board');
    if (board.children[visualIndex] !== button) board.insertBefore(button, board.children[visualIndex] || null);
    visualIndex++;
  }
  renderMaterial();
}
function renderTurns() {
  $('turns').replaceChildren();
  $('computerSettings').hidden = pvp();
  $('preset2').textContent = pvp() ? 'White 2 : Black 1' : 'You 2 : AI 1';
  $('preset3').textContent = pvp() ? 'White 3 : Black 1' : 'You 3 : AI 1';
  $('remove').disabled = order.length === 1;
  const presets = [['w', 'b'], [player(), player(), engine()], [player(), player(), player(), engine()]];
  presets.forEach((preset, index) => $('preset' + (index + 1)).classList.toggle('primary', preset.join('') === order.join('')));
  order.forEach((side, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    const active = index === state.index && !state.forcedSide;
    button.className = 'turn ' + (side === 'b' ? 'black ' : '') + (active ? 'active' : '');
    button.textContent = side === 'w' ? '♔' : '♚';
    button.title = `Turn ${index + 1}: ${names[side]} (click to switch)`;
    button.setAttribute('aria-label', button.title);
    if (active) button.setAttribute('aria-current', 'step');
    button.onclick = () => { const next = [...order]; next[index] = side === 'w' ? 'b' : 'w'; modifyOrder(next); };
    $('turns').append(button);
  });
}
function renderStatus() {
  const result = state.result;
  let message;
  if (result?.type === 'checkmate') message = `Checkmate — ${names[result.winner]} wins!${result.reason === 'king-capture' ? ' King captured.' : ''}`;
  else if (result) {
    const draws = {
      stalemate: 'stalemate', 'insufficient-material': 'insufficient material',
      'fifty-move': '50-move rule', 'threefold-repetition': 'threefold repetition'
    };
    message = `Draw — ${draws[result.type]}.`;
  } else {
    message = `${names[state.side]} ${busy ? '(computer) is thinking…' : 'to move ' + (pvp() ? '(Player ' + (state.side === 'w' ? '1' : '2') + ')' : state.side === player() ? '(you)' : '(computer)')}`;
    const checked = ['w', 'b'].filter(side => state.inCheck(side));
    if (checked.length) message += ` — ${names[checked[0]]} is in check!`;
    if (state.forcedSide) message += ' Immediate check response; then the sequence resumes.';
    if (pausedAI) message += ' Computer paused after undo. Press Resume computer.';
    if (aiError) message = aiError;
  }
  $('status').textContent = message;
  $('undo').disabled = !state.snapshots.length;
  $('resumeAI').hidden = pvp() || !pausedAI || !!result || state.side !== engine();
}
function render() {
  // In local PvP, orient the view toward the player whose move is due.
  // Consecutive same-color turns retain their orientation.
  if (pvp() && !state.result) flipped = state.side === 'b';
  renderBoard();
  renderTurns();
  renderStatus();
  updateStrength();
  $('ruleNote').textContent = state.allowKingCapture
    ? 'King capture variant: check does not interrupt the turn sequence. Capture the opponent’s king to win immediately (counted as checkmate). Normal checkmate also ends the game. Your own king must remain safe. Undo restores captured kings; computer replies stay paused until resumed.'
    : 'Standard rules: check requires an immediate response, even between consecutive moves. An extra response does not consume the attacker’s next tile. Checkmate ends the game immediately; kings cannot be captured. Undo pauses computer replies until resumed.';
  if (pvp()) $('ruleNote').textContent = $('ruleNote').textContent.replace('computer replies stay paused until resumed.', 'each player moves when their color is due.').replace('Undo pauses computer replies until resumed.', 'Undo takes back one move for either player.');
  $('history').textContent = state.history.length ? state.history.map((move, index) =>
    `${index + 1}. ${names[move.color]} ${move.san}`).join('   ') : 'No moves yet.';
  celebrate(state.result);
}
function apply(move) {
  const played = state.play(move);
  if (!played) return false;
  selected = null;
  legal = [];
  render();
  return true;
}
function clickSquare(square) {
  if (state.result || busy || (!pvp() && state.side !== player())) return;
  if (selected && legal.some(move => move.to === square)) {
    if (apply({ from: selected, to: square, promotion: $('promotion').value })) queueAI();
    return;
  }
  const piece = state.game.get(square);
  selected = piece?.color === state.side ? square : null;
  legal = selected ? state.legalMoves().filter(move => move.from === selected) : [];
  renderBoard();
}
function queueAI() {
  if (pvp() || state.result || state.side !== engine() || busy || pausedAI) return;
  busy = true;
  renderStatus();
  const token = generation;
  const elo = Number($('elo').value);
  aiTimer = setTimeout(async () => {
    aiTimer = null;
    try {
      const move = await engineClient.choose(state, elo, { fast: $('thinking').value === 'fast' });
      if (token !== generation) return;
      busy = false;
      if (move) apply(move);
      else { state.updateResult(); render(); }
      queueAI();
    } catch (error) {
      if (token !== generation) return;
      console.error('Computer search failed:', error);
      busy = false;
      pausedAI = true;
      aiError = 'The computer could not finish its move. Press Resume computer to retry, or undo.';
      renderStatus();
    }
  }, 30);
}
$('newGame').onclick = reset;
$('side').onchange = reset;
$('mode').onchange = reset;
$('kingCapture').onchange = reset;
$('addWhite').onclick = () => modifyOrder([...order, 'w']);
$('addBlack').onclick = () => modifyOrder([...order, 'b']);
$('remove').onclick = () => { if (order.length > 1) modifyOrder(order.slice(0, -1)); };
$('preset1').onclick = () => modifyOrder(['w', 'b']);
$('preset2').onclick = () => modifyOrder([player(), player(), engine()]);
$('preset3').onclick = () => modifyOrder([player(), player(), player(), engine()]);
$('flip').onclick = () => { flipped = !flipped; renderBoard(); };
function updateStrength() {
  const profile = strengthForElo($('elo').value);
  $('elo').value = profile.elo;
  $('eloValue').textContent = levelForSetting(profile.elo);
  $('elo').setAttribute('aria-valuetext', `Level ${levelForSetting(profile.elo)} of 32`);
  const presets = { 600: '1', 1200: '2', 2000: '3', 3500: '4' };
  $('depth').value = presets[profile.elo] || 'custom';
  $('ratingNote').textContent = ratingNote({ setting: profile.elo, order, allowKingCapture: $('kingCapture').value === 'allowed', fast: $('thinking').value === 'fast', rulesHash: window.CHESS_RULES_SHA256 });
}
$('thinking').onchange = () => {
  updateStrength(); cancelAI(); renderStatus(); queueAI();
};
$('elo').oninput = () => {
  updateStrength();
  cancelAI();
  renderStatus();
  queueAI();
};
$('depth').onchange = () => {
  const presets = { '1': 600, '2': 1200, '3': 2000, '4': 3500 };
  if (presets[$('depth').value]) $('elo').value = presets[$('depth').value];
  updateStrength();
  cancelAI(); renderStatus(); queueAI();
};
$('undo').onclick = () => {
  if (!state.snapshots.length) return;
  cancelAI();
  state.undo();
  selected = null;
  legal = [];
  // Undo really undoes one ply. Do not silently replay it if it was an AI move.
  pausedAI = !pvp() && state.side === engine();
  render();
};
$('resumeAI').onclick = () => { cancelAI(); pausedAI = false; queueAI(); };
updateStrength();
reset();
