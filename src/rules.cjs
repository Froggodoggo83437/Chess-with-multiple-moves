// Standard piece legality comes from chess.js. This layer owns variant scheduling,
// terminal results, and repetition history, which FEN alone cannot represent.
class CustomTurnRules {
  constructor(Chess, order = ['w', 'w', 'b'], fen, { allowKingCapture = false } = {}) {
    if (!order.length || order.some(side => !['w', 'b'].includes(side))) {
      throw new Error('Turn order must contain White or Black moves.');
    }
    this.Chess = Chess;
    this.allowKingCapture = allowKingCapture;
    this.order = [...order];
    this.game = new Chess(fen);
    this.index = 0;
    this.forcedSide = null;
    this.result = null;
    this.history = [];
    this.snapshots = [];
    this.repetitions = new Map();
    this.moveCache = new Map();
    // Standard mode gives a checked player priority. Capture mode deliberately
    // follows the scheduled sequence, allowing another attacking ply.
    const checked = ['w', 'b'].filter(side => this.inCheck(side));
    if (checked.length > 1) throw new Error('Both kings cannot be in check.');
    if (!this.allowKingCapture && checked.length && checked[0] !== this.order[this.index]) this.forcedSide = checked[0];
    this.alignTurn();
    this.recordPosition();
    this.updateResult();
  }

  get side() { return this.forcedSide || this.order[this.index]; }
  get lastMove() { return this.history.at(-1) || null; }

  positionFor(side) {
    const fields = this.game.fen().split(' ');
    if (fields[1] !== side) {
      fields[1] = side;
      // En passant lasts only the immediately following ply, and can only be
      // used by the opponent. Consecutive same-color moves expire it.
      fields[3] = '-';
    }
    return new this.Chess(fields.join(' '));
  }

  alignTurn() {
    if (this.game.turn() !== this.side) this.game = this.positionFor(this.side);
  }

  inCheck(side) {
    const king = this.game.board().flat().find(piece => piece?.type === 'k' && piece.color === side);
    if (!king) {
      if (this.result?.reason === 'king-capture') return false;
      throw new Error('A chess position must contain both kings.');
    }
    return this.game.isAttacked(king.square, side === 'w' ? 'b' : 'w');
  }

  legalMoves(side = this.side) {
    if (this.result) return [];
    if (this.moveCache.has(side)) return this.moveCache.get(side);
    const position = side === this.game.turn() ? this.game : this.positionFor(side);
    // In capture mode, chess.js may generate king captures from positions
    // reached by consecutive attacking plies. Other move legality stays intact.
    const cacheKey = position.fen();
    const cached = this.searchMoveCache?.get(cacheKey);
    if (cached) { this.moveCache.set(side, cached); return cached; }
    const moves = position.moves({ verbose: true }).filter(move =>
      this.allowKingCapture || (move.captured !== 'k' && position.get(move.to)?.type !== 'k'));
    if (this.searchMoveCache && this.searchMoveCache.size < 12000) this.searchMoveCache.set(cacheKey, moves);
    this.moveCache.set(side, moves);
    return moves;
  }

  positionKey() {
    return `${this.game.fen().split(' ').slice(0, 4).join(' ')}|${this.index}|${this.forcedSide || '-'}`;
  }

  recordPosition() {
    const key = this.positionKey();
    this.repetitions.set(key, (this.repetitions.get(key) || 0) + 1);
  }

  updateResult() {
    if (this.result?.reason === 'king-capture') return;
    this.result = null;
    // Checkmate is a win immediately, even if the attacker has unused slots.
    for (const side of ['w', 'b']) {
      if (this.inCheck(side) && !this.legalMoves(side).length) {
        this.result = { type: 'checkmate', winner: side === 'w' ? 'b' : 'w' };
        return;
      }
    }
    if (!this.legalMoves().length) this.result = { type: 'stalemate' };
    else if (this.game.isInsufficientMaterial()) this.result = { type: 'insufficient-material' };
    else if (Number(this.game.fen().split(' ')[4]) >= 100) this.result = { type: 'fifty-move' };
    else if ((this.repetitions.get(this.positionKey()) || 0) >= 3) this.result = { type: 'threefold-repetition' };
  }

  snapshot() {
    return {
      fen: this.game.fen(), index: this.index, forcedSide: this.forcedSide,
      result: this.result, history: [...this.history], repetitions: new Map(this.repetitions)
    };
  }

  restore(snapshot) {
    // Only a terminal king-capture board may omit a king. No further moves
    // or side changes are permitted on that board. Undo restores valid FEN.
    this.game = new this.Chess(snapshot.fen, { skipValidation: snapshot.result?.reason === 'king-capture' });
    this.index = snapshot.index;
    this.forcedSide = snapshot.forcedSide;
    this.result = snapshot.result;
    this.history = [...snapshot.history];
    this.repetitions = new Map(snapshot.repetitions);
    this.moveCache = new Map();
  }

  clone() {
    const copy = Object.create(CustomTurnRules.prototype);
    copy.Chess = this.Chess;
    copy.allowKingCapture = this.allowKingCapture;
    copy.searchMoveCache = this.searchMoveCache;
    copy.order = [...this.order];
    copy.snapshots = [];
    copy.restore(this.snapshot());
    return copy;
  }

  play(request, saveUndo = true) {
    if (this.result || !request) return null;
    const move = this.legalMoves().find(move =>
      move.from === request.from && move.to === request.to &&
      (!move.promotion || move.promotion === (request.promotion || 'q')));
    if (!move) return null;
    const before = this.snapshot();
    const side = this.side;
    const played = this.game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
    this.moveCache.clear();
    if (saveUndo) this.snapshots.push(before);
    this.history.push(played);
    // An extra check response does not consume someone else's scheduled slot.
    if (side === this.order[this.index]) this.index = (this.index + 1) % this.order.length;
    this.forcedSide = null;
    if (played.captured === 'k') {
      played.san = played.san.replace(/[+#]$/, '') + '#';
      this.result = { type: 'checkmate', winner: side, reason: 'king-capture' };
      return played;
    }
    const opponent = side === 'w' ? 'b' : 'w';
    if (!this.allowKingCapture && this.inCheck(opponent) && this.order[this.index] !== opponent) this.forcedSide = opponent;
    this.alignTurn();
    this.recordPosition();
    this.updateResult();
    return played;
  }

  undo() {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return false;
    this.restore(snapshot);
    return true;
  }
}

const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 100000 };
function evaluate(state, color) {
  let score = 0;
  const board = state.game.board();
  const pieces = board.flat().filter(Boolean);
  const material = pieces.reduce((sum, piece) => sum + (piece.type === 'k' ? 0 : VALUES[piece.type]), 0);
  const endgame = material < 2600;
  const bishops = { w: 0, b: 0 };
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const piece = board[row][col];
    if (!piece) continue;
    const enemy = piece.color === 'w' ? 'b' : 'w';
    const advance = piece.color === 'w' ? 6 - row : row - 1;
    const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
    let value = piece.type === 'k' ? 0 : VALUES[piece.type];
    if (piece.type === 'p') value += advance * (endgame ? 12 : 3) + center * 3;
    if (piece.type === 'n' || piece.type === 'b') {
      value += center * 10;
      if (row === (piece.color === 'w' ? 7 : 0)) value -= 20;
      if (piece.type === 'b') bishops[piece.color]++;
    }
    if (piece.type === 'r') {
      const ownPawn = pieces.some(p => p.type === 'p' && p.color === piece.color && p.square[0] === piece.square[0]);
      if (!ownPawn) value += 18;
      if (advance === 5) value += 20;
    }
    if (piece.type === 'k') {
      if (endgame) value += center * 10;
      else {
        value -= center * 12;
        if (row === (piece.color === 'w' ? 7 : 0) && [1, 2, 6].includes(col)) value += 35;
        const shieldRow = row + (piece.color === 'w' ? -1 : 1);
        for (const file of [col - 1, col, col + 1]) if (board[shieldRow]?.[file]?.color === piece.color && board[shieldRow][file].type === 'p') value += 12;
      }
    } else {
      // The fallback must recognize hanging pieces and bad exchanges even when
      // the time limit prevents the next full depth from completing.
      const attackers = state.game.attackers(piece.square, enemy);
      if (attackers.length) {
        const cheapest = Math.min(...attackers.map(square => VALUES[state.game.get(square).type]));
        const defended = state.game.isAttacked(piece.square, piece.color);
        const risk = defended ? Math.max(0, VALUES[piece.type] - cheapest) : VALUES[piece.type];
        value -= risk * (state.side === enemy ? 0.85 : 0.25);
      }
    }
    score += piece.color === color ? value : -value;
  }
  for (const side of ['w', 'b']) {
    let bonus = bishops[side] >= 2 ? 30 : 0;
    if (state.inCheck(side)) {
      // In capture mode an attacker with another scheduled move can win now.
      bonus -= state.allowKingCapture && state.side !== side ? 50000 : 55;
    }
    score += side === color ? bonus : -bonus;
  }
  return score;
}

// Cooperatively yield so reset, undo, and order edits can cancel an active search.
async function chooseMove(state, depth, color, { isCancelled = () => false, yieldEvery = 64, timeBudgetMs = 2500, sequenceExtension = 4, moveTolerance = 0, mistakeProbability = 0, random = Math.random, onIteration = () => {}, turnBeam = 3, lineLimit = 8, captureDepth = 3 } = {}) {
  // Search-only caches are shared by clones, never attached to the live game.
  // Full FEN keys preserve counters/rights; scores are not reused across draw
  // histories. Only move generation, static evaluation, and ordering are cached.
  state = state.clone();
  state.searchMoveCache = new Map();
  const evaluationCache = new Map();
  const principalMoves = new Map();
  function scorePosition(node) {
    const key = node.game.fen();
    if (evaluationCache.has(key)) return evaluationCache.get(key);
    const score = evaluate(node, color);
    if (evaluationCache.size < 12000) evaluationCache.set(key, score);
    return score;
  }
  let nodes = 0;
  const cancelled = Symbol('cancelled');
  const timedOut = Symbol('timed-out');
  const started = Date.now();
  let completedMove = null;
  let completedScores = [];
  let quiescenceEnabled = false;
  function terminal(node) {
    if (!node.result) return null;
    if (node.result.type !== 'checkmate') return 0;
    const distance = node.history.length - state.history.length;
    return node.result.winner === color ? 1000000 - distance : -1000000 + distance;
  }
  function orderedMoves(node, preferred) {
    preferred ||= principalMoves.get(node.positionKey());
    const enemyKing = node.game.board().flat().find(piece => piece?.type === 'k' && piece.color !== node.side)?.square;
    const priority = move => (preferred && move.lan === preferred.lan ? 1000000 : 0)
      + (move.captured ? VALUES[move.captured] * 10 - VALUES[move.piece] : 0)
      + (VALUES[move.promotion] || 0) + (/[+#]/.test(move.san) ? 200 : 0)
      + (enemyKing && ['r', 'q'].includes(move.piece) && (move.to[0] === enemyKing[0] || move.to[1] === enemyKing[1]) ? 80 : 0)
      + (['n', 'b'].includes(move.piece) ? (7 - Math.abs(3.5 - (move.to.charCodeAt(0) - 97)) - Math.abs(3.5 - (Number(move.to[1]) - 1))) * 5 : 0);
    return [...node.legalMoves()].sort((a, b) => priority(b) - priority(a));
  }
  async function checkpoint() {
    if (++nodes % yieldEvery === 0) await new Promise(resolve => setTimeout(resolve, 0));
    if (isCancelled()) throw cancelled;
    if (completedMove && Date.now() - started >= timeBudgetMs) throw timedOut;
  }
  const customSequence = state.order.some((side, index) => side === state.order[(index + 1) % state.order.length]);
  function replyHorizon() {
    let index = state.index;
    let side = state.side;
    let opponentMoved = false;
    for (let plies = 1; plies <= lineLimit; plies++) {
      opponentMoved ||= side !== color;
      if (side === state.order[index]) index = (index + 1) % state.order.length;
      side = state.order[index];
      if (opponentMoved && side === color) return plies;
    }
    return Math.min(lineLimit, state.order.length + 2);
  }
  async function planTurn(node, remaining, opponentMoved, alpha, beta, beamWidth) {
    await checkpoint();
    const result = terminal(node);
    if (result !== null) return result;
    // A decision covers the rest of our block AND the opponent's entire reply
    // block. In WWB, Black must see both White moves before evaluating safety.
    if (remaining <= 0 || (opponentMoved && node.side === color)) return scorePosition(node);
    const maximizing = node.side === color;
    let best = maximizing ? -Infinity : Infinity;
    // A bounded selective pass is completed before exhaustive deepening. It
    // checks every root move, retaining captures/checks and promising quiet moves.
    const candidates = orderedMoves(node).slice(0, beamWidth);
    for (const move of candidates) {
      const child = node.clone();
      child.play(move, false);
      const value = await planTurn(child, remaining - 1, opponentMoved || node.side !== color, alpha, beta, beamWidth);
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  async function completeTurnPlan(beamWidth) {
    let bestMove = null, bestScore = -Infinity;
    const scores = [];
    const horizon = replyHorizon();
    for (const move of orderedMoves(state, completedMove)) {
      const child = state.clone();
      child.play(move, false);
      const value = await planTurn(child, horizon - 1, false, -Infinity, Infinity, beamWidth);
      // A selective search is guidance, not proof of a forced win/loss: omitted
      // defensive moves may change the outcome. Full search still verifies it.
      const score = Math.max(-90000, Math.min(90000, value));
      scores.push({ move, score });
      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    completedMove = bestMove;
    completedScores = scores;
    onIteration({ depth: 0, phase: 'custom-turn-plan', beamWidth, nodes, scores });
  }
  async function quiescence(node, alpha, beta, remaining = captureDepth) {
    await checkpoint();
    const result = terminal(node);
    if (result !== null) return result;
    const inCheck = node.inCheck(node.side);
    const maximizing = node.side === color;
    const standPat = scorePosition(node);
    if (remaining === 0) return standPat;
    let best = inCheck ? (maximizing ? -Infinity : Infinity) : standPat;
    if (!inCheck) {
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) return best;
    }
    // At a checked node, all evasions matter; standing still is not an option.
    const consecutiveAttack = node.allowKingCapture && node.order[(node.index + 1) % node.order.length] === node.side;
    const moves = orderedMoves(node).filter(move => inCheck || move.captured || move.promotion
      || (remaining >= 2 && consecutiveAttack && /[+#]/.test(move.san)));
    for (const move of moves) {
      const child = node.clone();
      child.play(move, false);
      const value = await quiescence(child, alpha, beta, remaining - 1);
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  async function search(node, remaining, alpha, beta, lastMover, extensionsLeft) {
    await checkpoint();
    const result = terminal(node);
    if (result !== null) return result;
    if (remaining <= 0) {
      // Never assume alternating minimax levels. Finish an interrupted same-color
      // run when possible, including the human's consecutive attacking moves.
      // First complete a cheap one-ply fallback before spending time on extensions.
      if (!completedMove) return scorePosition(node);
      if (node.side !== lastMover || extensionsLeft <= 0) return quiescenceEnabled ? quiescence(node, alpha, beta) : scorePosition(node);
      remaining = 1;
      extensionsLeft--;
    }
    const maximizing = node.side === color;
    let best = maximizing ? -Infinity : Infinity;
    let bestMove;
    for (const move of orderedMoves(node)) {
      const child = node.clone();
      child.play(move, false);
      const value = await search(child, remaining - 1, alpha, beta, node.side, extensionsLeft);
      if (maximizing ? value > best : value < best) bestMove = move;
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    if (bestMove && principalMoves.size < 12000) principalMoves.set(node.positionKey(), bestMove);
    return best;
  }
  if (state.result || state.side !== color || isCancelled()) return null;
  depth = Math.max(1, Math.min(8, Number(depth) || 1));
  function selectCompleted() {
    if (!completedMove || isCancelled()) return null;
    const best = Math.max(...completedScores.map(candidate => candidate.score));
    // Do not discard a known forced win just to simulate a lower rating.
    if (best >= 100000 || moveTolerance <= 0 || random() >= mistakeProbability) return completedMove;
    const candidates = completedScores.filter(candidate => candidate.score >= best - moveTolerance && candidate.score > -100000);
    return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))].move : completedMove;
  }
  try {
    // Always finish a legal one-ply choice, then deepen within a bounded budget.
    // A partial deeper search must not overwrite the last completed result.
    let previousDepth = 0;
    for (let iteration = 1; iteration <= depth; iteration++) {
      const targetDepth = iteration === 1 || !customSequence ? iteration : Math.min(lineLimit, replyHorizon() + iteration - 2);
      if (targetDepth === previousDepth) break;
      previousDepth = targetDepth;
      // Finish an affordable tactical baseline before adding exchange searches.
      quiescenceEnabled = iteration >= 3;
      let bestMove = null, bestScore = -Infinity;
      const scores = [];
      for (const move of orderedMoves(state, completedMove)) {
        const child = state.clone();
        child.play(move, false);
        const score = await search(child, targetDepth - 1, moveTolerance > 0 ? -Infinity : bestScore, Infinity, state.side, sequenceExtension);
        scores.push({ move, score });
        if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      completedMove = bestMove;
      completedScores = scores;
      onIteration({ depth: targetDepth, phase: 'full-search', nodes, scores });
      if (bestScore >= 100000 || Date.now() - started >= timeBudgetMs) break;
      if (iteration === 1 && customSequence && depth > 1) {
        await completeTurnPlan(3);
        if (turnBeam > 3) await completeTurnPlan(turnBeam);
      }
    }
    return selectCompleted();
  } catch (error) {
    if (error === cancelled) return null;
    if (error === timedOut) return selectCompleted();
    throw error;
  }
}

// These are strength presets, not ratings measured against a rated player pool.
function strengthForElo(value) {
  const numeric = Number(value);
  const elo = Math.round(Math.max(400, Math.min(3500, Number.isFinite(numeric) ? numeric : 1200)) / 100) * 100;
  return {
    elo,
    depth: elo < 900 ? 2 : elo < 1500 ? 3 : elo < 2000 ? 4 : elo < 2800 ? 6 : 8,
    timeBudgetMs: Math.round(elo <= 2400 ? 250 + ((elo - 400) / 2000) ** 2 * 3750 : 4000 + ((elo - 2400) / 1100) * 8000),
    sequenceExtension: elo >= 2800 ? 6 : 4,
    turnBeam: elo >= 3000 ? 6 : elo >= 2500 ? 4 : 3,
    lineLimit: elo >= 2800 ? 12 : 8,
    captureDepth: elo >= 2800 ? 4 : 3,
    moveTolerance: Math.max(0, (1700 - elo) * 0.4),
    mistakeProbability: Math.max(0, (1800 - elo) / 2000)
  };
}
function chooseMoveForElo(state, elo, color, options = {}) {
  const profile = strengthForElo(elo);
  return chooseMove(state, profile.depth, color, { ...profile, ...options });
}
module.exports = { CustomTurnRules, chooseMove, chooseMoveForElo, strengthForElo };
