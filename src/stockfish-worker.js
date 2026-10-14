// Preserve the upstream factory/API without auto-starting its CLI/worker loader.
let onmessage; // Lexically suppress upstream auto-loader detection.
self.onmessage=undefined;
self.module={exports:{}};self.exports=self.module.exports;
/* STOCKFISH_FACTORY */
const factory=self.module.exports;
delete self.module;delete self.exports;
let engine=null;
self.onmessage=async({data})=>{
 try{
  if(data.boot){
   if(typeof DecompressionStream==='undefined')throw Error('Gzip decompression unavailable');
   const response=await fetch(data.url,{integrity:data.integrity});if(!response.ok)throw Error('Stockfish asset unavailable');
   const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
   const wasmBinary=new Uint8Array(await new Response(stream).arrayBuffer());
   engine=await factory({wasmBinary,listener:line=>self.postMessage({line})});
   engine.onDoneSearching=()=>{};
   if(engine._isReady)while(!engine._isReady())await new Promise(resolve=>setTimeout(resolve,10));
   self.postMessage({ready:true});
  }else if(engine&&data.command){
   const result=engine.ccall('command',null,['string'],[data.command],{async:typeof IS_ASYNCIFY!=='undefined'&&/^go\b/.test(data.command)});
   if(result?.catch)result.catch(error=>self.postMessage({error:error.message}));
  }
 }catch(error){self.postMessage({error:error.message});}
};
