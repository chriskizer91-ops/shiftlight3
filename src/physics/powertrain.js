/* =====================================================================================
   POWERTRAIN — engine -> clutch -> gearbox -> differential(s) -> driven wheels.
   The engine is one of the Engine Lab's specs (torque curve, boost, limiter, nitrous).
   Wheel spin is integrated semi-implicitly: each tyre's own stiffness (dFx/dkappa) goes in
   the denominator, so 240 Hz is stable even for light wheels at low speed. Difference modes
   of each differential carry its locking friction; the mean mode carries the engine.
   It also produces the synth's parameters (rpm, load, ignition cuts, boost) and events.
   ===================================================================================== */
import {SIM} from '../engine/engine-sim.js';
import {clamp,lerp,sstep,sgn,TAU} from './math3.js';
const {engTq,steadyBoost}=SIM;

/* the rpm where the next gear makes more wheel torque: the true optimal upshift point per gear */
function optimalShifts(e){
  const out=[],wot=r=>engTq(e,r,1,steadyBoost(e,r));
  for(let g=0;g<e.nG;g++){
    if(g===e.nG-1){out.push(e.limiterRpm-150);break;}
    const r1=e.gears[g],r2=e.gears[g+1];let best=e.limiterRpm-150;
    for(let rpm=e.redline*.5;rpm<e.limiterRpm-100;rpm+=25)if(wot(rpm*r2/r1)*r2>wot(rpm)*r1){best=rpm;break;}
    out.push(Math.min(best,e.limiterRpm-150));
  }
  return out;
}

export class Powertrain{
  /* e: SIM.makeSpec(...). o: {drive:'RWD'|'FWD'|'AWD', clutch (N m), engage (s), diff:{pre,acc,dec}, Iw, R} */
  constructor(e,o){
    this.e=e;this.o=o;this.drv=o.drive==='FWD'?[0,1]:o.drive==='AWD'?[0,1,2,3]:[2,3];
    this.upRpm=optimalShifts(e);
    this.st='off';this.t=0;this.we=0;this.rpm=0;this.gear=1;this.shiftT=0;this.shiftTo=1;this.engage=0;this.locked=false;
    this.boost=0;this.nos=e.nosKw?1:0;this.nosOn=false;this.cutT=0;this.cutFrac=0;this.thr=0;this.thrSnd=0;this.load=0;this.thrPrev=0;
    this.launching=false;this.launchW=0;this.launchT=0;this.hold=false;this.rev=false;this.revT=0;this.twostep=false;this.tcMul=1;this.tcOn=false;
    this.sinceShift=1;this.shiftGrade=null;this.events=[];this.lopeT=0;this.rpmOut=0;this.Te=0;this.Tdrv=0;
  }
  get running(){return this.st==='run'||this.st==='catch';}
  start(){if(this.st==='off'||this.st==='stopping'){this.st='crank';this.t=0;}}
  stop(){if(this.st!=='off')this.st='stopping';}
  shift(dir){
    const e=this.e;if(this.shiftT>0||this.rev||!this.running)return false;
    const to=this.gear+dir;if(to<1||to>e.nG)return false;
    this.shiftTo=to;this.shiftT=e.shiftT;this.engage=0;this.locked=false;this.sinceShift=0;
    if(dir>0){const opt=this.upRpm[this.gear-1],err=this.rpm-opt;this.shiftGrade=Math.abs(err)<180?'PERFECT':Math.abs(err)<450?'GOOD':err<0?'EARLY':'LATE';
      if(e.seq&&this.thr>.6)this.events.push({type:'shift'});}
    else this.shiftGrade=null;
    return true;
  }
  /* the automatic gearbox, driven from the same optimal shift points */
  autoShift(brk,air,holdGear=false){
    const e=this.e;if(this.shiftT>0||this.rev||air||this.sinceShift<.3||this.engage<.95||!this.running)return;
    const g=this.gear,rpm=this.rpm;
    /* everyday driving: short-shift early, change down only when it lugs */
    if(this.eco){const up=e.redline*(.36+.3*this.thr);
      if(this.locked&&g<e.nG&&rpm>up){this.shift(1);return;}
      if(g>1&&rpm<e.idle*1.3&&this.sinceShift>.6)this.shift(-1);
      return;}
    if(this.locked&&g<e.nG&&((!holdGear&&rpm>this.upRpm[g-1])||rpm>e.limiterRpm-80)&&this.thr>.3){this.shift(1);return;}
    if(g>1&&(!holdGear||rpm<e.idle*1.6)){const after=rpm*e.gears[g-2]/e.gears[g-1];
      if(after<this.upRpm[g-2]*.88&&(rpm<e.redline*.5||(brk>.3&&after<e.redline*.86))&&this.sinceShift>.45)this.shift(-1);}
  }
  meanW(W){let m=0;for(const i of this.drv)m+=W[i].w;return m/this.drv.length;}
  /* inertia a wheel's brake has to fight (with the engine attached through a locked clutch) */
  effInertia(i,Iw){if(this.locked&&this.drv.includes(i)){const gr=this.ratio();return Iw+this.e.Ie*gr*gr/this.drv.length;}return Iw;}
  ratio(){return this.e.gears[this.gear-1]*this.e.fd*(this.rev?-1.15:1);}
  /* one substep. inp {thr, brk, nos}. W: four wheels {w, Fx, Kd, Fz, kap}. aid {tc, escThr}. */
  step(dt,inp,W,aid){
    const e=this.e,o=this.o,R=o.R,Iw=o.Iw,drv=this.drv,idleW=e.idle*TAU/60;
    this.t+=dt;this.lopeT+=dt;this.sinceShift+=dt;this.twostep=false;this.cutFrac=0;this.tcOn=false;
    let thrIn=clamp(inp.thr,0,1),brkIn=clamp(inp.brk,0,1);
    /* ---- starting and stopping ---- */
    if(this.st==='off'){this.we=0;this.rpm=0;this.load=0;this.engage=0;this.locked=false;this._free(W,dt);this._out();return;}
    if(this.st==='crank'){this.we=(235+70*Math.sin(this.t*38))*TAU/60;this.rpm=this.we*60/TAU;if(this.t>.8){this.st='catch';this.t=0;}this._free(W,dt);this._out();return;}
    if(this.st==='catch'){const t=this.t;this.we=idleW*(1+.95*Math.sin(Math.min(1,t/.22)*Math.PI/2)*Math.exp(-Math.max(0,t-.22)*2.6));this.load=t<.22?.6:0;
      if(t>1.1)this.st='run';this.rpm=this.we*60/TAU;this._free(W,dt);this._out();return;}
    if(this.st==='stopping')thrIn=0;
    const vW=this.meanW(W)*R;
    /* ---- throttle body ---- */
    this.thr+=(thrIn-this.thr)*Math.min(1,dt*(thrIn>this.thr?9:14)*e.resp);
    let thrE=this.thr,thrSnd=this.thr;const rpm=this.we*60/TAU;this.rpm=rpm;
    /* traction control: an integral slip controller that cuts sparks (you hear it) */
    let dslip=0;for(const i of drv)dslip=Math.max(dslip,W[i].kap);
    const vAbs=Math.abs(vW);
    /* traction control, two parts: a feed-forward torque cap at what the driven tyres can put down
       (as a modern ECU's torque model does), and a fast trim on the measured slip. It cuts sparks, so you hear it. */
    this.tcCap=1e9;
    if(aid.tc&&!this.rev&&this.locked&&aid.fmax>0){const gr=Math.abs(this.ratio());
      this.tcCap=aid.fmax*.95*R/(gr*.88)*(1+e.Ie*gr*gr/(aid.mass*R*R));}
    if(aid.tc&&vAbs>.3&&!this.rev){const err=dslip-.13;if(err>0)this.tcMul-=Math.min(err,1)*dt*14;else this.tcMul+=dt*2.5;this.tcMul=clamp(this.tcMul,.3,1);}else this.tcMul=1;
    if(aid.escThr<1){thrE*=aid.escThr;}
    if(this.hold&&e.launch&&rpm>e.launchRpm){thrE=0;this.cutFrac=.75;this.twostep=this.thr>.4;}
    /* ---- forced induction ---- */
    if(e.turbo){const spool=sstep(e.s0,e.s1,rpm),tgt=thrSnd>.15?e.fiBoost*spool*(.35+.65*thrSnd):e.antilag&&this.running?e.fiBoost*.75*sstep(e.s0*.7,e.s1,rpm):0;
      if(this.boost>.35&&this.thrPrev>.6&&thrIn<.2&&!e.antilag&&e.bov!=='none')this.events.push({type:'bov',flutter:e.bov==='flutter'});
      this.boost+=(tgt-this.boost)*Math.min(1,dt*(tgt>this.boost?(.5+1.5*rpm/e.redline)/e.lag:6));}
    else this.boost=steadyBoost(e,rpm)*(thrSnd>.05?1:.2);
    this.thrPrev=thrIn;
    /* ---- shifting ---- */
    const shifting=this.shiftT>0;let thrEng=thrE;
    if(shifting){
      if(this.shiftTo>this.gear){if(e.seq&&this.thr>.7){thrEng=0;this.cutFrac=1;}else{thrEng=0;thrSnd=0;}}
      else{const tgtW=e.gears[this.shiftTo-1]*e.fd*this.meanW(W);thrEng=clamp((tgtW-this.we)*.02,0,1);thrSnd=thrEng;}
    }
    /* pulling away: the clutch target starts at the launch revs and slides down to meet the wheels;
       the driver feathers the throttle so the engine follows it rather than flaring to the limiter */
    const grL=this.ratio(),wmL=this.meanW(W),launchRpm=Math.max(Math.min(e.redline*.55,4600),e.turbo?e.s0*1.1:0);
    const wHold=this.launchW||lerp(idleW*1.3,launchRpm*TAU/60,clamp(this.thr,0,1)),wTgt=Math.max(Math.abs(grL*wmL),wHold*Math.max(.72,1-.3*this.launchT));
    if(this.launching&&!shifting&&!this.hold&&this.we>wTgt+15)thrEng*=clamp(1-(this.we-wTgt-15)/90,0,1);
    if(!shifting&&!this.locked&&!this.launching&&this.engage<1)thrEng*=this.engage*this.engage;
    /* ---- the rev limiter ---- */
    if(this.cutT>0){this.cutT-=dt;thrEng=0;this.cutFrac=1;}
    if(rpm>e.limiterRpm){if(e.limiter==='soft'){const k=clamp(1-(rpm-e.limiterRpm)/150,0,1);thrEng*=k;this.cutFrac=Math.max(this.cutFrac,1-k);}else{this.cutT=clamp(48/e.cyl*60/rpm,.025,.07);thrEng=0;this.cutFrac=1;}}
    let Te=engTq(e,Math.max(rpm,1),thrEng,this.boost);
    if(Te>0&&(this.tcMul<1||Te>this.tcCap)){const Tr=Te;Te=Math.min(Te*clamp(this.tcMul-3*Math.max(0,dslip-.13),.15,1),this.tcCap);
      const k=Te/Tr;if(k<.97){this.tcOn=true;this.cutFrac=Math.max(this.cutFrac,(1-k)*.9);}}
    this.nosOn=false;
    if(inp.nos&&e.nosKw&&this.nos>0&&this.thr>.5&&!shifting&&!this.hold&&this.running&&this.cutFrac<.5){this.nosOn=true;this.nos=Math.max(0,this.nos-dt/e.nosT);Te+=Math.min(e.nosKw*1000/Math.max(this.we,150),e.tq*1.6);}
    if(this.st==='run'&&this.we<idleW)Te+=(idleW-this.we)*e.Ie*25;
    const TeS=engTq(e,Math.max(rpm,1),thrSnd,this.boost);
    this.load=this.st==='run'?clamp(thrSnd*(TeS>0?1:0)*(.42+.58*Math.min(1,TeS/e.tq)),0,1):0;
    this.Te=Te;
    /* ---- clutch: the robot left foot ---- */
    if(shifting){this.shiftT-=dt;if(this.shiftT<=0){this.gear=this.shiftTo;this.shiftT=0;}}
    const gr=this.ratio(),wm=this.meanW(W);
    if(!this.locked&&!shifting&&Math.abs(gr*wm)<idleW*1.3&&this.engage<.5)this.launching=true;
    if(this.launching)this.launchT+=dt;else this.launchT=0;
    const slowForGear=this.launching&&Math.abs(gr*wm)<wTgt*.98;
    let fzD=0;for(const i of drv)fzD+=W[i].Fz;
    const tracCap=Math.abs(gr)>0?(aid.fmax||fzD*o.mu)*(aid.tc?.9:1.3)*R/(Math.abs(gr)*.88):1e9;
    let engT=1;if(shifting||this.hold||!this.running)engT=0;else if(Math.abs(gr*wm)<idleW*1.1&&this.thr<.05)engT=0;
    const er=engT>this.engage?dt/Math.max(.02,o.engage*(this.launchW?.25:this.launching?1:.55)):dt*12;
    this.engage=clamp(this.engage+clamp(engT-this.engage,-er,er),0,1);
    const cap=o.clutch*this.engage;
    /* ---- drivetrain solve ---- */
    const n=drv.length;let Fsum=0,Ksum=0;for(const i of drv){Fsum+=W[i].Fx;Ksum+=W[i].Kd;}
    let Tdrv=0;
    if(this.locked&&this.engage>.98&&!shifting){
      const Itot=e.Ie*gr*gr+n*Iw,tau=Te*gr*.88-R*Fsum,dwm=dt*tau/(Itot+dt*R*Ksum),Tcl=Te-e.Ie*gr*dwm/dt;
      if(Math.abs(Tcl)>o.clutch*1.02)this.locked=false;
      else{for(const i of drv)W[i].w+=dwm;this.we=gr*(wm+dwm);Tdrv=Tcl*gr*.88;}
    }else this.locked=false;
    if(!this.locked){
      const slipW=this.we-gr*wm;let Tc;
      if(gr===0||cap<=0)Tc=0;
      else if(slowForGear&&!shifting)Tc=clamp(Te+30*e.Ie*(this.we-wTgt),0,Math.min(cap,tracCap));
      else{Tc=cap*clamp(slipW/10,-1,1);const fl=idleW*1.15;if(Tc>0&&this.we<fl*1.4)Tc=Math.min(Tc,Math.max(0,Te+30*e.Ie*(this.we-fl)));}
      this.we+=dt*(Te-Tc)/e.Ie;Tdrv=Tc*gr*.88;
      const dwm=dt*(Tdrv-R*Fsum)/(n*Iw+dt*R*Ksum);for(const i of drv)W[i].w+=dwm;
      const s2=this.we-gr*(wm+dwm);
      if(gr!==0&&this.engage>.98&&!shifting&&(Math.abs(s2)<5||(Math.sign(s2)!==Math.sign(slipW)&&!slowForGear))){this.locked=true;this.we=gr*(wm+dwm);this.launchW=0;this.launching=false;}
    }
    if(this.we<idleW*.6&&this.st!=='stopping')this.we=idleW*.6;
    if(this.st==='stopping'&&this.we<idleW*.35){this.st='off';this.we=0;}
    this.Tdrv=Tdrv;
    /* ---- differentials: difference modes carry the locking friction ---- */
    const D=o.diff;
    if(n===2){
      const i=drv[0],j=drv[1];let Dd=(W[i].w-W[j].w)/2;const m=(W[i].w+W[j].w)/2;
      Dd+=dt*(-R*(W[i].Fx-W[j].Fx)/2)/(Iw+dt*R*(W[i].Kd+W[j].Kd)/2);
      const lk=D.pre+(Tdrv>=0?D.acc:D.dec)*Math.abs(Tdrv);Dd-=sgn(Dd)*Math.min(Math.abs(Dd),dt*lk/Iw);
      W[i].w=m+Dd;W[j].w=m-Dd;
    }else{
      const m=(W[0].w+W[1].w+W[2].w+W[3].w)/4;let Dc=((W[0].w+W[1].w)-(W[2].w+W[3].w))/4,Df=(W[0].w-W[1].w)/2,Dr=(W[2].w-W[3].w)/2;
      const Qc=-R*(W[0].Fx+W[1].Fx-W[2].Fx-W[3].Fx)-Tdrv*.2;
      Dc+=dt*Qc/(4*Iw+dt*R*(W[0].Kd+W[1].Kd+W[2].Kd+W[3].Kd));Dc-=sgn(Dc)*Math.min(Math.abs(Dc),dt*(160+Math.abs(Dc)*80)/(4*Iw));
      Df+=dt*(-R*(W[0].Fx-W[1].Fx))/(2*Iw+dt*R*(W[0].Kd+W[1].Kd));Df-=sgn(Df)*Math.min(Math.abs(Df),dt*(20+.1*Math.abs(Tdrv))/(2*Iw));
      Dr+=dt*(-R*(W[2].Fx-W[3].Fx))/(2*Iw+dt*R*(W[2].Kd+W[3].Kd));const lk=D.pre+(Tdrv>=0?D.acc:D.dec)*Math.abs(Tdrv)*.6;Dr-=sgn(Dr)*Math.min(Math.abs(Dr),dt*lk/(2*Iw));
      W[0].w=m+Dc+Df;W[1].w=m+Dc-Df;W[2].w=m-Dc+Dr;W[3].w=m-Dc-Dr;
    }
    for(let i=0;i<4;i++)if(!drv.includes(i))W[i].w+=dt*(-R*W[i].Fx)/(Iw+dt*R*W[i].Kd);
    this.thrSnd=thrSnd;this._out();
  }
  /* engine not driving: every wheel just rolls */
  _free(W,dt){const R=this.o.R,Iw=this.o.Iw;for(let i=0;i<4;i++)W[i].w+=dt*(-R*W[i].Fx)/(Iw+dt*R*W[i].Kd);}
  _sync(W){if(this.locked){const idleW=this.e.idle*TAU/60;this.we=this.ratio()*this.meanW(W);if(this.we<idleW*.92){this.locked=false;this.we=Math.max(this.we,idleW*.92);}}this.rpm=this.we*60/TAU;}
  _out(){
    const e=this.e,w=1-clamp((this.rpm-e.idle)/(e.idle*.9),0,1),lope=[0,.012,.032,.065][e.cam|0]*1.4+(e.ch.lope||0);
    const mod=this.running&&lope?lope*w*(Math.sin(this.lopeT*TAU*1.55)+.6*Math.sin(this.lopeT*TAU*.62+1.3)):0;
    this.rpmOut=this.st==='off'?0:this.rpm*(1+mod);
  }
  /* what the synth needs. listener: 0 behind, 1 cabin, 2 trackside; dist/pan/rear for 2 */
  soundParams(listener,speed,geo){
    const e=this.e;
    return {on:this.st!=='off'&&this.st!=='crank'?1:0,firing:this.st==='run'||this.st==='catch'?1:0,crank:this.st==='crank'?1:0,crankT:this.st==='crank'?this.t:0,
      rpm:this.rpmOut,load:this.load,cutFrac:this.cutFrac,boost:this.boost,nos:this.nosOn?1:0,speed,gear:this.gear,twostep:this.twostep?1:0,
      antilag:e.antilag&&e.turbo&&this.thr<.2&&this.running?1:0,view:listener,dist:geo?geo.dist:listener===1?1.4:3,pan:geo?geo.pan:0,rear:geo?geo.rear:listener===1?.35:1,vol:1,jump:geo&&geo.jump?1:0};
  }
  takeEvents(){const ev=this.events;this.events=[];return ev;}
}
