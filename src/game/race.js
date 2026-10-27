/* =====================================================================================
   RACE — a grid of rivals on Neon Loop: start lights, laps, positions, results.
   Each rival is the same car as yours (with their own engine and paint) on the same
   physics, driven by a racer with a personality:
     pace         how close to the limit they drive
     brake        how late they brake (above 1 is later than the car really can)
     aggression   how little room they need to try a pass, how close they follow
     consistency  how rarely they make mistakes (running wide, a wobble at the limit)
     react        how quickly they get off the line
   They follow the racing line, pick a side to pass a slower car, give room beside you,
   and lean on the catch-up a little when the field spreads out.
   ===================================================================================== */
import {Vehicle} from '../physics/vehicle.js';
import {clamp,sub,dot,qmat,mcol} from '../physics/math3.js';
import {CHASSIS} from './cars.js';
import {SIM} from '../engine/engine-sim.js';
import {speedProfile} from '../world/track.js';
import {carContact,carBox} from '../physics/carcontact.js';
import {PAINTS} from '../render/car.js';

export const RIVALS=[
  {name:'VEGA',engine:'v10',paint:'silver',caliper:[.9,.75,.1],pace:1.0,aggr:.7,cons:.93,brake:1.03,react:.2},
  {name:'KOJI',engine:'rotary3',paint:'white',caliper:[.1,.4,.9],pace:.99,aggr:.4,cons:.97,brake:1.0,react:.17},
  {name:'MARLOWE',engine:'muscle',paint:'midnight',caliper:[.8,.8,.82],pace:.965,aggr:.9,cons:.82,brake:1.07,react:.3},
  {name:'SABLE',engine:'flatplane',paint:'black',caliper:[.95,.1,.1],pace:.98,aggr:.55,cons:.9,brake:1.02,react:.21},
  {name:'RIOT',engine:'blown',paint:'orange',caliper:[.05,.05,.05],pace:.96,aggr:1,cons:.72,brake:1.09,react:.34},
  {name:'JUNO',engine:'screamer',paint:'green',caliper:[.95,.85,.2],pace:.975,aggr:.3,cons:.95,brake:.98,react:.25},
  {name:'NOX',engine:'v12',paint:'violet',caliper:[.7,.7,.75],pace:.98,aggr:.6,cons:.9,brake:1.03,react:.23}
];
const EXTRA_PAINTS={violet:{name:'Violet',col:[.18,.03,.4],metal:.8,rough:.3,flake:1,roof:[.18,.03,.4]}};
/* pace: the fraction of the ideal lap (for the car you're driving) the field aims at */
export const DIFFICULTY={relaxed:{name:'Relaxed',pace:.86,mu:.9},racing:{name:'Racing',pace:.915,mu:.94},hard:{name:'Hard',pace:.965,mu:.98}};
const BOX=carBox({xF:2.25,xR:-2.30,hw:.966,H:1.28},CHASSIS.sl3.hcg);

function rngf(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export class Race{
  /* level: Neon Loop. you: the player's Vehicle. opts: {rivals, laps, difficulty, wet, seed, assists} */
  /* ref: the car the field is built to ({chassis, spec}); by default yours */
  constructor(level,you,{rivals=5,laps=3,difficulty='racing',wet=0,seed=Date.now()&0xffff,slot=3,ref=null}={}){
    this.level=level;const T=level.T;this.T=T;this.laps=laps;this.diff=DIFFICULTY[difficulty]||DIFFICULTY.racing;this.R=rngf(seed);this.wet=wet;
    const pool=RIVALS.slice();for(let i=pool.length-1;i>0;i--){const j=Math.floor(this.R()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const picks=pool.slice(0,rivals),n=rivals+1;slot=Math.min(slot,n-1);
    this.entrants=[];let ri=0;
    for(let g=0;g<n;g++){const isYou=g===slot,P=isYou?null:picks[ri++];
      const R0=ref||{chassis:you.c,spec:you.spec};
      const car=isYou?you:new Vehicle(JSON.parse(JSON.stringify(R0.chassis)),this.rivalSpec(P,R0.spec),level.world);
      const e={id:isYou?1:200+g,you:isYou,name:isYou?'YOU':P.name,P,car,grid:g,cross:0,s:0,prog:0,finished:false,time:0,best:0,lapT0:0,lastLap:0,box:BOX,
        paint:isYou?null:(PAINTS[P.paint]||EXTRA_PAINTS[P.paint]),caliper:P?P.caliper:null,state:{off:0,offT:0,err:0,errKind:null,errT:0,go:0,hint:-1}};
      if(!isYou){car.setAssists('arcade');car.pt.auto=true;e.prof=this.profile(car,P);}
      this.entrants.push(e);}
    /* engines differ a lot; the field is matched to the car you brought: each rival's pace is set
       so their ideal lap compares with yours the way the difficulty says */
    const lapT=prof=>{let t=0;for(let i=0;i<T.N;i++)t+=T.ds/Math.max(prof[i],1);return t;};
    const refCar=ref?{m:ref.chassis.mass,c:ref.chassis,spec:ref.spec,tyre:ref.chassis.tyre}:you;
    const refP=this.profile(refCar,{brake:1}),refT=lapT(refP);
    for(const e of this.entrants)if(!e.you)e.adj=lapT(e.prof)/refT;
    this.refLap=refT;
    /* and kept there: eight sectors, each with the time it should take; a rival who runs a sector
       slower or faster than that (in clean air) nudges their pace (engines' torque curves differ
       in ways a power figure doesn't capture) */
    this.NS=8;this.secT=new Float64Array(this.NS);for(let i=0;i<T.N;i++)this.secT[Math.min(this.NS-1,Math.floor(i*T.ds/T.len*this.NS))]+=T.ds/Math.max(refP[i],1);
    this.placeGrid();
    this.phase='grid';this.t=0;this.lights=0;this.goT=-1;this.outAt=4.6+this.R()*1.2;this.finishT=-1;this.events=[];this.order=this.entrants.slice();
  }
  /* a rival's engine keeps its character (and its sound) but makes about the power yours does */
  rivalSpec(P,yours){const base=SIM.PRESETS.find(q=>q.id===P.engine),mass=CHASSIS.sl3.mass,kw0=SIM.makeSpec(Object.assign({},base,{mass})).peak.kw;
    /* (their own gearbox and drivetrain, your power) */
    const k=yours.peak.kw/kw0;return SIM.makeSpec(Object.assign({},base,{mass,tq:base.tq*k}));}
  profile(car,P){const mu=car.tyre.mu*this.diff.mu*(1-.14*this.wet);
    return speedProfile(this.T,{mass:car.m,clF:car.c.clF,clR:car.c.clR,cdA:car.c.cdA,powerKw:car.spec.peak.kw},{mu,brake:mu*9.81*.92*P.brake});}
  /* two columns, staggered, behind the line */
  placeGrid(){const T=this.T;
    for(const e of this.entrants){const row=e.grid,s=T.wrapS(T.len-9-row*7.5),d=(row%2?-1:1)*2.3;e.car.placeOnTrack(T,s,d);e.car.pt.start();
      e.car.pt.st='run';e.cross=0;e.s=s;e.finished=false;e.time=0;e.best=0;e.lastLap=0;e.lapT0=0;}}
  /* the inputs during the countdown: held on the brakes, revving allowed */
  hold(inp){if(!inp)return {steer:0,thr:.65,brk:1,hb:0,nos:false};
    /* you: throttle down arms the launch; off it, the handbrake holds you (holding the brake alone would select reverse) */
    return (inp.thr||0)>.3?{steer:0,thr:inp.thr,brk:1,hb:0,nos:false}:{steer:0,thr:inp.thr||0,brk:.45,hb:1,nos:false};}
  /* ---------- the racer ---------- */
  drive(e,dt){
    const T=this.T,car=e.car,P=e.P,st=e.state,loc=car.loc;
    if(this.phase==='grid'||this.phase==='countdown')return this.hold(null);
    if(st.go<P.react){st.go+=dt;return this.hold(null);}
    if(!loc)return {steer:0,thr:0,brk:1,hb:0};
    const M=qmat(car.q),F=mcol(M,0),Rt=mcol(M,2),v=Math.max(car.vf,1),s=loc.s,d=loc.d;
    /* catch-up: a little more pace behind you, a little less far ahead */
    const you=this.entrants.find(x=>x.you),gapYou=you?e.prog-you.prog:0;
    let pace=this.diff.pace*P.pace*e.adj*(gapYou<-150?1.025:gapYou>150?.98:1);
    /* mistakes: now and then, run a corner too fast or wobble */
    if(st.errT>0)st.errT-=dt;else if(this.R()<(1-P.cons)*.07*dt*Math.min(1,v/20)){st.errKind=this.R()<.6?'wide':'wobble';st.errT=1.2+this.R()*1.4;}
    if(st.errT>0&&st.errKind==='wide')pace*=1.07;
    /* the others: follow, pass, or give room */
    const lim={l:T.wl-1.5,r:T.wr-1.5},line=T.lineAt(T.wrapS(s+v*.5));let want=0,vCap=1e9;
    for(const o of this.entrants){if(o===e||!o.car.loc)continue;const ol=o.car.loc;let ds=ol.s-s;if(ds>T.len/2)ds-=T.len;if(ds<-T.len/2)ds+=T.len;const dd=ol.d-d;
      if(ds>0&&ds<45&&Math.abs(dd)<2.4){
        const ov=o.car.vf,cv=car.vf-ov;
        if(cv>.4||ds<12){
          /* room each side of them, and which way the road turns next */
          const roomL=lim.l-ol.d,roomR=ol.d+lim.r,need=3.2-1.1*P.aggr;
          const k=T.lineK[T.idx(Math.round(T.wrapS(s+40)/T.ds))],inside=k>0?1:-1;
          let side=0;if(roomL>need&&(roomL>=roomR||inside>0&&roomL>need+.5))side=1;else if(roomR>need)side=-1;
          if(side){want=(ol.d+side*2.7)-line;st.offT=1.5;}
          else vCap=Math.min(vCap,ov+Math.max(0,ds-(5+6*(1-P.aggr)))*.6);}
        if(ds<25)st.traffic=1.5;}
      /* alongside: don't lean on them */
      if(Math.abs(ds)<5.2&&Math.abs(dd)<2.3)want+=(dd>0?-1:1)*.9;}
    if(st.offT>0)st.offT-=dt;else if(Math.abs(want)<.01)want=0;
    if(st.traffic>0)st.traffic-=dt;
    st.off+=((st.offT>0||want?want:0)-st.off)*Math.min(1,dt*1.6);
    /* steer: pure pursuit to a point on the line, moved over by the offset */
    const la=clamp(v*.7,7,38),s2=T.wrapS(s+la),dT=clamp(T.lineAt(s2)+st.off,-lim.r,lim.l),tgt=T.pos(s2,dT),dv=sub(tgt,car.p);
    const xb=dot(dv,F),zb=dot(dv,Rt),kappa=2*zb/Math.max(xb*xb+zb*zb,1);
    let steer=clamp(kappa*v*v/(car.tyre.mu*9.81)*1.05+zb*.02,-1,1);
    if(st.errT>0&&st.errKind==='wobble')steer+=Math.sin(this.t*7.3+e.grid)*.12;
    /* speed */
    const i=T.idx(Math.round(T.wrapS(s+v*.55)/T.ds)),vt=Math.min(e.prof[i]*pace,vCap),err=vt-car.vf;
    let thr=0,brk=0;if(err>0)thr=clamp(.5+err*.4,0,1);else if(err<-1)brk=clamp(-err*.2,0,1);else thr=.3;
    return {steer:clamp(steer,-1,1),thr,brk,hb:0};
  }
  /* ---------- each fixed step: drive the rivals, collide everyone ---------- */
  stepPhysics(dt,youInputs){
    for(const e of this.entrants){if(e.you)continue;e.car.wet=this.wet;e.car.step(dt,e.finished&&e.car.vf<3?{steer:0,thr:0,brk:.3,hb:0}:this.drive(e,dt));}
    const E=this.entrants;
    for(let i=0;i<E.length;i++)for(let j=i+1;j<E.length;j++){const hit=carContact({veh:E[i].car,box:BOX},{veh:E[j].car,box:BOX});
      if(hit>0){const y=E[i].you?E[i]:E[j].you?E[j]:null;if(y&&hit>.8)y.car.ev.wall=Math.max(y.car.ev.wall,hit);else if(hit>2)this.events.push({type:'crash',speed:hit,p:E[i].car.p});}}
  }
  get kind(){return 'race';}
  get held(){return this.phase==='grid'||this.phase==='countdown';}
  get done(){const y=this.entrants.find(e=>e.you);return y.finished&&(this.phase==='done'||this.lastT-this.finishT>6);}
  others(){return this.entrants.filter(e=>!e.you).map(e=>({car:e.car,id:e.P.engine,name:e.name}));}
  result(){const R=this.results(),y=R.find(r=>r.you),pos=y.pos,fmt=t=>{if(!(t>0))return '—';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};
    return {rank:pos<=3?pos:0,medal:['','1ST','2ND','3RD'][pos]||'P'+pos,stat:{best:y.best||null},title:'RACE',summary:`P${pos} of ${R.length} · best lap ${fmt(y.best)}`,
      rows:R.map(r=>({you:r.you,text:`${String(r.pos).padStart(2,' ')}  ${r.name.padEnd(9,' ')}${r.dnf?'DNF':r.pos===1?fmt(r.time):'+'+(r.gap!==null?r.gap.toFixed(3):'—')}   best ${fmt(r.best)}`}))};}
  /* what the player's car may do right now */
  gate(inp){return this.phase==='grid'||this.phase==='countdown'?this.hold(inp):inp;}
  /* ---------- each frame: the lights, laps, the order ---------- */
  update(dt,time){
    this.t+=dt;this.lastT=time;const T=this.T;
    if(this.phase==='grid'&&this.t>1.2){this.phase='countdown';this.t=0;}
    if(this.phase==='countdown'){const n=Math.min(5,Math.floor(this.t/.9));if(n>this.lights){this.lights=n;this.events.push({type:'light',n});}
      if(this.t>this.outAt){this.phase='racing';this.lights=0;this.goT=time;this.events.push({type:'go'});for(const e of this.entrants){e.lapT0=time;e.state.go=0;}}}
    for(const e of this.entrants){const loc=e.car.loc;if(!loc)continue;const s=loc.s;
      if(this.phase==='racing'&&!e.finished){
        if(e.s>T.len-40&&s<40){e.cross++;
          const tc=time-s/Math.max(e.car.vf,1);   /* when it actually crossed, between frames */
          if(e.cross>1){const lt=tc-e.lapT0;e.lastLap=lt;if(!e.best||lt<e.best)e.best=lt;}
          e.lapT0=tc;
          if(e.cross>this.laps){e.finished=true;e.time=tc-this.goT;this.events.push({type:'finish',e});if(e.you&&this.finishT<0)this.finishT=time;}}
        else if(e.s<40&&s>T.len-40&&e.cross>0)e.cross--;}
      /* sector times: the pace nudge */
      if(!e.you&&this.phase==='racing'&&!e.finished){const k=Math.min(this.NS-1,Math.floor(s/T.len*this.NS));
        if(e.sec===undefined){e.sec=k;e.secT0=time;e.secClean=false;}
        else if(k!==e.sec){if(k===(e.sec+1)%this.NS&&e.secClean&&!(e.state.traffic>0)&&!(e.state.errT>0)){
            const tgt=this.secT[e.sec]/(this.diff.pace*e.P.pace),r=(time-e.secT0)/tgt;e.adj=clamp(e.adj*Math.pow(clamp(r,.8,1.25),.45),.8,1.2);}
          e.sec=k;e.secT0=time;e.secClean=e.cross>=1&&time-this.goT>8;}
        if(e.state.traffic>0)e.secClean=false;}
      e.s=s;
      if(!e.finished)e.prog=e.cross===0?s-(s>T.len/2?T.len:0):(e.cross-1)*T.len+s;
      else e.prog=1e9-e.time;}
    this.order=this.entrants.slice().sort((a,b)=>b.prog-a.prog);
    this.order.forEach((e,i)=>e.pos=i+1);
    if(this.phase==='racing'&&this.entrants.every(e=>e.finished))this.phase='done';
    const you=this.entrants.find(e=>e.you);
    if(you&&you.finished&&this.phase==='racing'){/* everyone still running is classified when they cross the line, or 25 s after you */
      if(time-this.finishT>25){for(const e of this.entrants)if(!e.finished){e.finished=true;e.dnf=true;e.time=0;}this.phase='done';}}
  }
  /* the HUD's view of it */
  hud(time){const you=this.entrants.find(e=>e.you),T=this.T;
    return {race:true,pos:you.pos,n:this.entrants.length,lap:Math.min(this.laps,Math.max(1,you.cross)),laps:this.laps,lights:this.phase==='countdown'?this.lights:0,
      go:this.phase==='racing'&&time-this.goT<2.2,finished:you.finished,
      lapT:this.phase==='racing'&&you.cross>0&&!you.finished?time-you.lapT0:0,best:you.best,last:you.lastLap,
      tower:this.order.map(e=>{const lead=this.order[0];const gap=e===lead?null:e.finished&&lead.finished?e.time-lead.time:(lead.prog-e.prog)/Math.max(20,lead.car.vf||20);return {name:e.name,you:e.you,gap,finished:e.finished,dnf:e.dnf};})};}
  /* standings for the results screen */
  results(){const lead=this.order[0];return this.order.map((e,i)=>({pos:i+1,name:e.name,you:e.you,time:e.finished&&!e.dnf?e.time:null,gap:i&&e.finished&&!e.dnf&&lead.finished?e.time-lead.time:null,best:e.best,dnf:!!e.dnf,engine:e.P?e.car.spec.name:null}));}
  /* the rivals as the renderer wants them */
  views(night){return this.entrants.filter(e=>!e.you).map(e=>{const c=e.car;
    return {id:e.id,design:this.aeroDesign||'sl3',p:c.p,q:c.q,paint:e.paint,caliper:e.caliper,wheels:c.wheels.map(w=>({hp:w.hp,len:w.len,steer:w.front?c.steer:0,ang:w.ang,disc:w.disc})),
      lamps:[night?1:0,night?1:0,c.brkIn>.05?1:0,0]};});}
  takeEvents(){const e=this.events;this.events=[];return e;}
}
