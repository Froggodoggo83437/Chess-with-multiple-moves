import {Chess} from 'chess.js';
import analysis from './analysis.cjs';
export function createAnalysisClient(){
 let worker=null,url=null,pending=null,generation=0;
 const dispose=()=>{worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;};
 const cancel=()=>{generation++;pending?.resolve(null);pending=null;dispose();};
 return {cancel,async start(payload,onProgress){
  cancel();const id=generation;
  if(typeof Worker!=='undefined')try{
   url=URL.createObjectURL(new Blob([window.CHESS_ANALYSIS_WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(url);
  }catch{dispose();}
  if(!worker)return analysis.analyzeGame(Chess,payload,{isCancelled:()=>id!==generation,onProgress:progress=>{if(id===generation)onProgress(progress);}});
  return new Promise((resolve,reject)=>{
   pending={resolve,reject};worker.onmessage=({data})=>{
    if(id!==generation||data.id!==id||!pending)return;
    if(data.progress){onProgress(data.progress);return;}
    const job=pending;pending=null;dispose();if(data.error)job.reject(Error(data.error));else job.resolve(data.result);
   };
   worker.onerror=event=>{const job=pending;pending=null;dispose();job?.reject(Error(event.message||'Analysis could not complete'));};
   worker.postMessage({id,payload});
  });
 }};
}
