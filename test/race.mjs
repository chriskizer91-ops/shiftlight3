/* A full race on Neon Loop, headless: the field holds still for the lights, everyone gets
   round, they race each other (passes happen), nobody ends up on their roof. You are a bot.
   node test/race.mjs */
import {makeLevel} from '../src/game/levels.js';
import {Race} from '../src/game/race.js';
import {Vehicle} from '../src/physics/vehicle.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {qmat,mcol} from '../src/physics/math3.js';

const level=makeLevel('loop');let fails=0;
const check=(ok,name,info)=>{console.log((ok?'PASS ':'FAIL ')+name+'  '+info);if(!ok)fails++;};
const t0=Date.now();
for(const diff of (process.env.DIFF||'racing').split(',')){
  const you=new Vehicle(CHASSIS.sl3,carSpec('six'),level.world);you.setAssists('arcade');you.pt.auto=true;
  const race=new Race(level,you,{rivals:5,laps:3,difficulty:diff,seed:11});
  const bot=level.bot(you);
  const DT=1/240;let time=0,moved=0,flips=0,crashes=0,changes=0,prevOrder=null,lead=[];
  const start=race.entrants.map(e=>e.car.p.slice());
  for(let f=0;f<60*400&&race.phase!=='done';f++){
    const dt=1/60;let drive=Object.assign({thr:0,brk:0,steer:0,hb:0},bot(you));drive=race.gate(drive);
    for(let k=0;k<4;k++){you.step(DT,drive);race.stepPhysics(DT);time+=DT;}
    race.update(dt,time);
    for(const e of race.takeEvents())if(e.type==='crash')crashes++;
    if(race.phase==='countdown'||race.phase==='grid')race.entrants.forEach((e,i)=>{moved=Math.max(moved,Math.hypot(e.car.p[0]-start[i][0],e.car.p[2]-start[i][2]));});
    for(const e of race.entrants){if(mcol(qmat(e.car.q),1)[1]<.3)flips++;}
    if(race.phase==='racing'){const ord=race.order.map(e=>e.name).join(',');if(prevOrder&&ord!==prevOrder&&time-race.goT>20)changes++;prevOrder=ord;}
  }
  const R=race.results();
  console.log(`  ${diff}: `+R.map(r=>`${r.pos}.${r.name} ${r.time?r.time.toFixed(1):'DNF'} (best ${r.best?r.best.toFixed(2):'-'})`).join('  '));
  check(moved<.6,diff+': the field holds for the lights',`moved at most ${moved.toFixed(2)} m before the go`);
  check(race.phase==='done'&&R.filter(r=>r.dnf).length===0,diff+': everyone finishes',`${R.filter(r=>r.dnf).length} DNF, phase ${race.phase}`);
  check(flips===0,diff+': nobody rolls',`${flips} upside-down frames`);
  check(changes>0,diff+': places change hands',`${changes} changes of order after the first 20 s, ${crashes} contacts between rivals`);
}
console.log(`${fails?fails+' FAILED':'all passed'}  (${((Date.now()-t0)/1000).toFixed(1)} s)`);
process.exit(fails?1:0);
