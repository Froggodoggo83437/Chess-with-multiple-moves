const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fork}=require('node:child_process');
const {Chess}=require('chess.js');const {CustomTurnRules:Rules,chooseMoveForElo}=require('../src/rules.cjs');const Stockfish=require('./stockfish.cjs');
const OPENINGS=[['e4','e5'],['d4','d5'],['e4','c5'],['Nf3','d5'],['c4','e5']];
const BUDGET=150,MAX_PLIES=80,GAMES=10,WORKERS=4;
const file=path.join(__dirname,'relative-ratings.json');
const atomicSave=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
const uci=move=>move.from+move.to+(move.promotion||'');const parse=move=>({from:move.slice(0,2),to:move.slice(2,4),...(move.length>4?{promotion:move[4]}:{})});
const rng=seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
function summarize(target,games){
 const finished=games.filter(game=>game.score!==null),n=finished.length,s=finished.reduce((sum,g)=>sum+g.score,0);
 const p=(s+.5)/(n+1),radius=n?Math.sqrt(Math.log(2*32/.05)/(2*n)):null;
 return {target,games,finished:n,unfinished:games.length-n,score:s,smoothedStockfishRelativeEstimate:n?Math.round(1320+400*Math.log10(p/(1-p))):null,scoreInterval:n?[Math.max(0,s/n-radius),Math.min(1,s/n+radius)]:null,estimateStatus:'provisional',actualEloStatus:'unverified'};
}
async function game(sf,target,color,openingIndex){
 const opening=new Chess();for(const move of OPENINGS[openingIndex])opening.move(move);const initialFen=opening.fen();
 const state=new Rules(Chess,['w','b'],initialFen),seed=872+target+openingIndex*10000+(color==='w'?1:2),random=rng(seed);
 const result={target,engineColor:color,openingIndex,opening:OPENINGS[openingIndex],seed,initialFen,moves:[]};
 for(let ply=0;ply<MAX_PLIES&&!state.result;ply++){
  const side=state.side;let move;const start=performance.now();
  if(side===color)move=await chooseMoveForElo(state,target,side,{timeBudgetMs:BUDGET,yieldEvery:Number.MAX_SAFE_INTEGER,random});
  else move=parse((await sf.analyze(initialFen,0,{movetime:BUDGET,moves:state.history.map(uci)})).move);
  if(!move)throw Error('No legal match choice');const played=state.play(move);if(!played)throw Error('Illegal match choice');
  result.moves.push({color:side,uci:uci(played),san:played.san,elapsedMs:Math.round(performance.now()-start)});
 }
 result.outcome=state.result||{type:'unfinished',reason:'ply-limit'};result.finalFen=state.game.fen();
 result.score=result.outcome.type==='unfinished'?null:result.outcome.winner?(result.outcome.winner===color?1:0):.5;
 return result;
}
async function worker(output,targets){
 const sf=new Stockfish(),data={status:'running',rows:[]};
 try{
  await sf.init();await sf.setStrength(1320);data.referenceName=sf.name;atomicSave(output,data);
  for(const target of targets){
   const games=[];data.rows.push(summarize(target,games));
   for(let openingIndex=0;openingIndex<OPENINGS.length;openingIndex++)for(const color of ['w','b']){
    games.push(await game(sf,target,color,openingIndex));data.rows[data.rows.length-1]=summarize(target,games);atomicSave(output,data);
    console.log(`Reference match finished: ${target}, ${games.length}/10`);
   }
  }
  data.status='completed';atomicSave(output,data);
 }catch(error){data.status='failed';data.error=error.stack;atomicSave(output,data);throw error;}finally{sf.close();}
}
function render(report){
 const lines=['# Stockfish-relative rating estimates','','All 32 settings played 10 games each against Stockfish 17.1 with its UCI strength model set to 1320: five opening pairs, with colors reversed. Both engines had a 150 ms-per-move budget; games were capped at 80 plies. This is a fast-control sample, **not verification of the printed ratings or full-budget play**.','','| Printed target | Score / completed games | Unfinished | Smoothed relative estimate | Score interval (simultaneous 95%) | Actual Elo |','| --- | --- | --- | --- | --- | --- |'];
 for(const row of report.rows)lines.push(`| ${row.target} | ${row.score}/${row.finished} | ${row.unfinished} | ${row.smoothedStockfishRelativeEstimate??'not estimated'} | ${row.scoreInterval?row.scoreInterval.map(v=>(100*v).toFixed(1)+'%').join('–'):'not estimated'} | unverified |`);
 const games=report.rows.flatMap(row=>row.games);
 lines.push('',`Across ${games.length} games: ${games.filter(g=>g.score===1).length} engine wins, ${games.filter(g=>g.score===0).length} losses, ${games.filter(g=>g.score===.5).length} draws, ${games.filter(g=>g.score===null).length} unfinished.`,
 '', 'Estimates use 1320 + 400 log10(p/(1-p)), with smoothed p=(score+0.5)/(completed games+1). The 1320 anchor is Stockfish’s model setting, not a real-world player rating. Draws score one-half; unfinished games are unscored. Ten games still give substantial uncertainty; zero/all-win results particularly depend on the smoothing convention.',
 '', 'Score intervals use a bounded-score Hoeffding calculation corrected across all 32 settings, assuming independent scores. Shared opening pairs and unseeded Stockfish randomness limit that interpretation. Unfinished games are censored, not draws; estimates conditional on completed games may be biased. Smoothed numbers are descriptive statistics, not a fitted calibration curve. More opening pairs and independently calibrated opponents are required.',
 '', 'Four benchmark processes ran concurrently. Wall-clock search depth depends on host load; the 150 ms budget does not guarantee an equal node count. No conclusions transfer to the full-budget engine or custom turn orders.',
 '', 'Raw game moves and outcomes: [relative-ratings.json](relative-ratings.json). Previous two-game pilot: [pilot-2-games/RELATIVE_RATINGS.md](pilot-2-games/RELATIVE_RATINGS.md). No game strength labels have been changed.');
 fs.writeFileSync(path.join(__dirname,'RELATIVE_RATINGS.md'),lines.join('\n')+'\n');
}
async function main(){
 const report={schema:2,status:'running',startedAtUTC:new Date().toISOString(),rulesSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/rules.cjs'))).digest('hex'),environment:{node:process.version,platform:process.platform,architecture:process.arch,cpu:require('node:os').cpus()[0]?.model},protocol:{reference:'Stockfish 17.1 UCI_LimitStrength=true, UCI_Elo=1320',moveBudgetMs:BUDGET,maxPlies:MAX_PLIES,gamesPerTarget:GAMES,openings:OPENINGS,workers:WORKERS,scope:'Stockfish-relative standard chess at 150 ms/move only. Does not estimate default/full-budget strengths, real-world Elo, or custom variants. Ten games per setting is not certification; unfinished games are unscored. Stockfish randomness is not seeded.'},rows:[]};
 const outputs=[],children=[];let timer;
 const collect=()=>{report.rows=outputs.flatMap(output=>fs.existsSync(output)?JSON.parse(fs.readFileSync(output)).rows:[]).sort((a,b)=>a.target-b.target);const first=outputs.find(output=>fs.existsSync(output));if(first)report.referenceName=JSON.parse(fs.readFileSync(first)).referenceName;atomicSave(file,report);};
 try{
  atomicSave(file,report);
  const promises=[];
  for(let index=0;index<WORKERS;index++){
   const output=path.join(__dirname,`relative-worker-${index}.json`);outputs.push(output);if(fs.existsSync(output))fs.unlinkSync(output);
   const targets=Array.from({length:32},(_,i)=>400+i*100).filter((_,i)=>i%WORKERS===index);
   const child=fork(__filename,['--worker',output,targets.join(',')],{stdio:'inherit'});children.push(child);
   promises.push(new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(Error(`Benchmark worker ${index} exited ${code??signal}`)));}));
  }
  timer=setInterval(collect,2000);await Promise.all(promises);clearInterval(timer);collect();
  if(report.rows.length!==32||report.rows.some(row=>row.games.length!==GAMES))throw Error('Incomplete benchmark');
  report.status='completed';report.finishedAtUTC=new Date().toISOString();atomicSave(file,report);render(report);
  outputs.forEach(output=>fs.unlinkSync(output));console.log('All 320 reference games completed. Ratings remain uncertified.');
 }catch(error){clearInterval(timer);children.forEach(child=>child.kill());collect();report.status='failed';report.error=error.stack;atomicSave(file,report);throw error;}
}
if(process.argv[2]==='--worker')worker(process.argv[3],process.argv[4].split(',').map(Number)).catch(error=>{console.error(error);process.exitCode=1;});
else main().catch(error=>{console.error(error);process.exitCode=1;});
