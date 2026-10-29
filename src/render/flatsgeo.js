/* =====================================================================================
   THE FLATS, DRAWN — the lakebed and its jumps are endless, so they are built around the
   camera and rebuilt as it moves:
   - the ground: 250 m squares out to about 3 km in every direction, the city cut out of
     the middle; the texture is anchored to the world, so nothing slides when it is rebuilt
   - the jumps within 1.5 km, each a height field sampled from the same function the
     physics drives on
   The renderer draws both as "dynamic" world geometry (Renderer.setDynamic).
   Lakebed material 20; jump material 21 (p1: 0 kicker, 1 table, 2 mega; p2: an id for
   variety), colour g = top length x4, b = half width x8; uv = (metres past the lip, across).
   ===================================================================================== */
import {MeshBuilder} from './mesh.js';
import {FLATS,rampsNear,rampHeight} from '../world/flats.js';

const W=(x,y,h)=>[x,h,-y];

export function buildFlatsGround(cx,cy,{cell=250,n=12}={}){
  const B=new MeshBuilder(4096);B.mat(20).col(255,0,0,255);
  const E=FLATS.edge,h=FLATS.y,ox=Math.floor(cx/cell)*cell,oy=Math.floor(cy/cell)*cell;
  const rect=(x0,y0,x1,y1)=>{if(x1-x0<.01||y1-y0<.01)return;
    B.quadP(W(x0,y0,h),W(x1,y0,h),W(x1,y1,h),W(x0,y1,h),[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],[0,1,0]);};
  for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){
    const x0=ox+i*cell,x1=x0+cell,y0=oy+j*cell,y1=y0+cell;
    if(x1<=-E||x0>=E||y1<=-E||y0>=E){rect(x0,y0,x1,y1);continue;}
    /* the city sits in the middle: keep only what lies outside it */
    if(x0<-E)rect(x0,y0,-E,y1);if(x1>E)rect(E,y0,x1,y1);
    const xa=Math.max(x0,-E),xb=Math.min(x1,E);
    if(y0<-E)rect(xa,y0,xb,-E);if(y1>E)rect(xa,E,xb,y1);
  }
  return B;
}

export function buildRamps(list){
  const B=new MeshBuilder(8192);
  for(const r of list){
    B.mat(21,r.kind==='mega'?2:r.kind==='table'?1:0,r.id&255).col(255,Math.min(255,Math.round(r.T*4)),Math.min(255,Math.round(r.hw*8)),255);
    const us=[],nf=r.kind==='mega'?30:20,nb=r.kind==='mega'?18:12;
    for(let k=0;k<=nf;k++)us.push(r.Lf*k/nf);
    us.push(r.Lf+r.T*.5,r.Lf+r.T);
    for(let k=1;k<=nb;k++)us.push(r.Lf+r.T+r.Lb*k/nb);
    const ws=r.ws,vs=[-r.hw,-r.hw+ws*.3,-r.hw+ws*.65,-r.hw+ws,0,r.hw-ws,r.hw-ws*.65,r.hw-ws*.3,r.hw];
    const map=(u,v)=>[r.ox+r.dx*u-r.dy*v,r.oy+r.dy*u+r.dx*v];
    const hAt=(u,v)=>{const [x,y]=map(Math.min(r.L-1e-3,Math.max(1e-3,u)),Math.max(-r.hw+1e-3,Math.min(r.hw-1e-3,v)));return rampHeight(r,x,y);};
    const idx=[];
    for(const u of us){const row=[];for(const v of vs){
      const [x,y]=map(u,v),h=hAt(u,v),e=.15;
      const du=(hAt(u+e,v)-hAt(u-e,v))/(2*e),dv=(hAt(u,v+e)-hAt(u,v-e))/(2*e);
      /* the slope in map axes, then the world normal (x east, z south) */
      const gx=du*r.dx-dv*r.dy,gy=du*r.dy+dv*r.dx;
      row.push(B.v(W(x,y,FLATS.y+h+.012),[-gx,1,gy],u-r.Lf,v));}idx.push(row);}
    for(let i=0;i<us.length-1;i++)for(let j=0;j<vs.length-1;j++)B.quad(idx[i][j],idx[i+1][j],idx[i+1][j+1],idx[i][j+1]);
    /* a beacon on each corner of the lip, so you can find the jumps at night and from far off */
    const lamp=r.kind==='mega'?[255,40,30]:[255,150,30],ph=r.kind==='mega'?3.4:2.4;
    for(const sv of [-1,1]){const v=sv*(r.hw-r.ws+.35),[x,y]=map(r.Lf,v),h=FLATS.y+hAt(r.Lf,v);
      B.mat(8,120,200).col(60,60,64);B.tube(W(x,y,h),W(x,y,h+ph),.06,6,false);
      B.mat(7,70,0).col(lamp[0],lamp[1],lamp[2]);B.sphere(W(x,y,h+ph+.12),.2,8,4);
      B.mat(21,r.kind==='mega'?2:r.kind==='table'?1:0,r.id&255).col(255,Math.min(255,Math.round(r.T*4)),Math.min(255,Math.round(r.hw*8)),255);}
  }
  return B;
}

/* keeps the two meshes up to date around the camera. Each jump is built once and kept; when the
   camera moves on, the nearby ones are stitched into one mesh (cheap), and new ones are built a few
   per frame so driving fast never stalls a frame. */
export class FlatsView{
  constructor(R){this.R=R;this.gk=null;this.rk=null;this.cache=new Map();this.pending=false;}
  update(camPos){
    const x=camPos[0],y=-camPos[2],gk=Math.floor(x/250)+','+Math.floor(y/250),rk=Math.floor(x/180)+','+Math.floor(y/180);
    if(gk!==this.gk){this.gk=gk;this.R.setDynamic('flats',buildFlatsGround(x,y));}
    if(rk===this.rk&&!this.pending)return;
    const list=rampsNear(x,y,1500);let built=0,missing=false;
    for(const r of list)if(!this.cache.has(r.key)){if(built>=2){missing=true;continue;}this.cache.set(r.key,buildRamps([r]));built++;}
    const B=new MeshBuilder(16384);for(const r of list){const c=this.cache.get(r.key);if(c)B.append(c);}
    this.R.setDynamic('ramps',B);this.rk=rk;this.pending=missing;
    if(this.cache.size>500){const keep=new Set(list.map(r=>r.key));for(const k of [...this.cache.keys()])if(!keep.has(k))this.cache.delete(k);}
  }
  clear(){this.gk=this.rk=null;this.R.setDynamic('flats',null);this.R.setDynamic('ramps',null);}
}
