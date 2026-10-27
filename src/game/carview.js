/* What the renderer needs to draw a car that isn't running full physics: where its wheels sit
   at rest (the same hardpoints the Vehicle computes), and a view object built from a pose. */
import {qaxis} from '../physics/math3.js';
const G=9.81;

export function wheelLayout(ch){
  const s=ch.susp,m=ch.mass,a=ch.wb*(1-ch.wf),b=ch.wb*ch.wf;
  const c0F=m*G*ch.wf/2/s.kF,c0R=m*G*(1-ch.wf)/2/s.kR;
  const hpF=-ch.hcg+ch.R+s.rest-c0F,hpR=-ch.hcg+ch.R+s.rest-c0R;
  return [[a,hpF,-ch.trackF/2,s.rest-c0F,1],[a,hpF,ch.trackF/2,s.rest-c0F,1],[-b,hpR,-ch.trackR/2,s.rest-c0R,0],[-b,hpR,ch.trackR/2,s.rest-c0R,0]]
    .map(([x,y,z,len,f])=>({hp:[x,y,z],len,front:!!f}));
}
/* a view of a car at a pose: p is the centre of mass in the world, yaw about +y (0 = facing +x) */
export function poseView(ch,{id,p,q,yaw=0,paint,lamps=[0,0,0,0],ind=[0,0],steer=0,spin=0,lod}){
  const W=wheelLayout(ch);
  return {id,design:ch.design,p,q:q||qaxis([0,1,0],yaw),paint,lamps,ind,lod,
    wheels:W.map(w=>({hp:w.hp,len:w.len,steer:w.front?steer:0,ang:spin,disc:0}))};
}
