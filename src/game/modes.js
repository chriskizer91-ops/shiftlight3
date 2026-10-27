/* =====================================================================================
   SOLO EVENTS on Neon Loop: the time trial (laps against the clock and your own ghost) and
   the drift event (a timed run for points). Same shape as a race, so the game page treats
   them all alike:
     gate(inp)  what your car may do (held on the line until the go)
     stepPhysics(dt) · update(dt, time, ctx) · hud(time) · views(night) · takeEvents()
     done · result()
   ===================================================================================== */
import {GhostRecorder,Ghost} from './ghost.js';
import {DriftScore} from './drift.js';
import {wheelLayout} from './carview.js';

const fmt=t=>{if(!(t>0))return '-:--.---';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};
export {fmt as fmtTime};

/* the start both share: standing 60 m before the line, five lights, go */
class Solo{
  constructor(level,car){this.level=level;this.T=level.T;this.car=car;this.phase='grid';this.t=0;this.lights=0;this.goT=-1;this.events=[];this.done=false;
    const T=this.T,s=T.wrapS(T.len-60);car.placeOnTrack(T,s,T.lineAt(s));car.pt.start();car.pt.st='run';}
  hold(inp){return (inp.thr||0)>.3?{steer:0,thr:inp.thr,brk:1,hb:0,nos:false}:{steer:0,thr:inp.thr||0,brk:.45,hb:1,nos:false};}
  gate(inp){return this.phase==='grid'||this.phase==='countdown'?this.hold(inp):this.phase==='done'?{steer:inp.steer,thr:0,brk:.5,hb:0}:inp;}
  get held(){return this.phase==='grid'||this.phase==='countdown';}
  stepPhysics(){}
  countdown(dt,time){
    this.t+=dt;
    if(this.phase==='grid'&&this.t>1){this.phase='countdown';this.t=0;}
    if(this.phase==='countdown'){const n=Math.min(5,Math.floor(this.t/.55));if(n>this.lights){this.lights=n;this.events.push({type:'light',n});}
      if(this.t>3.1){this.phase='run';this.lights=0;this.goT=time;this.events.push({type:'go'});return true;}}
    return false;}
  views(){return [];}
  others(){return [];}
  takeEvents(){const e=this.events;this.events=[];return e;}
}

export class TrialEvent extends Solo{
  get kind(){return 'trial';}
  constructor(level,car,{laps=5,ghost=null,medals=null}={}){
    super(level,car);this.laps=laps;this.medals=medals;this.cross=0;this.lapT0=0;this.times=[];this.best=0;this.last=0;this.lastS=null;
    this.rec=new GhostRecorder();this.bestRec=null;this.setGhost(ghost);this.layout=wheelLayout(car.c);this.reset=false;}
  setGhost(g){this.ghost=g?new Ghost(g):null;this.gs=null;
    /* where along the lap the ghost was at each sample, for the live split */
    if(this.ghost){const T=this.T,n=this.ghost.n,gs=new Float32Array(n);let hint=-1;
      for(let i=0;i<n;i++){const P=this.ghost.pose(i/this.ghost.g.hz),L=T.locate(P.p[0],P.p[2],hint);if(L){hint=L.i;gs[i]=L.s;}else gs[i]=i?gs[i-1]:0;}
      for(let i=1;i<n;i++)if(gs[i]<gs[i-1]-T.len/2)gs[i]+=T.len;this.gs=gs;}}
  ghostTimeAt(s){const g=this.gs;if(!g)return null;let lo=0,hi=g.length-1;if(s<=g[0])return 0;if(s>=g[hi])return this.ghost.time;
    while(hi-lo>1){const m=(lo+hi)>>1;if(g[m]<s)lo=m;else hi=m;}const f=(s-g[lo])/Math.max(1e-6,g[hi]-g[lo]);return (lo+f)/this.ghost.g.hz;}
  update(dt,time){
    if(this.countdown(dt,time))this.lapT0=time;
    const car=this.car,loc=car.loc;if(!loc||this.phase!=='run')return;const T=this.T,s=loc.s;
    if(this.lastS!==null&&this.lastS>T.len-40&&s<40){
      const tc=time-s/Math.max(car.vf,1);
      if(this.cross>0&&!this.reset){const lt=tc-this.lapT0;this.times.push(lt);this.last=lt;
        const pb=!this.best||lt<this.best;if(pb){this.best=lt;this.bestRec=this.rec.take(lt);this.setGhost(this.bestRec);}
        this.events.push({type:'lap',t:lt,best:pb});}
      this.cross++;this.lapT0=tc;this.rec.reset();this.reset=false;
      if(this.times.length>=this.laps){this.phase='done';this.done=true;}}
    else if(this.lastS!==null&&this.lastS<40&&s>T.len-40&&this.cross>0)this.reset=true;   /* backwards over the line */
    this.lastS=s;
    if(this.cross>0)this.rec.add(time-this.lapT0,car);
    this.ghostClock=this.cross>0?time-this.lapT0:0;
  }
  invalidate(){this.reset=true;this.events.push({type:'msg',text:'LAP INVALID'});}
  hud(time){const s=this.car.loc?this.car.loc.s:0,lt=this.phase==='run'&&this.cross>0?time-this.lapT0:0,gt=this.cross>0?this.ghostTimeAt(s):null;
    return {trial:true,lap:Math.max(1,Math.min(this.laps,this.times.length+1)),laps:this.laps,lapT:lt,best:this.best,last:this.last,lights:this.phase==='countdown'?this.lights:0,
      go:this.phase==='run'&&time-this.goT<1.5,delta:gt!==null&&lt>2?lt-gt:null,medals:this.medals,invalid:this.reset};}
  views(){if(!this.ghost||this.phase!=='run'||this.cross===0||this.ghostClock>this.ghost.time+1)return [];return [this.ghost.viewAt(this.ghostClock,this.layout,null)];}
  rank(){const m=this.medals,b=this.best;if(!m||!b)return 0;return b<=m[0]?1:b<=m[1]?2:b<=m[2]?3:0;}
  result(){const r=this.rank();return {rank:r,medal:['','GOLD','SILVER','BRONZE'][r],stat:{best:this.best||null},title:'TIME TRIAL',
    rows:this.times.map((t,i)=>`Lap ${i+1}   ${fmt(t)}${t===this.best?'   best':''}`),summary:`Best lap ${fmt(this.best)}`,ghost:this.bestRec};}
}

export class DriftEvent extends Solo{
  get kind(){return 'drift';}
  constructor(level,car,{time=90,targets=null}={}){
    super(level,car);this.time=time;this.targets=targets;this.left=time;
    const T=this.T;this.score=new DriftScore({wallDist:c=>{const L=c.loc;if(!L)return 99;return Math.min(T.wl-L.d,T.wr+L.d)-1.0;}});}
  update(dt,time,ctx){
    this.countdown(dt,time);if(this.phase!=='run')return;
    this.left=Math.max(0,this.time-(time-this.goT));
    this.score.update(dt,this.car,ctx&&ctx.ev);
    for(const m of this.score.takeMessages())this.events.push({type:'drift',m});
    if(this.left<=0){this.score.bank();for(const m of this.score.takeMessages())this.events.push({type:'drift',m});this.phase='done';this.done=true;}
  }
  hud(time){return Object.assign({drift:true,timeLeft:this.left,targets:this.targets,lights:this.phase==='countdown'?this.lights:0,go:this.phase==='run'&&time-this.goT<1.5},this.score.hud());}
  rank(){const t=this.targets,s=this.score.total;if(!t)return 0;return s>=t[0]?1:s>=t[1]?2:s>=t[2]?3:0;}
  result(){const S=this.score,r=this.rank();return {rank:r,medal:['','GOLD','SILVER','BRONZE'][r],stat:{score:Math.round(S.total)},title:'DRIFT',
    rows:[`Score   ${Math.round(S.total).toLocaleString()}`,`Best chain   ${Math.round(S.best).toLocaleString()}`,`Lost to walls and spins   ${Math.round(S.lost).toLocaleString()}`],summary:`${Math.round(S.total).toLocaleString()} points`};}
}
