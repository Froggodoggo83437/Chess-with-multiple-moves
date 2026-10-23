// Piece geometry comes from pinned chess.js. This layer owns turn-block king
// safety, scheduling, terminal results, and repetition history.
// chess.js 1.4.0 is pinned. Encapsulate its pseudo-legal generator here:
// castling attack/path restrictions still apply, but ordinary moves may leave
// the king attacked while a multi-move turn has a verified safe continuation.
function withPseudoLegal(position,operation){
  const original=position._moves;
  if(typeof original!=='function')throw Error('Unsupported chess.js pseudo-legal API');
  position._moves=function(options={}){return original.call(this,{...options,legal:false});};
  try{return operation();}finally{position._moves=original;}
}
function pseudoRequests(position){
  const square=index=>String.fromCharCode(97+(index&15))+(8-(index>>4));
  return position._moves({legal:false}).map(move=>({from:square(move.from),to:square(move.to),...(move.promotion?{promotion:move.promotion}:{})}));
}
const requestKey=move=>move.from+move.to+(move.promotion||'');
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
    this.escapeCache = new Map();
    const checked = ['w', 'b'].filter(side => this.inCheck(side));
    if (checked.length > 1) throw new Error('Both kings cannot be in check in a starting position.');
    this.alignTurn();
    this.recordPosition();
    this.updateResult();
  }

  get side() { return this.order[this.index]; }
  get lastMove() { return this.history.at(-1) || null; }

  positionFor(side) {
    const fields = this.game.fen({forceEnpassantSquare:true}).split(' ');
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

  movesRemaining(side=this.side){
    let start=this.index;
    if(this.order[start]!==side){
      let offset=1;while(offset<this.order.length&&this.order[(start+offset)%this.order.length]!==side)offset++;
      if(offset===this.order.length)return 1; // hypothetical defense; no extra turn is granted
      start=(start+offset)%this.order.length;
    }
    let count=1;
    while(count<this.order.length&&this.order[(start+count)%this.order.length]===side)count++;
    // With no opponent tiles there is always another move. Require a finite
    // safe continuation within a full configured cycle (at least two plies).
    return this.order.every(color=>color===side)?Math.max(2,this.order.length):count;
  }

  checkedPosition(position,side){
    const king=position.board().flat().find(piece=>piece?.type==='k'&&piece.color===side);
    return !king||position.isAttacked(king.square,side==='w'?'b':'w');
  }

  canFinishSafely(position,side,remaining){
    if(!this.checkedPosition(position,side))return true;
    if(remaining<=0)return false;
    const key=position.fen({forceEnpassantSquare:true}).split(' ').slice(0,4).join(' ')+`|${side}|${remaining}|${this.allowKingCapture}`;
    if(this.escapeCache.has(key))return this.escapeCache.get(key);
    // Any ordinary legal move resolves check immediately. Further moves can
    // keep the king safe, or end in a legitimate stalemate with a safe king.
    let safe=position.moves({verbose:true}).some(move=>this.allowKingCapture||move.captured!=='k');
    if(!safe&&remaining>1){
      for(const request of pseudoRequests(position)){
        const captured=position.get(request.to);
        if(captured?.type==='k')continue; // a terminal capture cannot be an unsafe intermediate step
        const child=new this.Chess(position.fen({forceEnpassantSquare:true}));
        withPseudoLegal(child,()=>child.move(request));
        const fields=child.fen({forceEnpassantSquare:true}).split(' ');fields[1]=side;fields[3]='-';child.load(fields.join(' '));
        if(this.canFinishSafely(child,side,remaining-1)){safe=true;break;}
      }
    }
    if(this.escapeCache.size<12000)this.escapeCache.set(key,safe);
    return safe;
  }

  legalMoves(side = this.side) {
    if (this.result) return [];
    if (this.moveCache.has(side)) return this.moveCache.get(side);
    const position = side === this.game.turn() ? this.game : this.positionFor(side);
    const remaining=this.movesRemaining(side);
    const cacheKey = `${this.allowKingCapture}|${remaining}|`+(this.searchMoveCache ? position.fen({forceEnpassantSquare:true}).split(' ').slice(0,4).join(' ') : position.fen({forceEnpassantSquare:true}));
    const cached = this.searchMoveCache?.get(cacheKey);
    if (cached) { this.moveCache.set(side, cached); return cached; }
    const moves = position.moves({ verbose: true }).filter(move =>this.allowKingCapture||move.captured!=='k');
    if(remaining>1){
      const ordinary=new Set(moves.map(requestKey));
      for(const request of pseudoRequests(position)){
        if(ordinary.has(requestKey(request))||position.get(request.to)?.type==='k')continue;
        const child=new this.Chess(position.fen({forceEnpassantSquare:true}));
        const played=withPseudoLegal(child,()=>child.move(request));
        const fields=child.fen({forceEnpassantSquare:true}).split(' ');fields[1]=side;fields[3]='-';child.load(fields.join(' '));
        if(this.canFinishSafely(child,side,remaining-1))moves.push(played);
      }
    }
    if (this.searchMoveCache && this.searchMoveCache.size < 12000) this.searchMoveCache.set(cacheKey, moves);
    this.moveCache.set(side, moves);
    return moves;
  }

  positionKey() {
    const fields=this.game.fen({forceEnpassantSquare:true}).split(' ').slice(0,4);
    // Preserve rights in snapshots, but repetition distinguishes en passant
    // only when it is actually available under this turn's safety rules.
    if(fields[3]!=='-'&&!this.legalMoves().some(move=>move.flags.includes('e')))fields[3]='-';
    return `${fields.join(' ')}|${this.index}|${this.forcedSide || '-'}`;
  }

  recordPosition() {
    const key = this.positionKey();
    this.repetitions.set(key, (this.repetitions.get(key) || 0) + 1);
  }

  updateResult() {
    if (this.result?.reason === 'king-capture') return;
    this.result = null;
    // Test the defender's remaining/upcoming block, not standard one-ply mate.
    // A player with a temporarily exposed king cannot claim a mating win.
    for (const side of ['w', 'b']) {
      if (this.inCheck(side) && !this.inCheck(side==='w'?'b':'w') && !this.legalMoves(side).length) {
        this.result = { type: 'checkmate', winner: side === 'w' ? 'b' : 'w' };
        return;
      }
    }
    if (!this.legalMoves().length) this.result = this.inCheck(this.side)?{type:'checkmate',winner:this.side==='w'?'b':'w'}:{ type: 'stalemate' };
    else if(this.lastMove?.color===this.side&&this.inCheck(this.side))return; // do not end an unfinished unsafe turn as a draw
    else if (this.game.isInsufficientMaterial()) this.result = { type: 'insufficient-material' };
    else if (Number(this.game.fen({forceEnpassantSquare:true}).split(' ')[4]) >= 100) this.result = { type: 'fifty-move' };
    else if ((this.repetitions.get(this.positionKey()) || 0) >= 3) this.result = { type: 'threefold-repetition' };
  }

  snapshot() {
    return {
      fen: this.game.fen({forceEnpassantSquare:true}), index: this.index, forcedSide: this.forcedSide,
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
    copy.escapeCache = this.escapeCache;
    copy.order = [...this.order];
    copy.snapshots = [];
    copy.restore({fen:this.game.fen({forceEnpassantSquare:true}),index:this.index,forcedSide:this.forcedSide,result:this.result,history:this.history,repetitions:this.repetitions});
    return copy;
  }

  play(request, saveUndo = true) {
    if (this.result || !request) return null;
    const move = this.legalMoves().find(move =>
      move.from === request.from && move.to === request.to &&
      (!move.promotion || move.promotion === (request.promotion || 'q')));
    if (!move) return null;
    const before = saveUndo ? this.snapshot() : null;
    const side = this.side;
    const played = withPseudoLegal(this.game,()=>this.game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }));
    this.moveCache.clear();
    if (saveUndo) this.snapshots.push(before);
    this.history.push(played);
    // Check never changes or interrupts the configured sequence.
    this.index = (this.index + 1) % this.order.length;
    this.forcedSide = null;
    if (played.captured === 'k') {
      played.san = played.san.replace(/[+#]$/, '') + '#';
      this.result = { type: 'checkmate', winner: side, reason: 'king-capture' };
      return played;
    }
    this.alignTurn();
    this.recordPosition();
    this.updateResult();
    // Standard SAN's one-ply mate suffix is not authoritative in this variant.
    played.san=played.san.replace(/[+#]$/,'');
    if(this.result?.type==='checkmate'&&this.result.winner===side)played.san+='#';
    else if(this.inCheck(side==='w'?'b':'w'))played.san+='+';
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
  const bishops = { w: 0, b: 0 }, pawns={w:Array(8).fill(0),b:Array(8).fill(0)};
  for(const piece of pieces)if(piece.type==='p')pawns[piece.color][piece.square.charCodeAt(0)-97]++;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const piece = board[row][col];
    if (!piece) continue;
    const enemy = piece.color === 'w' ? 'b' : 'w';
    const advance = piece.color === 'w' ? 6 - row : row - 1;
    const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
    let value = piece.type === 'k' ? 0 : VALUES[piece.type];
    if (piece.type === 'p') {
      value += advance * (endgame ? 12 : 3) + center * 3;
      if(pawns[piece.color][col]>1)value-=12;
      if(!pawns[piece.color][col-1]&&!pawns[piece.color][col+1])value-=10;
      const passed=!pieces.some(other=>other.type==='p'&&other.color===enemy&&Math.abs(other.square.charCodeAt(0)-piece.square.charCodeAt(0))<=1&&(piece.color==='w'?Number(other.square[1])>Number(piece.square[1]):Number(other.square[1])<Number(piece.square[1])));
      if(passed)value+=Math.max(0,advance)*Math.max(0,advance)*(endgame?5:2);
    }
    if (piece.type === 'n' || piece.type === 'b') {
      value += center * 10;
      if (row === (piece.color === 'w' ? 7 : 0)) value -= 20;
      if (piece.type === 'b') bishops[piece.color]++;
    }
    if (piece.type === 'r') {
      const ownPawn = pawns[piece.color][col]>0;
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

// Pick by calculated quality, with deliberate errors only at lower strengths.
// Exclude equally good moves from the mistake pool so Beginner doesn't merely
// randomize between the engine's best choices.
function pickStrengthMove(scores, { moveTolerance = 0, mistakeProbability = 0, minimumMistake = 1, random = Math.random } = {}) {
  if (!scores.length) return null;
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best.score >= 100000 || moveTolerance <= 0 || mistakeProbability <= 0 || random() >= mistakeProbability) return best.move;
  const mistakes = ranked.filter(candidate =>
    candidate.score <= best.score - minimumMistake &&
    candidate.score >= best.score - moveTolerance && candidate.score > -100000);
  if (!mistakes.length) return best.move;
  return mistakes[Math.min(mistakes.length - 1, Math.floor(random() * mistakes.length))].move;
}

// Cooperatively yield so reset, undo, and order edits can cancel an active search.
async function chooseMove(state, depth, color, { isCancelled = () => false, yieldEvery = 64, timeBudgetMs = 2500, sequenceExtension = 4, moveTolerance = 0, mistakeProbability = 0, minimumMistake = 1, random = Math.random, onIteration = () => {}, turnBeam = 3, lineLimit = 8, captureDepth = 3, useTranspositions = true } = {}) {
  // Search-only caches are shared by clones, never attached to the live game.
  // Full FEN keys preserve counters/rights; scores are not reused across draw
  // histories. Only move generation, static evaluation, and ordering are cached.
  state = state.clone();
  state.searchMoveCache = new Map();
  state.escapeCache = new Map();
  const evaluationCache = new Map();
  const principalMoves = new Map(), killers=new Map(), historyScores=new Map(), transpositions=new Map();
  let ttHits=0;
  // The root draw history is fixed for this table. Store only path deltas
  // until an irreversible move resets the relevant repetition history.
  state.searchRepetitions=new Map();state.searchResetHistory=false;
  function childPosition(node,move){
    const child=node.clone();child.play(move,false);
    // Pawn moves, captures and lost castling rights make all earlier boards
    // unreachable. Otherwise retain every relevant repetition count in the key.
    const irreversible=move.piece==='p'||move.captured||node.game.fen({forceEnpassantSquare:true}).split(' ')[2]!==child.game.fen({forceEnpassantSquare:true}).split(' ')[2];
    child.searchResetHistory=node.searchResetHistory||!!irreversible;
    child.searchRepetitions=irreversible?new Map():new Map(node.searchRepetitions);
    const key=child.positionKey();child.searchRepetitions.set(key,(child.searchRepetitions.get(key)||0)+1);
    return child;
  }
  function tableKey(node,remaining,lastMover,extensionsLeft){
    const repetitions=[...node.searchRepetitions].sort((a,b)=>a[0].localeCompare(b[0]));
    return JSON.stringify([node.game.fen({forceEnpassantSquare:true}),node.index,node.forcedSide,remaining,lastMover,extensionsLeft,quiescenceEnabled,node.history.length-state.history.length,node.searchResetHistory,repetitions]);
  }
  function scorePosition(node) {
    const key = node.game.fen({forceEnpassantSquare:true});
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
    const ply=node.history.length-state.history.length, killer=killers.get(ply)||[];
    return node.legalMoves().map(move=>({move,priority:priority(move)+(killer.includes(move.lan)?120:0)+Math.min(100,historyScores.get(node.side+move.lan)||0)})).sort((a,b)=>b.priority-a.priority).map(item=>item.move);
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
    const candidates = orderedMoves(node).filter((move,index)=>index<beamWidth||move.captured||move.promotion||/[+#]/.test(move.san));
    let bestMove;
    for (const move of candidates) {
      const child = childPosition(node,move);
      const value = await planTurn(child, remaining - 1, opponentMoved || node.side !== color, alpha, beta, beamWidth);
      if(maximizing?value>best:value<best)bestMove=move;
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    if(bestMove&&principalMoves.size<12000)principalMoves.set(node.positionKey(),bestMove);
    return best;
  }
  async function completeTurnPlan(beamWidth) {
    let bestMove = null, bestScore = -Infinity;
    const scores = [];
    const horizon = replyHorizon();
    for (const move of orderedMoves(state, completedMove)) {
      const child = childPosition(state,move);
      const value = await planTurn(child, horizon - 1, false, -Infinity, Infinity, beamWidth);
      // A selective search is guidance, not proof of a forced win/loss: omitted
      // defensive moves may change the outcome. Full search still verifies it.
      const score = Math.max(-90000, Math.min(90000, value));
      scores.push({ move, score });
      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    completedMove = bestMove;
    completedScores = scores;
    onIteration({ depth: 0, phase: 'custom-turn-plan', beamWidth, nodes, ttHits, elapsedMs:Date.now()-started, scores });
  }
  async function quiescence(node, alpha, beta, remaining = captureDepth) {
    await checkpoint();
    const result = terminal(node);
    if (result !== null) return result;
    const inCheck = node.inCheck(node.side);
    const maximizing = node.side === color;
    const standPat = scorePosition(node);
    if (remaining <= 0 && (!inCheck || remaining <= -2)) return standPat;
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
      const child = childPosition(node,move);
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
    const originalAlpha=alpha,originalBeta=beta;
    const cacheKey=useTranspositions?tableKey(node,remaining,lastMover,extensionsLeft):null;
    const cached=cacheKey&&transpositions.get(cacheKey);
    if(cached){
      ttHits++;
      if(cached.bound==='exact')return cached.score;
      if(cached.bound==='lower')alpha=Math.max(alpha,cached.score);else beta=Math.min(beta,cached.score);
      if(alpha>=beta)return cached.score;
    }
    const maximizing = node.side === color;
    let best = maximizing ? -Infinity : Infinity;
    let bestMove;
    for (const move of orderedMoves(node)) {
      const child = childPosition(node,move);
      const value = await search(child, remaining - 1, alpha, beta, node.side, extensionsLeft);
      if (maximizing ? value > best : value < best) bestMove = move;
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha){
        if(!move.captured&&!move.promotion){
          const ply=node.history.length-state.history.length,previous=killers.get(ply)||[];
          killers.set(ply,[move.lan,...previous.filter(item=>item!==move.lan)].slice(0,2));
          const key=node.side+move.lan;historyScores.set(key,Math.min(10000,(historyScores.get(key)||0)+remaining*remaining));
        }
        break;
      }
    }
    if(cacheKey&&transpositions.size<16000)transpositions.set(cacheKey,{score:best,bound:best<=originalAlpha?'upper':best>=originalBeta?'lower':'exact'});
    if (bestMove && principalMoves.size < 12000) principalMoves.set(node.positionKey(), bestMove);
    return best;
  }
  if (state.result || state.side !== color || isCancelled()) return null;
  const available = state.legalMoves();
  if (available.length === 1) return available[0];
  const kingCapture=available.find(move=>move.captured==='k');if(kingCapture)return kingCapture;
  depth = Math.max(1, Math.min(8, Number(depth) || 1));
  function selectCompleted() {
    if (!completedMove || isCancelled()) return null;
    return pickStrengthMove(completedScores, { moveTolerance, mistakeProbability, minimumMistake, random });
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
        const child = childPosition(state,move);
        // Mate or king capture in one is already an optimal win; no need to
        // score the other choices or spend the whole thinking allowance.
        if (child.result?.type === 'checkmate' && child.result.winner === color) return move;
        const score = await search(child, targetDepth - 1, moveTolerance > 0 ? -Infinity : bestScore, Infinity, state.side, sequenceExtension);
        scores.push({ move, score });
        if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      completedMove = bestMove;
      completedScores = scores;
      onIteration({ depth: targetDepth, phase: 'full-search', nodes, ttHits, elapsedMs:Date.now()-started, scores });
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

// Behavioral strength anchors; these have not been calibrated as real Elo.
const STRENGTH_ANCHORS = [
  { elo: 400, errors: .90, loss: 1200, time: 250 },
  { elo: 800, errors: .78, loss: 700, time: 500 },
  { elo: 1200, errors: .55, loss: 400, time: 900 },
  { elo: 1600, errors: .35, loss: 220, time: 1500 },
  { elo: 2000, errors: .18, loss: 100, time: 2500 },
  { elo: 2400, errors: .08, loss: 50, time: 3000 },
  { elo: 2800, errors: .03, loss: 25, time: 4500 },
  { elo: 3200, errors: .008, loss: 8, time: 6000 },
  { elo: 3500, errors: 0, loss: 0, time: 8000 }
];
function strengthForElo(value) {
  const numeric = Number(value);
  const elo = Math.round(Math.max(400, Math.min(3500, Number.isFinite(numeric) ? numeric : 1200)) / 100) * 100;
  const upper = STRENGTH_ANCHORS.findIndex(anchor => anchor.elo >= elo);
  const high = STRENGTH_ANCHORS[upper];
  const low = STRENGTH_ANCHORS[Math.max(0, upper - 1)];
  const fraction = high.elo === low.elo ? 0 : (elo - low.elo) / (high.elo - low.elo);
  const interpolate = key => low[key] + (high[key] - low[key]) * fraction;
  return {
    elo,
    depth: elo < 900 ? 2 : elo < 1500 ? 3 : elo < 2000 ? 4 : elo < 2800 ? 6 : 8,
    timeBudgetMs: Math.round(interpolate('time')),
    sequenceExtension: elo >= 2800 ? 6 : 4,
    turnBeam: elo >= 3000 ? 6 : elo >= 2500 ? 4 : 3,
    lineLimit: elo >= 2800 ? 12 : 8,
    captureDepth: elo >= 2800 ? 4 : 3,
    moveTolerance: Math.round(interpolate('loss')),
    mistakeProbability: interpolate('errors'),
    minimumMistake: Math.max(1, Math.round((1800 - elo) / 70))
  };
}
function chooseMoveForElo(state, elo, color, options = {}) {
  const profile = strengthForElo(elo);
  return chooseMove(state, profile.depth, color, { ...profile, ...options });
}
module.exports = { CustomTurnRules, chooseMove, chooseMoveForElo, strengthForElo, pickStrengthMove };
