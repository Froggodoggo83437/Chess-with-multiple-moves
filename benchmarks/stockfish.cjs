const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
class Stockfish {
  constructor() {
    const src=path.join(path.dirname(require.resolve('stockfish/package.json')), 'src');
    const file=fs.readdirSync(src).find(name=>/^stockfish-17\.1-single-.*\.js$/.test(name));
    if(!file)throw Error('Pinned Stockfish single-threaded build is missing');
    this.process=spawn(process.execPath,[path.join(src,file)],{stdio:['pipe','pipe','pipe']});
    this.waiter=null;this.score=null;this.info=null;this.name=null;this.errors='';
    this.process.stderr.on('data',data=>{this.errors=(this.errors+data).slice(-2000);});
    readline.createInterface({input:this.process.stdout}).on('line',line=>{
      if(line.startsWith('id name '))this.name=line.slice(8);
      const score=line.match(/\bscore (cp|mate) (-?\d+)/);
      if(score && !/\b(?:lowerbound|upperbound)\b/.test(line))this.score={type:score[1],value:Number(score[2])};
      if(line.startsWith('info depth '))this.info=line;
      if(this.waiter?.match(line)){const job=this.waiter;this.waiter=null;clearTimeout(job.timer);job.resolve(line);}
    });
    this.process.on('exit',code=>{
      if(this.waiter){const job=this.waiter;this.waiter=null;clearTimeout(job.timer);job.reject(Error(`Stockfish exited ${code}: ${this.errors}`));}
    });
    this.process.on('error',error=>{if(this.waiter){clearTimeout(this.waiter.timer);this.waiter.reject(error);this.waiter=null;}});
  }
  command(command,match){
    if(this.waiter)throw Error('Overlapping UCI commands');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.waiter=null;this.process.kill();reject(Error(`UCI timeout: ${command}`));},30000);
      this.waiter={match,resolve,reject,timer};this.process.stdin.write(command+'\n');
    });
  }
  async init(){
    await this.command('uci',line=>line==='uciok');
    this.process.stdin.write('setoption name Threads value 1\nsetoption name Hash value 32\n');
    await this.command('isready',line=>line==='readyok');
  }
  async setStrength(elo){
    if(!Number.isInteger(elo)||elo<1320||elo>3190)throw Error('Stockfish 17.1 UCI_Elo must be 1320–3190');
    this.process.stdin.write(`setoption name UCI_LimitStrength value true\nsetoption name UCI_Elo value ${elo}\n`);
    await this.command('isready',line=>line==='readyok');
  }
  async analyze(fen,nodes,{movetime,moves=[]}={}){
    this.process.stdin.write('ucinewgame\n');
    await this.command('isready',line=>line==='readyok');
    this.score=null;this.info=null;
    this.process.stdin.write('position fen '+fen+(moves.length?' moves '+moves.join(' '):'')+'\n');
    const line=await this.command(movetime ? 'go movetime '+movetime : 'go nodes '+nodes,line=>line.startsWith('bestmove '));
    return {move:line.split(' ')[1],score:this.score,info:this.info};
  }
  close(){this.process.stdin.end('quit\n');this.process.kill();}
}
module.exports=Stockfish;
