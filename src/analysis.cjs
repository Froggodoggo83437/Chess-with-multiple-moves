const { CustomTurnRules } = require('./rules.cjs');
const {searchPosition} = require('./custom-review.cjs');
const MATE = 1000000, MATE_THRESHOLD = 500000;
const BOOK = [
 ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6'],
 ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5'],
 ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6'],
 ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4'],
 ['e2e4','e7e6','d2d4','d7d5','b1c3','g8f6'],
 ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4'],
 ['e2e4','c7c6','d2d4','d7d5']
];
const key = move => move.from+move.to+(move.promotion||'');
function terminalScore(state) {
 if (!state.result) return null;
 return state.result.type === 'checkmate' ? (state.result.winner === 'w' ? MATE : -MATE) : 0;
}
function isBook(history, {order,allowKingCapture,initialFen,standardFen,standardCompatible:compatible=false}) {
 if((allowKingCapture&&!compatible)||order.join('')!=='wb'||initialFen!==standardFen||!history.length)return false;
 const moves=history.map(key);return BOOK.some(line=>moves.length<=line.length&&moves.every((move,index)=>move===line[index]));
}
function classifyMove(scores, move, book=false, {reliable=true, uncertainty=0, expectedScore=false}={}) {
 if(book)return {type:'book',loss:null};
 const played=scores.find(candidate=>key(candidate.move)===key(move));
 if(!played||!scores.length||!reliable)return {type:'unrated',loss:null};
 const ranked=[...scores].sort((a,b)=>b.score-a.score),best=ranked[0].score;
 const loss=Math.max(0,best-played.score);
 const chance=score=>score>=MATE_THRESHOLD?1:score<=-MATE_THRESHOLD?0:1/(1+Math.exp(-score/400));
 const probabilityLoss=Math.max(0,chance(best-uncertainty/2)-chance(played.score+uncertainty/2));
 if(best>=MATE_THRESHOLD&&played.score<MATE_THRESHOLD&&chance(played.score)<.85)return {type:'miss',loss:null};
 if(best>-MATE_THRESHOLD&&played.score<=-MATE_THRESHOLD&&chance(best)>.15)return {type:'blunder',loss:null};
 if(loss<=10&&scores.length>1&&key(ranked[0].move)===key(move)&&best-ranked[1].score>=150)return {type:'great',loss:0};
 const type=expectedScore?(probabilityLoss<=.01?'best':probabilityLoss<=.04?'excellent':probabilityLoss<=.095?'inaccuracy':probabilityLoss<=.18?'mistake':'blunder'):(loss<=10?'best':loss<=60?'excellent':loss<=150?'inaccuracy':loss<=300?'mistake':'blunder');
 return {type,loss:Math.abs(best)>=MATE_THRESHOLD?null:loss,uncertainty};
}
function standardCompatible(positions) {
 if(!positions.length||positions[0].order.join('')!=='wb')return false;
 return positions.every(state=>{
  if(state.result?.reason==='king-capture')return false;
  const kings=state.game.board().flat().filter(piece=>piece?.type==='k');
  if(kings.length!==2||state.game.turn()!==state.side)return false;
  return !!state.result||!state.inCheck(state.side==='w'?'b':'w');
 });
}
async function analyzePosition(state,options={}) {
 return searchPosition(state,options);
}
function gradeReview(result,move,nextState,book=false) {
 if(book)return {type:'book',loss:null,confidence:'opening'};
 if(nextState.result?.type==='checkmate'&&nextState.result.winner===move.color)return {type:'best',loss:0,confidence:'proven'};
 if(result.forced)return {type:'best',loss:0,confidence:'forced'};
 const actual=result.scores.find(candidate=>key(candidate.move)===key(move));
 const best=result.scores.length?Math.max(...result.scores.map(candidate=>candidate.score)):null;
 const provenWin=actual?.bound!=='upper'&&actual?.score>=MATE_THRESHOLD&&best>=MATE_THRESHOLD;
 const samples=result.samples.filter(sample=>sample.playedScore!==null).slice(-3);
 const losses=samples.map(sample=>Math.max(0,sample.bestScore-sample.playedScore));
 const spread=losses.length?Math.max(...losses)-Math.min(...losses):Infinity;
 const stable=losses.length>=2&&spread<=100;
 const uncertainty=Math.max(35,Number.isFinite(spread)?spread:1000);
 const reliable=provenWin||result.reliable&&stable;
 const grade=classifyMove(result.scores,move,false,{reliable,uncertainty,expectedScore:true});
 return {...grade,confidence:provenWin?'mate-found':reliable?'stable':'uncertain',bestMove:result.bestMove,pv:result.pv||[],source:result.source};
}
function restorePositions(Chess,payload) {
 return payload.snapshots.map(snapshot=>{const state=new CustomTurnRules(Chess,payload.order,undefined,{allowKingCapture:payload.allowKingCapture});state.restore(snapshot);return state;});
}
async function analyzeGame(Chess,payload,{onProgress=()=>{},isCancelled=()=>false,yieldEvery=128,timeBudgetMs=5000,positionAnalyzer=analyzePosition}={}) {
 const positions=restorePositions(Chess,payload),evaluations=[],moves=[];
 const context={...payload,standardCompatible:standardCompatible(positions),initialFen:positions[0].game.fen(),standardFen:new Chess().fen()};
 for(let index=0;index<positions.length;index++){
  if(isCancelled())return null;
  const playedMove=positions[index+1]?.history.at(-1),end=terminalScore(positions[index]);
  let result;
  if(end!==null)result={whiteScore:end,depth:0,scores:[],samples:[],source:'exact',reliable:true};
  else if(playedMove&&positions[index+1].result?.type==='checkmate'&&positions[index+1].result.winner===playedMove.color){
   const sign=playedMove.color==='w'?1:-1;result={whiteScore:sign*(MATE-1),depth:1,scores:[{move:playedMove,score:MATE-1,bound:'exact'}],samples:[],source:'exact',reliable:true};
  }else result=await positionAnalyzer(positions[index],{playedMove,index,positions,context,isCancelled,yieldEvery,timeBudgetMs});
  if(!result||isCancelled())return null;
  result.samples ||= []; result.scores ||= [];
  evaluations[index]={whiteScore:result.whiteScore,depth:result.depth,source:result.source,reliable:result.reliable,nodes:result.nodes};
  if(playedMove)moves[index]={...gradeReview(result,playedMove,positions[index+1],isBook(positions[index+1].history,context)),depth:result.depth};
  onProgress({index,evaluation:evaluations[index],move:moves[index]||null});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {evaluations,moves};
}
function barValue(score,flipped=false) {
 const white=score===null?50:score>=MATE_THRESHOLD?100:score<=-MATE_THRESHOLD?0:50+48*Math.tanh(score/600);
 return {whitePercent:white,topPercent:flipped?white:100-white};
}
module.exports={analyzeGame,analyzePosition,restorePositions,classifyMove,gradeReview,standardCompatible,isBook,barValue,terminalScore,MATE_THRESHOLD};
