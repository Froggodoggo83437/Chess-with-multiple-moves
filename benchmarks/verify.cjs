const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Chess}=require('chess.js');
const {CustomTurnRules:Rules}=require('../src/rules.cjs');
const report=require('./results.json');
const fixtures=require('./positions.json');
assert.equal(report.status,'completed');
assert.equal(report.engine.rulesSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/rules.cjs'))).digest('hex'),'Engine source changed since the benchmark');
assert.equal(report.tactics.length,fixtures.length*4);
assert.equal(report.fullBudget.length,report.protocol.fullBudgetTargets.length);
assert.equal(report.matches.length,8);
const parse=uci=>({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length>4?{promotion:uci[4]}:{})});
for(const row of [...report.tactics,...report.fullBudget]){
 const fixture=fixtures.find(f=>f.id===row.id);assert.ok(fixture);
 const state=new Rules(Chess,fixture.order,fixture.fen,{allowKingCapture:fixture.capture});
 const color=state.side;assert.ok(state.play(parse(row.move)),`Illegal recorded tactic: ${row.id}`);
 let solved=null;if(fixture.goal==='mate')solved=state.result?.type==='checkmate'&&state.result.winner===color;
 else if(fixture.expected)solved=fixture.expected.includes(row.move);
 else if(fixture.forbidden)solved=!fixture.forbidden.includes(row.move);
 assert.equal(row.solved,solved);
 if(row.referenceAgreement!==null)assert.equal(row.referenceAgreement,row.move===row.referenceMove);
}
let plies=0;
for(const game of report.matches){
 const state=new Rules(Chess,game.order,game.initialFen,{allowKingCapture:game.order.length!==2});
 for(const move of game.moves){assert.equal(move.color,state.side);const played=state.play(parse(move.uci));assert.ok(played,`Illegal recorded match move: ${game.id} ${move.uci}`);assert.equal(played.san,move.san);plies++;}
 assert.equal(state.game.fen(),game.finalFen);
 if(game.outcome.type==='unfinished'){assert.equal(state.result,null);assert.equal(game.moves.length,report.protocol.maxMatchPlies);}
 else assert.deepEqual(state.result,game.outcome);
 const winner=state.result?.winner?(state.result.winner==='w'?game.white:game.black):null;assert.equal(winner,game.winner);
}
console.log(`Verified ${report.tactics.length+report.fullBudget.length} legal tactical/reference decisions and ${report.matches.length} match replays (${plies} plies); outcomes and engine source hash match.`);
