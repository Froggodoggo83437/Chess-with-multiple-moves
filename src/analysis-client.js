import {Chess} from 'chess.js';
import analysis from './analysis.cjs';
import {StockfishAnalysis,standardPositionAnalyzer} from './stockfish-analysis.js';
const BUDGETS={quick:1000,deep:5000,maximum:15000};
export function createAnalysisClient(){
 let worker=null,url=null,pending=null,generation=0,stockfish=null;
 const dispose=()=>{worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;};
 const cancel=()=>{generation++;pending?.resolve(null);pending=null;dispose();stockfish?.cancel();stockfish=null;};
 return {cancel,async start(payload,onProgress,onStatus=()=>{}){
  cancel();const id=generation,budget=BUDGETS[payload.quality]||BUDGETS.deep;
  const cancelled=()=>id!==generation;
  const progress=value=>{if(!cancelled())onProgress(value);};
  const positions=analysis.restorePositions(Chess,payload);
  if(analysis.standardCompatible(positions)){
   try{
    onStatus('Loading full Stockfish 17.1…');stockfish=new StockfishAnalysis();const engine=stockfish;
    await engine.init();if(cancelled())return null;
    onStatus('Full Stockfish 17.1 — matching-depth move comparisons');
    const result=await analysis.analyzeGame(Chess,payload,{isCancelled:cancelled,onProgress:progress,timeBudgetMs:budget,positionAnalyzer:standardPositionAnalyzer(engine)});
    if(stockfish===engine){engine.cancel();stockfish=null;}return result;
   }catch(error){
    if(cancelled())return null;stockfish?.cancel();stockfish=null;
    onStatus('Stockfish unavailable — using cautious custom-engine estimates');
   }
  }else onStatus('Custom-turn analyzer — saved sequence '+payload.order.map(side=>side==='w'?'White':'Black').join(' → '));
  if(cancelled())return null;
  if(typeof Worker!=='undefined')try{
   url=URL.createObjectURL(new Blob([window.CHESS_ANALYSIS_WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(url);
  }catch{dispose();}
  if(!worker)return analysis.analyzeGame(Chess,payload,{isCancelled:cancelled,onProgress:progress,timeBudgetMs:budget});
  return new Promise((resolve,reject)=>{
   pending={resolve,reject};worker.onmessage=({data})=>{
    if(cancelled()||data.id!==id||!pending)return;
    if(data.progress){progress(data.progress);return;}
    const job=pending;pending=null;dispose();if(data.error)job.reject(Error(data.error));else job.resolve(data.result);
   };
   worker.onerror=event=>{const job=pending;pending=null;dispose();job?.reject(Error(event.message||'Analysis could not complete'));};
   worker.postMessage({id,payload,timeBudgetMs:budget});
  });
 }};
}
