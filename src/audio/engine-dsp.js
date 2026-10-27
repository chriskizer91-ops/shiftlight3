/* =====================================================================================
   SHIFTLIGHT ENGINE SYNTH — live, sample by sample.
   Every cylinder fires on its own crank angle, in its real firing order, into its own bank
   of pipe. The pipes are 1-D acoustic waveguides (Kelly-Lochbaum scattering at every change
   of bore, lossy where there is packing, a closed-ish valve at one end and an open radiating
   tip at the other), run live rather than baked into an impulse response. On top: flow rasp
   gated by each pulse, induction through its own airbox model, afterfire and bangs fired
   into the pipes, turbo/supercharger/gear whine, blow-off, nitrous, the starter, and a
   listener with real propagation delay (so Doppler falls out of a moving source).

   makeDSP() returns the EngineDSP class. Its source is stringified into an AudioWorklet
   module, so everything it needs is declared inside this function.
   ===================================================================================== */
export function makeDSP(){
'use strict';
const TAU=Math.PI*2,clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const C_GAS=500;   /* speed of sound in hot exhaust gas, m/s */
const C_AIR=343;   /* and in the air between the car and you */
const ftanh=x=>{if(x>3)return 1;if(x<-3)return -1;const x2=x*x;return x*(27+x2)/(27+9*x2);};
const LP=0,HP=1,BP=2;

class Biquad{
  constructor(){this.b0=1;this.b1=0;this.b2=0;this.a1=0;this.a2=0;this.z1=0;this.z2=0;}
  set(type,f,q,sr){
    const w=TAU*clamp(f,8,sr*.47)/sr,cw=Math.cos(w),al=Math.sin(w)/(2*q),a0=1+al;let b0,b1,b2;
    if(type===LP){b0=(1-cw)/2;b1=1-cw;b2=b0;}else if(type===HP){b0=(1+cw)/2;b1=-(1+cw);b2=b0;}else{b0=al;b1=0;b2=-al;}
    this.b0=b0/a0;this.b1=b1/a0;this.b2=b2/a0;this.a1=-2*cw/a0;this.a2=(1-al)/a0;return this;
  }
  tick(x){const y=this.b0*x+this.z1;this.z1=this.b1*x-this.a1*y+this.z2;this.z2=this.b2*x-this.a2*y;return y;}
  reset(){this.z1=this.z2=0;}
}

/* 1-D acoustic waveguide. sec = [[length m, bore m, packing 0..1], ...] from the valve outward.
   Each section is a pair of delay lines; at every change of bore a Kelly-Lochbaum junction
   splits the waves with k=(A1-A2)/(A1+A2). Packing is a lowpass and a loss per pass. The valve
   end reflects (rPort); the open tip reflects inverted and duller (rEnd) and radiates the flow
   it lets out through a leaky differentiator, the way a pipe's far field behaves. */
class Waveguide{
  constructor(sec,sr,rPort=.7,rEnd=-.8){
    const n=sec.length;this.n=n;this.rPort=rPort;this.rEnd=rEnd;
    this.m=new Int32Array(n);this.a=new Float64Array(n);this.g=new Float64Array(n);this.K=new Float64Array(n);this.p=new Int32Array(n);
    this.yr=new Float64Array(n);this.yl=new Float64Array(n);this.ar=new Float64Array(n);this.al=new Float64Array(n);this.nr=new Float64Array(n);this.nl=new Float64Array(n);
    this.R=[];this.L=[];
    for(let i=0;i<n;i++){const [l,,pk]=sec[i];this.m[i]=Math.max(2,Math.round(l/C_GAS*sr));this.a[i]=Math.min(.75,1-Math.min(.9,.6*pk));this.g[i]=.985-.08*pk;
      this.R.push(new Float64Array(this.m[i]));this.L.push(new Float64Array(this.m[i]));}
    for(let i=0;i<n-1;i++){const A1=sec[i][1]*sec[i][1],A2=sec[i+1][1]*sec[i+1][1];this.K[i]=(A1-A2)/(A1+A2);}
    this.tip=0;this.u1=0;this.dn=1e-20;
  }
  tick(x){
    const n=this.n,a=this.a,g=this.g,ar=this.ar,al=this.al,nr=this.nr,nl=this.nl,R=this.R,L=this.L,p=this.p,yr=this.yr,yl=this.yl,K=this.K,m=this.m;
    for(let i=0;i<n;i++){const q=p[i];yr[i]+=a[i]*(R[i][q]-yr[i]);ar[i]=yr[i]*g[i];yl[i]+=a[i]*(L[i][q]-yl[i]);al[i]=yl[i]*g[i];}
    this.dn=-this.dn;nr[0]=this.rPort*al[0]+x+this.dn;
    for(let i=0;i<n-1;i++){const k=K[i];nr[i+1]=(1+k)*ar[i]-k*al[i+1];nl[i]=k*ar[i]+(1-k)*al[i+1];}
    this.tip+=.5*(ar[n-1]-this.tip);const back=this.rEnd*this.tip,u=ar[n-1]-back;nl[n-1]=back;const out=u-.6*this.u1;this.u1=u;
    for(let i=0;i<n;i++){const q=p[i];R[i][q]=nr[i];L[i][q]=nl[i];p[i]=q+1>=m[i]?0:q+1;}
    return out;
  }
}
function irOf(sec,sr,rp,re){const w=new Waveguide(sec,sr,rp,re),n=Math.round(.15*sr),o=new Float64Array(n);for(let t=0;t<n;t++)o[t]=w.tick(t===0?1:0);return o;}
/* peak tailpipe response to one standard blowdown pulse: every system is levelled by it */
function pulsePeak(ir,sr){
  const n=Math.round(.005*sr),P=new Float64Array(n);for(let q=0;q<n;q++){const t=q/sr*1.5;P[q]=(1-Math.exp(-t/1e-4))*Math.exp(-t/1.5e-3);}
  const M=Math.min(ir.length,Math.round(.04*sr));let pk=1e-6;
  for(let t=0;t<M;t++){let s=0;for(let q=0;q<n&&q<=t;q++)s+=P[q]*ir[t-q];if(Math.abs(s)>pk)pk=Math.abs(s);}
  return pk;
}
/* plumbing per exhaust level: [length m, bore m, packing], valve to tip */
const PIPES=[
  [[.34,.036,.05],[.26,.05,.05],[.26,.1,.35],[1.05,.048,.05],[.34,.09,.4],[.85,.048,.05],[.42,.11,.55],[.3,.045,.05]], /* stock: manifold, cat, resonator, packed muffler */
  [[.34,.036,.05],[.26,.05,.05],[.26,.1,.35],[1.3,.056,.04],[.42,.09,.28],[.34,.058,.04]],                         /* cat-back: bigger pipe, straight-through box */
  [[.74,.04,.04],[.3,.06,.04],[.22,.085,.18],[1.3,.062,.03],[.34,.09,.2],[.3,.063,.03]],                            /* long-tube headers, high-flow cat */
  [[.78,.042,.03],[.3,.064,.03],[1.9,.068,.02],[.22,.076,.02]],                                                    /* straight pipe */
  [[.62,.042,.02],[.2,.056,.02]]];                                                                                 /* open headers: dump at the collector */
const INTAKES=[
  [[.22,.04,.03],[.32,.13,.35],[.06,.06,.05],[.45,.07,.08],[.3,.2,.6],[.22,.06,.1]],  /* airbox */
  [[.22,.04,.03],[.32,.13,.3],[.06,.065,.04],[.55,.075,.05],[.12,.12,.25]],          /* cold air: long pipe, cone filter */
  [[.22,.04,.03],[.32,.13,.25],[.06,.07,.03],[.35,.09,.05],[.2,.16,.2],[.25,.1,.05]], /* ram air */
  [[.2,.044,.02],[.08,.052,.02]]];                                                   /* individual throttles: just trumpets */
const EXK={ex:[.5,.66,.82,1,1.1],drive:[.55,.65,.8,1,1.12],bright:[.55,.75,.9,1.15,1.3],rasp:[.05,.09,.15,.24,.3],pop:[.25,.45,.7,1,1.15],crk:[.35,.6,1,1.35,1.6]};
const INK=[.22,.3,.38,.75];
function pipeGeom(c,bank){
  const lv=c.ex|0,bore=Math.pow(c.disp/2,.33),P=PIPES[lv].map(s=>s.slice());
  /* tuned primaries get shorter as the engine revs higher */
  P[0][0]*=clamp(Math.pow(7000/c.redline,.7),.5,1.25);
  /* the second bank's primaries are longer: equal-length headers tidy that up, a boxer keeps its rumble */
  if(bank){P[0][0]+=c.split*(lv>=2&&!c.rumble?.4:1);if(c.dual)P[Math.min(3,P.length-1)][0]+=.16;}
  if(c.turbo)P.splice(2,0,[.1,.032,.5]); /* the turbine: a lossy throat that swallows the crackle */
  for(const s of P)s[1]*=bore;
  return P;
}
function intakeGeom(c){const bore=Math.pow(c.disp/2,.25);return INTAKES[c.intake|0].map(s=>[s[0]*clamp(Math.pow(7000/c.redline,.5),.6,1.2),s[1]*bore,s[2]]);}
const hermite=(y0,y1,y2,y3,f)=>{const c1=.5*(y2-y0),c2=y0-2.5*y1+2*y2-.5*y3,c3=.5*(y3-y0)+1.5*(y1-y2);return ((c3*f+c2)*f+c1)*f+y1;};

class EngineDSP{
  constructor(sr){
    this.sr=sr;this.t=0;this.cfg=null;this.pend=null;
    this.p={on:0,firing:0,crank:0,crankT:0,rpm:0,load:0,cutFrac:0,boost:0,nos:0,speed:0,gear:0,twostep:0,antilag:0,view:0,dist:3,pan:0,rear:1,vol:1};
    this.rpm=0;this.load=0;this.ph=0;this.ei=0;this.idleW=1;this.kOn=0;this.und=.3;this.pl=0;this.crk=0;
    this.bs=[{e1:0,e2:0,u1:0,u2:0,env:0},{e1:0,e2:0,u1:0,u2:0,env:0}];
    this.bg=[{a1:0,a2:0,an:0,d1:0,d2:0,dn:0},{a1:0,a2:0,an:0,d1:0,d2:0,dn:0}];
    this.dc={d1:0,d2:0,d3:0,d4:0,de:0};
    this.pq=[];this.vox=[];
    const B=()=>new Biquad();
    this.f={rasp:B().set(BP,2400,.55,sr),roar:B(),rush:B(),sup:B(),nos:B().set(BP,3800,1.2,sr),start:B().set(LP,900,1.4,sr),
      hpL:B().set(HP,28,.7,sr),hpR:B().set(HP,28,.7,sr),lpL:B(),lpR:B(),lpI:B(),lpI2:B()};
    this.g={og:0,exG:0,inG:0,drive:1,post:1,rasp:0,roar:0,tw:0,rush:0,sup:0,gw:0,nos:0,st:0,fade:0,pan:0,gd:1};
    this.T={};for(const k in this.g)this.T[k]=this.g[k];
    this.ph1=0;this.ph2=0;this.ph3=0;this.phS=0;this.phG=0;this.phSt=0;this.phAm=0;
    this.xd={n:64,a:new Float64Array(64),b:new Float64Array(64),w:0,d:6,x:.9};
    this.dn=1<<15;this.dlL=new Float64Array(this.dn);this.dlR=new Float64Array(this.dn);this.dw=0;this.dS=3;this.airL=0;this.airR=0;this.aa=1;
    this.stats={pops:0,fires:0};
    this.ks=1-Math.exp(-1/(.012*sr));       /* per-sample smoothing for gains, ~12 ms */
    this.kd=1-Math.exp(-1/(.06*sr));        /* listener distance, ~60 ms */
  }
  /* ---------- control from the main thread ---------- */
  configure(c){
    if(!this.cfg){this._apply(c,false);this.g.fade=0;this.T.fade=1;return;}
    const geo=k=>JSON.stringify([k.layout,k.ex,k.intake,k.disp,k.redline,!!k.turbo,k.split,k.dual,k.rumble]);
    if(geo(c)!==geo(this.cfg)){this.pend=c;this.T.fade=0;}else this._apply(c,true);
  }
  set(p){this.p=p;if(p.jump)this.dS=p.dist;}
  event(e){
    const T=this.t,sr=this.sr;
    if(e.type==='bov'){
      const k=clamp((this.p.boost||0)/.9,.35,1.3);
      if(e.flutter){for(let i=0;i<10;i++)this._vox(T+(.015+i*.036*(1+i*.07))*sr,.026,.3*k*Math.pow(.82,i),1500-i*50,1100-i*40,BP,2.4);this._vox(T,.18,.16*k,700,300,LP,.7);}
      else{this._vox(T,.42,.26*k,5200,1400,BP,.9);this._vox(T,.12,.12*k,9000,6000,HP,.7);}
    }else if(e.type==='pop')this._bang(Math.random()<.5?0:1,e.k||.8);
    else if(e.type==='shift'){if(this.cfg&&this.cfg.ex>=1)this._bang(Math.random()<.5?0:1,.5);}
    else if(e.type==='purge'){this._vox(T,1.1,.32,7000,3000,HP,.7);this._vox(T,.9,.2,2600,900,BP,.8);}
  }
  takeStats(){const s=this.stats;if(!s.pops&&!s.fires)return null;this.stats={pops:0,fires:0};return s;}
  _apply(c,soft){
    const prev=this.cfg;this.cfg=c;const lv=c.ex|0,tb=!!c.turbo,ch=c.ch;
    this.k={ex:EXK.ex[lv],drive:EXK.drive[lv],bright:EXK.bright[lv]*(tb?.82:1)*ch.bright,rasp:EXK.rasp[lv]*(tb?.6:1)*ch.rasp,pop:EXK.pop[lv],
      inl:INK[c.intake|0],crackle:c.crackle*EXK.crk[lv]*(tb?.75:1),whine:c.gearWhine?1:.15,gain:c.gain||1};
    if(soft&&prev&&prev.layout===c.layout)return;
    const sr=this.sr;
    this.wgA=new Waveguide(pipeGeom(c,0),sr);this.wgB=new Waveguide(pipeGeom(c,1),sr);this.wgI=new Waveguide(intakeGeom(c),sr,.8,-.85);
    this.gEx=1/pulsePeak(irOf(pipeGeom(c,0),sr),sr);this.gIn=1/pulsePeak(irOf(intakeGeom(c),sr,.8,-.85),sr);
    /* twin pipes sit apart; a single tip is close to mono */
    this.xd.d=Math.round((c.dual?3.5e-4:1.2e-4)*sr);this.xd.x=c.dual?.5:.92;this.xd.a.fill(0);this.xd.b.fill(0);
    for(const b of this.bs){b.e1=b.e2=b.u1=b.u2=b.env=0;}for(const b of this.bg){b.a1=b.a2=b.an=0;}
    for(const k of ['hpL','hpR','lpL','lpR','lpI','lpI2'])this.f[k].reset();
    this.ei=c.ang.findIndex(a=>a>this.ph);if(this.ei<0)this.ei=c.ang.length;
  }
  /* noise voice: an enveloped, swept, filtered noise burst (blow-off, flutter, purge) */
  _vox(t0,dur,vol,f0,f1,type,q){
    if(this.vox.length>40)this.vox.shift();const sr=this.sr,N=Math.max(8,Math.round(dur*sr)),att=Math.round(.004*sr);
    this.vox.push({t0:Math.round(t0),N,att,e:1e-4,mA:Math.pow(vol/1e-4,1/att),mD:Math.pow(1e-4/vol,1/Math.max(1,N-att)),f0,f1,type,q,bq:new Biquad().set(type,f0,q,sr)});
  }
  /* a bang in the pipe: a hard pressure spike with a ragged tail, sometimes a double or a triple */
  _bang(b,k,extra=true){
    const s=this.bg[b],sr=this.sr,rate=.75+.5*Math.random(),tr=4e-5/rate,td=5e-4/rate,A=k*this.k.pop*1.6;
    s.d1=Math.exp(-1/(td*sr));s.d2=Math.exp(-1/(1/(1/tr+1/td)*sr));s.dn=Math.exp(-1/(6e-3/rate*sr));
    s.a1+=A;s.a2+=A;s.an+=A;this.stats.pops++;
    if(extra){const r=Math.random();if(r<.4)this._sched(this.t+(.005+Math.random()*.022)*sr,b,k*(.35+.5*Math.random()),0);if(r<.15)this._sched(this.t+(.02+Math.random()*.03)*sr,b,k*(.3+.4*Math.random()),0);}
  }
  _sched(at,b,k,kind){if(this.pq.length>64)return;const e={at:Math.round(at),b,k,kind};let i=this.pq.length;while(i>0&&this.pq[i-1].at>e.at)i--;this.pq.splice(i,0,e);}
  _burst(expect,k,n){let c=Math.floor(expect)+(Math.random()<expect%1?1:0);while(c-->0)this._sched(this.t+Math.random()*n,Math.random()<.5?0:1,k,0);}
  /* one cylinder's exhaust valve cracks open */
  _fire(i){
    const c=this.cfg,p=this.p,b=c.bank[i],base=c.amp[i],R=Math.random,s=this.bs[b];let A;
    this.stats.fires++;
    if(!p.firing||R()<p.cutFrac){
      /* no combustion: the piston still pumps air, and unburnt fuel can light off in the pipe */
      A=base*.1*(.8+.4*R());
      if(p.firing&&R()<.1*this.k.crackle+(p.twostep||p.antilag?.12:0))this._sched(this.t+(.0012+R()*.004)*this.sr,b,.5+.6*R(),0);
    }else{
      const r1=R(),sc=c.ch.scatter,kOn=this.kOn;
      const on=base*(1-sc*.5+sc*r1)*(1+.5*Math.min(p.boost||0,2.5)+(p.nos?.35:0));
      const off=base*(.32+.55*r1*r1)*(.7+.3*Math.min(1,this.rpm/this.cfg.redline*1.5));
      A=off+(on-off)*kOn;
      /* lumpy cams (and rotaries) idle unevenly: weak cycles, the odd near-misfire */
      const lope=c.lope*this.idleW;if(lope>0){A*=1+lope*(R()-.5)*5;if(R()<lope*1.6)A*=.2;}
      /* on overrun, now and then the thin charge lights off late in the header: the burble */
      if(kOn<.5&&R()<(.02+.08*this.k.crackle)*(1-kOn*2))this._sched(this.t+(.0014+R()*.003)*this.sr,b,(.45+.6*R())*.35,1);
    }
    const u=this.und;s.e1+=A;s.e2+=A;s.u1+=A*u;s.u2+=A*u;s.env+=A;
  }
  process(L,R,n){for(let o=0;o<n;o+=128)this._block(L,R,o,Math.min(128,n-o));}
  _block(OL,OR,o,n){
    if(!this.cfg){for(let i=0;i<n;i++){OL[o+i]=0;OR[o+i]=0;}this.t+=n;return;}
    /* a new engine waits until the old one has faded out, then swaps in at a block boundary */
    if(this.pend&&this.g.fade<.002){this._apply(this.pend,false);this.pend=null;this.T.fade=1;}
    const c=this.cfg,p=this.p,sr=this.sr,bt=n/sr,T=this.T,g=this.g,f=this.f,k=this.k;
    /* ---- block-rate state ---- */
    const r0=this.rpm,rT=p.on||p.crank?Math.max(0,p.rpm):0;this.rpm+=(rT-this.rpm)*(1-Math.exp(-bt/.01));const r1=this.rpm;
    const cut=p.cutFrac>.5;this.load+=((p.load||0)-this.load)*(1-Math.exp(-bt/(cut?.003:.02)));
    const L=this.load,rpm=Math.max(r1,1),x=rpm/c.redline;
    this.idleW=1-clamp((rpm-c.idle)/(c.idle*.7),0,1);
    this.kOn=p.firing?Math.max(Math.pow(L,.6),this.idleW*.55):0;const kOn=this.kOn,lw=Math.max(L,this.idleW*.3,p.firing?.3*Math.min(1,x):0);
    /* pulse shape: crank-angle-ish at idle, tighter with revs */
    const ts=clamp(Math.pow(3000/Math.max(rpm,250),.6),.26,2.8),tr=lerp(.22e-3,.1e-3,kOn)*ts*c.ch.tr,td=lerp(1.1e-3,1.5e-3,kOn)*ts*c.ch.td,td3=2.7*td;
    const dc=this.dc;dc.d1=Math.exp(-1/(td*sr));dc.d2=Math.exp(-1/(sr/(1/tr+1/td)));dc.d3=Math.exp(-1/(td3*sr));dc.d4=Math.exp(-1/(sr/(1/td+1/td3)));dc.de=Math.exp(-1/(2e-3*ts*sr));
    this.und=lerp(.16,.3,kOn);
    const view=p.view|0,cab=view===1,rear=p.rear===undefined?1:p.rear,vol=p.vol===undefined?1:p.vol;
    T.drive=k.drive*(.5+.9*lw*Math.min(1,x*1.2))*(1+.25*Math.min(p.boost||0,2));T.post=1/(.6+.5*k.drive);
    f.lpL.set(LP,clamp((700+(1800+7000*lw)*x)*k.bright*(cab?.45:1)*(.75+.35*rear),250,17000),.6,sr);f.lpR.b0=f.lpL.b0;f.lpR.b1=f.lpL.b1;f.lpR.b2=f.lpL.b2;f.lpR.a1=f.lpL.a1;f.lpR.a2=f.lpL.a2;
    T.exG=k.ex*(cab?.6:1)*(.75+.35*rear);
    T.rasp=k.rasp*lw*Math.min(1.2,x*x*1.4);
    T.inG=k.inl*(.12+.88*L)*(.35+.65*x)*(cab?2:1)*(.7+.5*(1-rear));
    f.lpI.set(LP,3500,.5,sr);f.lpI2.set(LP,3500*(cab?.7:1),.5,sr);
    T.roar=k.inl*.09*L*x*(cab?1.6:1);f.roar.set(BP,380+rpm*.12,.8,sr);
    /* forced induction and gears */
    const b=c.fiBoost>0?clamp((p.boost||0)/Math.max(.3,c.fiBoost),0,1.3):0;
    this.fw=900+b*4200+rpm*.05;
    T.tw=c.turbo?b*b*.04*(.35+.65*L):0;T.rush=c.turbo?b*.04*L+(p.antilag?b*.02:0):0;f.rush.set(BP,1300+b*2400,1.1,sr);
    if(c.sup==='roots'){this.fs=rpm*.13;f.sup.set(BP,rpm*.26,1.1,sr);T.sup=.07*Math.pow(clamp(x,0,1.1),1.2)*(.45+.55*L);}
    else if(c.sup==='screw'){this.fs=rpm*.24;f.sup.set(BP,rpm*.245,2.5,sr);T.sup=.055*Math.pow(clamp(x,0,1.1),1.3)*(.45+.55*L);}
    else if(c.sup==='cent'){this.fs=700+5200*x*x;T.sup=.05*x*x*(.3+.7*L);}
    else T.sup=0;
    this.fg=rpm/60*23;T.gw=k.whine*.026*clamp((p.speed||0)/30,0,1)*(.4+.6*L)*(cab?1.8:1);
    T.nos=p.nos?.06:0;
    T.st=p.crank?.5:0;this.fSt=90+60*Math.min(1,(p.crankT||0)/.8);this.fAm=6+6*Math.min(1,(p.crankT||0)/.8);
    T.og=.42*vol*(.32+.22*L+.75*Math.pow(Math.min(1.05,x),1.4))*k.gain*(p.on||p.crank?1:0)+(p.crank?.25:0);
    /* the listener: distance, air, pan */
    const dT=Math.max(.5,p.dist||3);this.aa=1-Math.exp(-TAU*clamp(21000/(1+this.dS/28),900,20000)/sr);
    T.pan=clamp(p.pan||0,-1,1);T.gd=clamp(3/Math.max(this.dS,.6),0,2.4)*(view===2?1.5:1);
    const width=clamp(5/Math.max(this.dS,1),.15,1);
    /* events fired into the pipes */
    if(this.pl>.5&&L<.15&&x>.45&&k.crackle>0)this.crk=Math.max(this.crk,.25+Math.random()*.5*k.crackle);
    this.pl=L;
    if(L<.2&&this.crk>0){this.crk-=bt;this._burst((5+9*k.crackle)*clamp(x*1.3,0,1.2)*(this.crk>.15?1:.45)*bt,.3+.5*Math.random(),n);}else if(L>.3)this.crk=0;
    if(p.antilag&&L<.2&&x>.3)this._burst(14*bt,.8+.4*Math.random(),n);
    if(p.twostep)this._burst(11*bt,.7+.3*Math.random(),n);
    /* ---- per sample ---- */
    const ang=c.ang,nE=ang.length,A=this.bs[0],B=this.bs[1],GA=this.bg[0],GB=this.bg[1],ks=this.ks,kd=this.kd,xd=this.xd,dl=this.dlL,dr=this.dlR,dn=this.dn,dm=dn-1;
    const gEx=this.gEx,gIn=this.gIn,ftw=this.fw/sr,fsu=(this.fs||0)/sr,fgw=this.fg/sr,fst=this.fSt/sr,fam=this.fAm/sr;
    const twin=!!c.twin,cent=c.sup==='cent',d1=dc.d1,d2=dc.d2,d3=dc.d3,d4=dc.d4,de=dc.de;
    for(let i=0;i<n;i++){
      g.og+=(T.og-g.og)*ks;g.exG+=(T.exG-g.exG)*ks;g.inG+=(T.inG-g.inG)*ks;g.drive+=(T.drive-g.drive)*ks;g.post+=(T.post-g.post)*ks;
      g.rasp+=(T.rasp-g.rasp)*ks;g.roar+=(T.roar-g.roar)*ks;g.tw+=(T.tw-g.tw)*ks;g.rush+=(T.rush-g.rush)*ks;g.sup+=(T.sup-g.sup)*ks;
      g.gw+=(T.gw-g.gw)*ks;g.nos+=(T.nos-g.nos)*ks;g.st+=(T.st-g.st)*ks;g.fade+=(T.fade-g.fade)*ks*1.5;g.pan+=(T.pan-g.pan)*ks*.25;g.gd+=(T.gd-g.gd)*ks*.25;
      const rpmI=r0+(r1-r0)*(i/n);
      if(rpmI>25&&(p.on||p.crank)){
        this.ph+=rpmI*6/sr;
        while(this.ei<nE&&this.ph>=ang[this.ei])this._fire(this.ei++);
        if(this.ph>=720){this.ph-=720;this.ei=0;while(this.ei<nE&&this.ph>=ang[this.ei])this._fire(this.ei++);}
      }
      while(this.pq.length&&this.pq[0].at<=this.t){const e=this.pq.shift();if(e.kind===1){const s=this.bg[e.b],sr2=sr;s.d1=Math.exp(-1/(6e-4*sr2));s.d2=Math.exp(-1/(sr2/(1/6e-5+1/6e-4)));s.dn=Math.exp(-1/(1.5e-3*sr2));s.a1+=e.k;s.a2+=e.k;s.an+=e.k*.5;}else this._bang(e.b,e.k,true);}
      this.t++;
      const w=Math.random()*2-1,w2=Math.random()*2-1;
      /* blowdown pulses: a fast rise, a decay, and the rarefaction behind it */
      const pa=A.e1-A.e2-(A.u1-A.u2),pb=B.e1-B.e2-(B.u1-B.u2);
      A.e1*=d1;A.e2*=d2;A.u1*=d3;A.u2*=d4;A.env*=de;B.e1*=d1;B.e2*=d2;B.u1*=d3;B.u2*=d4;B.env*=de;
      const ba=2.4*(GA.a1-GA.a2)+.32*GA.an*w,bb=2.4*(GB.a1-GB.a2)+.32*GB.an*w2;
      GA.a1*=GA.d1;GA.a2*=GA.d2;GA.an*=GA.dn;GB.a1*=GB.d1;GB.a2*=GB.d2;GB.an*=GB.dn;
      const rn=f.rasp.tick(w);
      const xa=this.wgA.tick(pa+rn*A.env*g.rasp+ba)*gEx,xb=this.wgB.tick(pb+rn*B.env*g.rasp+bb)*gEx;
      xd.a[xd.w]=xa;xd.b[xd.w]=xb;const ri=(xd.w-xd.d+xd.n)%xd.n,da=xd.a[ri],db=xd.b[ri];xd.w=(xd.w+1)%xd.n;
      /* saturation that grows with load, asymmetric so it adds even harmonics */
      let l=xa+db*xd.x,r=da*xd.x+xb;
      l=clamp(l*g.drive,-1,1);r=clamp(r*g.drive,-1,1);
      l=ftanh(1.5*(l+.16*l*l))*1.07*g.post;r=ftanh(1.5*(r+.16*r*r))*1.07*g.post;
      l=f.lpL.tick(f.hpL.tick(l))*g.exG;r=f.lpR.tick(f.hpR.tick(r))*g.exG;
      /* induction: the same pulses through the airbox and runners, plus a pulse-locked roar */
      let m=f.lpI2.tick(f.lpI.tick(this.wgI.tick(pa+pb)*gIn))*g.inG+f.roar.tick(w2)*(A.env+B.env)*g.roar+(ba+bb)*k.pop*.08;
      if(c.turbo){this.ph1+=ftw;if(this.ph1>1)this.ph1-=1;this.ph2+=ftw*1.51;if(this.ph2>1)this.ph2-=1;
        let tw=Math.sin(TAU*this.ph1)+.35*Math.sin(TAU*this.ph2);if(twin){this.ph3+=ftw*1.034;if(this.ph3>1)this.ph3-=1;tw+=.8*Math.sin(TAU*this.ph3);}
        m+=tw*g.tw+f.rush.tick(w)*g.rush;}
      if(g.sup>1e-5){this.phS+=fsu;if(this.phS>1)this.phS-=1;m+=(cent?Math.sin(TAU*this.phS)+.3*Math.sin(2*TAU*this.phS):f.sup.tick(2*this.phS-1)*3)*g.sup;}
      if(g.gw>1e-5){this.phG+=fgw;if(this.phG>1)this.phG-=1;m+=(4*Math.abs(this.phG-.5)-1)*g.gw;}
      if(g.nos>1e-5)m+=f.nos.tick(w2)*g.nos*3;
      if(g.st>1e-4){this.phSt+=fst;if(this.phSt>1)this.phSt-=1;this.phAm+=fam;if(this.phAm>1)this.phAm-=1;m+=f.start.tick(2*this.phSt-1)*(.55+.45*(this.phAm<.5?1:-1))*g.st;}
      for(let v=this.vox.length-1;v>=0;v--){const o2=this.vox[v],age=this.t-o2.t0;if(age<0)continue;if(age>=o2.N){this.vox.splice(v,1);continue;}
        if((age&31)===0)o2.bq.set(o2.type,o2.f0*Math.pow(o2.f1/o2.f0,age/o2.N),o2.q,sr);o2.e*=age<o2.att?o2.mA:o2.mD;m+=o2.bq.tick(Math.random()*2-1)*o2.e*3;}
      l=(l+m)*g.og*g.fade;r=(r+m)*g.og*g.fade;
      /* the listener: propagation delay (Doppler falls out of it), air absorption, distance, pan */
      this.dS+=(dT-this.dS)*kd;
      dl[this.dw]=l;dr[this.dw]=r;
      const dly=Math.min(dn-4,this.dS/C_AIR*sr+1),ip=Math.floor(dly),fr=dly-ip,j=this.dw-ip;
      const j0=(j+1)&dm,j1=j&dm,j2=(j-1)&dm,j3=(j-2)&dm;
      l=hermite(dl[j0],dl[j1],dl[j2],dl[j3],fr);r=hermite(dr[j0],dr[j1],dr[j2],dr[j3],fr);
      this.dw=(this.dw+1)&dm;
      this.airL+=this.aa*(l-this.airL);this.airR+=this.aa*(r-this.airR);
      const mid=(this.airL+this.airR)*.5,side=(this.airL-this.airR)*.5*width,th=(g.pan+1)*Math.PI/4;
      l=(mid+side)*Math.cos(th)*1.4142*g.gd;r=(mid-side)*Math.sin(th)*1.4142*g.gd;
      /* a soft knee so nothing ever hard-clips */
      const al=Math.abs(l),ar=Math.abs(r);
      if(al>.9)l=Math.sign(l)*(.9+.1*ftanh((al-.9)*10));if(ar>.9)r=Math.sign(r)*(.9+.1*ftanh((ar-.9)*10));
      OL[o+i]=l;OR[o+i]=r;
    }
  }
}
return EngineDSP;
}
