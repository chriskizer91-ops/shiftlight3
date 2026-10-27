/* The career's solo events, headless: a drag run (stage, tree, reaction, splits, a winner), a
   red light, a time trial with a ghost, a drift run that scores.  node test/events.mjs */
import {makeLevel} from '../src/game/levels.js';
import {Vehicle} from '../src/physics/vehicle.js';
import {build,STOCK_SETUP} from '../src/game/setup.js';
import {REF} from '../src/game/career.js';
import {DragEvent} from '../src/game/drag.js';
import {TrialEvent,DriftEvent} from '../src/game/modes.js';
let fails=0;const check=(ok,name,info)=>{console.log((ok?'PASS ':'FAIL ')+name+'  '+info);if(!ok)fails++;};
const mk=(S,level)=>{const b=build(S);const c=new Vehicle(b.chassis,b.spec,level.world);c.setAssists('arcade');c.pt.auto=true;return c;};
const city=makeLevel('city');
/* drag: you hold brake and throttle, let go 0.2 s after the green */
for(const [cls,foul] of [['D',false],['A',false],['D',true]]){
  const you=mk(REF[cls],city),ev=new DragEvent(city,you,{opp:build(REF[cls]),rt:.25,seed:7});
  let time=0,greenAt=-1;const dt=1/60;
  for(let f=0;f<60*40&&!ev.done;f++){
    let inp={steer:0,thr:1,brk:1,hb:0};
    if(ev.phase==='tree'&&foul&&ev.t>.3)inp.brk=0;
    if(ev.phase==='run'){if(greenAt<0)greenAt=time;if(time-greenAt>.2)inp.brk=0;}
    if(ev.runners[0].fin>0)inp={steer:0,thr:0,brk:.6,hb:0};
    inp=ev.gate(inp);for(let k=0;k<4;k++){you.step(dt/4,inp);ev.stepPhysics(dt/4);}time+=dt;ev.update(dt,time);ev.takeEvents();}
  const R=ev.result(),sl=ev.slip();
  console.log(`  ${cls}${foul?' (jumped)':''}: `+sl.map(x=>`${x.name} RT ${x.rt!==null?x.rt.toFixed(3):'-'} ET ${x.splits.length===5?x.splits[4].t.toFixed(3):'-'} trap ${x.trap?(x.trap*2.237).toFixed(1):'-'} mph`).join(' | ')+'  → '+R.summary);
  if(foul)check(R.rank===0&&ev.foul,'jumping the green is a red light',R.summary);
  else check(sl.every(x=>x.splits.length===5)&&ev.done,`class ${cls} drag runs to the finish`,`rank ${R.rank}, ${sl[0].splits.map(s=>s.name+' '+s.t.toFixed(2)).join(', ')}`);
}
/* time trial: a bot drives five laps; the best becomes the ghost, and the ghost replays it */
const loop=makeLevel('loop');
{const you=mk(STOCK_SETUP,loop),bot=loop.bot(you),ev=new TrialEvent(loop,you,{laps:3,medals:[60,63,67]});let time=0,ghostSeen=0,maxGap=0;const dt=1/60;
  for(let f=0;f<60*300&&!ev.done;f++){let inp=Object.assign({thr:0,brk:0,steer:0,hb:0},bot(you));inp=ev.gate(inp);for(let k=0;k<4;k++)you.step(dt/4,inp);time+=dt;ev.update(dt,time,{});
    const v=ev.views();if(v.length){ghostSeen++;const g=v[0].p;maxGap=Math.max(maxGap,Math.hypot(g[0]-you.p[0],g[2]-you.p[2]));}ev.takeEvents();}
  const R=ev.result();console.log('  trial:',R.rows.join(' | '));
  check(ev.done&&ev.times.length===3&&ev.best>40,'a time trial times its laps',R.summary+`, rank ${R.rank}`);
  check(ghostSeen>60&&maxGap<60,'the ghost drives your best lap alongside',`${ghostSeen} frames with a ghost, furthest apart ${maxGap.toFixed(1)} m`);}
/* drift: a car thrown into slides with the handbrake scores points */
{const you=mk(Object.assign({},STOCK_SETUP,{engine:'muscle',tyres:4,diff:4}),loop);you.setAssists('arcade');const bot=loop.bot(you),ev=new DriftEvent(loop,you,{time:40,targets:[20000,12000,6000]});let time=0;const dt=1/60;
  for(let f=0;f<60*60&&!ev.done;f++){let inp=Object.assign({thr:0,brk:0,steer:0,hb:0},bot(you));
    /* flick the handbrake when the bot is turning hard */
    if(Math.abs(inp.steer)>.35&&you.vf>12)inp.hb=1;if(you.drift.on){inp.thr=.8;}
    inp=ev.gate(inp);for(let k=0;k<4;k++)you.step(dt/4,inp);time+=dt;ev.update(dt,time,{ev:you.takeEvents()});ev.takeEvents();}
  const R=ev.result();check(ev.done&&ev.score.total>0,'drifting scores',R.rows.join(' | '));}
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
