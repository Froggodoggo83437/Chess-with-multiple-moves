import { Chess } from 'chess.js';
import { createCelebration } from './celebration.js';
import rules from './rules.cjs';
const { CustomTurnRules, chooseMove } = rules;
const names = { w: 'White', b: 'Black' };
const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const $ = id => document.getElementById(id);
let order = ['w', 'w', 'b'];
let state, selected = null, legal = [], flipped = false, busy = false;
let generation = 0, aiTimer = null, pausedAI = false, aiError = '';
const squares = new Map();
const celebrate = createCelebration(document.querySelector('.boardWrap'), window.CHESS_PIECES);
const player = () => $('side').value;
const engine = () => player() === 'w' ? 'b' : 'w';

function cancelAI() {
  generation++;
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
    let coordinate = button.querySelector('.coord');
    if (rank === ranks.at(-1)) {
      if (!coordinate) { coordinate = document.createElement('span'); coordinate.className = 'coord'; button.append(coordinate); }
      coordinate.textContent = file;
    } else coordinate?.remove();
    const board = $('board');
    if (board.children[visualIndex] !== button) board.insertBefore(button, board.children[visualIndex] || null);
    visualIndex++;
  }
}
function renderTurns() {
  $('turns').replaceChildren();
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
    message = `${names[state.side]} ${busy ? '(computer) is thinking…' : 'to move ' + (state.side === player() ? '(you)' : '(computer)')}`;
    const checked = ['w', 'b'].filter(side => state.inCheck(side));
    if (checked.length) message += ` — ${names[checked[0]]} is in check!`;
    if (state.forcedSide) message += ' Immediate check response; then the sequence resumes.';
    if (pausedAI) message += ' Computer paused after undo. Press Resume computer.';
    if (aiError) message = aiError;
  }
  $('status').textContent = message;
  $('undo').disabled = !state.snapshots.length;
  $('resumeAI').hidden = !pausedAI || !!result || state.side !== engine();
}
function render() {
  renderBoard();
  renderTurns();
  renderStatus();
  $('ruleNote').textContent = state.allowKingCapture
    ? 'King capture variant: check does not interrupt the turn sequence. Capture the opponent’s king to win immediately (counted as checkmate). Normal checkmate also ends the game. Your own king must remain safe. Undo restores captured kings; computer replies stay paused until resumed.'
    : 'Standard rules: check requires an immediate response, even between consecutive moves. An extra response does not consume the attacker’s next tile. Checkmate ends the game immediately; kings cannot be captured. Undo pauses computer replies until resumed.';
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
  if (state.result || busy || state.side !== player()) return;
  if (selected && legal.some(move => move.to === square)) {
    if (apply({ from: selected, to: square, promotion: $('promotion').value })) queueAI();
    return;
  }
  const piece = state.game.get(square);
  selected = piece?.color === player() ? square : null;
  legal = selected ? state.legalMoves().filter(move => move.from === selected) : [];
  renderBoard();
}
function queueAI() {
  if (state.result || state.side !== engine() || busy || pausedAI) return;
  busy = true;
  renderStatus();
  const token = generation;
  const aiColor = engine();
  const depth = Number($('depth').value);
  aiTimer = setTimeout(async () => {
    aiTimer = null;
    try {
      const move = await chooseMove(state.clone(), depth, aiColor, { isCancelled: () => token !== generation });
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
  }, 180);
}
$('newGame').onclick = reset;
$('side').onchange = reset;
$('kingCapture').onchange = reset;
$('addWhite').onclick = () => modifyOrder([...order, 'w']);
$('addBlack').onclick = () => modifyOrder([...order, 'b']);
$('remove').onclick = () => { if (order.length > 1) modifyOrder(order.slice(0, -1)); };
$('preset1').onclick = () => modifyOrder(['w', 'b']);
$('preset2').onclick = () => modifyOrder([player(), player(), engine()]);
$('preset3').onclick = () => modifyOrder([player(), player(), player(), engine()]);
$('flip').onclick = () => { flipped = !flipped; renderBoard(); };
$('depth').onchange = () => { cancelAI(); renderStatus(); queueAI(); };
$('undo').onclick = () => {
  if (!state.snapshots.length) return;
  cancelAI();
  state.undo();
  selected = null;
  legal = [];
  // Undo really undoes one ply. Do not silently replay it if it was an AI move.
  pausedAI = state.side === engine();
  render();
};
$('resumeAI').onclick = () => { cancelAI(); pausedAI = false; queueAI(); };
reset();
