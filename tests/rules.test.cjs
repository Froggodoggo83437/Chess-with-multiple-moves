const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { CustomTurnRules: Rules, chooseMove } = require('../src/rules.cjs');
const make = (order = ['w', 'b'], fen) => new Rules(Chess, order, fen);
const move = (state, from, to, promotion) => {
  const played = state.play({ from, to, promotion });
  assert.ok(played, `Expected ${from}-${to} to be legal (${state.game.fen()})`);
  return played;
};
const has = (state, from, to) => state.legalMoves().some(m => m.from === from && m.to === to);
const kings = state => assert.equal(state.game.board().flat().filter(p => p?.type === 'k').length, 2);

test('initial position and standard turn alternation', () => {
  const state = make();
  assert.equal(state.legalMoves().length, 20);
  move(state, 'e2', 'e4'); assert.equal(state.side, 'b');
  move(state, 'e7', 'e5'); assert.equal(state.side, 'w');
});
test('two and three consecutive moves keep pieces and schedule intact', () => {
  for (const count of [2, 3]) {
    const state = make([...Array(count).fill('w'), 'b']);
    for (const file of 'edc'.slice(0, count)) { assert.equal(state.side, 'w'); move(state, file+'2', file+'4'); }
    assert.equal(state.side, 'b'); move(state, 'e7', 'e5'); assert.equal(state.side, 'w'); kings(state);
  }
});
test('one-color turn sequences remain supported', () => {
  const state = make(['w']); move(state, 'e2', 'e4'); move(state, 'd2', 'd4'); assert.equal(state.side, 'w');
});
test('invalid orders are rejected', () => {
  assert.throws(() => make([])); assert.throws(() => make(['x']));
});
test('illegal move is atomic and does not add undo state', () => {
  const state = make(); const before = state.snapshot();
  assert.equal(state.play({from:'e2',to:'e5'}), null);
  assert.equal(state.play({from:'e7',to:'e5'}), null);
  assert.equal(state.play({from:'e1',to:'e2'}), null);
  assert.deepEqual(state.snapshot(), before); assert.equal(state.snapshots.length, 0);
});
test('standard fool’s mate ends immediately with winner and two kings', () => {
  const state = make();
  move(state,'f2','f3'); move(state,'e7','e5'); move(state,'g2','g4'); move(state,'d8','h4');
  assert.deepEqual(state.result, {type:'checkmate',winner:'b'}); kings(state);
  assert.equal(state.play({from:'a2',to:'a3'}), null);
  assert.ok(state.undo()); assert.equal(state.result, null); assert.equal(state.side, 'b');
});
test('mate ends before another consecutive attacking move', () => {
  const state = make(['w','w','b'], '7k/8/5KQ1/8/8/8/8/8 w - - 0 1');
  move(state,'g6','g7'); assert.deepEqual(state.result,{type:'checkmate',winner:'w'});
  assert.equal(state.play({from:'g7',to:'h8'}),null); kings(state);
});
test('check interrupts consecutive moves and resumes the unconsumed tile', () => {
  const state = make(['w','w','b'], '7k/7p/8/8/8/8/8/R6K w - - 0 1');
  move(state,'a1','a8'); assert.equal(state.side,'b'); assert.equal(state.forcedSide,'b'); assert.equal(state.index,1);
  assert.equal(state.play({from:'a8',to:'h8'}),null);
  assert.equal(state.play({from:'h7',to:'h6'}),null);
  move(state,'h8','g7'); assert.equal(state.side,'w'); assert.equal(state.index,1);
  kings(state);
  state.undo(); assert.equal(state.side,'b'); assert.equal(state.forcedSide,'b');
});
test('a scheduled check response consumes its own tile', () => {
  const state=make(['w','b','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1');
  move(state,'a1','a8'); assert.equal(state.forcedSide,null); move(state,'h8','g7');
  assert.equal(state.side,'b'); assert.equal(state.index,2);
});
test('a check response is granted even when checked color has no tiles', () => {
  const state=make(['w'],'7k/7p/8/8/8/8/8/R6K w - - 0 1');
  move(state,'a1','a8'); assert.equal(state.side,'b'); move(state,'h8','g7'); assert.equal(state.side,'w');
});
test('checked starting positions give priority to the defender and never king capture', () => {
  const state=make(['w','w','b'],'R6k/7p/8/8/8/8/8/7K w - - 0 1');
  assert.equal(state.side,'b'); assert.ok(!state.legalMoves('w').some(m=>m.to==='h8')); kings(state);
});
test('stalemate at a scheduled turn is a draw', () => {
  const state=make(['b','w'],'7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(state.result,{type:'stalemate'}); assert.equal(state.play({from:'h8',to:'h7'}),null);
});
test('stalemated opponent can wait during an attacker’s remaining slot', () => {
  const state=make(['w','w','b'],'7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');
  assert.equal(state.result,null); assert.equal(state.side,'w');
});
test('pins and king adjacency prohibit illegal moves', () => {
  const state=make(['w','b'],'k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.ok(!has(state,'e2','d2')); assert.ok(has(state,'e2','e8'));
  const near=make(['w','b'],'8/8/8/8/8/4k3/P7/4K3 w - - 0 1');
  assert.ok(!has(near,'e1','e2'));
});
test('castling moves both pieces and undo restores rights and positions', () => {
  for (const [to,rookTo,rookFrom] of [['g1','f1','h1'],['c1','d1','a1']]) {
    const state=make(['w','w','b'],'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const before=state.game.fen();move(state,'e1',to);
    assert.equal(state.game.get(to).type,'k'); assert.equal(state.game.get(rookTo).type,'r'); assert.equal(state.game.get(rookFrom),undefined);
    assert.equal(state.side,'w'); state.undo(); assert.equal(state.game.fen(),before);
  }
});
test('cannot castle while checked, through check, or through occupied squares', () => {
  const through=make(['w','b'],'k4r2/8/8/8/8/8/8/4K2R w K - 0 1'); assert.ok(!has(through,'e1','g1'));
  const checked=make(['w','b'],'k3r3/8/8/8/8/8/8/4K2R w K - 0 1'); assert.ok(!has(checked,'e1','g1'));
  const initial=make();assert.ok(!has(initial,'e1','g1'));
});
test('rook move and return permanently loses its castling right', () => {
  const state=make(['w'],'4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  move(state,'h1','h2');move(state,'h2','h1');assert.ok(!has(state,'e1','g1'));
});
test('en passant works on the immediately following opposing ply and undo restores it', () => {
  const state=make(['w','b'],'4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1');
  move(state,'e2','e4'); assert.ok(has(state,'d4','e3'));
  move(state,'d4','e3');assert.equal(state.game.get('e4'),undefined);assert.equal(state.game.get('e3').color,'b');
  state.undo(); assert.ok(has(state,'d4','e3'));assert.equal(state.game.get('e4').color,'w');
});
test('consecutive same-color moves expire en passant, without phantom captures', () => {
  const state=make(['w','w','b'],'4k3/8/8/8/3p4/8/P3P3/4K3 w - - 0 1');
  move(state,'e2','e4');assert.equal(state.game.fen().split(' ')[3],'-');move(state,'a2','a3');
  assert.ok(!has(state,'d4','e3'));assert.equal(state.game.get('e4').color,'w');
});
test('en passant exposing the king to a rook is illegal', () => {
  const state=make(['w','b'],'k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.ok(!has(state,'e5','d6'));
});
test('all four promotion choices and capture promotions work', () => {
  for (const promotion of ['q','r','b','n']) {
    for (const to of ['a8','b8']) {
      const state=make(['w','b'],'1r5k/P7/8/8/8/8/8/7K w - - 0 1');
      move(state,'a7',to,promotion);assert.equal(state.game.get(to).type,promotion);assert.equal(state.game.get('a7'),undefined);kings(state);
      state.undo();assert.equal(state.game.get('a7').type,'p');assert.equal(state.game.get('b8').type,'r');
    }
  }
});
test('queen remains default promotion and invalid choice is rejected', () => {
  const state=make(['w','b'],'7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(state.play({from:'a7',to:'a8',promotion:'k'}),null);
  move(state,'a7','a8');assert.equal(state.game.get('a8').type,'q');
});
test('insufficient material and fifty-move draws are recognized', () => {
  assert.equal(make(['w','b'],'7k/8/8/8/8/8/8/7K w - - 0 1').result.type,'insufficient-material');
  const state=make(['w','b'],'7k/8/8/8/8/8/8/R6K w - - 99 1');
  move(state,'a1','a2');assert.equal(state.result.type,'fifty-move');state.undo();assert.equal(state.result,null);
});
test('threefold repetition survives FEN reloads and undo removes the occurrence', () => {
  const state=make();
  for(let i=0;i<2;i++) {move(state,'g1','f3');move(state,'g8','f6');move(state,'f3','g1');move(state,'f6','g8');}
  assert.equal(state.result.type,'threefold-repetition');state.undo();assert.equal(state.result,null);
  move(state,'f6','g8');assert.equal(state.result.type,'threefold-repetition');
});
test('variant repetition distinguishes schedule cursors', () => {
  const state=make(['w','w','b']);const key=state.positionKey();state.index=1;assert.notEqual(state.positionKey(),key);
});
test('AI finds immediate mate before the next custom slot', async () => {
  const state=make(['w','w','b'],'7k/8/5KQ1/8/8/8/8/8 w - - 0 1');
  const chosen=await chooseMove(state,2,'w');assert.ok(chosen);move(state,chosen.from,chosen.to,chosen.promotion);
  assert.deepEqual(state.result,{type:'checkmate',winner:'w'});
});
test('AI evades check using the same legal custom rules', async () => {
  const state=make(['w','w','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1');move(state,'a1','a8');
  const chosen=await chooseMove(state,2,'b');assert.ok(chosen);move(state,chosen.from,chosen.to,chosen.promotion);
  assert.ok(!state.inCheck('b'));assert.equal(state.side,'w');kings(state);
});
test('AI search is cancellable, refuses wrong side, and does not mutate live state', async () => {
  const state=make();const before=state.snapshot();let cancelled=false;
  const promise=chooseMove(state,3,'w',{isCancelled:()=>cancelled,yieldEvery:1});cancelled=true;
  assert.equal(await promise,null);assert.deepEqual(state.snapshot(),before);assert.equal(await chooseMove(state,1,'b'),null);
});
test('deterministic randomized standard and custom games preserve legality and undo', () => {
  let seed=87123; const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(const order of [['w','b'],['w','w','b'],['w','b','b'],['w','w','w','b'],['w']]) {
    const state=make(order);
    for(let ply=0;ply<100 && !state.result;ply++) {
      const before=state.snapshot();const options=state.legalMoves();assert.ok(options.length);
      const chosen=options[random()%options.length];assert.notEqual(chosen.captured,'k');
      const mover=state.side;state.play(chosen);kings(state);assert.ok(!state.inCheck(mover));
      const after=state.snapshot();assert.ok(state.undo());assert.deepEqual(state.snapshot(),before);
      assert.ok(state.play(chosen));assert.deepEqual(state.snapshot(),after);
    }
  }
});

test('blocking and capturing a checking piece are legal responses', () => {
  const state=make(['w','b'],'4r2k/8/8/8/8/8/R7/4K3 w - - 0 1');
  assert.ok(state.inCheck('w'));assert.ok(has(state,'a2','e2'));move(state,'a2','e2');assert.ok(!state.inCheck('w'));
  const capture=make(['w','b'],'7k/8/8/8/8/8/4r3/4K3 w - - 0 1');
  assert.ok(has(capture,'e1','e2'));move(capture,'e1','e2');assert.equal(capture.game.get('e2').type,'k');kings(capture);
});
test('double check permits only king moves', () => {
  const state=make(['w','b'],'4r2k/8/8/8/1b6/8/R7/4K3 w - - 0 1');
  assert.ok(state.inCheck('w'));assert.ok(state.legalMoves().length>0);assert.ok(state.legalMoves().every(m=>m.piece==='k'));
});
test('black castling and promotion work on consecutive black turns', () => {
  const castle=make(['b','b','w'],'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
  move(castle,'e8','c8');assert.equal(castle.game.get('c8').type,'k');assert.equal(castle.game.get('d8').type,'r');assert.equal(castle.side,'b');
  const promotion=make(['b','b','w'],'7k/8/8/8/8/8/p7/7K b - - 0 1');
  move(promotion,'a2','a1','n');assert.equal(promotion.game.get('a1').type,'n');kings(promotion);
});
test('a pawn move resets the fifty-move counter', () => {
  const state=make(['w','b'],'7k/8/8/8/8/8/P7/R6K w - - 99 1');
  move(state,'a2','a3');assert.equal(state.result,null);assert.equal(state.game.fen().split(' ')[4],'0');
});
test('checkmate takes priority over the fifty-move draw', () => {
  const state=make(['w','w','b'],'7k/8/5KQ1/8/8/8/8/8 w - - 99 1');
  move(state,'g6','g7');assert.deepEqual(state.result,{type:'checkmate',winner:'w'});
});
test('bounded hard search returns a completed legal move without touching live state', async () => {
  const state=make(['w','w','b']);move(state,'e2','e4');move(state,'d2','d4');const before=state.snapshot();
  const started=Date.now();const choice=await chooseMove(state,3,'b',{timeBudgetMs:100});
  assert.ok(state.legalMoves().some(m=>m.from===choice.from&&m.to===choice.to));
  assert.ok(Date.now()-started<2000);assert.deepEqual(state.snapshot(),before);
});
test('standard legal move sets match chess.js through a deterministic full game', () => {
  const state=make();const reference=new Chess();
  const key=m=>m.from+m.to+(m.promotion||'');
  let seed=312;const rand=()=>{seed=(seed*1103515245+12345)>>>0;return seed;};
  for(let ply=0;ply<160&&!state.result;ply++) {
    const actual=state.legalMoves();const expected=reference.moves({verbose:true});
    assert.deepEqual(actual.map(key).sort(),expected.map(key).sort());
    const chosen=actual[rand()%actual.length];state.play(chosen);reference.move(chosen);
    assert.equal(state.game.fen(),reference.fen());
  }
});
test('a defensive countercheck is resolved before the sequence continues', () => {
  const state=make(['w','w','b'],'7k/4b3/7K/8/8/8/8/R7 w - - 0 1');
  move(state,'a1','a8');assert.equal(state.forcedSide,'b');
  move(state,'e7','f8');assert.equal(state.side,'w');assert.ok(state.inCheck('w'));assert.ok(!state.inCheck('b'));
  assert.equal(state.play({from:'a8',to:'a7'}),null);
  move(state,'h6','g5');assert.equal(state.side,'b');assert.ok(!state.inCheck('w'));kings(state);
});

const captureMode = (order, fen) => new Rules(Chess, order, fen, {allowKingCapture:true});
test('capture variant keeps consecutive attacking turns and king capture wins immediately', () => {
  const state=captureMode(['w','w','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1');
  move(state,'a1','a8');assert.equal(state.side,'w');assert.equal(state.forcedSide,null);assert.ok(state.inCheck('b'));
  assert.ok(has(state,'a8','h8'));move(state,'a8','h8');
  assert.deepEqual(state.result,{type:'checkmate',winner:'w',reason:'king-capture'});
  assert.equal(state.game.get('h8').type,'r');assert.equal(state.game.board().flat().filter(p=>p?.type==='k').length,1);
  assert.ok(state.lastMove.san.endsWith('#'));assert.equal(state.play({from:'h7',to:'h6'}),null);assert.deepEqual(state.legalMoves(),[]);
  state.updateResult();assert.equal(state.result.reason,'king-capture');assert.equal(state.clone().result.reason,'king-capture');
  assert.ok(state.undo());assert.equal(state.game.get('h8').type,'k');assert.equal(state.side,'w');assert.equal(state.result,null);kings(state);
});
test('Black can capture the White king and undo restores the position', () => {
  const state=captureMode(['b','b','w'],'r6k/8/8/8/8/8/7P/7K b - - 0 1');const before=state.game.fen();
  move(state,'a8','a1');move(state,'a1','h1');assert.equal(state.result.winner,'b');assert.equal(state.result.reason,'king-capture');
  state.undo();state.undo();assert.equal(state.game.fen(),before);kings(state);
});
test('promotion may capture an exposed king and keeps the selected promotion', () => {
  const state=captureMode(['w','w','b'],'7k/6P1/8/8/8/8/8/K7 w - - 0 1');
  move(state,'g7','h8','n');assert.equal(state.result.reason,'king-capture');assert.equal(state.game.get('h8').type,'n');
  state.undo();assert.equal(state.game.get('g7').type,'p');assert.equal(state.game.get('h8').type,'k');
});
test('AI chooses a king capture and terminal clones require no missing-king move generation', async () => {
  const state=captureMode(['w','w','b'],'R6k/7p/8/8/8/8/8/7K w - - 0 1');
  const choice=await chooseMove(state,3,'w');assert.equal(choice.captured,'k');state.play(choice);assert.equal(state.result.reason,'king-capture');
  assert.equal(await chooseMove(state.clone(),3,'b'),null);
});
test('capture variant still ends normal checkmate and rejects moves exposing its own king', () => {
  const mate=captureMode(['w','w','b'],'7k/8/5KQ1/8/8/8/8/8 w - - 0 1');move(mate,'g6','g7');assert.deepEqual(mate.result,{type:'checkmate',winner:'w'});
  const pin=captureMode(['w','w','b'],'k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');assert.equal(pin.play({from:'e2',to:'d2'}),null);
});
test('randomized capture-variant games preserve kings until a terminal capture and undo restores both', () => {
  let seed=634;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(const order of [['w','w','b'],['w','b','b'],['w','w','w','b'],['w','b']]) {
    const state=captureMode(order);
    for(let ply=0;ply<80&&!state.result;ply++) {
      const before=state.snapshot();const options=state.legalMoves();assert.ok(options.length);
      const chosen=options[random()%options.length];state.play(chosen);
      const count=state.game.board().flat().filter(p=>p?.type==='k').length;
      assert.equal(count,state.result?.reason==='king-capture'?1:2);
      const after=state.snapshot();state.undo();assert.deepEqual(state.snapshot(),before);kings(state);
      state.play(chosen);assert.deepEqual(state.snapshot(),after);
    }
  }
});
