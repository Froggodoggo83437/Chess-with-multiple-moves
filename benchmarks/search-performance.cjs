// Compare equal wall-clock budgets against a historical checkout, without
// changing tracked game files. Timing/depth probes are not Elo measurements.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Chess}=require('chess.js'),current=require('../src/rules.cjs');
const probes=[
 {name:'standard opening',order:['w','b']},
 {name:'two White moves',order:['w','w','b']},
 {name:'defend two-move rook threat',order:['b','w','w'],fen:'1r5k/7p/8/8/8/8/8/R6K b - - 0 1'},
 {name:'avoid poisoned pawn',order:['w','b'],fen:'3q3k/3p4/8/8/8/8/8/3Q3K w - - 0 1'}
];
async function measure(engine,probe,budget=600,depth=4){
 const state=new engine.CustomTurnRules(Chess,probe.order,probe.fen,{allowKingCapture:true});
 const snapshot=state.snapshot(),iterations=[],start=performance.now();
 const move=await engine.chooseMove(state,depth,state.side,{timeBudgetMs:budget,yieldEvery:Number.MAX_SAFE_INTEGER,onIteration:r=>iterations.push({phase:r.phase,depth:r.depth,nodes:r.nodes,ttHits:r.ttHits||0,elapsedMs:Math.round(performance.now()-start)})});
 require('node:assert/strict').deepEqual(state.snapshot(),snapshot);
 require('node:assert/strict').ok(state.legalMoves().some(candidate=>candidate.lan===move.lan));
 return {move:move.lan,ms:Math.round(performance.now()-start),depth:Math.max(0,...iterations.filter(r=>r.phase==='full-search').map(r=>r.depth)),iterations};
}
(async()=>{
 const ref=process.argv[2]||'0d61a34',directory=fs.mkdtempSync(path.join(os.tmpdir(),'chess-engine-comparison-'));
 try{
  const baselineSource=execFileSync('git',['show',ref+':src/rules.cjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
  const file=path.join(directory,'baseline.cjs');fs.writeFileSync(file,baselineSource);const baseline=require(file);
  // Warm up both versions; alternate their order across trials.
  await measure(baseline,probes[0],100);await measure(current,probes[0],100);
  const rows=[];
  for(const probe of probes){
   const row={name:probe.name,baseline:[],current:[]};
   for(let trial=0;trial<3;trial++)for(const name of trial%2?['current','baseline']:['baseline','current'])row[name].push(await measure(name==='current'?current:baseline,probe));
   row.fixedHorizon={baseline:await measure(baseline,probe,5000,2),current:await measure(current,probe,5000,2)};
   rows.push(row);process.stderr.write('Completed '+probe.name+'\n');
  }
  const report={baselineRef:ref,currentRulesSha256:crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../src/rules.cjs'))).digest('hex'),budgetMs:600,trials:3,note:'Local Node timing/depth probes, not Elo or a comprehensive strength benchmark.',rows};
  fs.writeFileSync(path.join(__dirname,'search-performance.json'),JSON.stringify(report,null,2)+'\n');
  for(const row of rows){const median=name=>row[name].map(r=>r.depth).sort((a,b)=>a-b)[1];console.log(row.name+': median completed depth '+median('baseline')+' → '+median('current'));}
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
