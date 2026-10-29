/* =====================================================================================
   RECORDS ON THE FLATS — kept the way land-speed runs are:
   - top speed: the fastest you've been on the flats, wheels on the ground
   - the flying mile (or kilometre, with km/h): your average speed over the last mile you
     covered out there, timed continuously, so any long straight run counts
   - jumps, anywhere in free roam: time in the air and how far you flew, from take-off to
     touch-down
   A new best is announced once it is settled (the peak has passed), not every frame.
   rec: {top, mile, km, air, jump} in m/s, seconds and metres; save(rec) keeps it.
   ===================================================================================== */
import {onFlats} from '../world/flats.js';

export const MILE=1609.344;
export class FlatsRun{
  constructor(rec,save){
    this.rec=Object.assign({top:0,mile:0,km:0,air:0,jump:0},rec||{});this.save=save||(()=>{});
    this.samples=[];this.dist=0;this.last=null;this.top=0;this.flying=0;this.on=false;
    this.inAir=false;this.msgs=[];this.pendTop=false;this.pendFly=false;
  }
  takeMessages(){const m=this.msgs;this.msgs=[];return m;}
  /* forget the current run (a reset, a new level, leaving free roam) */
  restart(){this.samples.length=0;this.dist=0;this.last=null;this.top=0;this.flying=0;this.inAir=false;this.pendTop=this.pendFly=false;}
  update(dt,time,car,mph){
    const x=car.p[0],y=-car.p[2],v=Math.hypot(car.v[0],car.v[2]);
    /* a jump in the air more than ~5 m from where the last frame was is a reset, not motion */
    if(this.last&&Math.hypot(x-this.last[0],y-this.last[1])>Math.max(6,v*dt*3)){this.restart();}
    const step=this.last?Math.hypot(x-this.last[0],y-this.last[1]):0;this.last=[x,y];
    /* ---- jumps ---- */
    if(car.air&&!this.inAir){this.inAir=true;this.t0=time;this.p0=[x,y];}
    else if(!car.air&&this.inAir){this.inAir=false;const t=time-this.t0,d=Math.hypot(x-this.p0[0],y-this.p0[1]);
      if(t>=.6&&d>4){const best=d>this.rec.jump+.01;if(best)this.rec.jump=d;if(t>this.rec.air)this.rec.air=t;
        this.msgs.push({t:'jump',air:t,dist:d,best});if(best||t>=this.rec.air)this.save(this.rec);}}
    /* ---- speed: only out on the flats ---- */
    this.on=onFlats(x,y);
    if(!this.on){if(this.samples.length){this.samples.length=0;this.dist=0;this.flying=0;}this.top=0;this.settle(v,true);return;}
    if(!car.air&&v>this.top)this.top=v;
    if(!car.air&&v>this.rec.top+.03){this.rec.top=v;this.pendTop=true;}
    /* the flying mile: distance covered against time, sampled 20 times a second */
    this.dist+=step;const L=mph?MILE:1000,key=mph?'mile':'km';
    const S=this.samples;if(!S.length||time-S[S.length-1].t>=.05)S.push({t:time,d:this.dist});
    while(S.length>2&&this.dist-S[1].d>=L)S.shift();
    if(S.length>1&&this.dist-S[0].d>=L){const dt2=time-S[0].t;this.flying=dt2>0?(this.dist-S[0].d)/dt2:0;
      if(this.flying>this.rec[key]+.03){this.rec[key]=this.flying;this.pendFly=key;}}
    else this.flying=0;
    this.settle(v,false);
  }
  /* announce a new best once the run has peaked */
  settle(v,force){
    if(this.pendTop&&(force||v<this.rec.top-2.5)){this.pendTop=false;this.msgs.push({t:'top',v:this.rec.top});this.save(this.rec);}
    if(this.pendFly&&(force||this.flying<this.rec[this.pendFly]-1)){const k=this.pendFly;this.pendFly=false;this.msgs.push({t:'flying',v:this.rec[k],unit:k});this.save(this.rec);}
  }
}
