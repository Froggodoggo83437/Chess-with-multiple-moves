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

test('first e4 is Book in a compatible standard game even with capture enabled',async()=>{
 const state=new Rules(Chess,['w','b'],undefined,{allowKingCapture:true});state.play(move('e2','e4'));
 const result=await analyzeGame(Chess,payload(state),{timeBudgetMs:1});
 assert.equal(require('../src/analysis.cjs').standardCompatible(restorePositions(Chess,payload(state))),true);
 assert.equal(result.moves[0].type,'book');
});
test('shallow custom opening review withholds judgments instead of calling e4 inaccurate',async()=>{
 const state=new Rules(Chess,['w','w','b'],undefined,{allowKingCapture:true});state.play(move('e2','e4'));
 const result=await analyzeGame(Chess,payload(state),{timeBudgetMs:1});
 assert.equal(result.moves[0].type,'unrated');assert.equal(result.moves[0].confidence,'uncertain');
 assert.equal(require('../src/analysis.cjs').standardCompatible(restorePositions(Chess,payload(state))),false);
});
test('custom analyzer sees two consecutive rook moves as a forced king capture',async()=>{
 const {searchPosition}=require('../src/custom-review.cjs');
 const fen='7k/7p/8/8/8/8/8/R6K b - - 0 1';
 const normal=new Rules(Chess,['b','w'],fen,{allowKingCapture:true});
 const custom=new Rules(Chess,['b','w','w'],fen,{allowKingCapture:true});const before=custom.snapshot();
 const single=await searchPosition(normal,{maxDepth:2,timeBudgetMs:6000});
 const double=await searchPosition(custom,{maxDepth:2,timeBudgetMs:6000});
 assert.ok(single.whiteScore<500000);assert.ok(double.whiteScore>=500000);
 assert.ok(double.scores.every(candidate=>candidate.score<=-500000));
 assert.deepEqual(custom.snapshot(),before);
 const replay=custom.clone();for(const key of double.pv)assert.ok(replay.play({from:key.slice(0,2),to:key.slice(2,4)},false));
 assert.equal(replay.result.reason,'king-capture');assert.equal(replay.result.winner,'w');
});
test('variant search plans consecutive attacking moves and preserves the full schedule',async()=>{
 const {searchPosition,replyHorizon}=require('../src/custom-review.cjs');
 const state=new Rules(Chess,['w','w','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1',{allowKingCapture:true});
 assert.equal(replyHorizon(state),3);const before=state.snapshot();
 const result=await searchPosition(state,{maxDepth:2,timeBudgetMs:6000});
 assert.ok(result.whiteScore>=500000);assert.equal(result.bestMove,'a1a8');
 const replay=state.clone();for(const key of result.pv)assert.ok(replay.play({from:key.slice(0,2),to:key.slice(2,4)},false));
 assert.equal(replay.history[0].color,'w');assert.equal(replay.history[1].color,'w');assert.equal(replay.result.winner,'w');assert.deepEqual(state.snapshot(),before);
});
test('unreliable and unstable comparisons withhold grades; large confirmed losses are blunders',()=>{
 const {gradeReview}=require('../src/analysis.cjs'),a=move('a1','a2'),b=move('b1','b2');
 const result={scores:[{move:a,score:0,bound:'exact'},{move:b,score:-600,bound:'exact'}],samples:[{bestScore:0,playedScore:-600},{bestScore:0,playedScore:-590}],reliable:false};
 assert.equal(gradeReview(result,b,{}).type,'unrated');
 result.reliable=true;assert.equal(gradeReview(result,b,{}).type,'blunder');
 result.samples[1].playedScore=-200;assert.equal(gradeReview(result,b,{}).type,'unrated');
});
test('saved custom order and check response cursor are restored rather than reconstructed as alternation',()=>{
 const state=new Rules(Chess,['w','w','b'],'7k/7p/8/8/8/8/8/R6K w - - 0 1',{allowKingCapture:false});
 state.play(move('a1','a8'));assert.equal(state.forcedSide,'b');
 const restored=restorePositions(Chess,payload(state));assert.deepEqual(restored[1].order,['w','w','b']);
 assert.equal(restored[1].index,1);assert.equal(restored[1].side,'b');assert.equal(restored[1].forcedSide,'b');
 assert.equal(require('../src/analysis.cjs').standardCompatible(restored),false);
});
test('custom search cancellation returns no result and never alters the live position',async()=>{
 const state=new Rules(Chess,['w','w','b']),before=state.snapshot();let calls=0;
 const result=await require('../src/custom-review.cjs').searchPosition(state,{timeBudgetMs:5000,isCancelled:()=>++calls>4,yieldEvery:1});
 assert.equal(result,null);assert.deepEqual(state.snapshot(),before);
});

test('Stockfish comparisons use the highest shared completed depth and the real move history',async()=>{
 const fs=require('fs'),vm=require('vm'),esbuild=require('esbuild'),exports={};
 const module={exports};
 const source=esbuild.transformSync(fs.readFileSync(require.resolve('../src/stockfish-analysis.js'),'utf8'),{format:'cjs'}).code;
 vm.runInNewContext(source,{module,exports,Map,Error});
 const state=new Rules(Chess,['w','b']);state.play(move('e2','e4'));const calls=[];
 const best={move:'e7e5',depth:14,score:900,pv:['e7e5'],samples:new Map([[12,{score:50,pv:['e7e5']}],[13,{score:100,pv:['e7e5']}],[14,{score:900,pv:['e7e5']}]])};
 const played={move:'g7g5',depth:13,score:-40,pv:['g7g5'],samples:new Map([[12,{score:-20,pv:['g7g5']}],[13,{score:-40,pv:['g7g5']}]])};
 const fake={search:async(fen,moves,options)=>{calls.push({fen,moves,options});return options.searchMove?played:best;}};
 const result=await module.exports.standardPositionAnalyzer(fake)(state,{playedMove:move('g7','g5'),context:{initialFen:new Chess().fen()},isCancelled:()=>false,timeBudgetMs:1000});
 assert.equal(result.depth,13);assert.equal(result.whiteScore,-100);assert.equal(result.scores[0].score,100);assert.equal(result.scores[1].score,-40);
 assert.equal(calls[1].options.searchMove,'g7g5');assert.equal(calls[1].options.depth,14);assert.deepEqual(calls[0].moves,['e2e4']);
});
