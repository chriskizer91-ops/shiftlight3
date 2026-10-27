/* =====================================================================================
   DRAG — a quarter mile down Shift City's Main Avenue, eastbound, with the side streets
   closed. You in the left lane, an opponent in the right.
   Stage by holding the brake (add throttle to build revs: launch control holds them).
   A pro tree: the ambers all light, the green comes 0.4 s later; let go of the brake on the
   green. Let go before it and that's a red light. Reaction time runs from the green to your
   release; elapsed time from when your front wheels leave the line. Splits at 60 ft, 330 ft,
   1/8 mile, 1000 ft and the quarter, trap speed over the last 66 ft.
   ===================================================================================== */
import {Vehicle} from '../physics/vehicle.js';
import {qaxis,qmat,mcol,clamp} from '../physics/math3.js';
import {RIVALS} from './race.js';
import {wheelLayout} from './carview.js';
import {PAINTS} from '../render/car.js';

export const STRIP={x0:-300,len:402.336,lanes:[-2.9,-6.3]};
const FT=.3048,SPLITS=[['60 ft',60*FT],['330 ft',330*FT],['1/8 mile',201.168],['1000 ft',1000*FT],['1/4 mile',402.336]];
const TRAP=66*FT;

export class DragEvent{
  /* opp: {chassis, spec} for the other lane; rt: the opponent's typical reaction time */
  constructor(level,car,{opp,rt=.25,seed=Date.now()&0xffff}={}){
    this.level=level;this.car=car;this.phase='stage';this.t=0;this.events=[];this.done=false;this.greenT=-1;this.amberT=-1;this.foul=false;
    let r=seed;const R=()=>{r=(r*16807)%2147483647;return r/2147483647;};this.R=R;
    const P=RIVALS[Math.floor(R()*RIVALS.length)];
    this.opp=new Vehicle(opp.chassis,opp.spec,level.world);this.opp.setAssists('arcade');this.opp.pt.auto=true;
    this.oppInfo={name:P.name,paint:PAINTS[P.paint]||PAINTS.silver,caliper:P.caliper,rt:Math.max(.08,rt+(R()-.5)*.12),layout:wheelLayout(opp.chassis)};
    this.runners=[{car,you:true,name:'YOU'},{car:this.opp,you:false,name:P.name}].map((x,i)=>Object.assign(x,{lane:STRIP.lanes[i],t0:-1,rt:null,splits:[],trapIn:-1,trap:null,fin:-1,prevX:null}));
    for(const x of this.runners)this.place(x);
    this.delay=.7+R()*.9;this.staged=0;
  }
  place(x){const c=x.car,w=this.level.world,X=STRIP.x0-(c.c.body.L/2-.06)-.15,g=w.ground(X,-x.lane,-1,50);
    c.q=qaxis([0,1,0],0);c.p=[X,g.y+c.c.hcg,-x.lane];c.v=[0,0,0];c.w=[0,0,0];c.hint=-1;for(const wh of c.wheels){wh.w=0;wh.hint=-1;}
    c.pt.start();c.pt.st='run';c.pt.gear=1;c.pt.shiftT=0;c.pt.engage=0;c.pt.locked=false;c.rev=false;c.pt.rev=false;c.drift.on=false;}
  front(c){const F=mcol(qmat(c.q),0);return c.p[0]+F[0]*(c.c.body.L/2-.06);}
  get held(){return this.phase==='stage'||this.phase==='tree';}
  get kind(){return 'drag';}
  others(){return [{car:this.opp,id:'drag-'+this.oppInfo.name,name:this.oppInfo.name}];}
  /* your car: held still on the line (brake as handbrake so it doesn't select reverse) until you let go */
  gate(inp){
    this.inBrk=inp.brk||0;
    const you=this.runners[0];
    if(this.phase==='stage'||this.phase==='tree'){
      const holding=this.inBrk>.5;
      if(this.phase==='tree'&&!holding&&!this.foul){this.foul=true;you.rt=-1;this.events.push({type:'msg',text:'RED LIGHT',col:'#ff3d5a'});}
      if(!this.foul)return (inp.thr||0)>.3?{steer:inp.steer||0,thr:inp.thr,brk:1,hb:0}:{steer:inp.steer||0,thr:inp.thr||0,brk:.45,hb:1};
    }
    return inp;
  }
  opponentInputs(){const c=this.opp,x=this.runners[1];
    if(this.phase==='stage'||this.phase==='tree'||(this.phase==='run'&&this.t<x.rtPlan))return {steer:0,thr:.85,brk:1,hb:0};
    /* lane keeping: aim down the lane */
    const M=qmat(c.q),F=mcol(M,0),Rt=mcol(M,2),tx=c.p[0]+30,tz=-x.lane,dx=tx-c.p[0],dz=tz-c.p[2],steer=clamp((dx*Rt[0]+dz*Rt[2])/Math.hypot(dx,dz)*1.6,-.4,.4);
    if(x.fin>0)return {steer,thr:0,brk:c.vf>2?.5:.2,hb:0};
    return {steer,thr:1,brk:0,hb:0};}
  stepPhysics(dt){this.opp.step(dt,this.opponentInputs());}
  update(dt,time){
    this.t+=dt;const you=this.runners[0];
    if(this.phase==='stage'){if(this.inBrk>.5)this.staged+=dt;else this.staged=0;
      if(this.staged>.6){this.phase='tree';this.t=0;this.events.push({type:'beep',f:520,len:.08});}}
    else if(this.phase==='tree'){
      if(this.amberT<0&&this.t>this.delay){this.amberT=time;this.events.push({type:'beep',f:760,len:.12});}
      if(this.amberT>0&&time-this.amberT>=.4){this.greenT=this.amberT+.4;this.phase='run';this.t=time-this.greenT;this.runners[1].rtPlan=this.oppInfo.rt;this.runners[1].rt=this.oppInfo.rt;this.events.push({type:'beep',f:1320,len:.3});}}
    if(this.phase==='run'&&!this.foul&&you.rt===null&&this.inBrk<.3){you.rt=time-this.greenT;}
    /* timing */
    for(const x of this.runners){const f=this.front(x.car),d=f-STRIP.x0;
      if(x.prevX!==null){
        const cross=(m)=>x.prevX<m&&d>=m?time-dt*(d-m)/Math.max(1e-6,d-x.prevX):null;
        if(x.t0<0){const c=cross(0);if(c!==null){x.t0=c;if(x.rt===null)x.rt=this.greenT>0?Math.max(0,c-this.greenT):0;}}
        else{for(let k=x.splits.length;k<SPLITS.length;k++){const c=cross(SPLITS[k][1]);if(c===null)break;x.splits.push({name:SPLITS[k][0],t:c-x.t0,v:x.car.speed});}
          const ti=cross(STRIP.len-TRAP);if(ti!==null)x.trapIn=ti;
          if(x.fin<0&&x.splits.length===SPLITS.length){x.fin=time;x.trap=TRAP/Math.max(1e-3,x.splits[SPLITS.length-1].t+x.t0-x.trapIn);
            this.events.push({type:'finish',you:x.you});}}}
      x.prevX=d;x.dist=Math.max(0,d);}
    if(this.phase==='run'){
      const all=this.runners.every(x=>x.fin>0),tooLong=this.t>30;
      if((all&&time-Math.max(...this.runners.map(x=>x.fin))>2.5)||tooLong||(you.fin>0&&time-you.fin>6)){this.phase='done';this.done=true;}}
  }
  /* who won: reaction plus elapsed, a red light loses */
  total(x){if(x.splits.length<SPLITS.length)return Infinity;return (x.rt||0)+x.splits[SPLITS.length-1].t;}
  rank(){const [y,o]=this.runners;if(this.foul)return 0;const ty=this.total(y),to=this.total(o);if(ty===Infinity)return 0;if(ty<to)return 1;return ty-to<.5?2:3;}
  hud(time){const [y,o]=this.runners,el=x=>x.t0>0?(x.fin>0?x.splits[SPLITS.length-1].t:time-x.t0):0;
    return {drag:true,tree:this.phase==='stage'?0:this.phase==='tree'?(this.amberT>0?2:1):this.phase==='run'||this.phase==='done'?3:0,foul:this.foul,
      staged:this.phase!=='stage',stagePrompt:this.phase==='stage',et:el(y),rt:y.rt,you:y.dist/STRIP.len,opp:o.dist/STRIP.len,oppName:o.name,
      finished:y.fin>0,win:y.fin>0?this.rank()===1:null};}
  views(night){const c=this.opp,I=this.oppInfo;
    return [{id:300,design:this.aeroDesign||'sl3',p:c.p,q:c.q,paint:I.paint,caliper:I.caliper,wheels:c.wheels.map(w=>({hp:w.hp,len:w.len,steer:w.front?c.steer:0,ang:w.ang,disc:w.disc})),lamps:[night?1:0,night?1:0,c.brkIn>.05?1:0,0]}];}
  takeEvents(){const e=this.events;this.events=[];return e;}
  slip(){return this.runners.map(x=>({name:x.name,you:x.you,rt:x.rt,splits:x.splits,trap:x.trap,total:this.total(x)}));}
  result(){const r=this.rank(),[y,o]=this.runners,mph=v=>v?(v*2.23694).toFixed(1)+' mph':'—',kmh=v=>v?(v*3.6).toFixed(0)+' km/h':'';
    const et=x=>x.splits.length===SPLITS.length?x.splits[SPLITS.length-1].t:null;
    const rows=[];for(const x of this.runners){rows.push(`${x.name}   RT ${x.rt===null||x.rt<0?'—':x.rt.toFixed(3)}`+(x.you&&this.foul?'  RED LIGHT':''));
      for(const s of x.splits)rows.push(`   ${s.name.padEnd(9,' ')} ${s.t.toFixed(3)} s`);rows.push(`   trap  ${mph(x.trap)}  ${kmh(x.trap)}`);}
    const yt=et(y);
    return {rank:r,medal:this.foul?'RED LIGHT':r===1?'WIN':'LOSS',stat:{et:yt,trap:y.trap},title:'DRAG',rows,summary:this.foul?'Red light':r===1?`You win  ·  ${yt.toFixed(3)} s @ ${mph(y.trap)}`:yt?`${o.name} wins  ·  you ran ${yt.toFixed(3)} s @ ${mph(y.trap)}`:`${o.name} wins`};}
}
