/* Shift City physics: the deck, a ramp, under the deck, a building. */
import {Vehicle} from '../src/physics/vehicle.js';
import {RoadWorld} from '../src/world/roadworld.js';
import {buildCityMap} from '../src/world/citymap.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {qmat,mcol,qlook,len} from '../src/physics/math3.js';
const M=buildCityMap(),W=new RoadWorld(M),results=[];
const check=(name,ok,detail)=>{results.push(ok);console.log((ok?'PASS ':'FAIL ')+name+'  '+detail);};
function newCar(){const c=new Vehicle(CHASSIS.sl3,carSpec('six'),W);c.setAssists('arcade');return c;}
function placeOn(car,R,s,d){const fr=R.frame(s),p=R.pos(s,d);car.q=qlook(fr.f,fr.u);car.p=[p[0]+fr.u[0]*car.c.hcg,p[1]+fr.u[1]*car.c.hcg,p[2]+fr.u[2]*car.c.hcg];car.v=[0,0,0];car.w=[0,0,0];car.pt.start();for(let i=0;i<480;i++)car.step(1/240,{});}
/* drive along a ribbon at an offset and target speed with pure pursuit */
function follow(car,R,d,vT,secs,each){let hint=-1;for(let k=0;k<secs*240;k++){
  const L=R.locate(car.p[0],car.p[2],hint);if(!L)return false;hint=L.i;
  const M2=qmat(car.q),F=mcol(M2,0),Rt=mcol(M2,2),la=Math.max(6,car.vf*.8),s2=R.wrapS(L.s+la),tg=R.pos(s2,d),dx=tg[0]-car.p[0],dz=tg[2]-car.p[2];
  const steer=Math.max(-1,Math.min(1,(dx*Rt[0]+dz*Rt[2])/Math.hypot(dx,dz)*2.2)),e=vT-car.vf;
  car.step(1/240,{steer,thr:e>0?Math.min(1,.3+e*.3):0,brk:e<-2?.4:0});if(each&&each(car,L)===false)return true;}return true;}
/* 1. a lap of the deck, eastbound lane, 100 km/h */
{const car=newCar();placeOn(car,M.hwy,10,-6);let minY=1e9,maxY=-1e9,walls=0;const s0=10;let dist=0,last=10;
  follow(car,M.hwy,-6,28,140,(c,L)=>{minY=Math.min(minY,c.p[1]);maxY=Math.max(maxY,c.p[1]);if(c.takeEvents().wall>1)walls++;let ds=L.s-last;if(ds<-1000)ds+=M.hwy.len;dist+=ds;last=L.s;if(dist>M.hwy.len)return false;});
  check('a lap of the elevated highway',minY>9.2&&maxY<9.8&&walls===0&&dist>M.hwy.len,`cg between ${minY.toFixed(2)} and ${maxY.toFixed(2)} m, ${walls} wall hits, ${dist.toFixed(0)} m`);}
/* 2. down an exit: from the deck to the boulevard */
{const r=M.ramps[0],car=newCar();const L0=M.hwy.locate(r.mx[0],-r.my[0],-1);placeOn(car,M.hwy,L0.s-60,-6);
  follow(car,M.hwy,-6,20,12,c=>{const Lr=r.locate(c.p[0],c.p[2],-1);if(Lr&&Lr.s>3)return false;});const ok1=car.p[1]>9;
  follow(car,r,0,18,10,(c,L)=>{if(L.s>r.len-1)return false;});const y=car.p[1];
  check('take an exit down to the street',ok1&&y<.8&&y>.3,`on the deck at ${ok1?'yes':'no'}, ended at cg ${y.toFixed(2)} m`);}
/* 3. under the deck: drive the boulevard below it */
{const car=newCar();const sh=M.hwy;placeOn(car,{...sh,pos:(s,d,h=0)=>{const p=sh.pos(s,d,h);p[1]=0;return p;},frame:s=>{const f=sh.frame(s);return {f:[f.f[0],0,f.f[2]].map((v,i,a)=>v/Math.hypot(a[0],a[2])),l:f.l,u:[0,1,0]};}},300,-6.85);
  let maxY=-1e9,walls=0;
  const ground={...sh,pos:(s,d,h=0)=>{const p=sh.pos(s,d,h);p[1]=0;return p;}};
  follow(car,ground,-6.85,16,40,c=>{maxY=Math.max(maxY,c.p[1]);if(c.takeEvents().wall>1)walls++;});
  check('drive the boulevard under the deck',maxY<.7&&walls===0,`highest cg ${maxY.toFixed(2)} m, ${walls} wall hits`);}
/* 4. into a building: run up along an avenue's centre and turn straight into the block */
{const L=M.lots.find(l=>l.district==='downtown'&&!l.outer&&l.y0>-250&&l.y0<-220),car=newCar();const cx=(L.x0+L.x1)/2;
  car.place([cx,0,240],Math.PI/2);car.pt.start();for(let i=0;i<480;i++)car.step(1/240,{});
  let hit=0,front=-1e9;for(let k=0;k<240*8;k++){car.step(1/240,{thr:car.vf<12&&!hit?1:0,brk:0,hb:hit?1:0});const e=car.takeEvents();if(e.wall>2)hit=Math.max(hit,e.wall);front=Math.max(front,-car.p[2]+2.3);}
  check('hit a building and stop at its wall',hit>4&&front<L.y0+.5&&front>L.y0-.5&&len(car.v)<1,`impact ${hit.toFixed(1)} m/s, nose reached ${front.toFixed(2)} (wall at ${L.y0.toFixed(2)}), speed after ${len(car.v).toFixed(1)} m/s`);}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
