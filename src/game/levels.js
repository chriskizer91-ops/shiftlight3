/* =====================================================================================
   LEVELS — Neon Loop (the circuit) and Shift City (free roam) behind one interface, so the
   game page doesn't care which one it is driving:
     world (physics), geo (what the renderer draws), mask (rain shelter and splash heights),
     spawn(car), resetAt(car), map (minimap paths), place(car) (street name), shelter(car),
     camCollide(pos, pivot), bot(car) (who drives on the title screen), guide(car)
   ===================================================================================== */
import {onFlats,flatsHeight,FLATS} from '../world/flats.js';
import {buildTrack,speedProfile} from '../world/track.js';
import {buildCity} from '../world/city.js';
import {buildRainMask} from '../world/rainmask.js';
import {TrackWorld} from '../world/collision.js';
import {buildCityMap,GRID,RING,CORNER,ROADS,DECK_H,HWY} from '../world/citymap.js';
import {buildShiftCity} from '../world/citygeo.js';
import {RoadWorld} from '../world/roadworld.js';
import {makeBot} from './bot.js';
import {makeGuide} from './guide.js';
import {qlook,qmat,mcol,clamp,sub,add,len,madd,norm,dot} from '../physics/math3.js';

export const LEVELS={loop:{name:'Neon Loop',mode:'Circuit'},city:{name:'Shift City',mode:'Free Roam'}};

export function makeLevel(kind){
  return kind==='city'?cityLevel():loopLevel();
}

/* ---------------- Neon Loop ---------------- */
function loopLevel(){
  const T=buildTrack('neon'),geo=buildCity(T),world=new TrackWorld(T),GRID_S=T.len-14;
  const L={kind:'loop',name:'Neon Loop',T,geo,world,mask:buildRainMask(T,geo),laps:true,lightGrid:null};
  L.spawn=car=>{car.placeOnTrack(T,GRID_S,-2.2);};
  L.resetAt=car=>{const s=car.loc?car.loc.s:GRID_S;car.placeOnTrack(T,s,T.lineAt(s));};
  L.map={paths:[{pts:Array.from({length:Math.ceil(T.N/4)},(_,i)=>[T.mx[i*4],T.my[i*4]]),closed:true,w:1}],start:[T.mx[0],T.my[0]]};
  L.place=()=> 'NEON LOOP';
  L.shelter=car=>{const t=geo.info.tunnel;return t&&car.loc&&car.loc.s>t[0]-5&&car.loc.s<t[1]+5&&Math.abs(car.loc.d)<T.wl?1:0;};
  /* keep the camera inside the barriers and above the road */
  L.camCollide=(p)=>{const Lc=T.locate(p[0],p[2],-1);if(!Lc)return p;const lim=(Lc.d>0?T.wl:T.wr)-.4;let q=p;
    if(Math.abs(Lc.d)>lim){const fr=T.frame(Lc.s);q=madd(q,fr.l,-(Math.abs(Lc.d)-lim)*Math.sign(Lc.d));}q[1]=Math.max(q[1],T.yAt(Lc.s)+.5);return q;};
  L.tvSpot=(car,idx)=>{const N=Math.max(8,Math.round(T.len/110)),seg=T.len/N,s=car.loc?car.loc.s:0,i=Math.floor(T.wrapS(s+seg*.55)/seg)%N;
    return {id:i,pos:T.pos(i*seg,(i%2?1:-1)*(T.wl+1.6),4.5+(i%3)*1.5)};};
  L.bot=car=>{const prof=speedProfile(T,{mass:car.m,clF:car.c.clF,clR:car.c.clR,cdA:car.c.cdA,powerKw:car.spec.peak.kw},{mu:car.tyre.mu*.84});return makeBot(T,prof,{pace:.88});};
  L.guide=car=>makeGuide(T,car);
  return L;
}

/* ---------------- Shift City ---------------- */
function cityLevel(){
  const M=buildCityMap(),geo=buildShiftCity(M),world=new RoadWorld(M);
  const L={kind:'city',name:'Shift City',M,geo,world,mask:cityMask(M,world),laps:false,lightGrid:{x0:-760,z0:-760,size:1520}};
  geo.info.lightGrid=L.lightGrid;
  const sp=geo.info.spawn;
  const placeAt=(car,x,y,yaw,h)=>{const g=world.ground(x,-y,-1,h===undefined?50:h+1);const f=[Math.cos(yaw),0,-Math.sin(yaw)];
    car.q=qlook(f,[0,1,0]);car.p=[x,g.y+car.c.hcg,-y];car.v=[0,0,0];car.w=[0,0,0];car.hint=-1;for(const w of car.wheels){w.w=0;w.hint=-1;}
    car.pt.gear=1;car.pt.shiftT=0;car.pt.engage=0;car.pt.locked=false;car.rev=false;car.pt.rev=false;car.drift.on=false;};
  L.spawn=car=>placeAt(car,2.9,-60,Math.PI/2,0);
  /* reset: back onto the nearest lane of the road you were on, pointing the way you were going */
  L.resetAt=car=>{const x=car.p[0],y=-car.p[2],F=mcol(qmat(car.q),0);const yaw=Math.atan2(-F[2],F[0]);
    /* out on the flats: back on your wheels right here, stepped back off any jump you landed on */
    if(onFlats(x,y)){const fx=Math.cos(yaw),fy=Math.sin(yaw),flat=(px,py)=>[[0,0],[2.6,1.2],[2.6,-1.2],[-2.6,1.2],[-2.6,-1.2]].every(([a,b])=>flatsHeight(px+fx*a-fy*b,py+fy*a+fx*b)<FLATS.y+.02);
      let px=x,py=y;for(let k=0;k<60&&!flat(px,py);k++){px-=fx*5;py-=fy*5;}
      if(!flat(px,py)){px=x;py=y;for(let k=0;k<60&&!flat(px,py);k++){px+=fy*5;py-=fx*5;}}
      placeAt(car,px,py,yaw,FLATS.y);return;}
    /* on the expressway? */
    const Lh=M.hwy.locate(car.p[0],car.p[2],-1);
    if(Lh&&Math.abs(Lh.d)<HWY.hw+2&&car.p[1]>DECK_H-2){const th=M.hwy.headAt(Lh.s),fwd=Math.cos(yaw-th)>0;const d=fwd?-4.2:4.2,p=M.hwy.pos(Lh.s,d);placeAt(car,p[0],-p[2],fwd?th:th+Math.PI,DECK_H);return;}
    /* otherwise the nearest street line */
    let best=null;for(const g of GRID){for(const ax of ['x','y']){const dd=Math.abs((ax==='x'?y:x)-g);if(!best||dd<best.dd)best={dd,ax,g};}}
    const cls=Math.abs(best.g)===RING?ROADS.ring:best.g===0?ROADS.main:Math.abs(best.g)===240?ROADS.ave:ROADS.street;
    const laneOff=(cls.med||0)+cls.lw*.5;
    if(best.ax==='x'){const east=Math.cos(yaw)>0;placeAt(car,clamp(x,-470,470),best.g+(east?-laneOff:laneOff),east?0:Math.PI,0);}
    else{const north=Math.sin(yaw)>0;placeAt(car,best.g+(north?laneOff:-laneOff),clamp(y,-470,470),north?Math.PI/2:-Math.PI/2,0);}};
  /* the minimap: every street and the expressway */
  const paths=[];
  for(const s of M.segs){if(s.axis==='arc'){const pts=[];for(let k=0;k<=12;k++){const a=s.a0+(s.a1-s.a0)*k/12;pts.push([s.cx+Math.cos(a)*s.r,s.cy+Math.sin(a)*s.r]);}paths.push({pts,w:s.cls==='street'?.5:1});}
    else paths.push({pts:[[s.x0,s.y0],[s.x1,s.y1]],w:s.cls==='street'?.5:s.cls==='ring'?1.2:.9});}
  L.map={paths,hwy:Array.from({length:Math.ceil(M.hwy.N/8)},(_,i)=>[M.hwy.mx[i*8],M.hwy.my[i*8]])};
  const NAMES=M.names;
  L.place=car=>{const x=car.p[0],y=-car.p[2];
    if(onFlats(x,y))return 'THE FLATS';
    if(car.p[1]>DECK_H-1.5){const Lh=M.hwy.locate(car.p[0],car.p[2],-1);if(Lh&&Math.abs(Lh.d)<HWY.hw+1)return 'RING EXPRESSWAY';
      for(const r of M.ramps){const Lr=r.locate(car.p[0],car.p[2],-1);if(Lr&&Lr.s>=0&&Lr.s<=r.len&&Math.abs(Lr.d)<r.hw+1)return r.name.toUpperCase();}}
    let best=null;for(const g of GRID){const dx=Math.abs(x-g),dy=Math.abs(y-g);if(!best||dx<best.d)best={d:dx,n:NAMES.x[g]};if(dy<best.d)best={d:dy,n:NAMES.y[g]};}
    return (best?best.n:'SHIFT CITY').toUpperCase();};
  /* under the deck: a little of the tunnel echo, and no rain on the lens */
  L.shelter=car=>{if(car.p[1]>DECK_H-1)return 0;const Lh=M.hwy.locate(car.p[0],car.p[2],-1);return Lh&&Math.abs(Lh.d)<HWY.hw?.45:0;};
  /* keep the camera out of buildings: walk from the car toward it and stop at the first wall */
  L.camCollide=(p,pivot)=>{if(!pivot)return p;const d=sub(p,pivot),D=len(d);if(D<1e-3)return p;const u=d.map(v=>v/D);let t=0,q=p;
    for(let k=1;k<=24;k++){const tt=D*k/24,x=[pivot[0]+u[0]*tt,pivot[1]+u[1]*tt,pivot[2]+u[2]*tt];if(world.wall(x)){q=[pivot[0]+u[0]*Math.max(.8,tt-.6),pivot[1]+u[1]*Math.max(.8,tt-.6),pivot[2]+u[2]*Math.max(.8,tt-.6)];break;}}
    const g=world.ground(q[0],q[2],-1,q[1]+.3);if(q[1]<g.y+.45)q[1]=g.y+.45;return q;};
  L.tvSpot=(car,idx)=>{const v=car.v,sp=Math.hypot(v[0],v[2]),dir=sp>2?[v[0]/sp,v[2]/sp]:[mcol(qmat(car.q),0)[0],mcol(qmat(car.q),0)[2]];
    const id=Math.floor((car.p[0]*dir[0]+car.p[2]*dir[2])/70);if(idx&&idx.id===id)return idx;
    const ahead=[car.p[0]+dir[0]*45-dir[1]*9,car.p[1]+3.5,car.p[2]+dir[1]*45+dir[0]*9];return {id,pos:L.camCollide(ahead,[car.p[0],car.p[1]+1,car.p[2]])};};
  /* on the title screen the car laps the expressway */
  L.bot=car=>{const H=M.hwy;let hint=-1;return c=>{const Lh=H.locate(c.p[0],c.p[2],hint);if(!Lh)return {thr:.3};hint=Lh.i;
    const Mq=qmat(c.q),F=mcol(Mq,0),Rt=mcol(Mq,2),v=Math.max(c.vf,1),la=clamp(v*.7,8,30),tg=H.pos(H.wrapS(Lh.s+la),-2.4),d=sub(tg,c.p);
    /* pure pursuit on the fast lane: the curvature to the target, as a share of the grip */
    const xb=dot(d,F),zb=dot(d,Rt),kappa=2*zb/Math.max(xb*xb+zb*zb,1),steer=clamp(kappa*v*v/(c.tyre.mu*9.81)*1.05+zb*.03,-1,1);
    /* patient behind anyone slower in the lane */
    let vT=27;if(L.traffic)for(const t of L.traffic.cars){if(t.dist>45)continue;const p=t.veh?t.veh.p:L.traffic.worldPos(t),rx=p[0]-c.p[0],rz=p[2]-c.p[2],ah=rx*F[0]+rz*F[2],sd=rx*Rt[0]+rz*Rt[2];
      if(ah>2&&ah<45&&Math.abs(sd)<2.3&&Math.abs(p[1]-c.p[1])<2)vT=Math.min(vT,t.v+(ah-12)*.5);}
    const e=vT-c.vf;return {steer,thr:e>0?clamp(.3+e*.3,0,1):0,brk:e<-1?clamp(-e*.15,0,.9):0};};};
  L.botStart=car=>{const p=M.hwy.pos(300,-2.4);placeAt(car,p[0],-p[2],0,DECK_H);};
  L.guide=()=>null;
  return L;
}
/* the rain mask for the city: the top surface at each spot (so rain stops on the deck), all open */
function cityMask(M,world,{x0=-760,z0=-760,size=1520,cell=4}={}){
  const n=Math.ceil(size/cell),data=new Float32Array(n*n*2);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const X=x0+(i+.5)*cell,Z=z0+(j+.5)*cell,g=world.ground(X,Z,-1);data[(j*n+i)*2]=g.y;data[(j*n+i)*2+1]=1;}
  return {n,data,params:[x0,z0,1/size,n]};
}
