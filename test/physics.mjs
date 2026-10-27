/* Vehicle physics checks. Each prints what it measured and whether it passed. */
import {Vehicle,ASSISTS} from '../src/physics/vehicle.js';
import {PlaneWorld,TrackWorld} from '../src/world/collision.js';
import {buildTrack,speedProfile} from '../src/world/track.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {makeBot} from '../src/game/bot.js';
import {makeGuide} from '../src/game/guide.js';
import {qmat,mcol,len} from '../src/physics/math3.js';

const DT=1/240,results=[];
const check=(name,ok,detail)=>{results.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+'  '+detail);};
const finite=car=>[...car.p,...car.v,...car.w,...car.q].every(Number.isFinite);
function newCar(world,engine='six',assist='arcade'){const car=new Vehicle(CHASSIS.sl3,carSpec(engine),world);car.setAssists(assist);return car;}
function run(car,secs,inp,each){const n=Math.round(secs/DT);for(let k=0;k<n;k++){const i=typeof inp==='function'?inp(car,k*DT):inp;car.step(DT,i);if(each&&each(car,k*DT)===false)return k*DT;}return secs;}
function startEngine(car){car.pt.start();run(car,2.2,{thr:0,brk:0,steer:0});}
const kmh=v=>v*3.6;

/* 1. settles at its ride height and stays put */
{const car=newCar(new PlaneWorld());car.place([0,0,0],0);run(car,3,{});
  const h=car.p[1],U=mcol(qmat(car.q),1);
  check('settle at ride height',finite(car)&&Math.abs(h-CHASSIS.sl3.hcg)<.03&&len(car.v)<.02&&U[1]>.999,`cg ${h.toFixed(3)} m (design ${CHASSIS.sl3.hcg}), speed ${len(car.v).toFixed(4)}`);}
/* 2. a 1.2 m drop lands and settles without bouncing away */
{const car=newCar(new PlaneWorld());car.place([0,1.2,0],0);let maxUp=0;run(car,4,{},c=>{maxUp=Math.max(maxUp,c.v[1]);});
  check('drop and settle',finite(car)&&Math.abs(car.p[1]-CHASSIS.sl3.hcg)<.04&&maxUp<3,`final cg ${car.p[1].toFixed(3)}, max rebound ${maxUp.toFixed(2)} m/s`);}
/* 3. 0-100 km/h and the quarter mile, arcade (traction control, automatic) */
for(const eng of ['six','muscle','v10','boxer']){
  const car=newCar(new PlaneWorld(),eng);car.place([0,0,0],0);startEngine(car);
  const x0=car.p[0];let t100=-1,tq=-1,trap=0,maxBeta=0,gears=new Set();
  run(car,25,{thr:1,brk:0,steer:0},(c,t)=>{maxBeta=Math.max(maxBeta,Math.abs(c.beta));gears.add(c.pt.gear);if(t100<0&&kmh(c.vf)>=100)t100=t;if(tq<0&&c.p[0]-x0>=402.3){tq=t;trap=kmh(c.vf);return false;}});
  check(`0-100 and quarter mile (${eng})`,t100>2.4&&t100<7.5&&tq>9&&tq<16&&maxBeta<.08&&finite(car),`0-100 ${t100.toFixed(2)} s, 1/4 mile ${tq.toFixed(2)} s @ ${trap.toFixed(0)} km/h, gears ${[...gears].join('')}, max slip angle ${(maxBeta*57.3).toFixed(1)} deg`);}
/* 4. braking from 100 km/h with ABS */
{const car=newCar(new PlaneWorld());car.place([0,0,0],0);startEngine(car);
  run(car,20,{thr:1},c=>kmh(c.vf)<101);const x0=car.p[0];let maxBeta=0;
  const t=run(car,8,{thr:0,brk:1,steer:0},c=>{maxBeta=Math.max(maxBeta,Math.abs(c.beta));return c.vf>.3;});const dist=car.p[0]-x0;
  check('brake 100-0 (ABS)',dist>30&&dist<45&&maxBeta<.06,`${dist.toFixed(1)} m in ${t.toFixed(2)} s, ${(27.78**2/(2*dist)/9.81).toFixed(2)} g average`);}
/* 5. skidpad: hold a 60 m circle, find the speed where it can't */
for(const as of ['arcade','sim']){
  const car=newCar(new PlaneWorld(),'six',as);car.pt.auto=true;car.place([0,0,60],0);startEngine(car);const Rr=60;let best=0,vT=8;
  run(car,40,(c,t)=>{vT=Math.min(40,8+t*.9);const rad=Math.hypot(c.p[0],c.p[2]),M=qmat(c.q),F=mcol(M,0);
      /* steer to hold the radius (centre at the origin, driving counter-clockwise seen from above) */
      const tang=[c.p[2]/rad,0,-c.p[0]/rad],err=rad-Rr,head=Math.atan2(F[0]*tang[2]-F[2]*tang[0],F[0]*tang[0]+F[2]*tang[2]);
      let steer;
      if(as==='sim'){/* a driver turning the wheel: Ackermann angle plus corrections, countersteering a slide */
        const lockEff=c.c.lock/(1+c.vf/45),delta=-Math.atan(c.c.wb/Rr)-err*.03+head*1.2+Math.sign(c.beta)*Math.max(0,Math.abs(c.beta)-.1);steer=Math.max(-1,Math.min(1,delta/lockEff));}
      else steer=Math.max(-1,Math.min(1,(c.vf*c.vf/Rr)/(c.tyre.mu*9.81)*-1-err*.08+head*1.5));
      const e=vT-c.vf;return {steer,thr:e>0?Math.min(1,.3+e*.3):0,brk:e<-1?.3:0};},
    c=>{const rad=Math.hypot(c.p[0],c.p[2]);if(Math.abs(rad-Rr)<3)best=Math.max(best,c.vf*c.vf/Rr);});
  check(`skidpad 60 m (${as})`,best/9.81>.85&&best/9.81<1.35&&finite(car),`held ${(best/9.81).toFixed(2)} g (${kmh(Math.sqrt(best*Rr)).toFixed(0)} km/h)`);}
/* 6. step steer at 110 km/h: arcade must not spin, sim may slide */
for(const as of ['arcade','sport','sim']){
  const car=newCar(new PlaneWorld(),'six',as);car.place([0,0,0],0);startEngine(car);run(car,20,{thr:1},c=>kmh(c.vf)<110);
  let maxBeta=0,minV=1e9;run(car,3,{thr:.6,steer:1},c=>{maxBeta=Math.max(maxBeta,Math.abs(c.beta));minV=Math.min(minV,c.vf);});
  run(car,2,{thr:.3,steer:0});const settled=Math.abs(car.beta)<.05;
  const ok=as==='sim'?settled:as==='sport'?maxBeta<.35&&settled:maxBeta<.22&&settled;
  check(`step steer at 110 km/h then let go (${as})`,ok&&finite(car),`max slip ${(maxBeta*57.3).toFixed(1)} deg, slowed to ${kmh(minV).toFixed(0)} km/h, ${settled?'straightened up':'still sliding'}`);}
/* 7. arcade handbrake drift: holds an angle, doesn't spin */
{const car=newCar(new PlaneWorld());car.place([0,0,0],0);startEngine(car);run(car,20,{thr:1},c=>kmh(c.vf)<75);
  run(car,.35,{thr:.6,steer:-1,hb:1});let bSum=0,n=0,maxBeta=0,onT=0;
  run(car,3,{thr:1,steer:-.7},c=>{maxBeta=Math.max(maxBeta,Math.abs(c.beta));if(c.drift.on){onT+=DT;bSum+=Math.abs(c.beta);n++;}});
  const mean=n?bSum/n:0;
  check('arcade handbrake drift',onT>2&&mean>.2&&mean<.75&&maxBeta<1.1,`drift held ${onT.toFixed(1)} s, mean angle ${(mean*57.3).toFixed(0)} deg, max ${(maxBeta*57.3).toFixed(0)} deg, speed ${kmh(car.vf).toFixed(0)} km/h`);}
/* 8. a robot lap of Neon Loop (arcade), including the jump on 5th Street */
{const T=buildTrack('neon'),world=new TrackWorld(T),car=newCar(world);car.wet=1;
  const prof=speedProfile(T,{mass:car.m,clF:car.c.clF,clR:car.c.clR,cdA:car.c.cdA,powerKw:car.spec.peak.kw},{mu:car.tyre.mu*.84});
  car.placeOnTrack(T,T.len-15,T.lineAt(T.len-15));startEngine(car);
  const bot=makeBot(T,prof,{pace:.93});let lapT=-1,walls=0,maxAir=0,dist=0,lastS=car.loc?car.loc.s:0,maxBeta=0,started=false;
  run(car,140,c=>bot(c),(c,t)=>{const e=c.takeEvents();if(e.wall>1.5)walls++;maxAir=Math.max(maxAir,c.airT);maxBeta=Math.max(maxBeta,Math.abs(c.beta));
    if(!c.loc)return false;let ds=c.loc.s-lastS;if(ds<-T.len/2)ds+=T.len;if(ds>T.len/2)ds-=T.len;dist+=ds;lastS=c.loc.s;
    if(!started&&dist>15){started=true;c.t0=t;}if(started&&dist>=T.len+15){lapT=t-c.t0;return false;}});
  check('robot lap of Neon Loop, wet (arcade)',lapT>0&&walls<=2&&finite(car),`lap ${lapT.toFixed(2)} s over ${T.len.toFixed(0)} m, ${walls} wall hits, longest airtime ${maxAir.toFixed(2)} s, max slip ${(maxBeta*57.3).toFixed(0)} deg`);}
/* 9. a careless driver (flat out, never brakes, lazy steering toward the middle of the road):
      on Arcade the walls come quickly; Arcade Easy's guide should get them round */
function careless(as){
  const T=buildTrack('neon'),world=new TrackWorld(T),car=newCar(world,'six',as);car.wet=1;
  car.placeOnTrack(T,T.len-15,0);startEngine(car);
  const guide=ASSISTS[as].guide?makeGuide(T,car):null;let walls=0,flips=0,dist=0,lastS=car.loc?car.loc.s:0,steer=0,hard=0;
  run(car,75,c=>{
    if(!c.loc)return {thr:1};
    const M=qmat(c.q),F=mcol(M,0),Rt=mcol(M,2),la=Math.max(8,c.vf*.9),s2=T.wrapS(c.loc.s+la),tg=T.pos(s2,0),d=[tg[0]-c.p[0],0,tg[2]-c.p[2]];
    const want=Math.max(-1,Math.min(1,(d[0]*Rt[0]+d[2]*Rt[2])/(Math.hypot(d[0],d[2])+1e-6)*2.2));steer+=(want-steer)*.03;
    const inp={thr:1,brk:0,steer};return guide?guide(inp):inp;},
    (c,t)=>{const e=c.takeEvents();if(e.wall>3)hard++;if(e.wall>1.5)walls++;if(mcol(qmat(c.q),1)[1]<.2)flips++;
      if(c.loc){let ds=c.loc.s-lastS;if(ds<-T.len/2)ds+=T.len;if(ds>T.len/2)ds-=T.len;dist+=ds;lastS=c.loc.s;}
      if(dist>=T.len)return false;});
  return {walls,hard,flips,dist};
}
{const a=careless('arcade'),e=careless('easy');
  check('Arcade Easy keeps a careless driver off the walls',e.dist>=1250&&e.hard<=1&&e.flips===0&&e.hard<a.hard+a.walls,
    `arcade: ${a.walls} wall hits (${a.hard} hard), ${a.dist.toFixed(0)} m; easy: ${e.walls} (${e.hard} hard), ${e.dist.toFixed(0)} m, flipped ${e.flips?'yes':'no'}`);}
const failed=results.filter(r=>!r.ok).length;console.log(`\n${results.length-failed}/${results.length} passed`);process.exit(failed?1:0);
