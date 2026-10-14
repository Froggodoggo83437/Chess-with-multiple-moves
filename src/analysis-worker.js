import {Chess} from 'chess.js';
import analysis from './analysis.cjs';
self.onmessage=async({data})=>{
 try {
  const result=await analysis.analyzeGame(Chess,data.payload,{timeBudgetMs:data.timeBudgetMs||5000,yieldEvery:Number.MAX_SAFE_INTEGER,onProgress:progress=>self.postMessage({id:data.id,progress})});
  self.postMessage({id:data.id,result});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
