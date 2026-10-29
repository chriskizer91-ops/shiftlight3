/* The flats: endless ground, jumps you can fly off and land, solid towers, the speed strips.
   node test/flats.mjs */
import {Vehicle} from '../src/physics/vehicle.js';
import {RoadWorld} from '../src/world/roadworld.js';
import {buildCityMap} from '../src/world/citymap.js';
import {CHASSIS,carSpec} from '../src/game/cars.js';
import {qmat,mcol,qaxis} from '../src/physics/math3.js';
import {FLATS,onFlats,flatsHeight,rampsNear,rampsIn,skylineBlocks} from '../src/world/flats.js';
import {FlatsRun} from '../src/game/flatsrun.js';

const M=buildCityMap(),W=new RoadWorld(M),results=[],DT=1/240;
const check=(name,ok,detail)=>{results.push(ok);console.log((ok?'PASS ':'FAIL ')+name+'  '+detail);};
const finite=c=>[...c.p,...c.v,...c.q].every(Number.isFinite);
function newCar(engine='v10'){const c=new Vehicle(CHASSIS.sl3,carSpec(engine),W);c.setAssists('arcade');return c;}
/* map (x, y) facing yaw (radians, 0 = east), at rest on the ground */
function park(c,x,y,yaw){c.place([x,flatsHeight(x,y),-y],yaw);c.pt.start();for(let i=0;i<600;i++)c.step(DT,{thr:0,brk:.3});}
const up=c=>mcol(qmat(c.q),1)[1];

/* 1. the ground goes on: far out it is still there, flat, at the lakebed height */
{const pts=[[5000,123],[-20000,4000],[300,-60000],[80000,80000]];let ok=true,worst=0;
  for(const [x,y] of pts){if(rampsNear(x,y,1).length)continue;const g=W.ground(x,-y,-1);worst=Math.max(worst,Math.abs(g.y-FLATS.y));if(!(Math.abs(g.y-FLATS.y)<1e-6&&g.n[1]>.999))ok=false;}
  check('the flats go on forever',ok,`ground at ${FLATS.y} m out to 113 km, worst error ${worst}`);}
/* 2. jumps exist all the way out, and keep clear of the strips, the city and the towers */
{let n=0,bad=0;const kinds={};for(let i=-30;i<30;i++)for(let j=-30;j<30;j++)for(const r of rampsIn(i,j)){n++;kinds[r.kind]=(kinds[r.kind]||0)+1;
    if(Math.abs(r.mx)<r.rad+FLATS.strip||Math.abs(r.my)<r.rad+FLATS.strip||Math.max(Math.abs(r.mx),Math.abs(r.my))-r.rad<FLATS.edge)bad++;}
  check('jumps scattered across the flats',n>800&&bad===0&&kinds.mega>10,`${n} jumps in 21.6 km square (${JSON.stringify(kinds)}), ${bad} in the way`);}
/* 3. fly off kickers, tables and a big one at speed: real air, and down on the wheels */
for(const kind of ['kicker','table','mega']){
  let r=null;for(let d=1;d<40&&!r;d++)for(const q of rampsNear(2000+d*500,1500+d*300,400))if(q.kind===kind&&!r)r=q;
  const c=newCar(),yaw=Math.atan2(r.dy,r.dx),back=kind==='mega'?520:300;
  park(c,r.ox-r.dx*back,r.oy-r.dy*back,yaw);
  let air=0,maxAir=0,top=0,landedUp=1,maxV=0,t=0;
  /* full throttle straight at it, then keep going a while */
  for(let k=0;k<240*22;k++){c.step(DT,{thr:1,brk:0,steer:0});t+=DT;maxV=Math.max(maxV,c.vf);
    if(c.air){air+=DT;top=Math.max(top,c.p[1]);}else{if(air>maxAir)maxAir=air;if(air>.3)landedUp=Math.min(landedUp,up(c));air=0;}}
  check(`full throttle off a ${kind}`,finite(c)&&maxAir>(kind==='table'?.7:1)&&up(c)>.9,`${(maxV*3.6).toFixed(0)} km/h, longest air ${maxAir.toFixed(2)} s, peak ${top.toFixed(1)} m, upright ${up(c).toFixed(2)} at the end`);
}
/* 4. the towers are solid */
{const b=skylineBlocks().find(b=>Math.abs(b.cx)>900&&Math.abs(b.cy)>200&&b.w>30);const c=newCar('six');
  const x=b.cx-b.w/2-80,y=b.cy;park(c,x,y,0);let hit=0,maxX=-1e9;
  for(let k=0;k<240*8;k++){c.step(DT,{thr:1,brk:0,steer:0});const e=c.takeEvents();hit=Math.max(hit,e.wall);maxX=Math.max(maxX,c.p[0]);}
  check('the towers out on the flats are solid',hit>3&&maxX<b.cx-b.w/2+1,`hit at ${hit.toFixed(1)} m/s, got no further than ${(maxX-(b.cx-b.w/2)).toFixed(2)} m into its face`);}
/* 5. a straight run down the east strip: top speed and the flying kilometre are recorded */
{const c=newCar('v10'),run=new FlatsRun(null,()=>{});park(c,700,-3,0);let t=0;
  for(let k=0;k<240*60;k++){const F=mcol(qmat(c.q),0);c.step(DT,{thr:1,brk:0,steer:clamp(((-c.p[2])+3)*.02+(-F[2])*1.5,-1,1)});t+=DT;if(k%4===0)run.update(4*DT,t,c,false);}
  check('a run down the east strip',run.rec.top>60&&run.rec.km>40&&run.rec.km<=run.rec.top,`top ${(run.rec.top*3.6).toFixed(1)} km/h, flying km ${(run.rec.km*3.6).toFixed(1)} km/h, ${((c.p[0]-700)/1000).toFixed(1)} km out`);}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
const failed=results.filter(r=>!r).length;console.log(`\n${results.length-failed}/${results.length} passed`);process.exit(failed?1:0);
