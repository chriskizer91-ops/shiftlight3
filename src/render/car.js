/* =====================================================================================
   CAR PIPELINE — draws every car, instanced: one draw per part per body design per level of
   detail, whatever the number of cars. Body, greenhouse (paint pass and glass pass), a driver,
   wheels that steer and spin, calipers that only steer. Plugs into the renderer's opaque,
   glass and shadow hooks. A car to draw is a plain object the game fills each frame:
     {id, design, self, p, q, wheels:[{hp, len, steer, ang, disc}], lamps:[head, tail, brake, rev],
      ind:[left, right], paint, caliper, driver (false hides the driver), lod (forced, optional)}
   ===================================================================================== */
import {M4} from './gl.js';
import {LAYOUT,STRIDE} from './mesh.js';
import {buildCar,mirrorZ} from './carmodel.js';
import {DESIGNS,designUniforms} from './designs.js';
import {CAR_VS,CAR_FS,CAR_DEPTH_VS,CAR_DEPTH_FS} from './glsl/car.js';

export const PAINTS={
  magenta:{name:'Neon Magenta',col:[.62,.03,.22],metal:.75,rough:.32,flake:.9,roof:[.62,.03,.22]},
  midnight:{name:'Midnight Blue',col:[.012,.03,.11],metal:.8,rough:.3,flake:1,roof:[.012,.03,.11]},
  silver:{name:'Liquid Silver',col:[.6,.62,.64],metal:1,rough:.28,flake:.6,roof:[.6,.62,.64]},
  orange:{name:'Signal Orange',col:[.85,.2,.02],metal:.15,rough:.25,flake:.2,roof:[.01,.01,.01]},
  green:{name:'Racing Green',col:[.01,.12,.05],metal:.6,rough:.3,flake:.8,roof:[.01,.12,.05]},
  white:{name:'Pearl White',col:[.8,.8,.78],metal:.1,rough:.22,flake:.4,roof:[.01,.01,.01]},
  black:{name:'Gloss Black',col:[.006,.006,.007],metal:.3,rough:.2,flake:.5,roof:[.006,.006,.007]}
};
/* everyday colours for the cars around you */
export const TRAFFIC_PAINTS=[
  {col:[.55,.56,.57],metal:.9,rough:.32,flake:.5},{col:[.02,.02,.022],metal:.4,rough:.25,flake:.4},{col:[.7,.7,.68],metal:.05,rough:.3,flake:0},
  {col:[.12,.13,.14],metal:.8,rough:.35,flake:.5},{col:[.25,.02,.02],metal:.6,rough:.3,flake:.6},{col:[.02,.06,.18],metal:.7,rough:.3,flake:.6},
  {col:[.3,.3,.31],metal:.85,rough:.3,flake:.6},{col:[.06,.1,.06],metal:.5,rough:.35,flake:.4},{col:[.4,.33,.22],metal:.6,rough:.35,flake:.5},
  {col:[.75,.74,.7],metal:.1,rough:.25,flake:.2},{col:[.5,.08,.02],metal:.2,rough:.3,flake:.2},{col:[.05,.18,.3],metal:.3,rough:.3,flake:.3}
].map(p=>Object.assign({roof:p.col},p));
export const TAXI_PAINT={col:[.78,.5,.02],metal:.05,rough:.28,flake:0,roof:[.78,.5,.02]};

const FPI=40;                 /* floats per instance: 10 vec4 */
const LOD_DIST=45,LOD0_MAX=8,MAX_DIST=420;
const SPLITS=[18,49,144];     /* the sun cascades' far ends, plus a car's reach */
const T4=(x,y,z)=>{const m=M4.ident();m[12]=x;m[13]=y;m[14]=z;return m;};
const RY=a=>{const m=M4.ident(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;};
const RZ=a=>{const m=M4.ident(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;};
/* rotation of a quaternion [x,y,z,w] into a column-major 4x4 with position */
function qm4(q,p){const [x,y,z,w]=q,m=new Float32Array(16);
  m[0]=1-2*(y*y+z*z);m[1]=2*(x*y+z*w);m[2]=2*(x*z-y*w);m[4]=2*(x*y-z*w);m[5]=1-2*(x*x+z*z);m[6]=2*(y*z+x*w);
  m[8]=2*(x*z+y*w);m[9]=2*(y*z-x*w);m[10]=1-2*(x*x+y*y);m[12]=p[0];m[13]=p[1];m[14]=p[2];m[15]=1;return m;}
const pack8=c=>Math.round(Math.min(1,Math.max(0,c[0]))*255)*65536+Math.round(Math.min(1,Math.max(0,c[1]))*255)*256+Math.round(Math.min(1,Math.max(0,c[2]))*255);

/* one stream of instances, shared by the meshes drawn with it */
class Batch{
  constructor(G,meshes){this.G=G;this.gl=G.gl;this.meshes=meshes.filter(Boolean);this.cap=0;this.buf=this.gl.createBuffer();this.data=new Float32Array(0);this.n=0;this.d=[];this.self=false;
    this.ensure(8);for(const m of this.meshes)this.point(m,0);}
  point(mesh,first){const gl=this.gl;gl.bindVertexArray(mesh.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);
    for(let i=0;i<10;i++){const loc=5+i;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,FPI*4,first*FPI*4+i*16);gl.vertexAttribDivisor(loc,1);}
    gl.bindVertexArray(null);}
  ensure(n){if(n<=this.cap)return;const gl=this.gl;this.cap=Math.max(n,this.cap*2,8);const d=new Float32Array(this.cap*FPI);d.set(this.data.subarray(0,this.n*FPI));this.data=d;
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);}
  reset(){this.n=0;this.d.length=0;this.self=false;}
  push(M,P,paint,p2,roof,lamps,dist){this.ensure(this.n+1);const o=this.n*FPI,a=this.data;
    for(let r=0;r<3;r++){a[o+r*4]=M[r];a[o+r*4+1]=M[4+r];a[o+r*4+2]=M[8+r];a[o+r*4+3]=M[12+r];a[o+12+r*4]=P[r];a[o+12+r*4+1]=P[4+r];a[o+12+r*4+2]=P[8+r];a[o+12+r*4+3]=P[12+r];}
    a.set(paint,o+24);a.set(p2,o+28);a.set(roof,o+32);a.set(lamps,o+36);this.d.push(dist);this.n++;}
  upload(){if(!this.n)return;const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.n*FPI);}
  /* how many instances are nearer than r (they are sorted by distance) */
  within(r){let k=0;while(k<this.n&&this.d[k]<r)k++;return k;}
  draw(mesh,first=0,count=this.n){if(count<=first)return;
    if(first>0)this.point(mesh,first);this.G.drawInst(mesh,count-first);if(first>0)this.point(mesh,0);}
}

export class CarRenderer{
  /* chassis: {id: chassis with a .design}, every body that may appear */
  constructor(R,chassis){
    this.R=R;const G=R.G;this.G=G;
    this.P={car:G.program('car',CAR_VS,CAR_FS),glass:G.program('carGlass',CAR_VS,CAR_FS,{GLASS:1}),depth:G.program('carDepth',CAR_DEPTH_VS,CAR_DEPTH_FS)};
    this.kinds=new Map();
    const list=chassis.design?{[chassis.design||'sl3']:chassis}:chassis;
    for(const ch of Object.values(list))this.addDesign(ch);
    this.prev=new Map();this.items=[];this.stats={cars:0,lod0:0};
    R.extra.push(this);
  }
  addDesign(ch){const id=ch.design||'sl3';if(this.kinds.has(id))return;const D=DESIGNS[id],G=this.G;
    const up=B=>B?G.mesh(LAYOUT,STRIDE,B.vertexData(),B.indexData()):null;
    const K={id,D,ch,U:designUniforms(D,ch.hcg),lod:[]};
    for(const lod of [0,1]){const m=buildCar(ch,D,{lod});
      const mesh={body:up(m.body),glass:up(m.glass),driver:up(m.driver),wheelR:up(m.wheel),wheelL:up(mirrorZ(m.wheel)),calR:m.caliper?up(m.caliper):null,calL:m.caliper?up(mirrorZ(m.caliper)):null};
      K.lod.push({mesh,dims:m.dims,body:new Batch(G,[mesh.body,mesh.glass]),driver:new Batch(G,[mesh.driver]),wR:new Batch(G,[mesh.wheelR]),wL:new Batch(G,[mesh.wheelL]),
        cR:mesh.calR?new Batch(G,[mesh.calR]):null,cL:mesh.calL?new Batch(G,[mesh.calL]):null,
        tris:[m.body,m.glass,m.wheel].reduce((s,b)=>s+b.idx.length/3,0)});}
    this.kinds.set(id,K);}
  batches(){const out=[];for(const K of this.kinds.values())for(const L of K.lod)out.push([K,L]);return out;}
  prepare(R,S){
    const cam=S.cam.pos,cars=S.cars||[];
    for(const [,L] of this.batches())for(const b of [L.body,L.driver,L.wR,L.wL,L.cR,L.cL])b&&b.reset();
    /* nearest first, your own car before everyone */
    const items=[];
    for(const c of cars){const dx=c.p[0]-cam[0],dy=c.p[1]-cam[1],dz=c.p[2]-cam[2],d=c.self?-1:Math.sqrt(dx*dx+dy*dy+dz*dz);if(d>MAX_DIST)continue;items.push({c,d});}
    items.sort((a,b)=>a.d-b.d);
    let n0=0;const seen=new Set();
    for(const {c,d} of items){
      const K=this.kinds.get(c.design||'sl3');if(!K)continue;
      const lod=c.lod!=null?c.lod:(c.self||(d<LOD_DIST&&n0<LOD0_MAX))?0:1;if(lod===0)n0++;const L=K.lod[lod];
      const M=qm4(c.q,c.p),key=c.id||0,pv=this.prev.get(key);seen.add(key);
      const prevM=pv&&pv.M?pv.M:M;
      const pt=c.paint||PAINTS.magenta,L4=c.lamps||[0,0,0,0],ind=c.ind||[0,0];
      const paint=[pt.col[0],pt.col[1],pt.col[2],pt.metal],cal=c.caliper||[.7,.02,.02],roof=[pt.roof[0],pt.roof[1],pt.roof[2],pack8(cal)];
      const lamps=[L4[0],L4[1],L4[2],(L4[3]>.5?1:0)+(ind[0]?2:0)+(ind[1]?4:0)];
      const dist=Math.max(0,d),gh=c.ghost?1:0;
      L.body.push(M,prevM,paint,[pt.rough,pt.flake,0,gh],roof,lamps,dist);if(c.self)L.body.self=true;
      if(c.driver!==false&&!gh)L.driver.push(M,prevM,paint,[pt.rough,pt.flake,0,0],roof,lamps,dist);
      const pw=pv?pv.wheels:null,wl=[];
      c.wheels.forEach((w,i)=>{
        const base=M4.mul(M,M4.mul(T4(w.hp[0],w.hp[1]-w.len,w.hp[2]),RY(-w.steer)));
        const p=pw?pw[i]:null,dAng=p?Math.max(-.35,Math.min(.35,w.ang-p.ang)):0;
        const WM=M4.mul(base,RZ(-w.ang)),WP=p?M4.mul(p.base,RZ(-(w.ang-dAng))):WM;
        const left=w.hp[2]<0,p2=[pt.rough,pt.flake,w.disc||0,gh];
        (left?L.wL:L.wR).push(WM,WP,paint,p2,roof,lamps,dist);if(c.self)(left?L.wL:L.wR).self=true;
        if(L.cR&&!gh)(left?L.cL:L.cR).push(base,p?p.base:base,paint,p2,roof,lamps,dist);
        wl.push({ang:w.ang,base});});
      this.prev.set(key,{M,wheels:wl});
    }
    for(const k of this.prev.keys())if(!seen.has(k))this.prev.delete(k);
    for(const [,L] of this.batches())for(const b of [L.body,L.driver,L.wR,L.wL,L.cR,L.cL])b&&b.upload();
    this.stats={cars:items.length,lod0:n0};
  }
  opaque(R,U,texs){
    const G=R.G,gl=R.gl;let P=null;
    gl.enable(gl.CULL_FACE);
    for(const [K,L] of this.batches()){if(!L.body.n)continue;
      if(!P){P=G.use(this.P.car);G.set(P,U);G.tex(P,texs);}
      G.set(P,{uD:K.U});
      L.body.draw(L.mesh.body);L.body.draw(L.mesh.glass);L.driver.draw(L.mesh.driver);
      L.wR.draw(L.mesh.wheelR);L.wL.draw(L.mesh.wheelL);
      if(L.cR){L.cR.draw(L.mesh.calR);L.cL.draw(L.mesh.calL);}}
  }
  glass(R,U,texs){
    const G=R.G,gl=R.gl;let P=null;
    gl.enable(gl.CULL_FACE);
    for(const [K,L] of this.batches()){if(!L.body.n)continue;
      if(!P){P=G.use(this.P.glass);G.set(P,U);G.tex(P,texs);}
      G.set(P,{uD:K.U});L.body.draw(L.mesh.glass);}
    gl.disable(gl.CULL_FACE);
  }
  /* sun cascades draw the cars inside their range; the headlight shadow skips your own car */
  shadow(R,P,VP,kind,k){
    const G=R.G;let Pd=null;
    for(const [,L] of this.batches()){if(!L.body.n)continue;
      if(!Pd){Pd=G.use(this.P.depth);G.uni(Pd,'uVP',VP);}
      const far=kind==='hl'?85:SPLITS[k|0];
      for(const [b,mesh] of [[L.body,L.mesh.body],[L.body,L.mesh.glass],[L.wR,L.mesh.wheelR],[L.wL,L.mesh.wheelL]]){
        const n=b.within(far),first=kind==='hl'&&b.self?(mesh===L.mesh.wheelR||mesh===L.mesh.wheelL?2:1):0;b.draw(mesh,first,n);}}
    if(Pd)G.use(P);
  }
}
