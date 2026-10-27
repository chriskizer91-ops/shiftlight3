/* =====================================================================================
   TRAFFIC — the everyday cars of Shift City.
   Every car follows the lane graph (world/lanes.js) with its own driver: how hard it pulls
   away and brakes, the gap it keeps, how much over the limit it drives (an Intelligent Driver
   Model with a personality). Drivers stop for red, go on green, run an amber they can't stop
   for, and only enter an intersection when nothing crossing their path is in it and there is
   room on the other side. They take exits and ramps, change lanes on the expressway to get
   past slow cars, signal their turns, and brake (and honk) for you.
   Far away a car is a point moving along its lane. Near you it is a full Vehicle, the same
   physics as yours, steered along its lane by the same driver, so a bump pushes it, a hard
   hit spins it, and the wreck stays where it stopped.
   ===================================================================================== */
import {Vehicle} from '../physics/vehicle.js';
import {qmat,mcol,qlook,qaxis,qmul,clamp,dot} from '../physics/math3.js';
import {CHASSIS,trafficSpec} from './cars.js';
import {wheelLayout} from './carview.js';
import {buildLanes,signalState} from '../world/lanes.js';
import {DESIGNS} from '../render/designs.js';
import {TRAFFIC_PAINTS,TAXI_PAINT} from '../render/car.js';
import {carContact,carBox} from '../physics/carcontact.js';

const KINDS=[['meridian',.34],['pip',.3],['courier',.14],['taxi',.22]];
const DYN_IN=70,DYN_OUT=95,MAX_DYN=14,PHYS_DT=1/120;
const SPAWN_MIN=160,SPAWN_MAX=340,DESPAWN=400,LOOK=130;
const wrapPos=(d,L)=>((d%L)+L)%L;

function rngf(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export class Traffic{
  constructor(level,{count=56,seed=7}={}){
    this.level=level;this.M=level.M;this.world=level.world;this.G=buildLanes(level.M);
    this.R=rngf(seed);this.count=count;this.cars=[];this.nextId=1000;this.time=0;this.acc=0;this.events=[];
    this.info={};
    for(const [k] of KINDS){const ch=CHASSIS[k],D=DESIGNS[ch.design],st=D.st;
      const dims={xF:st[st.length-1][0],xR:st[0][0],hw:Math.max(...st.map(s=>s[2])),H:Math.max(...D.gh.map(g=>g[1]))};
      this.info[k]={kind:k,ch,layout:wheelLayout(ch),dims,box:carBox(dims,ch.hcg),front:dims.xF,rear:-dims.xR,spec:trafficSpec(k)};}
    this.spawnLanes=this.G.lanes.filter(L=>L.kind!=='conn'&&L.len>24);
    this.weights(false);
    this.pool={};this.used=new Set();this.stats={dyn:0,kin:0,wreck:0,moving:0};
  }
  /* where new cars appear, by lane length; the expressway gets more when you're up on it */
  weights(onDeck){this.onDeck=onDeck;this.cum=[];let t=0;for(const L of this.spawnLanes){t+=L.len*(L.kind==='hwy'?(onDeck?7:2.5):L.kind==='ramp'?1.5:1);this.cum.push(t);}this.total=t;}
  /* ---------------- making and removing cars ---------------- */
  pickKind(){let r=this.R(),k=KINDS[0][0];for(const [id,w] of KINDS){if(r<w){k=id;break;}r-=w;}return k;}
  make(L,s){
    const R=this.R,kind=this.pickKind(),I=this.info[kind],taxi=kind==='taxi';
    const pp={a:1.2+R()*1.0+(taxi?.4:0),b:2.6+R()*1.3,T:.9+R()*.8-(taxi?.2:0),s0:1.8+R()*1.4,vf:.88+R()*.26+(taxi?.08:0),patience:2.5+R()*4};
    const c={id:this.nextId++,kind,I,lane:L,s,v:Math.min(L.speedAt(s),L.speed)*pp.vf*.8,vT:0,a:0,aCmd:0,lat:0,latV:0,plan:[],claim:null,bDec:null,mergeOk:false,
      pp,mode:'kin',veh:null,ang:R()*6,steerVis:0,pitch:0,roll:0,brake:false,ind:[0,0],indT:0,wait:0,honkT:0,stuck:0,lcT:1+R()*4,prevLane:null,
      paint:taxi?TAXI_PAINT:TRAFFIC_PAINTS[Math.floor(R()*TRAFFIC_PAINTS.length)],hint:-1,pHint:[-1,-1,-1],hitT:0,blockBy:null,view:null};
    this.ensurePlan(c);this.cars.push(c);return c;
  }
  remove(c){this.release(c);if(c.veh)this.toPool(c);const i=this.cars.indexOf(c);if(i>=0)this.cars.splice(i,1);}
  release(c){if(c.claim){c.claim.users=Math.max(0,(c.claim.users||0)-1);c.claim=null;}}
  /* somewhere on the network, between rmin and rmax from the player, not right in front of the camera */
  trySpawn(ctx,rmin,rmax){
    const P=ctx.player?ctx.player.p:[0,0,0];
    for(let k=0;k<14;k++){
      const u=this.R()*this.total;let lo=0,hi=this.cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(this.cum[m]<u)lo=m+1;else hi=m;}
      const L=this.spawnLanes[lo],s=L.closed?this.R()*L.len:6+this.R()*Math.max(1,L.len-16),a=L.at(s);
      const dx=a.x-P[0],dz=-a.y-P[2],d=Math.hypot(dx,dz);if(d<rmin||d>rmax)continue;
      if(ctx.cam&&rmin>60){const f=ctx.cam.fwd,dd=(dx*f[0]+dz*f[2])/(d||1);if(dd>.55&&d<300)continue;}
      if(this.cars.some(o=>o.lane===L&&Math.abs(L.closed?((o.s-s+L.len*1.5)%L.len)-L.len/2:o.s-s)<16))continue;
      return this.make(L,s);}
    return null;
  }
  /* ---------------- the route ---------------- */
  choose(L){const n=L.next;if(n.length<=1)return n[0];let tot=0;
    const w=n.map(x=>{const t=x.lane.turn,v=t==='S'?.62:t==='R'?.2:t==='L'?.18:.5;tot+=v;return v;});
    let r=this.R()*tot;for(let i=0;i<n.length;i++){r-=w[i];if(r<=0)return n[i];}return n[n.length-1];}
  ensurePlan(c){
    const L=c.lane;
    /* the nearest branch ahead (an exit, an on-ramp): decide once per approach */
    let nb=null,na=1e9;for(const b of L.branches){const ah=L.closed?wrapPos(b.s-c.s,L.len):b.s-c.s;if(ah>2&&ah<LOOK&&ah<na){na=ah;nb=b;}}
    if(nb&&(!c.bDec||c.bDec.b!==nb)){const take=c.mode!=='wreck'&&this.R()<(nb.kind==='exit'?.3:.3);c.bDec={b:nb,take};
      if(take)c.plan=[{lane:nb.to,s:nb.toS,lat:nb.lat,merge:false,at:nb.s,branch:true}];}
    if(!c.plan.length&&!L.closed&&L.next.length){const n=this.choose(L);c.plan.push({lane:n.lane,s:n.s,lat:n.lat,merge:n.merge,at:L.len});}
    if(c.plan.length===1){const N=c.plan[0].lane;if(!N.closed&&N.next.length){const n=this.choose(N);c.plan.push({lane:n.lane,s:n.s,lat:n.lat,merge:n.merge,at:N.len});}}
  }
  /* move a car onto the lane of link p */
  enter(c,p){c.plan.shift();c.lane=p.lane;c.s=p.s;c.lat+=p.lat;c.bDec=null;c.hint=-1;c.mergeOk=false;c.prevLane=null;
    if(p.lane.kind==='conn'&&c.claim!==p.lane){this.release(c);c.claim=p.lane;p.lane.users=(p.lane.users||0)+1;}
    this.ensurePlan(c);}
  /* move along the path by ds, through any joins on the way */
  advance(c,ds){
    for(let g=0;g<5;g++){const L=c.lane,p=c.plan[0];
      if(p){const ah=L.closed?wrapPos(p.at-c.s,L.len):p.at-c.s;if(ds>=ah){ds-=Math.max(0,ah);this.enter(c,p);continue;}}
      c.s=L.closed?L.wrap(c.s+ds):Math.min(c.s+ds,L.len+.5);return;}
  }
  /* a point on the car's path, dist ahead of s (map x, y, h and heading), with its lateral offset */
  pathAt(c,dist){let L=c.lane,s=c.s+dist,base=c.s;
    for(let i=0;i<3;i++){const p=c.plan[i];if(!p)break;const end=L.closed?base+wrapPos(p.at-base,L.len):p.at;
      if(s<=end)break;s=p.s+(s-end);base=p.s;L=p.lane;}
    return L.at(s);}
  /* ---------------- each frame: decide, then move the far cars ---------------- */
  update(dt,ctx){
    this.time=ctx.time;const t=ctx.time,P=ctx.player;
    /* who is on which lane, in order */
    for(const L of this.used)L.cars.length=0;this.used.clear();
    const reg=(L,c,s)=>{L.cars.push({c,s});this.used.add(L);};
    for(const c of this.cars){reg(c.lane,c,c.s);if(c.prevLane&&Math.abs(c.lat)>1)reg(c.prevLane,c,c.s/c.lane.len*c.prevLane.len);
      if(c.claim&&c.claim!==c.lane&&c.plan[0]&&c.plan[0].lane===c.claim)reg(c.claim,c,-c.I.front-1);}
    for(const L of this.used)L.cars.sort((a,b)=>a.s-b.s);
    /* claims are released once the car is clear of the intersection */
    for(const c of this.cars)if(c.claim){const C=c.claim,out=C.next[0].lane;
      if(c.lane===out){if(c.s>c.I.rear+1)this.release(c);}else if(c.lane!==C&&!(c.plan[0]&&c.plan[0].lane===C))this.release(c);}
    /* nearest cars become physical, far ones go back to the lane */
    const dist=c=>{const p=c.veh?c.veh.p:this.worldPos(c);return P?Math.hypot(p[0]-P.p[0],p[1]-P.p[1],p[2]-P.p[2]):1e9;};
    for(const c of this.cars)c.dist=dist(c);
    const near=this.cars.filter(c=>c.mode==='kin'&&c.dist<DYN_IN).sort((a,b)=>a.dist-b.dist);
    let nd=this.cars.filter(c=>c.mode!=='kin').length;
    for(const c of near){if(nd>=MAX_DYN)break;this.toDyn(c);nd++;}
    for(const c of this.cars)if(c.mode==='dyn'&&c.dist>DYN_OUT&&c.hitT<=0)this.toKin(c);
    /* decide */
    for(const c of this.cars){if(c.mode==='wreck'){c.brake=false;c.ind=[1,1];continue;}this.drive(c,dt,ctx);}
    /* the far cars move along their lanes */
    for(const c of this.cars)if(c.mode==='kin')this.kinStep(c,dt);
    /* cars far behind you go, new ones arrive ahead */
    for(const c of this.cars.slice()){
      if(c.dist>DESPAWN&&c.mode!=='dyn')this.remove(c);
      else if(c.mode==='wreck'&&c.dist>160)this.remove(c);
      else if(c.stuck>40&&c.dist>120)this.remove(c);}
    if(P){const deck=P.p[1]>6;if(deck!==this.onDeck)this.weights(deck);}
    let n=0;while(this.cars.length<this.count&&n<3){this.trySpawn(ctx,ctx.init?25:SPAWN_MIN,SPAWN_MAX);n++;}
    if(ctx.init)while(this.cars.length<this.count&&n<this.count*3){this.trySpawn(ctx,25,SPAWN_MAX);n++;}
    const S=this.stats;S.dyn=S.kin=S.wreck=S.moving=0;for(const c of this.cars){S[c.mode]++;if(c.v>1)S.moving++;}
  }
  worldPos(c){const a=c.lane.at(c.s);return [a.x+a.ty*c.lat,a.h+c.I.ch.hcg,-(a.y-a.tx*c.lat)];}
  /* the driver: the acceleration they want, the turn signals, lane changes */
  drive(c,dt,ctx){
    const L=c.lane,pp=c.pp,v=c.mode==='dyn'?Math.max(0,c.veh.vf):c.v;
    this.ensurePlan(c);
    const v0=Math.max(2,Math.min(L.speedAt(c.s+c.I.front),L.speed*pp.vf));
    /* IDM toward one obstacle: gap and its speed */
    const idm=(gap,vl)=>{const dv=v-vl,ss=pp.s0+Math.max(0,v*pp.T+v*dv/(2*Math.sqrt(pp.a*pp.b)));return -pp.a*(ss/Math.max(gap,.2))**2;};
    /* the free-road term, then the most restrictive thing ahead (another car, a stop line, a merge, you) */
    let worst=0;const obs=(gap,vl)=>{const ai=idm(gap,vl);if(ai<worst)worst=ai;return ai;};
    let a=pp.a*(1-Math.pow(v/v0,4)),block=null;
    const lead=this.leader(c);
    if(lead){obs(lead.gap,lead.v);if(lead.gap<8&&v<.5)block=lead.c;}
    /* corners and slower lanes ahead */
    c.aCurve=99;{let d=0,Lc=L,s0=c.s;for(let i=0;i<2;i++){const p=c.plan[i];if(!p)break;d+=(Lc.closed?wrapPos(p.at-s0,Lc.len):p.at-s0)-(i===0?c.I.front:0);
        const vn=Math.min(p.lane.speedAt(p.s+2),p.lane.speed*pp.vf);if(v>vn&&d<120){const ac=-(v*v-vn*vn)/(2*Math.max(d,2));c.aCurve=Math.min(c.aCurve,ac*1.1);}Lc=p.lane;s0=p.s;}}
    /* the stop line */
    const p0=c.plan[0];c.ind=[0,0];
    if(L.kind==='road'&&p0&&p0.lane.kind==='conn'){
      const conn=p0.lane,dStop=L.len-c.s-c.I.front-.6,n=this.G.nodes[L.node];
      if(conn.turn==='L'&&dStop<45)c.ind=[1,0];else if(conn.turn==='R'&&dStop<45)c.ind=[0,1];
      if(c.claim!==conn){
        const st=signalState(n,L.axis,ctx.time),near=dStop<v*1.7+7;let go=false;
        if(dStop<-.5){c.claim=conn;conn.users=(conn.users||0)+1;go=true;}   /* already over the line */
        else if(st===2&&!near)go=true;
        else if(st===2||(st===1&&v*v/(2*3.4)>dStop-.5&&dStop>-.5)){
          if(near&&this.canEnter(c,conn)){c.claim=conn;conn.users=(conn.users||0)+1;go=true;}}
        if(!go){obs(Math.max(dStop,0),0);c.waitSig=true;}else c.waitSig=false;
      }
    }
    if(L.kind==='conn'){c.ind=L.turn==='L'?[1,0]:L.turn==='R'?[0,1]:[0,0];}
    /* merging: wait for a gap */
    if(p0&&p0.merge&&!c.mergeOk){const dM=(L.closed?wrapPos(p0.at-c.s,L.len):p0.at-c.s)-c.I.front;
      if(dM<80){const T=p0.lane;let clear=true;for(const e of T.cars){const o=e.c;if(o===c)continue;const ds=T.closed?((e.s-p0.s+T.len*1.5)%T.len)-T.len/2:e.s-p0.s;
          if(ds>-(10+o.v*1.4)&&ds<9){clear=false;break;}}
        if(clear&&dM<14)c.mergeOk=true;else if(!clear)obs(Math.max(dM-1,0),0);}}
    /* you */
    const po=this.playerAhead(c,ctx);
    if(po){const ai=obs(po.gap,po.v);if(po.gap<14)block='you';if(ai<-5&&v>6)this.honk(c,ctx,.6);}
    /* the lane change on the expressway */
    if(L.kind==='hwy'&&c.mode!=='wreck')this.laneChange(c,lead,v0,dt);
    if(c.indT>0){c.indT-=dt;c.ind=c.lcDir>0?[0,1]:[1,0];}
    /* dead ends: stop at the end */
    if(!p0&&!L.closed){const d=L.len-c.s-c.I.front;obs(Math.max(d,0),0);}
    a+=worst;if(c.aCurve<a)a=c.aCurve;
    c.aCmd=clamp(a,-9,pp.a);
    c.brake=c.aCmd<-.7||v<.3;
    /* waiting, and losing patience with you */
    if(v<.3){c.wait+=dt;if(block==='you'&&c.wait>pp.patience)this.honk(c,ctx,1);}else c.wait=0;
    if(v<.2)c.stuck+=dt;else c.stuck=0;
    c.blockBy=block;
  }
  honk(c,ctx,k){if(this.time-c.honkT<3.5)return;c.honkT=this.time;const p=c.veh?c.veh.p:this.worldPos(c);this.events.push({type:'horn',p,kind:c.kind,len:.25+k*.5});}
  /* can a car enter this connector now: nothing crossing it in use, and room on the far side */
  canEnter(c,conn){
    for(const o of conn.conflicts)if(o.users>0)return false;
    const out=conn.next[0].lane;let first=1e9;for(const e of out.cars)if(e.c!==c)first=Math.min(first,e.s-e.c.I.rear);
    let need=c.I.front+c.I.rear+2;for(const e of conn.cars)if(e.c!==c)need+=e.c.I.front+e.c.I.rear+2;
    return first>need;
  }
  /* the nearest car ahead along the path */
  leader(c){
    let L=c.lane,s0=c.s,dist=0,best=null;
    for(let e=0;e<3;e++){
      for(const it of L.cars){const o=it.c;if(o===c)continue;
        let ds=L.closed?wrapPos(it.s-s0,L.len):it.s-s0;if(L.closed&&ds>L.len*.5)continue;
        if(e===0?ds<=0:ds<-o.I.front)continue;
        const gap=dist+ds-o.I.rear-c.I.front;if(!best||gap<best.gap)best={gap,v:o.mode==='dyn'?Math.max(0,o.veh.vf):o.v,c:o};}
      if(best)return best;
      const p=c.plan[e];if(!p)break;
      dist+=L.closed?wrapPos(p.at-s0,L.len):p.at-s0;if(dist>LOOK)break;
      L=p.lane;s0=p.s;}
    return best;
  }
  /* you, if you're in the way: on the path ahead within a lane's width */
  playerAhead(c,ctx){
    const P=ctx.player;if(!P||c.dist>110)return null;
    const px=P.p[0],py=-P.p[2],ph=P.p[1];let L=c.lane,s0=c.s,dist=0;
    for(let e=0;e<2;e++){
      const q=L.locate(px,py,c.pHint[e]);c.pHint[e]=q.i;
      let ds=L.closed?wrapPos(q.s-s0,L.len):q.s-s0;if(L.closed&&ds>L.len*.5)ds=-1;
      const a=L.at(Math.max(0,Math.min(L.len,q.s)));
      const lat=e===0?c.lat:0;
      if(ds>-2&&q.s>-3&&q.s<L.len+3&&Math.abs(q.d-lat)<2.9&&Math.abs(ph-P.hcg-a.h)<2.5){
        const gap=dist+ds-2.3-c.I.front,vl=(P.v[0]*a.tx-P.v[2]*a.ty);if(gap<LOOK)return {gap,v:vl};}
      const p=c.plan[e];if(!p)break;dist+=L.closed?wrapPos(p.at-s0,L.len):p.at-s0;if(dist>90)break;L=p.lane;s0=p.s;}
    return null;
  }
  laneChange(c,lead,v0,dt){
    c.lcT-=dt;if(c.lcT>0||Math.abs(c.lat)>.4||(c.plan[0]&&c.plan[0].branch))return;c.lcT=2+this.R()*3;
    const L=c.lane,other=L.siblings[1-L.k];if(!other)return;
    const v=c.mode==='dyn'?Math.max(0,c.veh.vf):c.v;
    let want=false;
    if(lead&&lead.gap<50&&lead.v<v0*.85)want=true;               /* get past */
    else if(L.k===0&&(!lead||lead.gap>90))want=this.R()<.45;       /* keep right */
    else if(L.k===1&&this.R()<.04)want=true;
    if(!want)return;
    const s=c.s/L.len*other.len;let ahead=1e9,behind=1e9,vb=0;
    for(const e of other.cars){const o=e.c;if(o===c)continue;const ds=((e.s-s+other.len*1.5)%other.len)-other.len/2;
      if(ds>=0){const g=ds-o.I.rear-c.I.front;if(g<ahead)ahead=g;}else{const g=-ds-o.I.front-c.I.rear;if(g<behind){behind=g;vb=o.v;}}}
    if(ahead<Math.max(12,v*.8)||behind<Math.max(10,vb*.7+(vb-v)*2.5))return;
    const p=this.worldPos(c),q=other.locate(p[0],-p[2],-1);
    c.prevLane=L;c.lane=other;c.s=q.s;c.lat=q.d;c.latV=0;c.plan=[];c.bDec=null;c.hint=-1;c.lcDir=q.d<0?1:-1;c.indT=2.6;this.ensurePlan(c);
  }
  /* ---------------- a car that is just a point on its lane ---------------- */
  kinStep(c,dt){
    c.v=Math.max(0,c.v+c.aCmd*dt);c.a=c.aCmd;this.advance(c,c.v*dt);
    c.latV+=(-3.2*c.lat-3.5*c.latV)*dt;c.lat+=c.latV*dt;if(Math.abs(c.lat)<.01&&Math.abs(c.latV)<.01){c.lat=0;c.latV=0;c.prevLane=null;}
    c.ang+=c.v/c.I.ch.R*dt;
    const a0=c.lane.at(c.s),a1=this.pathAt(c,4),th0=Math.atan2(a0.ty,a0.tx),th1=Math.atan2(a1.ty,a1.tx);let dth=th1-th0;dth=Math.atan2(Math.sin(dth),Math.cos(dth));const k=dth/4;
    const kq=Math.min(1,dt*5);c.steerVis+=(-Math.atan(c.I.ch.wb*k)-c.steerVis)*kq;
    c.pitch+=(clamp(c.aCmd*.007,-.045,.025)-c.pitch)*kq;c.roll+=(clamp(c.v*c.v*k*.007,-.05,.05)-c.roll)*kq;
  }
  kinPose(c,vis=true){
    const a=c.lane.at(c.s),x=a.x+a.ty*c.lat,y=a.y-a.tx*c.lat,yaw=Math.atan2(a.ty,a.tx)-Math.atan2(c.latV,Math.max(c.v,3));
    let q=qlook([Math.cos(yaw),a.slope,-Math.sin(yaw)],[0,1,0]);if(vis){q=qmul(q,qaxis([0,0,1],c.pitch));q=qmul(q,qaxis([1,0,0],c.roll));}
    return {p:[x,a.h+c.I.ch.hcg,-y],q,yaw};
  }
  /* ---------------- near you: a real car ---------------- */
  getVeh(kind){const P=this.pool[kind]||(this.pool[kind]=[]);if(P.length)return P.pop();
    const I=this.info[kind],v=new Vehicle(I.ch,I.spec,this.world);v.setAssists('ai');v.pt.eco=true;v.pt.auto=true;return v;}
  toPool(c){const v=c.veh;c.veh=null;(this.pool[c.kind]||(this.pool[c.kind]=[])).push(v);}
  toDyn(c){
    const V=this.getVeh(c.kind),ps=this.kinPose(c,false),R=c.I.ch.R,e=V.pt.e;
    V.q=ps.q;V.p=ps.p;const F=mcol(qmat(V.q),0);V.v=[F[0]*c.v,F[1]*c.v,F[2]*c.v];V.w=[0,0,0];V.hint=-1;V.rev=false;V.revT=0;V.drift.on=false;V.takeEvents();
    for(const w of V.wheels){w.w=c.v/R;w.hint=-1;w.len=c.I.layout[w.i].len;w.comp=V.c.susp.rest-w.len;w.disc=0;}
    /* the engine running in a gear that suits the speed */
    const pt=V.pt;pt.st='run';pt.rev=false;pt.hold=false;pt.launching=false;pt.shiftT=0;pt.thr=0;let g=1;
    for(let k=e.nG;k>=1;k--){const rpm=c.v/R*e.gears[k-1]*e.fd*60/(2*Math.PI);if(rpm>e.idle*1.4){g=k;break;}}
    pt.gear=g;const we=c.v/R*e.gears[g-1]*e.fd;pt.we=Math.max(we,e.idle*2*Math.PI/60);pt.rpm=pt.we*60/(2*Math.PI);pt.engage=c.v>1?1:0;pt.locked=c.v>1;pt.sinceShift=1;
    c.veh=V;c.mode='dyn';c.vT=c.v;c.hint=-1;
  }
  toKin(c){const V=c.veh,q=c.lane.locate(V.p[0],-V.p[2],c.hint);c.s=c.lane.closed?c.lane.wrap(q.s):clamp(q.s,0,c.lane.len);c.lat=q.d;c.latV=0;c.v=Math.max(0,V.vf);this.toPool(c);c.mode='kin';}
  /* the physical cars: steer along the path, drive to the wanted speed, collide */
  stepPhysics(dt,player){
    this.acc+=dt;
    while(this.acc>=PHYS_DT){this.acc-=PHYS_DT;const h=PHYS_DT;
      const dyn=this.cars.filter(c=>c.veh);
      for(const c of dyn){const V=c.veh;V.wet=this.wet||0;V.step(h,c.mode==='wreck'?{steer:0,thr:0,brk:.4,hb:0}:this.controls(c,h));}
      /* contacts: car with car, and with you */
      const bodies=dyn.map(c=>({veh:c.veh,box:c.I.box,c}));
      if(player&&player.veh)bodies.push({veh:player.veh,box:player.box,you:true});
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const A=bodies[i],B=bodies[j],hit=carContact(A,B);
        if(hit>0){for(const X of [A,B])if(X.c){X.c.hitT=Math.max(X.c.hitT,hit>1.5?1.5:.4);if(hit>5.5&&(A.you||B.you))X.c.mode='wreck';}
          if(A.you||B.you){const o=A.you?B:A;this.events.push({type:'crash',speed:hit,c:o.c});if(o.c&&hit>1.2)this.honk(o.c,{},.5);
            player.veh.ev.wall=Math.max(player.veh.ev.wall,hit);}
          else if(hit>2)this.events.push({type:'crash',speed:hit,far:true});}}
      for(const c of dyn)this.track(c,h);
    }
  }
  controls(c,h){
    const V=c.veh,M=qmat(V.q),F=mcol(M,0),Rt=mcol(M,2),v=V.vf,ch=c.I.ch;
    if(c.hitT>0){c.hitT-=h;return {steer:0,thr:0,brk:.35,hb:0};}
    /* pure pursuit toward a point on the path */
    const Ld=clamp(3.5+Math.abs(v)*.5,4.5,22),t=this.pathAt(c,Ld),lat=c.lat*Math.exp(-Ld/Math.max(v,3)*1.4);
    const tx=t.x+t.ty*lat,ty=t.y-t.tx*lat,dx=tx-V.p[0],dz=-ty-V.p[2];
    const xf=dx*F[0]+dz*F[2],zr=dx*Rt[0]+dz*Rt[2],Lw=Math.max(3,Math.hypot(xf,zr)),al=Math.atan2(zr,Math.max(xf,.3));
    const delta=Math.atan(2*ch.wb*Math.sin(al)/Lw),steer=clamp(delta*(1+Math.abs(v)/45)/ch.lock,-1,1);
    /* speed: the acceleration the driver wants, fed forward, plus a little correction toward the speed they meant to be doing */
    const a=c.aCmd;c.vT=clamp(c.vT+a*h,Math.max(0,v-2),v+2);if(a<=0)c.vT=Math.min(c.vT,v+.3);
    const e=c.vT-v;let thr=0,brk=0;
    if(a>.05&&e>-.6)thr=clamp(.1+a*.3+e*.4,0,1);
    if(a<-.15||e<-.6){brk=clamp(-a/8.5+Math.max(0,-e-.6)*.2,0,1);thr=0;}
    if(v<1.4)brk=Math.min(brk,.45);
    if(c.vT<.3&&v<.6){thr=0;brk=.4;}
    return {steer,thr,brk,hb:0};
  }
  /* where the physical car has got to along its lane; spun or pushed off it, it's a wreck */
  track(c,h){
    const V=c.veh,L=c.lane,q=L.locate(V.p[0],-V.p[2],c.hint);c.hint=q.i;
    let ds=L.closed?((q.s-c.s+L.len*1.5)%L.len)-L.len/2:q.s-c.s;
    if(ds>0)this.advance(c,ds);
    c.v=Math.max(0,V.vf);c.lat+=(-c.lat*1.6)*h;if(Math.abs(c.lat)<.02)c.prevLane=null;
    c.ang=0;
    if(c.mode==='wreck')return;
    const a=c.lane.at(c.s),M=qmat(V.q),F=mcol(M,0),U=mcol(M,1),hd=Math.atan2(-F[2],F[0])-Math.atan2(a.ty,a.tx),he=Math.abs(Math.atan2(Math.sin(hd),Math.cos(hd)));
    const err=Math.abs(q.d-c.lat);
    if(U[1]<.45||(c.hitT<=0&&(err>4.5||(he>1.1&&V.speed>1))))c.mode='wreck',this.release(c);
  }
  /* ---------------- what the renderer and the audio need ---------------- */
  views(ctx){
    const out=[],night=ctx.night>.3;
    for(const c of this.cars){if(c.dist>430)continue;
      let v=c.view;if(!v){v=c.view={id:c.id,design:c.I.ch.design,paint:c.paint,lamps:[0,0,0,0],ind:[0,0],wheels:c.I.layout.map(w=>({hp:w.hp,len:w.len,steer:0,ang:0,disc:0}))};}
      if(c.veh){const V=c.veh;v.p=V.p;v.q=V.q;V.wheels.forEach((w,i)=>{const o=v.wheels[i];o.hp=w.hp;o.len=w.len;o.steer=w.front?V.steer:0;o.ang=w.ang;o.disc=w.disc;});}
      else{const ps=this.kinPose(c);v.p=ps.p;v.q=ps.q;v.wheels.forEach((o,i)=>{o.hp=c.I.layout[i].hp;o.len=c.I.layout[i].len;o.steer=c.I.layout[i].front?c.steerVis:0;o.ang=c.ang;o.disc=0;});}
      v.lamps[0]=night?1:0;v.lamps[1]=night?1:0;v.lamps[2]=c.brake&&c.mode!=='wreck'?1:0;v.lamps[3]=0;
      v.ind=c.mode==='wreck'?[1,1]:c.ind;out.push(v);}
    return out;
  }
  /* real light from the nearest cars' headlamps at night */
  lights(ctx,n=5){
    if(ctx.night<.3)return [];const cam=ctx.cam.pos,out=[];
    const list=this.cars.filter(c=>c.dist<120).map(c=>{const v=c.view;if(!v||!v.p)return null;const d=Math.hypot(v.p[0]-cam[0],v.p[2]-cam[2]);return {c,v,d};}).filter(Boolean).sort((a,b)=>a.d-b.d).slice(0,n);
    for(const {c,v} of list){const M=qmat(v.q),F=mcol(M,0),U=mcol(M,1),h=c.I.ch.hcg,f=c.I.front-.1;
      const pos=[v.p[0]+F[0]*f+U[0]*(.68-h),v.p[1]+F[1]*f+U[1]*(.68-h),v.p[2]+F[2]*f+U[2]*(.68-h)];
      out.push({pos,r:30,col:[150,145,128],type:1,dir:[F[0]-U[0]*.08,F[1]-U[1]*.08-.04,F[2]-U[2]*.08],cosO:Math.cos(.62)});}
    return out;
  }
  takeEvents(){const e=this.events;this.events=[];return e;}
}
