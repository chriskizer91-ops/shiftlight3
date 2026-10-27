/* =====================================================================================
   ARCADE ASSIST: THE GUIDE — sits between your hands and the car when Arcade Assist is on.
   - corner speed: looks down the road for the next corner, works out how fast the car can
     take it (from the track's curvature and the grip it has right now) and how far it has to
     slow down; if you're coming in too fast it lifts the throttle and brakes for you
   - walls: predicts where the car will be in about half a second; if that is into a barrier,
     it adds steering away from it
   Your inputs always win where they ask for less: it never adds throttle or takes away brake.
   ===================================================================================== */
import {speedProfile} from '../world/track.js';
import {dot,clamp,len} from '../physics/math3.js';

export function makeGuide(T,car){
  /* corner speeds along the centre line (tighter than the racing line, so it errs safe) */
  const TC=Object.assign({},T,{lineK:T.K});
  const prof={};
  const get=wet=>{const k=wet>.5?'wet':'dry';if(!prof[k]){const mu=car.tyre.mu*(car.plus?car.plus.grip:1)*(wet>.5?.93:1)*.86;
    prof[k]={v:speedProfile(TC,{mass:car.m,clF:car.c.clF,clR:car.c.clR,cdA:car.c.cdA,powerKw:car.spec.peak.kw},{mu}),mu};}return prof[k];};
  const state={brake:0,steer:0};
  const guide=function(inp){
    const out=Object.assign({},inp);state.brake=0;state.steer=0;
    if(!car.loc||car.air||car.rev||car.vf<5||inp.hb>.3)return out;
    const L=car.loc,v=car.vf,P=get(car.wet),aB=P.mu*9.81*.78;
    if(Math.abs(L.d)>T.hw+2.5)return out;
    /* ---- corner speed ---- */
    let vmax=1e9;const reach=Math.min(180,v*v/(2*aB)+v*.6+15);
    for(let k=0;k<=reach;k+=2){const i=T.idx(Math.round(T.wrapS(L.s+k)/T.ds));
      const va=Math.sqrt(P.v[i]*P.v[i]+2*aB*Math.max(0,k-v*.3));if(va<vmax)vmax=va;}
    if(v>vmax*1.015){out.thr=0;const b=clamp((v-vmax*1.015)/2.5,0,1);out.brk=Math.max(out.brk,b);state.brake=b;}
    else if(v>vmax*.95)out.thr=Math.min(out.thr,clamp((vmax*1.015-v)/(vmax*.065),0,1));
    /* ---- walls ---- */
    const fr=T.frame(L.s),vl=dot(car.v,fr.l),tp=.5+v*.006,dp=L.d+vl*tp;
    const lim=(dp>0?T.wl:T.wr)-1.8;
    if(Math.abs(dp)>lim){const over=Math.abs(dp)-lim,add=Math.sign(dp)*clamp(over*.32,0,.9);
      /* only push away from the wall: never fight a driver already steering away */
      if(Math.sign(out.steer)!==Math.sign(add)||Math.abs(out.steer)<Math.abs(add))out.steer=clamp(out.steer+add,-1,1);state.steer=add;}
    return out;
  };
  guide.state=state;return guide;
}
