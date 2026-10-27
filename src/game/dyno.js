/* =====================================================================================
   DYNO — an inertia rolling road. The car's own powertrain (the same code that drives it on
   the street: clutch, gearbox, boost lag, limiter, nitrous) turns a drum through the driven
   wheels. A pull is flat out in the gear nearest 1:1 from low revs to the limiter; the drum's
   acceleration gives the power at the wheels, sampled against engine rpm. It sounds like it
   too: the engine synth plays the real thing as it runs.
   ===================================================================================== */
import {Powertrain} from '../physics/powertrain.js';
import {SIM} from '../engine/engine-sim.js';
const TAU=Math.PI*2;

export class Dyno{
  constructor(chassis,spec,{nos=false}={}){
    this.c=chassis;this.e=spec;this.nos=nos;
    /* the drum: about a third of the car's inertia, so a pull takes a few seconds */
    const R=chassis.R,n=spec.drv==='AWD'?4:2;this.R=R;
    this.Jd=chassis.mass*.36*R*R;
    this.pt=new Powertrain(spec,{drive:spec.drv||'RWD',clutch:spec.tq*(2.2+spec.fiBoost*.9),engage:.22,diff:chassis.diff,Iw:this.Jd/n+chassis.Iw,R,mu:9});
    this.W=[0,1,2,3].map(i=>({i,w:0,Fx:0,Kd:0,Fz:4e4,kap:0}));
    /* the gear nearest 1:1 (fourth in most boxes) */
    let g=1,best=9;spec.gears.forEach((r,i)=>{if(Math.abs(r-1)<best){best=Math.abs(r-1);g=i+1;}});this.gear=g;
    this.state='idle';this.t=0;this.samples=[];this.peak=null;this.live={rpm:0,kw:0,tq:0,boost:0,speed:0};
    const pt=this.pt;pt.st='run';pt.we=spec.idle*TAU/60;pt.rpm=spec.idle;pt.gear=g;pt.locked=false;pt.engage=0;
  }
  /* roll up to the start revs, then go */
  start(){const pt=this.pt,e=this.e,rpm0=Math.max(e.idle*1.35,e.redline*.22);
    pt.gear=this.gear;pt.locked=true;pt.engage=1;pt.shiftT=0;pt.we=rpm0*TAU/60;pt.rpm=rpm0;pt.boost=0;pt.nos=1;
    const w=pt.we/pt.ratio();for(const W of this.W)W.w=pt.drv.includes(W.i)?w:w;
    this.samples=[];this.peak=null;this.state='pull';this.t=0;this.nosShot=this.nos&&e.nosKw>0;}
  /* one step; thr is forced flat out during a pull */
  step(dt){
    const pt=this.pt,e=this.e;this.t+=dt;
    let thr=0;if(this.state==='pull')thr=1;else if(this.state==='spin')thr=this.revThr||0;
    if(this.state==='down'){for(const W of this.W)W.w*=Math.exp(-dt*.9);}
    const wPrev=pt.meanW(this.W);
    pt.step(dt,{thr,brk:0,nos:this.state==='pull'&&this.nosShot&&pt.rpm>e.redline*.45},this.W,{tc:false,escThr:1,fmax:1e9,mass:this.c.mass});
    pt._sync(this.W);
    const w=pt.meanW(this.W),acc=(w-wPrev)/dt;
    /* power into the drum (its inertia times its acceleration) and the torque that means at the crank */
    const Pw=this.Jd*acc*w,ratio=Math.abs(pt.ratio());
    const L=this.live;L.rpm=pt.rpm;L.speed=w*this.R;L.boost=pt.boost;
    L.kw+=(Pw/1000-L.kw)*Math.min(1,dt*18);L.tq=L.kw*1000/Math.max(pt.we,1)/.88;
    if(this.state==='pull'){
      if(pt.rpm>e.redline*.26&&this.t>.25){const bin=Math.round(pt.rpm/50)*50,last=this.samples[this.samples.length-1];
        if(!last||bin>last.rpm)this.samples.push({rpm:bin,kw:L.kw,tq:L.tq,boost:pt.boost});}
      if(pt.rpm>=e.limiterRpm-60||this.t>25){this.state='down';this.t=0;this.finish();}
    }else if(this.state==='down'&&w*this.R<3){this.state='idle';pt.locked=false;pt.engage=0;}
    else if(this.state==='idle'){/* idling in neutral */}
    return L;
  }
  finish(){let pk={kw:0,rpm:0},tk={tq:0,rpm:0};for(const s of this.samples){if(s.kw>pk.kw)pk={kw:s.kw,rpm:s.rpm};if(s.tq>tk.tq)tk={tq:s.tq,rpm:s.rpm};}
    this.peak={kw:pk.kw,hp:pk.kw*1.341,rpm:pk.rpm,tq:tk.tq,tqRpm:tk.rpm};}
  /* the steady-state curve at the crank, for a quick look before a pull */
  static curve(spec){return SIM.curve(spec,90).map(p=>({rpm:p.rpm,kw:p.hp*.7457,tq:p.tq}));}
  get running(){return this.state==='pull'||this.state==='down';}
  sound(){return this.pt.soundParams(0,this.live.speed,{dist:4.2,pan:.15,rear:.75});}
}
