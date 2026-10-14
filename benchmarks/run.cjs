const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Chess}=require('chess.js');
const {CustomTurnRules:Rules,chooseMoveForElo}=require('../src/rules.cjs');
const Stockfish=require('./stockfish.cjs');
const fixtures=require('./positions.json');
const root=path.resolve(__dirname,'..');
const output=path.join(__dirname,'results.json');
const report={schema:1,startedAtUTC:new Date().toISOString(),status:'running',
  environment:{node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},
  engine:{commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    rulesSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/rules.cjs'))).digest('hex')},
  protocol:{seed:872,rapidMoveBudgetMs:150,referenceNodes:30000,childReferenceNodes:10000,matchMoveBudgetMs:150,maxMatchPlies:60,
    fullBudgetTargets:['free-queen','knight-fork','defend-two-move-rook-attack','reference-italian-center'],
    note:'Small exploratory benchmark, not Elo calibration. Curated tactics overlap regression tests; six opening-derived positions are additional reference probes. Matches at capped time do not represent the 12-second Expert setting.'},
  tactics:[],fullBudget:[],matches:[]};
const sf=new Stockfish();
function save(){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
const uci=move=>move.from+move.to+(move.promotion||'');
const parse=move=>({from:move.slice(0,2),to:move.slice(2,4),...(move.length>4?{promotion:move[4]}:{})});
function stateFor(f){return new Rules(Chess,f.order,f.fen,{allowKingCapture:f.capture});}
async function tactic(f,elo,cap,reference,seed){
  const state=stateFor(f),color=state.side;let last=null;
  const options={yieldEvery:Number.MAX_SAFE_INTEGER,random:rng(seed),onIteration:result=>{last={phase:result.phase,depth:result.depth,nodes:result.nodes};}};
  if(cap!==null)options.timeBudgetMs=cap;
  const started=performance.now();const chosen=await chooseMoveForElo(state,elo,color,options);
  const elapsedMs=Math.round(performance.now()-started);
  if(!chosen)throw Error('No move for nonterminal fixture '+f.id);
  const move=uci(chosen);
  if(!state.play(chosen))throw Error('Illegal engine move '+f.id+' '+move);
  let solved=null;
  if(f.goal==='mate')solved=state.result?.type==='checkmate'&&state.result.winner===color;
  else if(f.expected)solved=f.expected.includes(move);
  else if(f.forbidden)solved=!f.forbidden.includes(move);
  let after=null,lossCp=null;
  if(reference&&!state.result)after=await sf.analyze(state.game.fen(),report.protocol.childReferenceNodes);
  if(reference?.score?.type==='cp'&&after?.score?.type==='cp')lossCp=Math.max(0,reference.score.value+after.score.value);
  return {id:f.id,elo,variant:f.capture?'custom-king-capture':'standard',budgetMs:cap===null?'profile':cap,move,elapsedMs,solved,
    lastCompletedSearch:last,referenceMove:reference?.move||null,referenceAgreement:reference?move===reference.move:null,
    referenceScore:reference?.score||null,afterReferenceScore:after?.score||null,referenceLossCp:lossCp};
}
async function match(id,order,white,black,fen){
  const custom=order.length!==2;
  const state=new Rules(Chess,order,fen,{allowKingCapture:custom});
  const initialFen=state.game.fen();const random={w:rng(1000+id.length),b:rng(2000+id.length)};
  const result={id,order,white,black,budgetMs:150,initialFen,moves:[],outcome:null};
  for(let ply=0;ply<60&&!state.result;ply++){
    const color=state.side,opponent=color==='w'?white:black;const start=performance.now();let selected;
    if(opponent==='stockfish')selected=parse((await sf.analyze(initialFen,0,{movetime:150,moves:state.history.map(uci)})).move);
    else selected=await chooseMoveForElo(state,Number(opponent),color,{timeBudgetMs:150,yieldEvery:Number.MAX_SAFE_INTEGER,random:random[color]});
    if(!selected)throw Error('No match move '+id);
    const played=state.play(selected);if(!played)throw Error('Illegal match move '+id+' '+JSON.stringify(selected));
    result.moves.push({color,uci:uci(played),san:played.san,elapsedMs:Math.round(performance.now()-start)});
  }
  result.finalFen=state.game.fen();result.outcome=state.result||{type:'unfinished',reason:'ply-limit'};
  result.winner=result.outcome.winner?(result.outcome.winner==='w'?white:black):null;
  return result;
}
(async()=>{
  try {
    await sf.init();report.reference={name:sf.name,package:'stockfish@17.1.0',threads:1,hashMb:32};save();
    const references=new Map();
    for(const f of fixtures)if(!f.capture){const reference=await sf.analyze(f.fen,30000);if(!stateFor(f).legalMoves().some(move=>uci(move)===reference.move))throw Error('Illegal Stockfish reference '+f.id);references.set(f.id,reference);}
    for(const elo of [400,1200,2400,3500]){
      for(let index=0;index<fixtures.length;index++){const f=fixtures[index];report.tactics.push(await tactic(f,elo,150,references.get(f.id),872+index));save();}
      process.stdout.write(`Rapid tactical/reference checks completed at ${elo}\n`);
    }
    for(const id of report.protocol.fullBudgetTargets){const f=fixtures.find(f=>f.id===id);report.fullBudget.push(await tactic(f,3500,null,references.get(id),872));save();process.stdout.write(`Full-budget Expert check: ${id}\n`);}
    for(const [name,line]of [['e4-e5','e4 e5'],['d4-d5','d4 d5']]){
      const opening=new Chess();for(const move of line.split(' '))opening.move(move);
      for(const white of [3500,'stockfish']){const black=white==='stockfish'?3500:'stockfish';const id=`standard-${name}-${white}-white`;report.matches.push(await match(id,['w','b'],white,black,opening.fen()));save();process.stdout.write(`Match completed: ${id}\n`);}
    }
    for(const order of [['w','w','b'],['w','b','b']])for(const white of [3500,1200]){
      const black=white===3500?1200:3500,id=`custom-${order.join('')}-${white}-white`;
      report.matches.push(await match(id,order,white,black));save();process.stdout.write(`Match completed: ${id}\n`);
    }
    report.status='completed';report.finishedAtUTC=new Date().toISOString();save();
    process.stdout.write('Benchmark completed: benchmarks/results.json\n');
  } catch(error){report.status='failed';report.error=error.stack;save();throw error;}
  finally{sf.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
