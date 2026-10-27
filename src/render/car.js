/* =====================================================================================
   CAR PIPELINE — draws every car: body, greenhouse (paint pass and glass pass), wheels that
   steer and spin, calipers that only steer. Plugs into the renderer's opaque, glass and
   shadow hooks. A car to draw is a plain object the game fills each frame:
     {p, q, wheels:[{hp, len, steer, ang, disc}], lamps:[head, tail, brake, reverse], paint, self}
   ===================================================================================== */
import {M4} from './gl.js';
import {LAYOUT,STRIDE} from './mesh.js';
import {buildCar,mirrorZ} from './carmodel.js';
import {CAR_VS,CAR_FS} from './glsl/car.js';

export const PAINTS={
  magenta:{name:'Neon Magenta',col:[.62,.03,.22],metal:.75,rough:.32,flake:.9,roof:[.62,.03,.22]},
  midnight:{name:'Midnight Blue',col:[.012,.03,.11],metal:.8,rough:.3,flake:1,roof:[.012,.03,.11]},
  silver:{name:'Liquid Silver',col:[.6,.62,.64],metal:1,rough:.28,flake:.6,roof:[.6,.62,.64]},
  orange:{name:'Signal Orange',col:[.85,.2,.02],metal:.15,rough:.25,flake:.2,roof:[.01,.01,.01]},
  green:{name:'Racing Green',col:[.01,.12,.05],metal:.6,rough:.3,flake:.8,roof:[.01,.12,.05]},
  white:{name:'Pearl White',col:[.8,.8,.78],metal:.1,rough:.22,flake:.4,roof:[.01,.01,.01]},
  black:{name:'Gloss Black',col:[.006,.006,.007],metal:.3,rough:.2,flake:.5,roof:[.006,.006,.007]}
};
const T4=(x,y,z)=>{const m=M4.ident();m[12]=x;m[13]=y;m[14]=z;return m;};
const RY=a=>{const m=M4.ident(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;};
const RZ=a=>{const m=M4.ident(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;};
/* rotation of a quaternion [x,y,z,w] into a column-major 4x4 with position */
function qm4(q,p){const [x,y,z,w]=q,m=new Float32Array(16);
  m[0]=1-2*(y*y+z*z);m[1]=2*(x*y+z*w);m[2]=2*(x*z-y*w);m[4]=2*(x*y-z*w);m[5]=1-2*(x*x+z*z);m[6]=2*(y*z+x*w);
  m[8]=2*(x*z+y*w);m[9]=2*(y*z-x*w);m[10]=1-2*(x*x+y*y);m[12]=p[0];m[13]=p[1];m[14]=p[2];m[15]=1;return m;}

export class CarRenderer{
  constructor(R,chassis){
    this.R=R;const G=R.G;this.ch=chassis;
    this.P={car:G.program('car',CAR_VS,CAR_FS),glass:G.program('carGlass',CAR_VS,CAR_FS,{GLASS:1})};
    const m=buildCar(chassis);this.model=m;
    const up=B=>G.mesh(LAYOUT,STRIDE,B.vertexData(),B.indexData());
    this.mesh={body:up(m.body),glass:up(m.glass),wheelR:up(m.wheel),wheelL:up(mirrorZ(m.wheel)),calR:up(m.caliper),calL:up(mirrorZ(m.caliper))};
    this.list=[];this.prev=new Map();
    R.extra.push(this);
  }
  prepare(R,S){
    this.list=[];
    for(const c of S.cars||[]){
      const M=qm4(c.q,c.p),key=c.id||0,pv=this.prev.get(key);
      const wheels=c.wheels.map((w,i)=>{
        const cx=w.hp[0],cy=w.hp[1]-w.len,cz=w.hp[2];
        const base=M4.mul(M,M4.mul(T4(cx,cy,cz),RY(-w.steer)));
        const pw=pv?pv.wheels[i]:null;
        const dAng=pw?Math.max(-.35,Math.min(.35,w.ang-pw.ang)):0;
        return {M:M4.mul(base,RZ(-w.ang)),C:base,ang:w.ang,left:w.hp[2]<0,spin:pw?w.ang-pw.ang:0,
          prevAngM:pw?M4.mul(pw.base,RZ(-(w.ang-dAng))):null,base,prevC:pw?pw.base:base,disc:w.disc||0};});
      const item={c,M,prevM:pv?pv.M:M,wheels,paint:c.paint||PAINTS.magenta};
      for(const w of item.wheels)if(!w.prevAngM)w.prevAngM=w.M;
      this.list.push(item);
      this.prev.set(key,{M,wheels:wheels.map(w=>({ang:w.ang,base:w.base}))});
    }
  }
  uniforms(G,P,it){
    const p=it.paint,c=it.c,L=c.lamps||[0,0,0,0];
    G.set(P,{uPaint:p.col,uMetal:p.metal,uPaintR:p.rough,uFlake:p.flake,uRoof:p.roof,uLamps:L,uArch:[this.model?1.32:1.32,.335-this.ch.hcg,.405,0],uHcg:this.ch.hcg,
      uCaliper:c.caliper||[.7,.02,.02],uDirt:0});
  }
  draw(G,P,M,prevM,mesh){G.uni(P,'uModel',M);G.uni(P,'uPrevModel',prevM);G.draw(mesh);}
  opaque(R,U,texs){
    if(!this.list.length)return;const G=R.G,gl=R.gl;
    const P=G.use(this.P.car);G.set(P,U);G.tex(P,texs);
    gl.enable(gl.CULL_FACE);
    for(const it of this.list){
      this.uniforms(G,P,it);G.uni(P,'uDisc',0);
      this.draw(G,P,it.M,it.prevM,this.mesh.body);
      this.draw(G,P,it.M,it.prevM,this.mesh.glass);
      for(const w of it.wheels){G.uni(P,'uDisc',w.disc);
        this.draw(G,P,w.M,w.prevAngM,w.left?this.mesh.wheelL:this.mesh.wheelR);
        this.draw(G,P,w.C,w.prevC,w.left?this.mesh.calL:this.mesh.calR);}
    }
  }
  glass(R,U,texs){
    if(!this.list.length)return;const G=R.G,gl=R.gl;
    const P=G.use(this.P.glass);G.set(P,U);G.tex(P,texs);
    gl.enable(gl.CULL_FACE);
    for(const it of this.list){this.uniforms(G,P,it);this.draw(G,P,it.M,it.prevM,this.mesh.glass);}
    gl.disable(gl.CULL_FACE);
  }
  shadow(R,P,VP,kind){
    const G=R.G;
    for(const it of this.list){if(kind==='hl'&&it.c.self)continue;
      G.uni(P,'uModel',it.M);G.draw(this.mesh.body);G.draw(this.mesh.glass);
      for(const w of it.wheels){G.uni(P,'uModel',w.M);G.draw(w.left?this.mesh.wheelL:this.mesh.wheelR);}}
    G.uni(P,'uModel',M4.ident());
  }
}
