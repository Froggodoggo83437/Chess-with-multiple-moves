const { CustomTurnRules, chooseMove } = require('./rules.cjs');
const MATE = 1000000, MATE_THRESHOLD = 500000;
const VALUES = {p:100,n:320,b:330,r:500,q:900,k:0};
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
function staticScore(state) {
 const terminal = terminalScore(state); if (terminal !== null) return terminal;
 return state.game.board().flat().reduce((score,piece)=>score+(piece?(piece.color==='w'?1:-1)*VALUES[piece.type]:0),0);
}
function isBook(history, {order,allowKingCapture,initialFen,standardFen}) {
 if(allowKingCapture||order.join('')!=='wb'||initialFen!==standardFen||!history.length)return false;
 const moves=history.map(key);return BOOK.some(line=>moves.length<=line.length&&moves.every((move,index)=>move===line[index]));
}
function classifyMove(scores, move, book=false) {
 if(book)return {type:'book',loss:null};
 const played=scores.find(candidate=>key(candidate.move)===key(move));
 if(!played||!scores.length)return {type:'unrated',loss:null};
 const ranked=[...scores].sort((a,b)=>b.score-a.score),best=ranked[0].score;
 const loss=Math.max(0,best-played.score);
 if(best>=MATE_THRESHOLD&&played.score<MATE_THRESHOLD)return {type:'miss',loss:null};
 if(best>-MATE_THRESHOLD&&played.score<=-MATE_THRESHOLD)return {type:'blunder',loss:null};
 if(loss<=10&&scores.length>1&&key(ranked[0].move)===key(move)&&best-ranked[1].score>=150)return {type:'great',loss:0};
 return {type:loss<=10?'best':loss<=60?'excellent':loss<=150?'inaccuracy':loss<=300?'mistake':'blunder',loss:Math.abs(best)>=MATE_THRESHOLD?null:loss};
}
async function analyzePosition(state,{isCancelled=()=>false,yieldEvery=64,timeBudgetMs=350}={}) {
 const terminal=terminalScore(state);if(terminal!==null)return {whiteScore:terminal,scores:[],depth:0};
 const side=state.side,sign=side==='w'?1:-1;
 const baseline=state.legalMoves().map(move=>{const child=state.clone();child.play(move,false);return {move,score:sign*staticScore(child)};});
 let scores=baseline,depth=0;
 await chooseMove(state,3,side,{timeBudgetMs,yieldEvery,isCancelled,moveTolerance:1,mistakeProbability:0,onIteration:iteration=>{
  // Full root iterations compare every legal move at the same horizon. Partial
  // beam plans do not provide comparable scores for omitted moves.
  if(iteration.phase==='full-search'){scores=iteration.scores;depth=iteration.depth;}
 }});
 if(isCancelled())return null;
 const best=scores.length?Math.max(...scores.map(candidate=>candidate.score)):sign*staticScore(state);
 return {whiteScore:sign*best,scores,depth};
}
function restorePositions(Chess,payload) {
 return payload.snapshots.map(snapshot=>{const state=new CustomTurnRules(Chess,payload.order,undefined,{allowKingCapture:payload.allowKingCapture});state.restore(snapshot);return state;});
}
async function analyzeGame(Chess,payload,{onProgress=()=>{},isCancelled=()=>false,yieldEvery=64,timeBudgetMs=350}={}) {
 const positions=restorePositions(Chess,payload),evaluations=[],moves=[];
 const context={...payload,initialFen:positions[0].game.fen(),standardFen:new Chess().fen()};
 for(let index=0;index<positions.length;index++){
  if(isCancelled())return null;
  const result=await analyzePosition(positions[index],{isCancelled,yieldEvery,timeBudgetMs});if(!result)return null;
  evaluations[index]={whiteScore:result.whiteScore,depth:result.depth};
  if(index<positions.length-1){const move=positions[index+1].history.at(-1);moves[index]={...classifyMove(result.scores,move,isBook(positions[index+1].history,context)),depth:result.depth};}
  onProgress({index,evaluation:evaluations[index],move:moves[index]||null});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {evaluations,moves};
}
function barValue(score,flipped=false) {
 const white=score===null?50:score>=MATE_THRESHOLD?100:score<=-MATE_THRESHOLD?0:50+48*Math.tanh(score/600);
 return {whitePercent:white,topPercent:flipped?white:100-white};
}
module.exports={analyzeGame,analyzePosition,restorePositions,classifyMove,isBook,barValue,terminalScore,MATE_THRESHOLD};
