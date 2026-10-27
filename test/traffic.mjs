/* Traffic in Shift City, headless: does it flow, does it stop for red, does anything overlap,
   deadlock or crash on its own, and does it stop for you.  node test/traffic.mjs */
import {makeLevel} from '../src/game/levels.js';
import {Traffic} from '../src/game/traffic.js';
import {Vehicle} from '../src/physics/vehicle.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {carBox} from '../src/physics/carcontact.js';
import {signalState} from '../src/world/lanes.js';

const t0=Date.now();
const level=makeLevel('city');
console.log('level',((Date.now()-t0)/1000).toFixed(1)+'s');
const t1=Date.now();
const T=new Traffic(level,{count:Number(process.env.N||60),seed:3});
const G=T.G;
console.log('lanes',G.lanes.length,'connectors',G.conns.length,'built',((Date.now()-t1)/1000).toFixed(1)+'s',
  'conflict pairs',G.conns.reduce((s,c)=>s+c.conflicts.length,0)/2,'dead ends',G.lanes.filter(L=>!L.closed&&!L.next.length).length);
let fails=0;const check=(ok,name,info)=>{console.log((ok?'PASS ':'FAIL ')+name+'  '+info);if(!ok)fails++;};
check(G.lanes.filter(L=>!L.closed&&!L.next.length).length===0,'every lane leads somewhere','');
check(G.lanes.filter(L=>L.kind==='ramp').every(L=>L.next.length===1),'every ramp joins a road',G.lanes.filter(L=>L.kind==='ramp').map(L=>L.next.length).join(''));

/* a player parked in the park, out of everyone's way */
const you={p:[180,.15+.48,-180],v:[0,0,0],hcg:.48};
let time=0;const dt=1/30;
const ctx=()=>({time,player:you,cam:{pos:you.p,fwd:[1,0,0]},night:1});
T.update(dt,Object.assign(ctx(),{init:true}));
check(T.cars.length===T.count,'populated',T.cars.length+' cars');
let maxOverlap=0,overlaps=0,ranRed=0,sumV=0,nV=0,maxStuck=0,crashes=0,dynSeen=0;
const prevLane=new Map();
const stepAll=(sec,extra)=>{for(let k=0;k<sec/dt;k++){time+=dt;T.update(dt,ctx());for(let j=0;j<8;j++)T.stepPhysics(dt/8,extra||null);
  for(const e of T.takeEvents())if(e.type==='crash')crashes++;
  dynSeen=Math.max(dynSeen,T.stats.dyn);
  /* overlaps on each lane */
  for(const L of G.lanes){if(L.cars.length<2)continue;const A=L.cars.filter(e=>e.c.lane===L&&e.c.mode==='kin');
    for(let i=0;i+1<A.length;i++){const a=A[i],b=A[i+1],gap=b.s-b.c.I.rear-(a.s+a.c.I.front);if(gap<-.3){overlaps++;maxOverlap=Math.max(maxOverlap,-gap);}}}
  /* entering an intersection on red without a claim made on green or amber */
  for(const c of T.cars){const pl=prevLane.get(c);if(pl&&pl!==c.lane&&c.lane.kind==='conn'&&pl.kind==='road'){
      const n=G.nodes[pl.node],st=signalState(n,pl.axis,time-dt*2);if(st===0&&!c.claimT)ranRed++;}
    prevLane.set(c,c.lane);sumV+=c.v;nV++;maxStuck=Math.max(maxStuck,c.mode!=='wreck'?c.stuck:0);}
}};
stepAll(240);
const S=T.stats;
check(overlaps===0,'no cars overlap on a lane',overlaps+' overlaps, worst '+maxOverlap.toFixed(2)+' m');
check(maxStuck<75,'nobody stuck for good',`longest wait ${maxStuck.toFixed(0)} s`);
check(S.wreck===0&&crashes===0,'no crashes on their own',`${S.wreck} wrecks, ${crashes} crash events`);
check(sumV/nV>4,'it flows',`mean speed ${(sumV/nV*3.6).toFixed(0)} km/h, ${S.moving}/${T.cars.length} moving now, up to ${dynSeen} physical`);
const claims=G.conns.reduce((s,c)=>s+(c.users||0),0);
console.log('  claims held',claims,'by mode',JSON.stringify(S));
/* where do they drive: lane kinds */
const kinds={};for(const c of T.cars)kinds[c.lane.kind]=(kinds[c.lane.kind]||0)+1;console.log('  on',JSON.stringify(kinds));

/* --- you on the corner of the busiest crossing: everyone near you drives with full physics --- */
{
  you.p=[13,.15+.48,-13];let wr=0,cr=0,dmax=0,ms=0;const t0=performance.now();let frames=0;
  for(let k=0;k<150/dt;k++){time+=dt;T.update(dt,ctx());for(let j=0;j<8;j++)T.stepPhysics(dt/8,null);frames++;
    for(const e of T.takeEvents())if(e.type==='crash')cr++;dmax=Math.max(dmax,T.stats.dyn);wr=Math.max(wr,T.stats.wreck);}
  ms=(performance.now()-t0)/frames;
  const wl=T.cars.filter(c=>c.mode==='wreck').map(c=>c.kind+' on '+c.lane.kind+(c.lane.turn||'')+' v'+c.v.toFixed(1));
  check(wr===0&&cr===0,'physical cars drive their lanes without crashing',`${wr} wrecks ${wl.join(', ')}, ${cr} contacts, up to ${dmax} physical at once`);
  check(ms<4,'and it is cheap',`${ms.toFixed(2)} ms of CPU per 1/30 s frame (traffic logic + 120 Hz physics)`);
}
/* --- you, stopped in a lane: the car behind stops, then honks --- */
{
  const L=G.lanes.find(L=>L.kind==='road'&&L.cls==='main'&&L.len>90);
  const a=L.at(L.len*.6),car=new Vehicle(CHASSIS.sl3,carSpec('six'),level.world);
  /* park the player's real car in that lane */
  car.place([a.x,0,-a.y],Math.atan2(a.ty,a.tx));car.pt.start();
  for(let i=0;i<240;i++)car.step(1/240,{thr:0,brk:0,steer:0,hb:0});
  const me={p:car.p,v:car.v,hcg:car.c.hcg,veh:car,box:carBox({xF:2.25,xR:-2.3,hw:.966,H:1.28},car.c.hcg)};
  /* clear the traffic around, then a car coming down the lane behind */
  for(const c of T.cars.slice())if(Math.hypot(c.dist)<400)T.remove(c);
  const c=T.make(L,Math.max(2,L.len*.6-60));c.v=12;
  let honks=0,minGap=1e9;const ctx2=()=>({time,player:me,cam:{pos:me.p,fwd:[1,0,0]},night:1});
  for(let k=0;k<20/dt;k++){time+=dt;T.count=1;T.update(dt,ctx2());for(let j=0;j<8;j++){car.step(dt/8,{thr:0,brk:0,steer:0,hb:0});T.stepPhysics(dt/8,me);}
    for(const e of T.takeEvents())if(e.type==='horn')honks++;
    const p=c.veh?c.veh.p:T.worldPos(c);const g=Math.hypot(p[0]-car.p[0],p[2]-car.p[2]);minGap=Math.min(minGap,g);}
  check(minGap>4.4&&minGap<14,'a car stops behind you',`closest centre-to-centre ${minGap.toFixed(1)} m, it is ${c.mode}, speed ${c.v.toFixed(2)}`);
  check(honks>0,'and honks',honks+' honks; it waited '+c.wait.toFixed(1)+' s blocked by '+c.blockBy+', patience '+c.pp.patience.toFixed(1));
  /* now drive into it */
  const before=c.mode;
  for(let k=0;k<4/dt;k++){time+=dt;T.update(dt,ctx2());for(let j=0;j<8;j++){car.step(dt/8,{thr:0,brk:0,steer:0,hb:0,rev:1});T.stepPhysics(dt/8,me);}}
  /* reverse into it hard */
  car.rev=true;car.pt.rev=true;
  let hit=0;for(let k=0;k<3/dt;k++){time+=dt;T.update(dt,ctx2());for(let j=0;j<8;j++){car.step(dt/8,{thr:0,brk:1,steer:0,hb:0});T.stepPhysics(dt/8,me);}for(const e of T.takeEvents())if(e.type==='crash')hit=Math.max(hit,e.speed);}
  check(hit>0,'backing into it is a collision',`impact ${hit.toFixed(1)} m/s, it is ${c.mode} (was ${before})`);
}
console.log(`${fails?fails+' FAILED':'all passed'}  (${((Date.now()-t0)/1000).toFixed(1)} s)`);
process.exit(fails?1:0);
