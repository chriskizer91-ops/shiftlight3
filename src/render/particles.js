/* =====================================================================================
   PARTICLE SYSTEM — rain and splashes (pure GPU), spray / tyre smoke / steam (a CPU pool).
   ===================================================================================== */
import {RAIN_VS,RAIN_FS,SPLASH_VS,SPLASH_FS,PUFF_VS,PUFF_FS} from './glsl/particles.js';

const MAXP=3000;
export class Particles{
  constructor(R,mask,{rainN=9000,splashN=1400}={}){
    this.R=R;const G=R.G,gl=R.gl;this.G=G;
    this.P={rain:G.program('rain',RAIN_VS,RAIN_FS),splash:G.program('splash',SPLASH_VS,SPLASH_FS),puff:G.program('puff',PUFF_VS,PUFF_FS)};
    const md=new Float32Array(mask.n*mask.n*2);md.set(mask.data);
    this.maskT=G.texture(mask.n,mask.n,'rg32f',{data:md,filter:G.ext.flt?'linear':'nearest'});this.maskP=mask.params;
    this.rainN=rainN;this.splashN=splashN;
    /* the CPU pool */
    this.n=0;this.p=new Float32Array(MAXP*3);this.v=new Float32Array(MAXP*3);this.life=new Float32Array(MAXP);this.age=new Float32Array(MAXP);
    this.size0=new Float32Array(MAXP);this.size1=new Float32Array(MAXP);this.a0=new Float32Array(MAXP);this.kind=new Uint8Array(MAXP);this.seed=new Float32Array(MAXP);
    this.inst=new Float32Array(MAXP*8);this.order=new Uint16Array(MAXP);
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferData(gl.ARRAY_BUFFER,this.inst.byteLength,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0);gl.vertexAttribDivisor(0,1);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16);gl.vertexAttribDivisor(1,1);
    gl.bindVertexArray(null);
    this.rain={on:0,fall:[1.2,-9.5,.6],camVel:[0,0,0]};this.emitAcc=new Map();
    R.extra.push(this);
  }
  /* spawn one puff. kind: 0 spray, 1 tyre smoke, 2 steam */
  spawn(kind,p,v,life,s0,s1,a0){
    let i;if(this.n<MAXP)i=this.n++;else{i=Math.floor(Math.random()*MAXP);}
    this.p.set(p,i*3);this.v.set(v,i*3);this.life[i]=life;this.age[i]=0;this.size0[i]=s0;this.size1[i]=s1;this.a0[i]=a0;this.kind[i]=kind;this.seed[i]=Math.random();
  }
  /* emit at a rate (per second) from a named source, carrying the fraction between frames */
  emit(key,rate,dt,fn){let a=(this.emitAcc.get(key)||0)+rate*dt;while(a>=1){fn();a-=1;}this.emitAcc.set(key,a);}
  update(dt,camPos){
    let w=0;
    for(let i=0;i<this.n;i++){
      this.age[i]+=dt;if(this.age[i]>=this.life[i])continue;
      const k=this.kind[i],o=i*3;
      const drag=k===0?2.2:k===1?1.1:.5,rise=k===0?-1.6:k===1?.45:.9;
      const e=Math.exp(-drag*dt);this.v[o]*=e;this.v[o+1]=this.v[o+1]*e+rise*dt;this.v[o+2]*=e;
      this.p[o]+=this.v[o]*dt;this.p[o+1]+=this.v[o+1]*dt;this.p[o+2]+=this.v[o+2]*dt;
      if(w!==i){this.p.copyWithin(w*3,o,o+3);this.v.copyWithin(w*3,o,o+3);for(const A of [this.life,this.age,this.size0,this.size1,this.a0,this.kind,this.seed])A[w]=A[i];}
      w++;
    }
    this.n=w;
    /* back to front */
    const d=new Float32Array(this.n);for(let i=0;i<this.n;i++){const o=i*3;d[i]=(this.p[o]-camPos[0])**2+(this.p[o+1]-camPos[1])**2+(this.p[o+2]-camPos[2])**2;this.order[i]=i;}
    const ord=Array.from(this.order.subarray(0,this.n)).sort((a,b)=>d[b]-d[a]);
    for(let j=0;j<ord.length;j++){const i=ord[j],o=i*3,t=this.age[i]/this.life[i],q=j*8;
      const sz=this.size0[i]+(this.size1[i]-this.size0[i])*Math.sqrt(t);
      const a=this.a0[i]*Math.min(1,t*6)*(1-t)*(1-t);
      this.inst[q]=this.p[o];this.inst[q+1]=this.p[o+1];this.inst[q+2]=this.p[o+2];this.inst[q+3]=sz;
      this.inst[q+4]=a;this.inst[q+5]=this.kind[i];this.inst[q+6]=this.seed[i];this.inst[q+7]=this.age[i];}
  }
  particles(R,U,texs){
    const G=this.G,gl=R.gl;gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
    const common=Object.assign({uMask:this.maskT,uDepth:R.dT},texs);
    const vals={uMaskP:this.maskP,uOutRes:[R.W,R.H],uFogAmb:U.uFogAmb};
    /* rain and splashes use the unjittered camera: they are drawn after TAA */
    const U2=Object.assign({},U,{uVP:U.uVPnj});
    if(this.rain.on>0.01){
      let P=G.use(this.P.rain);G.set(P,U2);G.set(P,vals);G.tex(P,common);
      G.set(P,{uBox:[38,22,38],uFall:this.rain.fall,uCamVel:this.rain.camVel,uStreak:1/45,uDensity:this.rain.on});
      G.procedural(6,this.rainN);
      P=G.use(this.P.splash);G.set(P,U2);G.set(P,vals);G.tex(P,common);G.set(P,{uRadius:22,uDensity:this.rain.on});
      G.procedural(6,this.splashN);
    }
    if(this.n){const P=G.use(this.P.puff);G.set(P,U2);G.set(P,vals);G.tex(P,common);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.inst,0,this.n*8);
      gl.bindVertexArray(this.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.n);gl.bindVertexArray(null);}
  }
}
