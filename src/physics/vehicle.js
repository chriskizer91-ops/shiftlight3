/* =====================================================================================
   VEHICLE — one real car, whatever the assists.
   A 6-DOF rigid body on four raycast suspensions (springs, bump/rebound dampers, bump stops,
   anti-roll bars). Each wheel has its own spin, the combined-slip tyre, its own brake. The
   powertrain drives them through the clutch, gearbox and differentials. Aero drag and
   downforce, rolling resistance. Body corners collide with barriers and the ground, so it can
   scrape, bounce off a wall, or roll over.

   The assists sit between the controls and that car, never inside it:
   - steering: the stick asks how hard to turn; the front wheels are aimed at the tyres' peak
     slip angle relative to where the front axle is actually travelling (that is also
     automatic countersteer)
   - stability: differential braking and a throttle trim when the car rotates past what you asked
   - drift: the handbrake kicks the rear out, then the angle you ask for is held with throttle
   - traction control and ABS, and an automatic gearbox
   ===================================================================================== */
import {clamp,lerp,sstep,sgn,add,sub,scale,madd,dot,cross,len,norm,qmat,mcol,mvec,mtvec,qint,qlook,qaxis} from './math3.js';
import {tyreForce,TYRE_DEFAULT} from './tyre.js';
import {Powertrain} from './powertrain.js';
const G=9.81,RHO=1.2;

export const ASSISTS={
  /* Arcade Easy: everything Arcade has, plus the assist layer in the car (grip, spin catch,
     keep-upright, slide-off walls) and the guide in the game (corner speed, wall avoidance) */
  easy:{id:'easy',name:'Arcade Easy',steer:1,esc:1,tc:1,abs:1,drift:1,auto:1,catchSpin:1,plus:{grip:1.15,upright:true},guide:true},
  arcade:{id:'arcade',name:'Arcade',steer:1,esc:1,tc:1,abs:1,drift:1,auto:1,catchSpin:1},
  sport:{id:'sport',name:'Sport',steer:.75,esc:.65,tc:1,abs:1,drift:0,auto:1,catchSpin:0},
  sim:{id:'sim',name:'Simulation',steer:0,esc:0,tc:0,abs:1,drift:0,auto:1,catchSpin:0},
  /* the traffic's drivers steer the wheels directly and keep stability control on */
  ai:{id:'ai',name:'AI',steer:0,esc:.8,tc:1,abs:1,drift:0,auto:1,catchSpin:0,hidden:true}
};
const SURF_MU={road:1,curb:.95,shoulder:.9,ground:.7};

/* ---- smooth motion between physics steps ----
   The physics runs at a fixed 240 Hz. A screen refreshing at 144 Hz shows a frame every 1.67 steps, so
   without help the car would move one step on some frames and two on others: a steady micro-stutter
   that no graphics setting fixes. Each step remembers where the car started; just for drawing, the
   pose is blended between that and the latest step by how far the clock has run past it (alpha), and
   put back right after. interpolateVehicles(alpha) before drawing, restoreVehicles() after. */
const LIVE=new Set();let ipGen=0;
export function interpolateVehicles(alpha){ipGen++;const a=alpha<0?0:alpha>1?1:alpha;
  for(const v of LIVE){if(ipGen-v._ipGen>3||!v._pp||!v._pp.ok){LIVE.delete(v);continue;}v._ipApply(a);}}
export function restoreVehicles(){for(const v of LIVE)v._ipRestore();}

export class Vehicle{
  constructor(chassis,spec,world){
    const c=chassis;this.c=c;this.spec=spec;this.world=world;
    this.m=c.mass||spec.mass;const L=c.body.L,Wd=c.body.W,H=c.body.H,m=this.m;
    /* inertia about body X (roll), Y (yaw), Z (pitch) */
    this.I=[m*(Wd*Wd+H*H)/12,m*(L*L+Wd*Wd)/12*1.05,m*(L*L+H*H)/12];
    const a=c.wb*(1-c.wf),b=c.wb*c.wf;this.a=a;this.b=b;
    /* hardpoints placed so the car sits at its design ride height under its own weight */
    const s=c.susp,c0F=m*G*c.wf/2/s.kF,c0R=m*G*(1-c.wf)/2/s.kR;
    const hpF=-c.hcg+c.R+s.rest-c0F,hpR=-c.hcg+c.R+s.rest-c0R;
    this.wheels=[[a,hpF,-c.trackF/2,1],[a,hpF,c.trackF/2,1],[-b,hpR,-c.trackR/2,0],[-b,hpR,c.trackR/2,0]].map(([x,y,z,f],i)=>({
      i,hp:[x,y,z],front:!!f,left:z<0,k:f?s.kF:s.kR,cb:f?s.cbF:s.cbR,cr:f?s.crF:s.crR,
      w:0,ang:0,steer:0,comp:f?c0F:c0R,len:s.rest,Fz:0,contact:false,cp:[0,0,0],n:[0,1,0],hpW:[0,0,0],f:[1,0,0],r:[0,0,1],
      kap:0,tanA:0,Fx:0,Fy:0,Kd:0,sg:0,slipV:0,vl:0,surf:'road',hint:-1,Tb:0,disc:0,temp:.45,escBrake:0}));
    this.tyre=Object.assign({},TYRE_DEFAULT,c.tyre,{fz0:m*G/4});
    this.pt=new Powertrain(spec,{drive:spec.drv||'RWD',clutch:spec.tq*(2.2+spec.fiBoost*.9),engage:.22,diff:c.diff,Iw:c.Iw,R:c.R,mu:this.tyre.mu});
    /* body hull points for barrier and ground contacts (body frame) */
    const hx=L/2-.06,hz=Wd/2-.02,yb=-c.hcg+.16,ym=-c.hcg+.55,yt=-c.hcg+H-.04;
    this.hull=[];for(const x of [hx,hx*.45,-hx*.45,-hx])for(const z of [-hz,hz])this.hull.push([x,yb,z*(Math.abs(x)>hx*.9?.9:1)],[x,ym,z]);
    for(const x of [hx*.45,-hx*.6])for(const z of [-hz*.78,hz*.78])this.hull.push([x,yt,z]);
    this.hull.push([hx+.04,ym-.05,0],[-hx-.04,ym,0]);
    this.p=[0,0,0];this.q=[0,0,0,1];this.v=[0,0,0];this.w=[0,0,0];
    this.steer=0;this.hint=-1;this.loc=null;this.air=true;this.airT=0;this.speed=0;this.vf=0;this.beta=0;
    this.aid=ASSISTS.arcade;this.wet=0;
    this.drift={on:false,dir:0,t:0,low:0};
    this.ev={wall:0,land:0,scrape:0,ground:0};
    this.rev=false;this.revT=0;this.escOn=false;this.absOn=false;this.assistTorque=0;
    /* the arcade assist layer (null = off): more grip, no throttle-drift entry, an earlier spin
       catch, a keep-upright force, and walls that let you slide off them */
    this.plus=null;
    this.TY={fx:0,fy:0,dk:0,sg:0};this.acc=[0,0,0];this.accB=[0,0,0];
    this.setAssists('arcade');
  }
  /* put the car at rest on the track at (s, d), facing along it */
  placeOnTrack(T,s,d=0){
    if(this._pp)this._pp.ok=false;
    const fr=T.frame(s),p=T.pos(s,d);this.q=qlook(fr.f,fr.u);
    this.p=madd(p,fr.u,this.c.hcg);this.v=[0,0,0];this.w=[0,0,0];this.hint=-1;
    for(const wh of this.wheels){wh.w=0;wh.hint=-1;}
    this.pt.gear=1;this.pt.shiftT=0;this.pt.engage=0;this.pt.locked=false;this.rev=false;this.pt.rev=false;this.drift.on=false;
  }
  place(p,yaw){if(this._pp)this._pp.ok=false;this.q=qaxis([0,1,0],yaw);this.p=[p[0],p[1]+this.c.hcg,p[2]];this.v=[0,0,0];this.w=[0,0,0];for(const wh of this.wheels){wh.w=0;}}
  setAssists(id){this.aid=ASSISTS[id]||ASSISTS.arcade;this.pt.auto=!!this.aid.auto;this.plus=this.aid.plus||null;}
  /* invert the world-space inertia: I_w^-1 * x */
  invI(M,x){const b=mtvec(M,x);return mvec(M,[b[0]/this.I[0],b[1]/this.I[1],b[2]/this.I[2]]);}

  /* inp: {steer -1..1 (+right), thr 0..1, brk 0..1, hb 0..1, nos bool} */
  /* remember where this step starts, for drawing between steps */
  _ipSave(){
    if(this._ipT)this._ipRestore();
    let P=this._pp;if(!P)P=this._pp={p:[0,0,0],q:[0,0,0,1],ang:[0,0,0,0],len:[0,0,0,0],steer:0,ok:false};
    for(let k=0;k<3;k++)P.p[k]=this.p[k];for(let k=0;k<4;k++)P.q[k]=this.q[k];
    this.wheels.forEach((w,i)=>{P.ang[i]=w.ang;P.len[i]=w.len;});P.steer=this.steer;P.ok=true;
    this._ipGen=ipGen;LIVE.add(this);
  }
  _ipApply(a){
    const P=this._pp,p=this.p,q=this.q,W=this.wheels;
    if(this._ipT)this._ipRestore();
    /* a teleport (a reset, a new grid slot) isn't motion: draw it where it is */
    const dx=p[0]-P.p[0],dy=p[1]-P.p[1],dz=p[2]-P.p[2];if(dx*dx+dy*dy+dz*dz>9)return;
    const T=this._ipT||(this._ipBuf=this._ipBuf||{pv:[0,0,0],qv:[0,0,0,0],ang:[0,0,0,0],len:[0,0,0,0]});this._ipT=T;
    T.p=p;T.q=q;T.steer=this.steer;for(let k=0;k<3;k++)T.pv[k]=p[k];for(let k=0;k<4;k++)T.qv[k]=q[k];W.forEach((w,i)=>{T.ang[i]=w.ang;T.len[i]=w.len;});
    for(let k=0;k<3;k++)p[k]=P.p[k]+(p[k]-P.p[k])*a;
    const sg=P.q[0]*q[0]+P.q[1]*q[1]+P.q[2]*q[2]+P.q[3]*q[3]<0?-1:1;let n=0;
    for(let k=0;k<4;k++){q[k]=P.q[k]*(1-a)+q[k]*sg*a;n+=q[k]*q[k];}n=1/Math.sqrt(n||1);for(let k=0;k<4;k++)q[k]*=n;
    W.forEach((w,i)=>{w.ang=P.ang[i]+(w.ang-P.ang[i])*a;w.len=P.len[i]+(w.len-P.len[i])*a;});
    this.steer=P.steer+(this.steer-P.steer)*a;
  }
  _ipRestore(){
    const T=this._ipT;if(!T)return;this._ipT=null;
    if(this.p===T.p)for(let k=0;k<3;k++)this.p[k]=T.pv[k];
    if(this.q===T.q)for(let k=0;k<4;k++)this.q[k]=T.qv[k];
    this.wheels.forEach((w,i)=>{w.ang=T.ang[i];w.len=T.len[i];});this.steer=T.steer;
  }

  step(dt,inp){
    this._ipSave();
    const c=this.c,s=c.susp,m=this.m,R=c.R,pt=this.pt,aid=this.aid,W=this.wheels;
    let M=qmat(this.q);const U=mcol(M,1),p=this.p,v=this.v,w=this.w;
    const vb=mtvec(M,v),wb=mtvec(M,w);this.speed=len(v);this.vf=vb[0];
    this.beta=Math.atan2(vb[2],Math.max(Math.abs(vb[0]),.5));
    this.loc=this.world.locate(p,this.hint);if(this.loc)this.hint=this.loc.i;
    /* ---- the driver's feet: reverse by holding the brake at a standstill, launch by holding brake and throttle ---- */
    let thr=clamp(inp.thr||0,0,1),brk=clamp(inp.brk||0,0,1);const hb=clamp(inp.hb||0,0,1);
    if(!this.rev&&Math.abs(vb[0])<.6&&brk>.5&&thr<.05){this.revT+=dt;if(this.revT>.5&&pt.running){this.rev=true;pt.rev=true;pt.gear=1;pt.shiftT=0;}}else if(!this.rev)this.revT=0;
    if(this.rev){if(thr>.1&&vb[0]>-.8){this.rev=false;pt.rev=false;this.revT=0;}else{const t=thr;thr=brk;brk=t;}}
    if(!this.rev&&Math.abs(vb[0])<.5&&brk>.5&&thr>.3&&pt.running){pt.hold=true;}
    else if(pt.hold){pt.hold=false;if(thr>.3){pt.launchW=pt.we;pt.launching=true;}}
    this.thrIn=thr;this.brkIn=brk;
    /* ---- steering ---- */
    this.steer=this._steer(dt,inp.steer||0,vb,wb);
    /* ---- suspension ---- */
    const down=[-U[0],-U[1],-U[2]];let nContact=0;
    for(const wh of W){
      const hpW=add(p,mvec(M,wh.hp));wh.hpW=hpW;
      const hit=this.world.raycast(hpW,down,s.rest+R+.3,wh.hint);
      let comp=-1;if(hit){wh.hint=hit.i;comp=s.rest-(hit.t-R);}
      if(comp<=0){wh.contact=false;wh.Fz=0;wh.comp=0;wh.len=hit?Math.min(s.rest,hit.t-R):s.rest;continue;}
      const rate=clamp((comp-wh.comp)/dt,-4,4);wh.comp=comp;wh.len=s.rest-comp;wh.contact=true;nContact++;
      let Fs=wh.k*comp+(rate>0?wh.cb:wh.cr)*rate;
      if(comp>s.travel)Fs+=(comp-s.travel)*wh.k*14+Math.max(0,rate)*wh.cb*2;
      wh.Fz=Math.max(0,Fs);wh.cp=hit.p;wh.n=hit.n;wh.surf=hit.surf;
    }
    for(const [l,r,k] of [[0,1,s.arbF],[2,3,s.arbR]]){const d=(W[l].contact?W[l].comp:0)-(W[r].contact?W[r].comp:0),f=k*d;
      if(W[l].contact)W[l].Fz=Math.max(0,W[l].Fz+f);if(W[r].contact)W[r].Fz=Math.max(0,W[r].Fz-f);}
    const wasAir=this.air;this.air=nContact===0;if(this.air)this.airT+=dt;else{if(wasAir&&this.airT>.15)this.ev.land=Math.max(this.ev.land,-vb[1]);this.airT=0;}
    /* ---- tyres ---- */
    const P=this.plus,TY=this.TY,wetMu=lerp(1,(P?.93:.84)*(this.tyre.wet||1),this.wet)*(P?P.grip:1);
    for(const wh of W){
      if(!wh.contact){wh.Fx=wh.Fy=wh.Kd=wh.kap=wh.sg=wh.slipV=0;wh.tanA=0;continue;}
      const st=wh.front?this.steer:0,fw=mvec(M,[Math.cos(st),0,Math.sin(st)]),n=wh.n;
      const f=norm(sub(fw,scale(n,dot(fw,n)))),r=norm(cross(f,n));
      const vc=add(v,cross(w,sub(wh.cp,p))),vl=dot(vc,f),vt=dot(vc,r),vn=Math.max(Math.abs(vl),2.5);
      const kap=(wh.w*R-vl)/vn,tanA=vt/vn;
      /* tyre temperature: warm tyres grip, overheated ones go greasy */
      const tg=wh.temp<.62?.92+.08*sstep(.15,.62,wh.temp):wh.temp<.85?1.02:1.02-.15*sstep(.85,1.15,wh.temp);
      tyreForce(this.tyre,wh.Fz,kap,tanA,(SURF_MU[wh.surf]||1)*wetMu*tg,TY);
      wh.Fx=TY.fx-(Math.abs(vl)>.2?.012*wh.Fz*sgn(vl):0);wh.Fy=TY.fy;wh.Kd=TY.dk*R/vn;wh.kap=kap;wh.tanA=tanA;wh.sg=TY.sg;wh.f=f;wh.r=r;wh.vl=vl;
      wh.slipV=Math.hypot(wh.w*R-vl,vt);
      wh.temp+=dt*(wh.slipV*wh.Fz/(m*G)*.02-(wh.temp-.42)*(.015+this.speed*.0008));wh.temp=clamp(wh.temp,.2,1.25);
    }
    /* ---- assists that act through the engine and brakes ---- */
    const escThr=this._stability(dt,inp,vb,wb,thr);
    /* ---- powertrain ---- */
    let fmax=0;for(const i of pt.drv){const wh=W[i];if(wh.contact){const lf=Math.max(.6,1-this.tyre.loadSens*(wh.Fz/this.tyre.fz0-1));fmax+=wh.Fz*this.tyre.mu*lf*wetMu*(SURF_MU[wh.surf]||1);}}
    pt.step(dt,{thr,brk,nos:!!inp.nos},W,{tc:aid.tc&&!this.drift.on,escThr,fmax,mass:m});
    if(pt.auto)pt.autoShift(brk,this.air,this.drift.on);
    /* ---- brakes: friction that can stop a wheel but never spin it backwards ---- */
    this.absOn=false;const hold=this.speed<.4&&thr<.05&&!this.rev&&pt.running;
    for(const wh of W){
      let Tb=brk*c.brake*(wh.front?c.bias:1-c.bias)/2;
      if(aid.abs&&brk>.1&&this.speed>2.5&&wh.kap<-.1){const k=clamp(1-(-wh.kap-.1)*7,.2,1);Tb*=k;if(k<.95)this.absOn=true;}
      if(!wh.front&&hb>0)Tb+=c.hbTorque*hb;
      Tb+=wh.escBrake;if(hold||pt.hold)Tb+=1500;
      const dw=dt*Tb/pt.effInertia(wh.i,c.Iw);
      if(Math.abs(wh.w)<=dw)wh.w=0;else wh.w-=sgn(wh.w)*dw;
      wh.Tb=Tb;wh.disc=clamp(wh.disc+dt*(Tb*Math.abs(wh.w)/9e4-wh.disc*(.08+this.speed*.004)),0,1.2);
    }
    if(hb>.5&&!pt.drv.includes(0)){pt.engage=0;pt.locked=false;}
    pt._sync(W);
    /* ---- forces on the body ---- */
    const force=[0,-m*G,0],torque=[0,0,0];
    const apply=(F,at)=>{force[0]+=F[0];force[1]+=F[1];force[2]+=F[2];const t=cross(sub(at,p),F);torque[0]+=t[0];torque[1]+=t[1];torque[2]+=t[2];};
    for(const wh of W){if(!wh.contact)continue;
      apply(scale(U,wh.Fz),wh.hpW);
      apply(add(scale(wh.f,wh.Fx),scale(wh.r,wh.Fy)),madd(wh.cp,wh.n,c.rcH));}
    const sp=this.speed,dr=.5*RHO*c.cdA*sp;apply([-v[0]*dr,-v[1]*dr,-v[2]*dr],p);
    const q2=.5*RHO*vb[0]*vb[0];apply(scale(U,-q2*c.clF),add(p,mvec(M,[this.a,0,0])));apply(scale(U,-q2*c.clR),add(p,mvec(M,[-this.b,0,0])));
    if(this.assistTorque){torque[0]+=U[0]*this.assistTorque;torque[1]+=U[1]*this.assistTorque;torque[2]+=U[2]*this.assistTorque;}
    if(P&&P.upright){/* keep the wheels down: past 12 degrees of roll a hand turns the car back; in the air it also levels the pitch */
      const F=mcol(M,0),Rt=mcol(M,2),ax=cross(U,[0,1,0]),roll=dot(ax,F),pitch=dot(ax,Rt),wr=dot(w,F),wp=dot(w,Rt);
      const ex=Math.sign(roll)*Math.max(0,Math.abs(roll)-.2),tr=(ex*28-wr*(Math.abs(roll)>.2?5:0))*this.I[0];
      const tp=this.air?(pitch*10-wp*3)*this.I[2]:0;
      for(let k=0;k<3;k++)torque[k]+=F[k]*tr+Rt[k]*tp;}
    /* ---- integrate ---- */
    for(let k=0;k<3;k++){this.acc[k]=force[k]/m;v[k]+=this.acc[k]*dt;}
    const tb=mtvec(M,torque),I=this.I,Iwb=[I[0]*wb[0],I[1]*wb[1],I[2]*wb[2]],gy=cross(wb,Iwb);
    for(let k=0;k<3;k++)wb[k]+=dt*(tb[k]-gy[k])/I[k];
    this.w=mvec(M,wb);for(let k=0;k<3;k++)p[k]+=v[k]*dt;this.q=qint(this.q,this.w,dt);
    this.accB=mtvec(M,this.acc);
    for(const wh of W)wh.ang+=wh.w*dt;
    /* ---- contacts: barriers and the ground ---- */
    this._collide(dt);
    /* rest: kill the last creep when stopped and held */
    if(hold&&this.speed<.2){for(let k=0;k<3;k++){this.v[k]*=1-Math.min(1,dt*6);this.w[k]*=1-Math.min(1,dt*6);}}
  }

  /* the steering assist: aim the front tyres at their peak slip angle relative to how the front axle is moving */
  _steer(dt,sIn,vb,wb){
    const c=this.c,aid=this.aid,lock=c.lock,vx=vb[0],v=Math.abs(vx);
    let tgt=sIn*lock/(1+v/(aid.steer>0?20:45));
    if(aid.steer>0&&vx>1.5){
      const vzF=vb[2]-wb[1]*this.a,thF=Math.atan2(vzF,Math.max(vx,.5)),aPk=this.tyre.aPk*.92;
      const assist=thF+sIn*aPk*(this.drift.on?1.35:1);
      tgt=lerp(tgt,assist,aid.steer*sstep(1.5,8,vx));
    }
    tgt=clamp(tgt,-lock,lock);
    const rate=aid.steer>0?5.5:4.2;return this.steer+clamp(tgt-this.steer,-rate*dt,rate*dt);
  }

  /* stability control, the drift helper and the spin catcher. Returns a throttle multiplier. */
  _stability(dt,inp,vb,wb,thr){
    const aid=this.aid,W=this.wheels,v=vb[0],beta=this.beta,r=wb[1],sIn=inp.steer||0,mu=this.tyre.mu;
    for(const wh of W)wh.escBrake=0;this.escOn=false;this.assistTorque=0;
    let mult=1;const Iyaw=this.I[1];
    /* ---- drift mode (arcade): the handbrake starts it, holding the stick keeps it, straightening ends it ---- */
    const D=this.drift;
    if(aid.drift){
      if(!D.on&&v>9&&((inp.hb>.5&&Math.abs(sIn)>.15)||(!this.plus&&Math.abs(beta)>.22&&thr>.6&&Math.abs(sIn)>.3))){D.on=true;D.dir=-sgn(sIn)||sgn(beta);D.t=0;D.low=0;D.bPrev=undefined;D.bd=0;}
      if(D.on){D.t+=dt;if(Math.abs(beta)<.1||sIn*D.dir>.35)D.low+=dt;else D.low=0;
        if(D.low>.35||v<6||this.air&&this.airT>.5)D.on=false;}
    }else D.on=false;
    if(D.on){
      /* left drift: dir +1, the car yaws left and the velocity sits to the right of the nose (beta > 0).
         The angle you ask for: more stick into the drift, more angle. */
      const into=Math.max(0,-sIn*D.dir),bT=(.3+.3*into)*D.dir,err=bT-beta;
      const raw=D.bPrev===undefined?0:(beta-D.bPrev)/dt;D.bPrev=beta;D.bd=(D.bd||0)+(raw-(D.bd||0))*.25;
      /* a hidden hand on the yaw: pull the angle toward the target and damp how fast it changes */
      this.assistTorque=clamp((6*err-2.5*D.bd)*Iyaw,-5*Iyaw,5*Iyaw)*Math.min(1,.3+D.t*3);
      /* and the throttle: too much angle, ease off so the rear bites; too little, let it spin */
      return clamp(.55+2.5*err*D.dir,.1,1);
    }
    if(v<4)return 1;
    /* ---- stability control: differential braking when rotating past what was asked for ---- */
    if(aid.esc>0){
      const rMax=Math.min(mu*G/Math.max(v,1),v*Math.tan(this.c.lock)/this.c.wb),rRef=-sIn*rMax;
      const lim=.07+.22*(1-aid.esc),over=Math.abs(beta)-lim;
      const yawErr=r-rRef;
      if(over>0&&Math.sign(r)===Math.sign(beta)&&Math.abs(r)>.05){
        /* rotating left too much -> brake the right front, and the other way round */
        const k=clamp(over*6,0,1)*aid.esc,front=r>0?W[1]:W[0];front.escBrake=2400*k;this.escOn=true;mult=Math.min(mult,clamp(1-over*4*aid.esc,.15,1));
      }else if(Math.abs(yawErr)>.15&&Math.abs(r)>Math.abs(rRef)+.15&&Math.sign(r)===Math.sign(rRef||r)){
        const k=clamp((Math.abs(r)-Math.abs(rRef)-.15)*2,0,1)*aid.esc,front=r>0?W[1]:W[0];front.escBrake=1500*k;this.escOn=k>.05;
      }
    }
    /* ---- the spin catcher (arcade): past ~45 degrees a hidden hand stops the rotation ---- */
    if(aid.catchSpin&&Math.abs(beta)>.6&&v>6){const k=clamp((Math.abs(beta)-.6)*2.5,0,1);this.assistTorque=-r*Iyaw*6*k;}
    if(this.plus&&Math.abs(beta)>.3&&v>5&&Math.sign(r)===Math.sign(beta)){const k=clamp((Math.abs(beta)-.3)*3,0,1);this.assistTorque=-r*Iyaw*7*k;mult=Math.min(mult,1-.5*k);}
    return mult;
  }

  /* barrier and ground contacts on the hull: impulses with restitution and friction */
  _collide(dt){
    const M=qmat(this.q),p=this.p,world=this.world;let push=[0,0,0],pushN=0;
    for(const hp of this.hull){
      const P=add(p,mvec(M,hp)),loc=world.locate(P,this.hint);
      const wc=world.wall(P,loc);if(wc&&wc.pen>0)this._impulse(M,P,wc.n,wc.pen,this.plus?.04:.18,this.plus?.05:.28,'wall'),push=madd(push,wc.n,wc.pen),pushN++;
      const g=world.ground(P[0],P[2],loc?loc.i:this.hint,P[1]);
      const pen=(g.y-P[1])*g.n[1];
      if(pen>0){this._impulse(M,P,g.n,pen,.05,.55,'ground');push=madd(push,g.n,pen);pushN++;}
    }
    if(pushN)for(let k=0;k<3;k++)this.p[k]+=push[k]/pushN;
  }
  _impulse(M,P,n,pen,e,mu,kind){
    const r=sub(P,this.p),vr=add(this.v,cross(this.w,r)),vn=dot(vr,n);
    if(vn>=0)return;
    const k=1/this.m+dot(n,cross(this.invI(M,cross(r,n)),r)),j=-(1+e)*vn/k;
    let Jv=scale(n,j);
    const vt=sub(vr,scale(n,vn)),vtl=len(vt);
    if(vtl>1e-4){const t=scale(vt,1/vtl),kt=1/this.m+dot(t,cross(this.invI(M,cross(r,t)),r)),jt=Math.min(mu*j,vtl/kt);Jv=madd(Jv,t,-jt);}
    for(let q=0;q<3;q++)this.v[q]+=Jv[q]/this.m;
    const dw=this.invI(M,cross(r,Jv));for(let q=0;q<3;q++)this.w[q]+=dw[q];
    if(kind==='wall'){this.ev.wall=Math.max(this.ev.wall,-vn);if(vtl>2)this.ev.scrape=Math.max(this.ev.scrape,vtl);}
    else this.ev.ground=Math.max(this.ev.ground,-vn);
  }
  takeEvents(){const e=this.ev;this.ev={wall:0,land:0,scrape:0,ground:0};return e;}
}
