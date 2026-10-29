/* =====================================================================================
   THE FLATS — the dry lakebed that runs out from Shift City in every direction, forever.
   - onFlats(x, y): is this map point past the city's outer band?
   - rampsIn(ci, cj): the jumps in one 360 m patch, decided by a hash of the patch, so the
     same jumps sit in the same places however far you drive
   - flatsHeight(x, y): the ground height there, jumps included. The physics and the meshes
     both use it, so what you see is what you drive on.
   - skylineBlocks(): the towers in the ring around the city (solid, drawn by citygeo)
   - the speed strips: dark guide lines straight out from the city along both axes (Main
     Street east and west, the 0 avenue north and south), with ticks every 500 m, kept clear
     of jumps and towers
   Map coordinates: x east, y north. World: X = x, Z = -y.
   ===================================================================================== */
import {rng} from '../render/mesh.js';

export const FLATS={edge:680,y:.15,cell:360,strip:45};

export const onFlats=(x,y)=>Math.abs(x)>FLATS.edge||Math.abs(y)>FLATS.edge;

/* a well-mixed hash of a patch and a slot, in [0, 1) */
function hash(i,j,k){let h=Math.imul(i|0,374761393)^Math.imul(j|0,668265263)^Math.imul(k|0,1103515245);
  h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;h=Math.imul(h,2246822519);h^=h>>>13;return (h>>>0)/4294967296;}

/* ---------- the skyline: towers in a ring 760 m to 1.9 km out ---------- */
let SKYLINE=null,SKY_BINS=null;const SB=120;
export function skylineBlocks(){
  if(SKYLINE)return SKYLINE;
  const R=rng(4242),out=[],S=FLATS.strip;
  for(let k=0;k<420;k++){
    const a=R()*Math.PI*2,r=760+Math.pow(R(),.7)*1100,cx=Math.cos(a)*r,cy=Math.sin(a)*r;
    const w=18+R()*40,l=18+R()*40,H=25+Math.pow(R(),2)*200,style=R()<.5?2:1,seed=Math.floor(R()*255);
    const tint=style===2?[50+R()*40,80+R()*30,100+R()*30]:[120+R()*50,118+R()*45,110+R()*40];
    /* the speed strips run clear through */
    if(Math.abs(cy)<l/2+S||Math.abs(cx)<w/2+S)continue;
    /* and towers don't overlap */
    if(out.some(b=>Math.abs(b.cx-cx)<(b.w+w)/2+6&&Math.abs(b.cy-cy)<(b.l+l)/2+6))continue;
    out.push({cx,cy,w,l,H,style,seed,tint});
  }
  SKY_BINS=new Map();
  for(const b of out){const r=Math.hypot(b.w,b.l)/2;
    for(let i=Math.floor((b.cx-r)/SB);i<=Math.floor((b.cx+r)/SB);i++)for(let j=Math.floor((b.cy-r)/SB);j<=Math.floor((b.cy+r)/SB);j++){
      const key=i+','+j;let a=SKY_BINS.get(key);if(!a)SKY_BINS.set(key,a=[]);a.push(b);}}
  return SKYLINE=out;
}
/* does a circle touch any tower (with a margin)? */
function nearTower(x,y,r){skylineBlocks();
  for(let i=Math.floor((x-r)/SB);i<=Math.floor((x+r)/SB);i++)for(let j=Math.floor((y-r)/SB);j<=Math.floor((y+r)/SB);j++){
    const a=SKY_BINS.get(i+','+j);if(!a)continue;
    for(const b of a){const dx=Math.max(0,Math.abs(x-b.cx)-b.w/2),dy=Math.max(0,Math.abs(y-b.cy)-b.l/2);if(dx*dx+dy*dy<r*r)return true;}}
  return false;
}

/* ---------- jumps ----------
   Each jump runs along its own axis u (0 at the foot of the run-up) with a cross axis v:
     run-up: a curve that steepens to the lip (kickers), or a straight slope (tables)
     top:    flat
     back:   a smooth slope down, long enough to land on
   The sides slope off over ws metres, so there are no walls to hit, only banks. */
const CACHE=new Map();
export function rampsIn(ci,cj){
  const key=ci+','+cj;let list=CACHE.get(key);if(list)return list;
  list=[];if(CACHE.size>4000)CACHE.clear();CACHE.set(key,list);
  const C=FLATS.cell,cx=(ci+.5)*C,cy=(cj+.5)*C,D=Math.hypot(cx,cy);
  if(hash(ci,cj,1)>.62)return list;
  const t=hash(ci,cj,2),h=k=>hash(ci,cj,10+k);
  let r;
  if(t<.12&&D>1400)r={kind:'mega',H:7+h(0)*5,Lf:44+h(1)*18,T:6,k:1.5,hw:10+h(2)*3,ws:6};
  else if(t<.45)r={kind:'table',H:2+h(0)*2.2,Lf:14+h(1)*8,T:16+h(2)*22,k:1.15,hw:6+h(3)*3,ws:3.5};
  else r={kind:'kicker',H:2.2+h(0)*2.6,Lf:13+h(1)*9,T:3+h(2)*3,k:1.6,hw:5+h(3)*3,ws:3};
  r.Lb=r.kind==='table'?r.Lf*1.1:r.Lf*(r.kind==='mega'?1.9:2.4);
  r.L=r.Lf+r.T+r.Lb;
  const yaw=h(5)*Math.PI*2;r.dx=Math.cos(yaw);r.dy=Math.sin(yaw);
  const rad=Math.hypot(r.L/2,r.hw),room=C/2-rad-6;
  const mx=cx+(h(6)-.5)*2*Math.max(0,room),my=cy+(h(7)-.5)*2*Math.max(0,room);
  /* the middle of the jump at (mx, my); u = 0 at its foot */
  r.ox=mx-r.dx*r.L/2;r.oy=my-r.dy*r.L/2;r.mx=mx;r.my=my;r.rad=rad;r.id=(ci*7919+cj*104729)>>>0;r.key=key;
  /* keep clear of the city, the speed strips and the towers */
  const E=FLATS.edge+30,S=FLATS.strip;
  if(Math.max(Math.abs(mx),Math.abs(my))-rad<E)return list;
  if(Math.abs(my)<rad+S||Math.abs(mx)<rad+S)return list;
  if(nearTower(mx,my,rad+15))return list;
  list.push(r);return list;
}
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
/* the height a jump adds at a map point, and the local coordinates there */
export function rampHeight(r,x,y){
  const dx=x-r.ox,dy=y-r.oy,u=dx*r.dx+dy*r.dy,v=-dx*r.dy+dy*r.dx,av=Math.abs(v);
  if(u<=0||u>=r.L||av>=r.hw)return 0;
  let p;
  if(u<r.Lf)p=r.H*Math.pow(u/r.Lf,r.k);
  else if(u<r.Lf+r.T)p=r.H;
  else p=r.H*(1-smooth((u-r.Lf-r.T)/r.Lb));
  return av<r.hw-r.ws?p:p*smooth((r.hw-av)/r.ws);
}
/* the ground on the flats at a map point (the caller checks onFlats) */
export function flatsHeight(x,y){
  const C=FLATS.cell;let h=0;
  for(const r of rampsIn(Math.floor(x/C),Math.floor(y/C)))h=Math.max(h,rampHeight(r,x,y));
  return FLATS.y+h;
}
/* every jump within reach of a point */
export function rampsNear(x,y,reach){
  const C=FLATS.cell,out=[];
  for(let i=Math.floor((x-reach)/C);i<=Math.floor((x+reach)/C);i++)for(let j=Math.floor((y-reach)/C);j<=Math.floor((y+reach)/C);j++)
    for(const r of rampsIn(i,j))if(Math.hypot(r.mx-x,r.my-y)<reach+r.rad)out.push(r);
  return out;
}
