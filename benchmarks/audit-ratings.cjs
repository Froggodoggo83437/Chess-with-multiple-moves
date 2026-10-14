const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {Chess}=require('chess.js');const {CustomTurnRules:Rules,chooseMoveForElo,strengthForElo}=require('../src/rules.cjs');
const Stockfish=require('./stockfish.cjs');const fixtures=require('./positions.json');
const filename=path.join(__dirname,'ratings-audit.json');
const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/rules.cjs'))).digest('hex');
const report={schema:1,status:'running',startedAtUTC:new Date().toISOString(),rulesSha256:sourceHash,
  environment:{node:process.version,cpu:os.cpus()[0]?.model},
  protocol:{targets:'Every 100-point setting from 400 through 3500',budget:'Actual profile budget, no cap',seed:872,referenceNodes:150000,childReferenceNodes:50000,
    limitations:'Two positions per setting are a functionality/quality audit, not Elo calibration. Custom case overlaps regression tests. No calibrated player pool, rating estimate, or confidence interval is established.'},rows:[]};
const save=()=>fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
const rng=()=>{let seed=872;return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};};
const uci=move=>move.from+move.to+(move.promotion||'');
const standard=fixtures.find(f=>f.id==='reference-italian-center');const custom=fixtures.find(f=>f.id==='defend-two-move-rook-attack');
const sf=new Stockfish();
(async()=>{try{
 await sf.init();report.reference={name:sf.name,package:'stockfish@17.1.0',threads:1,hashMb:32};
 const reference=await sf.analyze(standard.fen,150000);report.referencePosition=reference;save();
 for(let elo=400;elo<=3500;elo+=100){
  const row={target:elo,profile:strengthForElo(elo),actualEloStatus:'unverified',cases:[]};
  for(const fixture of [standard,custom]){
   const state=new Rules(Chess,fixture.order,fixture.fen,{allowKingCapture:fixture.capture});
   let completed=null;const started=performance.now();
   const chosen=await chooseMoveForElo(state,elo,state.side,{yieldEvery:Number.MAX_SAFE_INTEGER,random:rng(),onIteration:result=>{completed={phase:result.phase,depth:result.depth,nodes:result.nodes};}});
   const elapsedMs=Math.round(performance.now()-started);if(!chosen)throw Error(`Missing move at ${elo}`);
   const move=uci(chosen);if(!state.play(chosen))throw Error(`Illegal move at ${elo}: ${move}`);
   const test={id:fixture.id,variant:fixture.capture?'custom':'standard',move,elapsedMs,legal:true,lastCompletedSearch:completed,goalPassed:fixture.expected?fixture.expected.includes(move):null};
   if(!fixture.capture&&!state.result){const after=await sf.analyze(state.game.fen(),50000);test.referenceMove=reference.move;test.referenceScore=reference.score;test.afterReferenceScore=after.score;test.referenceAgreement=move===reference.move;test.referenceLossCp=reference.score?.type==='cp'&&after.score?.type==='cp'?Math.max(0,reference.score.value+after.score.value):null;}
   row.cases.push(test);
  }
  report.rows.push(row);save();console.log(`Full-budget setting audit completed: ${elo}`);
 }
 report.status='completed';report.finishedAtUTC=new Date().toISOString();save();
 const lines=['# All-settings audit','','All 32 settings were exercised at their actual thinking budgets. **No actual Elo rating is verified.** These are two-position checks, not a rating pool or statistical calibration.','','| Target | Opening move | Reference loss (cp) | Custom defense | Total engine time | Actual Elo |','| --- | --- | --- | --- | --- | --- |'];
 for(const row of report.rows){const [s,c]=row.cases;lines.push(`| ${row.target} | ${s.move} | ${s.referenceLossCp??'mate/non-numeric'} | ${c.goalPassed?'goal met':'goal missed'} (${c.move}) | ${s.elapsedMs+c.elapsedMs} ms | unverified |`);}
 lines.push('','Stockfish 17.1 used 150,000 nodes for the opening reference and 50,000 for each chosen continuation. Opposite-side numeric scores yield a finite-search centipawn-loss estimate; mate scores are not converted to centipawns. The custom defense uses a curated regression goal, not an independent custom engine.','','Every move is replayed for legality. One deterministic seed per setting is used; this does not measure the distribution of lower-strength errors. Search depth and results depend on wall-clock budget and hardware.','','Repeatedly running these checks cannot establish actual Elo. Standard ratings require a declared calibrated opponent pool/time control, many balanced held-out games, and uncertainty estimates. Arbitrary turn sequences need a separate rating pool for each rules/time-control definition; Stockfish’s standard-chess rating cannot be transferred to them.','','See [raw records](ratings-audit.json) and the earlier [benchmark report](REPORT.md).');
 fs.writeFileSync(path.join(__dirname,'RATINGS_AUDIT.md'),lines.join('\n')+'\n');console.log('All 32 full-budget setting audits completed; actual Elo remains unverified.');
}catch(error){report.status='failed';report.error=error.stack;save();throw error;}finally{sf.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
