const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {Chess}=require('chess.js');const {CustomTurnRules:Rules,strengthForElo}=require('../src/rules.cjs');
const report=require('./ratings-audit.json');const fixtures=require('./positions.json');
assert.equal(report.status,'completed');assert.equal(report.rows.length,32);
assert.equal(report.rulesSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/rules.cjs'))).digest('hex'));
let moves=0;
report.rows.forEach((row,index)=>{
 assert.equal(row.target,400+index*100);assert.equal(row.actualEloStatus,'unverified');assert.deepEqual(row.profile,strengthForElo(row.target));assert.equal(row.cases.length,2);
 for(const test of row.cases){
  const f=fixtures.find(f=>f.id===test.id);assert.ok(f);
  const state=new Rules(Chess,f.order,f.fen,{allowKingCapture:f.capture});
  const played=state.play({from:test.move.slice(0,2),to:test.move.slice(2,4),...(test.move.length>4?{promotion:test.move[4]}:{})});
  assert.ok(played);assert.equal(test.legal,true);
  if(f.expected)assert.equal(test.goalPassed,f.expected.includes(test.move));
  if(test.referenceLossCp!==null&&test.referenceLossCp!==undefined){assert.equal(test.referenceScore.type,'cp');assert.equal(test.afterReferenceScore.type,'cp');assert.equal(test.referenceLossCp,Math.max(0,test.referenceScore.value+test.afterReferenceScore.value));}
  moves++;
 }
});
console.log(`Verified every target from 400–3500: ${moves} legal full-budget decisions across 32 settings. Actual Elo remains unverified for all settings.`);
