const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Chess}=require('chess.js');const {CustomTurnRules:Rules}=require('../src/rules.cjs');
const report=require('./relative-ratings.json');
assert.equal(report.schema,2);assert.equal(report.status,'completed');assert.equal(report.rows.length,32);
assert.equal(report.protocol.gamesPerTarget,10);assert.equal(report.protocol.moveBudgetMs,150);assert.equal(report.protocol.maxPlies,80);
const openings=[['e4','e5'],['d4','d5'],['e4','c5'],['Nf3','d5'],['c4','e5']];assert.deepEqual(report.protocol.openings,openings);
assert.equal(report.rulesSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/rules.cjs'))).digest('hex'));
let plies=0;
report.rows.forEach((row,index)=>{
 assert.equal(row.target,400+index*100);assert.equal(row.games.length,10);assert.equal(row.estimateStatus,'provisional');assert.equal(row.actualEloStatus,'unverified');
 row.games.forEach((game,i)=>{
  assert.equal(game.target,row.target);assert.equal(game.engineColor,['w','b'][i%2]);assert.equal(game.openingIndex,Math.floor(i/2));assert.deepEqual(game.opening,openings[game.openingIndex]);assert.equal(game.seed,872+row.target+game.openingIndex*10000+(game.engineColor==='w'?1:2));
  const opening=new Chess();for(const move of game.opening)opening.move(move);assert.equal(game.initialFen,opening.fen());
  const independent=new Chess(game.initialFen);const state=new Rules(Chess,['w','b'],game.initialFen);assert.ok(game.moves.length<=80);
  for(const move of game.moves){assert.equal(move.color,state.side);assert.equal(state.result,null);const played=state.play({from:move.uci.slice(0,2),to:move.uci.slice(2,4),...(move.uci.length>4?{promotion:move.uci[4]}:{})});assert.ok(played);assert.equal(played.san,move.san);const reference=independent.move({from:played.from,to:played.to,...(played.promotion?{promotion:played.promotion}:{})});assert.ok(reference);assert.equal(reference.san,move.san);assert.equal(independent.fen(),state.game.fen());assert.ok(Number.isInteger(move.elapsedMs)&&move.elapsedMs>=0);plies++;}
  assert.equal(game.finalFen,state.game.fen());assert.deepEqual(game.outcome,state.result||{type:'unfinished',reason:'ply-limit'});
  if(!state.result)assert.equal(game.moves.length,80);
  if(state.result?.type==='checkmate')assert.equal(independent.isCheckmate(),true);if(state.result?.type==='stalemate')assert.equal(independent.isStalemate(),true);
  assert.equal(game.score,!state.result?null:state.result.winner?(state.result.winner===game.engineColor?1:0):.5);
 });
 const finished=row.games.filter(g=>g.score!==null),n=finished.length,s=finished.reduce((a,g)=>a+g.score,0);
 assert.equal(row.finished,n);assert.equal(row.unfinished,10-n);assert.equal(row.score,s);
 const p=(s+.5)/(n+1);assert.equal(row.smoothedStockfishRelativeEstimate,n?Math.round(1320+400*Math.log10(p/(1-p))):null);
 const radius=n?Math.sqrt(Math.log(2*32/.05)/(2*n)):null;assert.deepEqual(row.scoreInterval,n?[Math.max(0,s/n-radius),Math.min(1,s/n+radius)]:null);
});
console.log(`Replayed 320 reference games (${plies} plies) across all 32 settings; provisional estimates and outcomes verified. Elo remains uncertified.`);
