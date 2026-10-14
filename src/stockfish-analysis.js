export class StockfishAnalysis {
 constructor(){this.worker=null;this.waiter=null;this.lines=[];this.closed=false;}
 async init(){
  const asset=window.CHESS_STOCKFISH_ASSET;
  if(!asset||typeof WebAssembly==='undefined'||typeof Worker==='undefined')throw Error('Stockfish not available');
  this.url=URL.createObjectURL(new Blob([window.CHESS_STOCKFISH_WORKER_SOURCE],{type:'application/javascript'}));
  this.worker=new Worker(this.url);
  this.worker.onmessage=({data})=>{
   if(data.error){const job=this.waiter;this.waiter=null;if(job){clearTimeout(job.timer);job.reject(Error(data.error));}return;}
   if(data.line)this.lines.push(data.line);
   if(this.waiter?.match(data)){const job=this.waiter;this.waiter=null;clearTimeout(job.timer);job.resolve(data);}
  };
  this.worker.onerror=event=>{const job=this.waiter;this.waiter=null;if(job){clearTimeout(job.timer);job.reject(Error(event.message||'Stockfish worker failed'));}};
  await this.waitFor({boot:true,url:new URL(asset.path,window.location.href).href,integrity:asset.integrity},data=>data.ready,120000);
  await this.command('uci',line=>line==='uciok');
  this.send('setoption name Threads value 1');this.send('setoption name Hash value 64');this.send('setoption name UCI_LimitStrength value false');
  await this.command('isready',line=>line==='readyok');
 }
 send(command){if(this.closed)throw Error('Analysis cancelled');this.worker.postMessage({command});}
 waitFor(message,match,timeout=60000){
  if(this.closed)return Promise.reject(Error('Analysis cancelled'));
  if(this.waiter)throw Error('Overlapping UCI commands');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiter=null;reject(Error('Stockfish timed out'));this.cancel();},timeout);this.waiter={match,resolve,reject,timer};this.worker.postMessage(message);});
 }
 command(command,match,timeout){return this.waitFor({command},data=>data.line&&match(data.line),timeout);}
 async search(initialFen,moves,{depth=22,timeBudgetMs=5000,searchMove}={}){
  this.send('position fen '+initialFen+(moves.length?' moves '+moves.join(' '):''));this.lines=[];
  const result=await this.command(`go depth ${depth} movetime ${timeBudgetMs}${searchMove?' searchmoves '+searchMove:''}`,line=>line.startsWith('bestmove '),Math.max(30000,timeBudgetMs+10000));
  const samples=new Map();
  for(const line of this.lines){
   const d=line.match(/\bdepth (\d+)/),s=line.match(/\bscore (cp|mate) (-?\d+)/),pv=line.match(/\bpv (.+)$/);
   if(d&&s&&!/\b(?:lowerbound|upperbound)\b/.test(line))samples.set(Number(d[1]),{score:s[1]==='mate'?Math.sign(Number(s[2]))*(1000000-Math.abs(Number(s[2]))):Number(s[2]),pv:pv?pv[1].split(' '):[]});
  }
  const last=[...samples.entries()].sort((a,b)=>b[0]-a[0])[0];
  return {move:result.line.split(' ')[1],depth:last?.[0]||0,score:last?.[1].score??null,pv:last?.[1].pv||[],samples};
 }
 cancel(){this.closed=true;const job=this.waiter;this.waiter=null;if(job){clearTimeout(job.timer);job.reject(Error('Analysis cancelled'));}this.worker?.terminate();this.worker=null;if(this.url)URL.revokeObjectURL(this.url);}
}

export function standardPositionAnalyzer(engine){
 return async(state,{playedMove,positions,context,isCancelled,timeBudgetMs})=>{
  if(isCancelled())return null;
  const initialFen=context.initialFen,moves=state.history.map(move=>move.from+move.to+(move.promotion||''));
  const best=await engine.search(initialFen,moves,{timeBudgetMs:Math.max(250,Math.floor(timeBudgetMs*.7)),depth:26});
  if(isCancelled())return null;
  const sign=state.side==='w'?1:-1,key=move=>move.from+move.to+(move.promotion||'');
  const parse=text=>({from:text.slice(0,2),to:text.slice(2,4),...(text.length>4?{promotion:text[4]}:{})});
  if(!best.move||!state.legalMoves().some(move=>key(move)===best.move))throw Error('Stockfish returned an incompatible move');
  let played=best;
  if(playedMove&&key(playedMove)!==best.move)played=await engine.search(initialFen,moves,{searchMove:key(playedMove),depth:best.depth,timeBudgetMs:Math.max(250,Math.floor(timeBudgetMs*.3))});
  if(isCancelled())return null;
  const common=[...best.samples.keys()].filter(depth=>played.samples.has(depth)).sort((a,b)=>b-a);
  const depth=common[0]||0,bestSample=best.samples.get(depth),playedSample=played.samples.get(depth);
  const bestKey=bestSample?.pv[0]||best.move;
  const scores=[];
  if(bestSample)scores.push({move:parse(bestKey),score:bestSample.score,bound:'exact'});
  if(playedMove&&playedSample&&key(playedMove)!==bestKey)scores.push({move:playedMove,score:playedSample.score,bound:'exact'});
  const samples=common.slice(0,3).sort((a,b)=>a-b).map(depth=>({depth,bestScore:best.samples.get(depth).score,playedScore:playedMove?played.samples.get(depth).score:null}));
  return {whiteScore:sign*(bestSample?.score??best.score??0),scores,depth,samples,bestMove:bestKey,pv:bestSample?.pv||best.pv,source:'stockfish',reliable:depth>=12&&common.length>=2,forced:state.legalMoves().length===1};
 };
}
