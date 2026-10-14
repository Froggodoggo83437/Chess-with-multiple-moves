const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {strengthForElo,pickStrengthMove}=require('../src/rules.cjs');
const scores=[0,2,4,8,16,32,64,128,256,512,1024,1200].map(loss=>({move:{loss},score:1000-loss}));
const rows=[];const trials=10000,z=3.2; // Conservative simultaneous intervals for 32 settings.
for(let target=400;target<=3500;target+=100){
 const profile=strengthForElo(target);let seed=872+target,errors=0;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<trials;i++){
  const move=pickStrengthMove(scores,{...profile,random});assert.ok(scores.some(s=>s.move===move));
  if(move.loss){errors++;assert.ok(move.loss>=profile.minimumMistake);assert.ok(move.loss<=profile.moveTolerance);}
 }
 const p=errors/trials,denominator=1+z*z/trials;
 const center=(p+z*z/(2*trials))/denominator;
 const radius=z*Math.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/denominator;
 const interval=[Math.max(0,center-radius),Math.min(1,center+radius)];
 assert.ok(profile.mistakeProbability>=interval[0]-1e-12&&profile.mistakeProbability<=interval[1]+1e-12,`Error rate outside interval at ${target}`);
 if(target===3500)assert.equal(errors,0);
 rows.push({target,trials,expectedProbability:profile.mistakeProbability,observedProbability:p,interval,maxPermittedLossCp:profile.moveTolerance,status:'behavior verified',actualEloStatus:'unverified'});
}
fs.writeFileSync(path.join(__dirname,'strength-model-audit.json'),JSON.stringify({status:'completed',trialsPerSetting:trials,totalDecisions:trials*rows.length,method:'Seeded synthetic candidate pools; Wilson intervals z=3.2. Measures selection logic only, not playing strength or Elo.',rows},null,2)+'\n');
const lines=['# Strength-selection behavior audit','','All 32 settings passed 10,000 seeded selection checks each (320,000 total). This verifies their configured mistake rates and permitted loss sizes on synthetic candidate pools, **not actual Elo or game strength**. Wilson intervals use z=3.2 to conservatively account for the 32 simultaneous checks.','','| Target | Configured mistakes | Observed mistakes | Interval | Maximum loss (cp) | Actual Elo |','| --- | --- | --- | --- | --- | --- |'];
for(const r of rows)lines.push(`| ${r.target} | ${(r.expectedProbability*100).toFixed(2)}% | ${(r.observedProbability*100).toFixed(2)}% | ${(r.interval[0]*100).toFixed(2)}–${(r.interval[1]*100).toFixed(2)}% | ${r.maxPermittedLossCp} | unverified |`);
fs.writeFileSync(path.join(__dirname,'STRENGTH_MODEL.md'),lines.join('\n')+'\n');
console.log(`Verified configured error behavior across ${rows.length} settings and ${trials*rows.length} synthetic decisions. No Elo ratings were certified.`);
