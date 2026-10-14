const test=require('node:test'),assert=require('node:assert/strict');
const {Chess}=require('chess.js');
const {CustomTurnRules:Rules}=require('../src/rules.cjs');
const {analyzeGame,restorePositions,classifyMove,isBook,barValue}=require('../src/analysis.cjs');
const payload=state=>({order:state.order,allowKingCapture:state.allowKingCapture,snapshots:[...state.snapshots,state.snapshot()]});
const move=(from,to)=>({from,to});
test('move grades distinguish loss size, forced losses, missed wins, and unique strong moves',()=>{
 const a=move('a1','a2'),b=move('b1','b2');
 for(const [loss,type]of[[5,'best'],[40,'excellent'],[100,'inaccuracy'],[200,'mistake'],[400,'blunder']])assert.equal(classifyMove([{move:a,score:0},{move:b,score:-loss}],b).type,type);
 assert.equal(classifyMove([{move:a,score:1000000},{move:b,score:10}],b).type,'miss');
 assert.equal(classifyMove([{move:a,score:0},{move:b,score:-1000000}],b).type,'blunder');
 assert.equal(classifyMove([{move:a,score:500},{move:b,score:0}],a).type,'great');
 assert.equal(classifyMove([{move:a,score:0}],a).type,'best');
 assert.equal(classifyMove([],a).type,'unrated');
});
test('book labels require actual recognized prefixes and standard initial rules',()=>{
 const context={order:['w','b'],allowKingCapture:false,initialFen:new Chess().fen(),standardFen:new Chess().fen()};
 assert.equal(isBook([move('e2','e4'),move('e7','e5')],context),true);
 assert.equal(isBook([move('a2','a3')],context),false);
 assert.equal(isBook([move('e2','e4')],{...context,order:['w','w','b']}),false);
 assert.equal(isBook([move('e2','e4')],{...context,allowKingCapture:true}),false);
 assert.equal(isBook([move('e2','e4')],{...context,initialFen:'fixture'}),false);
});
test('evaluation bar favors White for positive scores and reverses physical orientation',()=>{
 assert.deepEqual(barValue(null),{whitePercent:50,topPercent:50});
 assert.ok(barValue(300).whitePercent>50);assert.ok(barValue(-300).whitePercent<50);
 assert.equal(barValue(300,true).topPercent,barValue(300).whitePercent);
 assert.equal(barValue(1000000).whitePercent,100);assert.equal(barValue(-1000000).whitePercent,0);
});
test('king-capture replay preserves consecutive turns, terminal missing kings, and live undo state',async()=>{
 const state=new Rules(Chess,['w','w','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1',{allowKingCapture:true});
 state.play(move('a1','a8'));state.play(move('a8','h8'));
 const before=state.snapshot(),snapshots=state.snapshots.slice(),data=payload(state);
 const positions=restorePositions(Chess,data);assert.deepEqual(positions.map(state=>state.history.length),[0,1,2]);assert.equal(positions[1].side,'w');
 assert.equal(positions[2].game.get('h8').type,'r');assert.equal(positions[2].result.reason,'king-capture');
 const result=await analyzeGame(Chess,data,{timeBudgetMs:30});assert.equal(result.moves.length,2);assert.equal(result.evaluations.length,3);assert.equal(result.evaluations[2].whiteScore,1000000);
 assert.ok(['great','best'].includes(result.moves[1].type));assert.deepEqual(state.snapshot(),before);assert.deepEqual(state.snapshots,snapshots);
});
test('Black checkmate ends with a negative evaluation; cancellation emits no late progress',async()=>{
 const state=new Rules(Chess,['b','b','w'],'8/8/8/8/8/5kq1/8/7K b - - 0 1');state.play(move('g3','g2'));assert.equal(state.result.winner,'b');
 const result=await analyzeGame(Chess,payload(state),{timeBudgetMs:30});assert.equal(result.evaluations.at(-1).whiteScore,-1000000);
 let progress=0;assert.equal(await analyzeGame(Chess,payload(state),{isCancelled:()=>true,onProgress:()=>progress++}),null);assert.equal(progress,0);
});
