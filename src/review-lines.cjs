// Review positions are independent Rules clones. Branching never changes the
// completed game or an existing continuation, and there is no variation limit.
class ReviewLines {
 constructor(positions,{moves=[],evaluations=[]}={}){
  this.main={id:0,label:'Original game',positions,moves,evaluations,forkIndex:0,parent:null};
  this.lines=[this.main];this.active=this.main;
 }
 select(id){const line=this.lines.find(line=>line.id===Number(id));if(line)this.active=line;return line;}
 play(index,request){
  const parent=this.active,before=parent.positions[index];if(!before||before.result)return null;
  const next=before.clone(),played=next.play(request,false);if(!played)return null;
  let line=parent;
  if(parent===this.main||index<parent.positions.length-1){
   line={id:this.lines.length,label:`Variation ${this.lines.length} — after move ${index}`,parent,forkIndex:index,
    positions:parent.positions.slice(0,index+1),moves:parent.moves.slice(0,index),evaluations:parent.evaluations.slice(0,index+1)};
   this.lines.push(line);this.active=line;
  }
  line.positions.push(next);line.moves.push(undefined);
  return {line,index,before,next,played};
 }
 syncInherited(){
  for(const line of this.lines.slice(1)){
   for(let index=0;index<line.forkIndex;index++){
    line.moves[index]=line.parent.moves[index];line.evaluations[index]=line.parent.evaluations[index];
   }
   line.evaluations[line.forkIndex]??=line.parent.evaluations[line.forkIndex];
  }
 }
}
module.exports={ReviewLines};
