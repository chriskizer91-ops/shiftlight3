/* A robot driver: pure pursuit on the racing line, speed from the car's speed profile.
   Used by the physics tests now; the AI drivers will grow from it. Steering input is the
   lateral acceleration it wants as a fraction of what the tyres can give. */
import {clamp,sub,dot,qmat,mcol} from '../physics/math3.js';
export function makeBot(T,prof,{pace=.95,look=.7}={}){
  const st={iv:0};
  return function drive(car){
    const loc=car.loc;if(!loc)return {steer:0,thr:0,brk:1,hb:0};
    const M=qmat(car.q),F=mcol(M,0),Rt=mcol(M,2),v=Math.max(car.vf,1);
    const la=clamp(v*look,7,38),s2=T.wrapS(loc.s+la),tgt=T.pos(s2,T.lineAt(s2)),d=sub(tgt,car.p);
    const xb=dot(d,F),zb=dot(d,Rt),L2=xb*xb+zb*zb,kappa=2*zb/Math.max(L2,1);
    const latFrac=kappa*v*v/(car.tyre.mu*9.81);
    const steer=clamp(latFrac*1.05+zb*.02,-1,1);
    const i=T.idx(Math.round(T.wrapS(loc.s+v*.55)/T.ds)),vt=prof[i]*pace,e=vt-car.vf;
    let thr=0,brk=0;if(e>0)thr=clamp(.5+e*.4,0,1);else if(e<-1)brk=clamp(-e*.2,0,1);else thr=.3;
    return {steer,thr,brk,hb:0};
  };
}
