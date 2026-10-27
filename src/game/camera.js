/* =====================================================================================
   CAMERAS — chase (near and far), hood, bumper, cockpit, and a TV director who picks
   trackside cameras. The chase camera swings with the car on a spring, leans toward where
   the car is actually going when it slides, pulls back under acceleration, and stays inside
   the barriers.
   ===================================================================================== */
import {clamp,lerp,norm,cross,qmat,mcol,mvec,add,scale,madd,sub,dot,len} from '../physics/math3.js';
export const CAM_MODES=['chase','far','hood','bumper','cockpit','tv'];
/* one implicit step of a critically damped spring toward t */
const springTo=(x,v,t,w,dt)=>{const a=2*dt*w,b=dt*dt*w*w,n=(x*(1+a)+dt*v+b*t)/(1+a+b);return [n,(n-x)/dt];};

export class CameraRig{
  constructor(level){this.setLevel(level);this.mode=0;this.yaw=null;this.yawV=0;this.pos=null;this.pv=[0,0,0];this.shake=0;this.tvIdx=-1;this.tvPos=null;this.cut=true;
    this.fq=null;this.lookBack=false;this.pitchSm=0;}
  setLevel(level){this.level=level;this.T=level.T||null;this.tv=null;this.pos=null;this.yaw=null;this.cut=true;}
  next(){this.mode=(this.mode+1)%CAM_MODES.length;this.cut=true;this.yaw=null;this.pos=null;this.tvIdx=-1;}
  get name(){return CAM_MODES[this.mode];}
  update(dt,car,{look=false,impact=0}={}){
    const M=qmat(car.q),F=mcol(M,0),U=mcol(M,1),Rt=mcol(M,2),hcg=car.c.hcg,v=car.v,sp=len(v);
    const mode=CAM_MODES[this.mode];let cut=this.cut;this.cut=false;
    if(look!==this.lookBack){this.lookBack=look;cut=true;this.yaw=null;this.pos=null;}
    const out={near:.25,lensRain:0,fov:1.15,cut};
    if(this.orbit){/* a turntable view of the car (garage, screenshots) */
      const o=this.orbit,c=add(car.p,mvec(M,[o.x||0,o.y||0,0]));const yaw=Math.atan2(-F[2],F[0])+o.yaw;
      const dir=[Math.cos(o.pitch)*Math.cos(yaw),Math.sin(o.pitch),-Math.cos(o.pitch)*Math.sin(yaw)];
      out.pos=madd(c,dir,o.dist);out.fwd=scale(dir,-1);out.up=[0,1,0];out.fov=o.fov||.7;out.cut=true;
      /* slide the camera sideways (the car sits left of centre, beside a panel) */
      if(o.shift){const r=norm(cross(out.fwd,[0,1,0]));out.pos=madd(out.pos,r,o.shift);}
      return out;}
    this.shake=Math.max(this.shake*Math.exp(-dt*6),impact*.6);
    const body=(x,y,z)=>add(car.p,mvec(M,[x,y-hcg,z]));
    if(mode==='chase'||mode==='far'||look){
      /* the direction to look: the car's nose, leaning toward its path when it slides */
      const fh=norm([F[0],0,F[2]]);let dir=fh;
      if(sp>3){const vd=norm([v[0],0,v[2]]);const k=clamp((sp-3)/12,0,1)*.45*(dot(vd,fh)>0?1:0);dir=norm([fh[0]+vd[0]*k,0,fh[2]+vd[2]*k]);}
      if(look)dir=[-dir[0],0,-dir[2]];
      const ty=Math.atan2(-dir[2],dir[0]);
      if(this.yaw===null){this.yaw=ty;this.yawV=0;}
      let d=ty-this.yaw;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
      const w=4.2+clamp(sp/12,0,3.5);[this.yaw,this.yawV]=springTo(this.yaw,this.yawV,this.yaw+d,w,dt);
      const h=[Math.cos(this.yaw),0,-Math.sin(this.yaw)];
      const far=mode==='far';const dist=(far?7.6:5.5)+clamp(sp*.018,0,1.4),ht=(far?2.6:1.55)-clamp(sp*.004,0,.2);
      let tgt=[car.p[0]-h[0]*dist,car.p[1]+ht,car.p[2]-h[2]*dist];
      /* stay inside the barriers (or out of the buildings) and above the road */
      tgt=this.level.camCollide(tgt,[car.p[0],car.p[1]+.9,car.p[2]]);
      /* spring the offset from the car, not the position: no lag at steady speed, a pull back when it surges */
      const ax=clamp((car.accB?car.accB[0]:0)*.05,-.5,.8);
      const off=[tgt[0]-car.p[0]-h[0]*ax,tgt[1]-car.p[1],tgt[2]-car.p[2]-h[2]*ax];
      if(!this.pos||cut){this.off=off.slice();this.pv=[0,0,0];}
      for(let k=0;k<3;k++){const wk=k===1?6:8;const r=springTo(this.off[k],this.pv[k],off[k],wk,dt);this.off[k]=r[0];this.pv[k]=r[1];}
      this.pos=add(car.p,this.off);
      this.pos=this.level.camCollide(this.pos,[car.p[0],car.p[1]+.9,car.p[2]]);
      const at=[car.p[0]+h[0]*2.6,car.p[1]+.62,car.p[2]+h[2]*2.6];
      out.pos=this.pos.slice();out.fwd=norm(sub(at,out.pos));out.up=[0,1,0];
      out.fov=(far?1.0:1.12)+clamp(sp*.0035,0,.28);
    }else if(mode==='hood'||mode==='bumper'||mode==='cockpit'){
      const p=mode==='hood'?body(.75,1.02,0):mode==='bumper'?body(2.32,.42,0):body(-.27,1.12,-.38);
      /* a little give in the mount so bumps don't shake the whole picture */
      if(!this.fq||cut)this.fq={F,U};
      const k=1-Math.exp(-dt*(mode==='cockpit'?14:22));this.fq.F=norm(madd(this.fq.F,sub(F,this.fq.F),k));this.fq.U=norm(madd(this.fq.U,sub(U,this.fq.U),k));
      out.pos=p;out.fwd=this.fq.F;out.up=this.fq.U;out.near=mode==='cockpit'?.06:.12;
      out.fov=mode==='cockpit'?1.2:1.08+clamp(sp*.003,0,.22);out.lensRain=mode==='bumper'?1:mode==='hood'?.6:0;
      this.pos=null;this.yaw=null;
    }else{
      /* TV: cameras beside the road ahead of the car, switching as it passes */
      const spot=this.level.tvSpot(car,this.tv);if(!this.tv||spot.id!==this.tv.id){this.tv=spot;out.cut=true;}
      out.pos=this.tv.pos;const at=[car.p[0],car.p[1]+.3,car.p[2]];out.fwd=norm(sub(at,out.pos));out.up=[0,1,0];
      const dd=len(sub(at,out.pos));out.fov=clamp(2*Math.atan(6/dd),.18,1.1);
      this.pos=null;this.yaw=null;
    }
    if(this.shake>.001&&out.pos){const s=this.shake*.05;out.pos=[out.pos[0]+(Math.random()-.5)*s,out.pos[1]+(Math.random()-.5)*s,out.pos[2]+(Math.random()-.5)*s];}
    return out;
  }
}
