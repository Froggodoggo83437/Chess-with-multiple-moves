const MATE=1000000,THRESHOLD=500000;
const VALUES={p:100,n:320,b:330,r:500,q:900,k:0};
const key=move=>move.from+move.to+(move.promotion||'');
function evaluate(state){
 if(state.result)return state.result.type==='checkmate'?(state.result.winner==='w'?MATE:-MATE):0;
 const board=state.game.board(),material=board.flat().reduce((sum,piece)=>sum+(piece?VALUES[piece.type]:0),0),endgame=material<2600;
 const bishops={w:0,b:0},pawns={w:Array(8).fill(0),b:Array(8).fill(0)};
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){const piece=board[row][col];if(piece?.type==='p')pawns[piece.color][col]++;}
 let score=0;
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const piece=board[row][col];if(!piece)continue;
  const home=piece.color==='w'?7:0,advance=piece.color==='w'?6-row:row-1,center=7-Math.abs(3.5-row)-Math.abs(3.5-col);
  let value=VALUES[piece.type];
  if(piece.type==='p'){value+=advance*(endgame?10:3)+center*2;if(pawns[piece.color][col]>1)value-=12;if(!pawns[piece.color][col-1]&&!pawns[piece.color][col+1])value-=10;}
  if(piece.type==='n'||piece.type==='b'){value+=center*8;if(row===home)value-=12;if(piece.type==='b')bishops[piece.color]++;}
  if(piece.type==='r'&&!pawns[piece.color][col])value+=15;
  if(piece.type==='k'){
   if(endgame)value+=center*8;
   else{value-=center*8;if(row===home&&[1,2,6].includes(col))value+=30;const shield=row+(piece.color==='w'?-1:1);for(const file of [col-1,col,col+1])if(board[shield]?.[file]?.color===piece.color&&board[shield][file].type==='p')value+=8;}
  }
  score+=(piece.color==='w'?1:-1)*value;
 }
 return score+(bishops.w>=2?25:0)-(bishops.b>=2?25:0);
}
function replyHorizon(state){
 let index=state.index,side=state.side,opponent=false;
 for(let ply=1;ply<=16;ply++){opponent ||=side!==state.side;if(side===state.order[index])index=(index+1)%state.order.length;side=state.order[index];if(opponent&&side===state.side)return ply;}
 return Math.min(16,state.order.length+2);
}
async function searchPosition(original,{playedMove,isCancelled=()=>false,yieldEvery=128,timeBudgetMs=5000,maxDepth=10,onDepth=()=>{}}={}){
 const root=original.clone();root.searchMoveCache=new Map();
 const side=root.side,sign=side==='w'?1:-1,start=Date.now(),stop=Symbol('stop'),cancel=Symbol('cancel');
 let nodes=0,finished=null;const samples=[],principal=new Map(),evalCache=new Map();
 const minimumDepth=Math.max(3,replyHorizon(root)+1);
 const terminal=(state,ply)=>state.result?(state.result.type==='checkmate'?(state.result.winner===side?MATE-ply:-MATE+ply):0):null;
 const checkpoint=async()=>{if(++nodes%yieldEvery===0)await new Promise(resolve=>setTimeout(resolve,0));if(isCancelled())throw cancel;if(Date.now()-start>=timeBudgetMs)throw stop;};
 const score=state=>{const fen=state.game.fen();if(!evalCache.has(fen)){if(evalCache.size<8000)evalCache.set(fen,sign*evaluate(state));else return sign*evaluate(state);}return evalCache.get(fen);};
 const ordered=state=>{
  const preferred=principal.get(state.positionKey());
  const priority=move=>(key(move)===preferred?10000000:0)+(move.captured?(move.captured==='k'?1000000:VALUES[move.captured])*10-VALUES[move.piece]:0)+(VALUES[move.promotion]||0)+(/[+#]/.test(move.san)?150:0);
  return state.legalMoves().slice().sort((a,b)=>priority(b)-priority(a));
 };
 async function quiescence(state,alpha,beta,remaining,ply){
  await checkpoint();const end=terminal(state,ply);if(end!==null)return {score:end,pv:[]};
  const checked=state.inCheck(state.side),maximizing=state.side===side,stand=score(state);
  if(ply>=24||remaining<=0&&!checked)return {score:stand,pv:[]};
  let best=checked?(maximizing?-Infinity:Infinity):stand,pv=[];
  if(!checked){if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(alpha>=beta)return {score:best,pv};}
  const moves=ordered(state).filter(move=>checked||move.captured||move.promotion||(remaining>=2&&/[+#]/.test(move.san)));
  for(const move of moves){
   const child=state.clone();child.play(move,false);const result=await quiescence(child,alpha,beta,remaining-1,ply+1);
   if(maximizing?result.score>best:result.score<best){best=result.score;pv=[key(move),...result.pv];}
   if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(alpha>=beta)break;
  }
  return {score:best,pv};
 }
 async function search(state,depth,alpha,beta,lastMover,extensions,ply){
  await checkpoint();const end=terminal(state,ply);if(end!==null)return {score:end,pv:[]};
  if(depth<=0){if(state.side===lastMover&&extensions>0){depth=1;extensions--;}else return quiescence(state,alpha,beta,5,ply);}
  const maximizing=state.side===side;let best=maximizing?-Infinity:Infinity,pv=[];
  for(const move of ordered(state)){
   const child=state.clone();child.play(move,false);const result=await search(child,depth-1,alpha,beta,state.side,extensions,ply+1);
   if(maximizing?result.score>best:result.score<best){best=result.score;pv=[key(move),...result.pv];}
   if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(alpha>=beta)break;
  }
  if(pv.length&&principal.size<8000)principal.set(state.positionKey(),pv[0]);
  return {score:best,pv};
 }
 const legal=root.legalMoves(),baseline=sign*evaluate(root);
 if(root.result)return {whiteScore:sign*terminal(root,0),scores:[],depth:0,reliable:true,samples:[],source:'custom',nodes};
 try{
  for(let depth=1;depth<=maxDepth;depth++){
   let best=-Infinity,bestMove=null,bestPv=[],scores=[];
   // Root alpha-beta bounds are useful for finding the best move. The played
   // candidate is re-searched with an open window at the same depth for grading.
   for(const move of ordered(root)){
    const child=root.clone();child.play(move,false);const previous=best;
    const result=await search(child,depth-1,best,Infinity,side,6,1);
    scores.push({move,score:result.score,bound:result.score<=previous?'upper':'exact',pv:[key(move),...result.pv]});
    if(result.score>best){best=result.score;bestMove=move;bestPv=[key(move),...result.pv];}
   }
   if(playedMove&&key(playedMove)!==key(bestMove)){
    const actual=legal.find(move=>key(move)===key(playedMove));if(!actual)throw Error('Played move missing from legal choices');
    const child=root.clone();child.play(actual,false);const result=await search(child,depth-1,-Infinity,Infinity,side,6,1);
    scores=scores.map(candidate=>key(candidate.move)===key(actual)?{move:actual,score:result.score,bound:'exact',pv:[key(actual),...result.pv]}:candidate);
   }
   principal.set(root.positionKey(),key(bestMove));
   const played=scores.find(candidate=>playedMove&&key(candidate.move)===key(playedMove));
   samples.push({depth,bestScore:best,playedScore:played?.score??null});
   finished={whiteScore:sign*best,scores,depth,bestMove:key(bestMove),pv:bestPv,samples:samples.slice(),source:'custom',nodes,forced:legal.length===1,reliable:depth>=minimumDepth&&samples.length>=2,minimumDepth};
   onDepth(finished);
   // A completed exhaustive iteration establishes terminal mating lines. An
   // unplayed alternative needs a comparable played score before grading.
   if(Math.abs(best)>=THRESHOLD&&(!playedMove||played&&Math.abs(played.score)>=THRESHOLD))break;
   if(legal.length===1&&depth>=minimumDepth)break;
  }
 }catch(error){if(error===cancel)return null;if(error!==stop)throw error;}
 if(isCancelled())return null;
 return finished||{whiteScore:sign*baseline,scores:[],depth:0,reliable:false,samples:[],source:'custom',nodes,minimumDepth};
}
module.exports={searchPosition,evaluate,replyHorizon,key};
