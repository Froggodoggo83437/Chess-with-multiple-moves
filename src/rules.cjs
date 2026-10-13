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
    const moves = position.moves({ verbose: true }).filter(move =>
      this.allowKingCapture || (move.captured !== 'k' && position.get(move.to)?.type !== 'k'));
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
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      let value = VALUES[piece.type];
      if (piece.type === 'p') value += (piece.color === 'w' ? 6 - row : row - 1) * 6;
      if (piece.type === 'n' || piece.type === 'b') value += (7 - Math.abs(3.5 - row) - Math.abs(3.5 - col)) * 4;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

// Cooperatively yield so reset, undo, and order edits can cancel an active search.
async function chooseMove(state, depth, color, { isCancelled = () => false, yieldEvery = 32, timeBudgetMs = 2500, sequenceExtension = 4, moveTolerance = 0, mistakeProbability = 0, random = Math.random } = {}) {
  let nodes = 0;
  const cancelled = Symbol('cancelled');
  const timedOut = Symbol('timed-out');
  const started = Date.now();
  let completedMove = null;
  let completedScores = [];
  function terminal(node, remaining) {
    if (!node.result) return null;
    if (node.result.type !== 'checkmate') return 0;
    return node.result.winner === color ? 100000 + remaining : -100000 - remaining;
  }
  function orderedMoves(node) {
    return node.legalMoves().sort((a, b) =>
      ((VALUES[b.captured] || 0) + (VALUES[b.promotion] || 0)) -
      ((VALUES[a.captured] || 0) + (VALUES[a.promotion] || 0)));
  }
  async function search(node, remaining, alpha, beta, lastMover, extensionsLeft) {
    if (++nodes % yieldEvery === 0) await new Promise(resolve => setTimeout(resolve, 0));
    if (isCancelled()) throw cancelled;
    if (completedMove && Date.now() - started >= timeBudgetMs) throw timedOut;
    const result = terminal(node, remaining);
    if (result !== null) return result;
    if (remaining <= 0) {
      // Never assume alternating minimax levels. Finish an interrupted same-color
      // run when possible, including the human's consecutive attacking moves.
      // First complete a cheap one-ply fallback before spending time on extensions.
      if (!completedMove || node.side !== lastMover || extensionsLeft <= 0) return evaluate(node, color);
      remaining = 1;
      extensionsLeft--;
    }
    const maximizing = node.side === color;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of orderedMoves(node)) {
      const child = node.clone();
      child.play(move, false);
      const value = await search(child, remaining - 1, alpha, beta, node.side, extensionsLeft);
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  if (state.result || state.side !== color || isCancelled()) return null;
  depth = Math.max(1, Math.min(6, Number(depth) || 1));
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
    for (let iteration = 1; iteration <= depth; iteration++) {
      let bestMove = null, bestScore = -Infinity;
      const scores = [];
      for (const move of orderedMoves(state)) {
        const child = state.clone();
        child.play(move, false);
        const score = await search(child, iteration - 1, moveTolerance > 0 ? -Infinity : bestScore, Infinity, state.side, sequenceExtension);
        scores.push({ move, score });
        if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      completedMove = bestMove;
      completedScores = scores;
      if (bestScore >= 100000 || Date.now() - started >= timeBudgetMs) break;
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
  const elo = Math.round(Math.max(400, Math.min(2400, Number.isFinite(numeric) ? numeric : 1200)) / 100) * 100;
  return {
    elo,
    depth: elo < 900 ? 2 : elo < 1500 ? 3 : elo < 2000 ? 4 : 6,
    timeBudgetMs: Math.round(250 + ((elo - 400) / 2000) ** 2 * 3750),
    sequenceExtension: 4,
    moveTolerance: Math.max(0, (1700 - elo) * 0.4),
    mistakeProbability: Math.max(0, (1800 - elo) / 2000)
  };
}
function chooseMoveForElo(state, elo, color, options = {}) {
  const profile = strengthForElo(elo);
  return chooseMove(state, profile.depth, color, { ...profile, ...options });
}
module.exports = { CustomTurnRules, chooseMove, chooseMoveForElo, strengthForElo };
