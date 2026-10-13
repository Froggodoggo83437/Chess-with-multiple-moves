// Standard piece legality comes from chess.js. This layer owns variant scheduling,
// terminal results, and repetition history, which FEN alone cannot represent.
class CustomTurnRules {
  constructor(Chess, order = ['w', 'w', 'b'], fen) {
    if (!order.length || order.some(side => !['w', 'b'].includes(side))) {
      throw new Error('Turn order must contain White or Black moves.');
    }
    this.Chess = Chess;
    this.order = [...order];
    this.game = new Chess(fen);
    this.index = 0;
    this.forcedSide = null;
    this.result = null;
    this.history = [];
    this.snapshots = [];
    this.repetitions = new Map();
    this.moveCache = new Map();
    // Also support a checked starting position without ever giving its attacker
    // an opportunity to capture the king.
    const checked = ['w', 'b'].filter(side => this.inCheck(side));
    if (checked.length > 1) throw new Error('Both kings cannot be in check.');
    if (checked.length && checked[0] !== this.order[this.index]) this.forcedSide = checked[0];
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
    if (!king) throw new Error('A chess position must contain both kings.');
    return this.game.isAttacked(king.square, side === 'w' ? 'b' : 'w');
  }

  legalMoves(side = this.side) {
    if (this.moveCache.has(side)) return this.moveCache.get(side);
    const position = side === this.game.turn() ? this.game : this.positionFor(side);
    // chess.js assumes reachable alternating positions. Explicitly protect the
    // opposing king even for externally supplied/custom-turn positions.
    const moves = position.moves({ verbose: true }).filter(move =>
      move.captured !== 'k' && position.get(move.to)?.type !== 'k');
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
    this.game = new this.Chess(snapshot.fen);
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
    const opponent = side === 'w' ? 'b' : 'w';
    if (this.inCheck(opponent) && this.order[this.index] !== opponent) this.forcedSide = opponent;
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

const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
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
async function chooseMove(state, depth, color, { isCancelled = () => false, yieldEvery = 32, timeBudgetMs = 2500 } = {}) {
  let nodes = 0;
  const cancelled = Symbol('cancelled');
  const timedOut = Symbol('timed-out');
  const started = Date.now();
  let completedMove = null;
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
  async function search(node, remaining, alpha, beta) {
    if (++nodes % yieldEvery === 0) await new Promise(resolve => setTimeout(resolve, 0));
    if (isCancelled()) throw cancelled;
    if (completedMove && Date.now() - started >= timeBudgetMs) throw timedOut;
    const result = terminal(node, remaining);
    if (result !== null) return result;
    if (remaining === 0) return evaluate(node, color);
    const maximizing = node.side === color;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of orderedMoves(node)) {
      const child = node.clone();
      child.play(move, false);
      const value = await search(child, remaining - 1, alpha, beta);
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  if (state.result || state.side !== color || isCancelled()) return null;
  depth = Math.max(1, Math.min(3, Number(depth) || 1));
  try {
    // Always finish a legal one-ply choice, then deepen within a bounded budget.
    // A partial deeper search must not overwrite the last completed result.
    for (let iteration = 1; iteration <= depth; iteration++) {
      let bestMove = null, bestScore = -Infinity;
      for (const move of orderedMoves(state)) {
        const child = state.clone();
        child.play(move, false);
        const score = await search(child, iteration - 1, bestScore, Infinity);
        if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      completedMove = bestMove;
      if (bestScore >= 100000 || Date.now() - started >= timeBudgetMs) break;
    }
    return isCancelled() ? null : completedMove;
  } catch (error) {
    if (error === cancelled) return null;
    if (error === timedOut) return isCancelled() ? null : completedMove;
    throw error;
  }
}

module.exports = { CustomTurnRules, chooseMove };
