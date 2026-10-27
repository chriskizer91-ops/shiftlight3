/* =====================================================================================
   REPLAYS — the last two minutes, every car that was on screen, kept at 20 Hz.
   Your car keeps its pose, wheels, lamps and what the engine was doing (so the synth can
   play it back); the other cars keep their poses, wheels, lamps and signals. Playback
   interpolates between samples, so it runs at any speed and scrubs both ways.
   ===================================================================================== */
const HZ=20,PF=31,OF=24,MAXO=32;

export class ReplayRecorder{
  constructor(maxSec=120){this.max=Math.round(maxSec*HZ);this.reset();}
  reset(){this.frames=[];this.next=0;this.palette=[];this.palIdx=new Map();this.designs=[];}
  pal(p){if(!p)return -1;let i=this.palIdx.get(p);if(i===undefined){i=this.palette.length;this.palette.push(p);this.palIdx.set(p,i);}return i;}
  des(d){let i=this.designs.indexOf(d);if(i<0){i=this.designs.length;this.designs.push(d);}return i;}
  get length(){return this.frames.length?this.frames[this.frames.length-1].t-this.frames[0].t:0;}
  /* car: your Vehicle; others: the views drawn this frame (nearest first); snd: the engine state */
  add(time,car,view,others,center){
    if(time<this.next)return;this.next=Math.max(this.next+1/HZ,time-.5/HZ);
    const P=new Float32Array(PF),w=car.wheels,pt=car.pt;
    P.set(car.p,0);P.set(car.q,3);P.set(car.v,7);P[10]=car.steer||0;for(let i=0;i<4;i++){P[11+i]=w[i].ang;P[15+i]=w[i].len;}
    P[19]=car.brkIn>.05?1:0;P[20]=car.rev?1:0;P[21]=pt.rpmOut||pt.rpm;P[22]=pt.load;P[23]=pt.gear;P[24]=pt.boost;P[25]=pt.nosOn?1:0;P[26]=pt.cutFrac;P[27]=car.speed;P[28]=view.lamps[0];P[29]=car.vf;P[30]=pt.thrSnd||0;
    const near=others.filter(o=>!o.self&&(o.p[0]-center[0])**2+(o.p[2]-center[2])**2<160*160).slice(0,MAXO);
    const O=new Float32Array(near.length*OF);
    near.forEach((o,k)=>{const b=k*OF;O[b]=o.id;O[b+1]=this.des(o.design||'sl3');O[b+2]=this.pal(o.paint);O.set(o.p,b+3);O.set(o.q,b+6);
      const ww=o.wheels;O[b+10]=ww[0].steer||0;for(let i=0;i<4;i++){O[b+11+i]=ww[i].ang;O[b+15+i]=ww[i].len;}
      const L=o.lamps||[0,0,0,0];O[b+19]=L[0];O[b+20]=L[2];O[b+21]=o.ind?o.ind[0]:0;O[b+22]=o.ind?o.ind[1]:0;O[b+23]=o.ghost?1:0;});
    this.frames.push({t:time,P,O,n:near.length,cal:near.map(o=>o.caliper||null)});
    if(this.frames.length>this.max)this.frames.shift();
  }
}

const lerp=(a,b,f)=>a+(b-a)*f;
function nlerpQ(a,ao,b,bo,f){let d=a[ao]*b[bo]+a[ao+1]*b[bo+1]+a[ao+2]*b[bo+2]+a[ao+3]*b[bo+3],s=d<0?-1:1;
  const q=[0,1,2,3].map(k=>lerp(a[ao+k],b[bo+k]*s,f)),l=Math.hypot(...q)||1;return q.map(v=>v/l);}

export class ReplayPlayer{
  constructor(rec,layout){this.r=rec;this.F=rec.frames.slice();this.t0=this.F.length?this.F[0].t:0;this.t1=this.F.length?this.F[this.F.length-1].t:0;this.t=this.t0;this.speed=1;this.paused=false;this.layout=layout;this.views=new Map();}
  get duration(){return this.t1-this.t0;}
  step(dt){if(!this.paused)this.t=Math.max(this.t0,Math.min(this.t1,this.t+dt*this.speed));if(this.t>=this.t1&&this.speed>0)this.paused=true;}
  seek(d){this.t=Math.max(this.t0,Math.min(this.t1,this.t+d));}
  idx(){const F=this.F;let lo=0,hi=F.length-1;if(this.t<=F[0].t)return [0,0,0];if(this.t>=F[hi].t)return [hi,hi,0];
    while(hi-lo>1){const m=(lo+hi)>>1;if(F[m].t<=this.t)lo=m;else hi=m;}return [lo,hi,(this.t-F[lo].t)/Math.max(1e-6,F[hi].t-F[lo].t)];}
  /* your car at the current time: a stand-in the camera and the lights can use, plus the engine state */
  you(proxy){const [a,b,f]=this.idx(),A=this.F[a].P,B=this.F[b].P;
    proxy.p=[lerp(A[0],B[0],f),lerp(A[1],B[1],f),lerp(A[2],B[2],f)];proxy.q=nlerpQ(A,3,B,3,f);proxy.v=[lerp(A[7],B[7],f),lerp(A[8],B[8],f),lerp(A[9],B[9],f)];
    proxy.steer=lerp(A[10],B[10],f);proxy.speed=lerp(A[27],B[27],f);proxy.vf=lerp(A[29],B[29],f);proxy.brkIn=f<.5?A[19]:B[19];proxy.rev=(f<.5?A[20]:B[20])>.5;
    proxy.wheels.forEach((w,i)=>{w.ang=lerp(A[11+i],B[11+i],f);w.len=lerp(A[15+i],B[15+i],f);});
    proxy.snd={rpm:lerp(A[21],B[21],f),load:lerp(A[22],B[22],f),gear:Math.round(f<.5?A[23]:B[23]),boost:lerp(A[24],B[24],f),nos:(f<.5?A[25]:B[25])>.5?1:0,cutFrac:lerp(A[26],B[26],f),thr:lerp(A[30],B[30],f)};
    return proxy;}
  /* everyone else, as car views */
  others(){const [a,b,f]=this.idx(),FA=this.F[a],FB=this.F[b],A=FA.O,B=FB.O,out=[];
    const posB=new Map();for(let k=0;k<FB.n;k++)posB.set(B[k*OF],k);
    for(let k=0;k<FA.n;k++){const o=k*OF,id=A[o],kb=posB.get(id),Bo=kb===undefined?null:kb*OF,BB=Bo===null?A:B,bo=Bo===null?o:Bo,ff=Bo===null?0:f;
      let v=this.views.get(id);
      if(!v){v={id:id+5000,design:this.r.designs[A[o+1]],paint:this.r.palette[A[o+2]]||null,caliper:FA.cal[k],lamps:[0,0,0,0],ind:[0,0],wheels:this.layout(this.r.designs[A[o+1]]).map(w=>({hp:w.hp,len:w.len,steer:0,ang:0,disc:0}))};this.views.set(id,v);}
      v.p=[lerp(A[o+3],BB[bo+3],ff),lerp(A[o+4],BB[bo+4],ff),lerp(A[o+5],BB[bo+5],ff)];v.q=nlerpQ(A,o+6,BB,bo+6,ff);
      v.wheels.forEach((w,i)=>{w.ang=lerp(A[o+11+i],BB[bo+11+i],ff);w.len=lerp(A[o+15+i],BB[bo+15+i],ff);w.steer=i<2?lerp(A[o+10],BB[bo+10],ff):0;});
      v.lamps[0]=v.lamps[1]=A[o+19];v.lamps[2]=A[o+20];v.ind=[A[o+21],A[o+22]];v.ghost=A[o+23]>.5?1:0;v.driver=!v.ghost;out.push(v);}
    return out;}
}
