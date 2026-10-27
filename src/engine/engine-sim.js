/* =====================================================================================
   ENGINE + DRIVETRAIN SIM — runs on the main thread (the game will own this part), feeding
   the synth its rpm, load, boost and ignition cuts. Layouts carry real firing orders: the
   crank angle of each exhaust pulse over a 720 degree cycle and which bank of pipe it feeds.
   ===================================================================================== */
export const SIM=(()=>{
'use strict';
const TAU=Math.PI*2,G0=9.81,clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const steps=(n,d)=>Array.from({length:n},(_,i)=>i*d);
const alt=n=>Array.from({length:n},(_,i)=>i&1);

/* fire: crank angle of each exhaust pulse (of 720). bank: which pipe it feeds. order: the cylinder
   (or rotor) firing at that angle. split: extra primary length on bank B (m). dual: separate tailpipes */
const LAYOUTS={
  I3:  {name:'Inline 3',fam:'Inline',fire:[0,240,480],bank:[0,1,0],order:[1,2,3],split:.06,dual:0,
        note:'Three pulses every two turns. The off-beat thrum comes from the 240 degree gaps.'},
  I4:  {name:'Inline 4',fam:'Inline',fire:steps(4,180),bank:[0,1,0,1],order:[1,3,4,2],amp:[1,.97,1.02,.98],split:.06,dual:0,
        note:'Even 180 degree firing into a 4-2-1 manifold. Bright and buzzy, sings at high rpm.'},
  I5:  {name:'Inline 5',fam:'Inline',fire:steps(5,144),bank:[0,1,0,1,0],order:[1,2,4,5,3],amp:[1,.93,1.05,.96,1.03],split:.1,dual:0,
        note:'An odd number of cylinders into one collector: the pulses never line up, so it warbles.'},
  I6:  {name:'Inline 6',fam:'Inline',fire:steps(6,120),bank:alt(6),order:[1,5,3,6,2,4],split:.04,dual:0,
        note:'Perfectly balanced, front three and back three into separate scrolls. Smooth and silky.'},
  I8:  {name:'Inline 8',fam:'Inline',fire:steps(8,90),bank:[0,1,0,1,1,0,1,0],order:[1,6,2,5,8,3,7,4],split:.05,dual:0,
        note:'The straight-eight: V8 firing frequency, but the front and rear groups fire unevenly.'},
  V6:  {name:'V6 · 60° even-fire',fam:'V',fire:steps(6,120),bank:alt(6),order:[1,2,3,4,5,6],split:.08,dual:1,
        note:'Each bank fires every 240 degrees, like two inline threes woven together.'},
  V6O: {name:'V6 · 90° odd-fire',fam:'V',fire:[0,90,240,330,480,570],bank:alt(6),order:[1,6,5,4,3,2],split:.1,dual:1,
        note:'Gaps of 90 and 150 degrees. The engine gallops at idle.'},
  V8:  {name:'V8 · cross-plane',fam:'V',fire:steps(8,90),bank:[0,1,1,0,1,0,0,1],order:[1,8,4,3,6,5,7,2],amp:[1,.94,.97,.95,1,.93,.98,.96],split:.12,dual:1,
        note:'Each bank fires unevenly (90, 180 and 270 degree gaps). That is the burble.'},
  V8F: {name:'V8 · flat-plane',fam:'V',fire:steps(8,90),bank:alt(8),order:[1,5,3,7,4,8,2,6],split:.05,dual:1,
        note:'Banks alternate, so each fires evenly every 180 degrees: two inline fours that scream.'},
  V10: {name:'V10 · even-fire',fam:'V',fire:steps(10,72),bank:alt(10),order:[1,6,5,10,2,7,3,8,4,9],split:.06,dual:1,
        note:'Ten pulses per cycle, each bank firing every 144 degrees like an inline five. A raw, hard-edged howl.'},
  V10O:{name:'V10 · odd-fire',fam:'V',fire:[0,90,144,234,288,378,432,522,576,666],bank:alt(10),order:[1,6,5,10,2,7,3,8,4,9],split:.08,dual:1,
        note:'A 90 degree V10 on a shared crankpin: gaps of 54 and 90 degrees give it a rasping edge.'},
  V12: {name:'V12 · 60°',fam:'V',fire:steps(12,60),bank:alt(12),order:[1,7,5,11,3,9,6,12,2,8,4,10],split:.04,dual:1,ch:{scatter:.12},
        note:'Two inline sixes fired alternately. Silky at low revs, a shriek at the top.'},
  F4:  {name:'Flat 4 · boxer',fam:'Flat',fire:steps(4,180),bank:[0,0,1,1],order:[1,3,2,4],split:.55,rumble:1,dual:0,
        note:'Unequal-length headers: one side fires twice, then the other. The rumble.'},
  F6:  {name:'Flat 6',fam:'Flat',fire:steps(6,120),bank:alt(6),order:[1,6,2,4,3,5],split:.05,dual:1,
        note:'Opposed sixes, banks alternating. Mechanical, metallic and hard-edged near the redline.'},
  R2:  {name:'Rotary · 2 rotor',fam:'Rotary',rotary:1,fire:steps(4,180),bank:[0,1,0,1],order:['R1','R2','R1','R2'],split:.05,dual:0,ch:{tr:.55,td:1.7,scatter:.24,rasp:1.9,bright:1.25,lope:.02},
        note:'Each rotor fires once per shaft turn through a port that opens all at once: long, harsh pulses.'},
  R3:  {name:'Rotary · 3 rotor',fam:'Rotary',rotary:1,fire:steps(6,120),bank:[0,1,0,0,1,0],order:['R1','R2','R3','R1','R2','R3'],split:.05,dual:0,ch:{tr:.55,td:1.7,scatter:.22,rasp:1.9,bright:1.3,lope:.015},
        note:'Three rotors, six pulses per cycle into two pipes. The high, piercing shriek of a racing rotary.'}
};
const LAYOUT_IDS=Object.keys(LAYOUTS);
const CAM_LOPE=[0,.012,.032,.065];
const EXHAUSTS=['Stock muffler','Cat-back','Headers','Straight pipe','Open headers'];
const INTAKES=['Airbox','Cold air','Ram air','Individual throttles'];
const CAMS=['Stock','Street','Race','Wild'];
const INDUCTION={none:'Natural',turbo:'Turbo',twin:'Twin turbo',roots:'Roots blower',screw:'Screw blower',cent:'Centrifugal'};
const NOS_SHOTS=[0,35,75,125,250];
const GEARS6=[3.13,2.1,1.58,1.25,1.03,.86],GEARS6R=[2.9,2.1,1.66,1.37,1.16,1.0],GEARS7=[3.0,2.4,1.98,1.68,1.45,1.27,1.12],GEARS4=[2.7,1.75,1.3,1.0];

/* turbo sizes: spool window (fraction of redline) and lag */
const TURBO_SIZE=[{n:'Small',s0:.32,s1:.48,lag:.24},{n:'Medium',s0:.4,s1:.6,lag:.36},{n:'Large',s0:.48,s1:.7,lag:.55}];

const PRESETS=[
  {id:'street4',name:'Street Four',tag:'2.0 L inline-4, stock',layout:'I4',disp:2.0,redline:7200,idle:850,tq:205,cP:.6,cW:.48,cA:.45,Ie:.13,ex:0,intake:0,cam:0,crackle:.15,limiter:'soft',mass:1180,drv:'RWD'},
  {id:'screamer',name:'Ten-Grand Four',tag:'2.0 L inline-4, throttle bodies, 9,400 rpm',layout:'I4',disp:2.0,redline:9400,idle:1150,tq:232,cP:.8,cW:.42,cA:.42,Ie:.085,ex:3,intake:3,cam:3,crackle:.55,seq:1,gearWhine:1,limiter:'hard',mass:980,drv:'RWD'},
  {id:'three',name:'Pocket Three',tag:'1.6 L inline-3, turbo',layout:'I3',disp:1.6,redline:7200,idle:900,tq:190,cP:.55,cW:.5,cA:.5,Ie:.11,fi:'turbo',boost:1.25,tsize:0,bov:'flutter',ex:2,intake:1,cam:1,crackle:.6,mass:1180,drv:'FWD'},
  {id:'five',name:'Group B Five',tag:'2.1 L inline-5, turbo, anti-lag',layout:'I5',disp:2.1,redline:8000,idle:950,tq:235,cP:.62,cW:.45,cA:.42,Ie:.13,fi:'turbo',boost:1.6,tsize:1,antilag:1,bov:'valve',ex:3,intake:2,cam:2,crackle:.9,launch:1,launchRpm:5500,mass:1100,drv:'AWD'},
  {id:'six',name:'Big-Turbo Six',tag:'3.0 L inline-6, single turbo, 75-shot',layout:'I6',disp:3.0,redline:7600,idle:850,tq:300,cP:.58,cW:.5,cA:.5,Ie:.17,fi:'turbo',boost:1.4,tsize:2,bov:'flutter',ex:3,intake:1,cam:1,crackle:.4,nos:2,mass:1450,drv:'RWD'},
  {id:'eight',name:'Blown Straight-Eight',tag:'4.0 L inline-8, roots blower, 1930s Grand Prix',layout:'I8',disp:4.0,redline:6200,idle:650,tq:430,cP:.6,cW:.55,cA:.55,Ie:.24,fi:'roots',boost:.85,ex:4,intake:0,cam:1,crackle:.65,gearWhine:1,mass:1050,drv:'RWD',mu:.95,gears:GEARS4},
  {id:'oddv6',name:'Odd-Fire V6',tag:'3.8 L 90-degree V6, odd-firing crank',layout:'V6O',disp:3.8,redline:5800,idle:700,tq:350,cP:.5,cW:.5,cA:.6,Ie:.22,ex:3,intake:0,cam:2,crackle:.3,mass:1500,drv:'RWD'},
  {id:'v6tt',name:'Twin-Turbo V6',tag:'3.5 L 60-degree V6, twin turbos',layout:'V6',disp:3.5,redline:7600,idle:850,tq:340,cP:.6,cW:.48,cA:.5,Ie:.15,fi:'twin',boost:1.2,tsize:0,bov:'valve',ex:2,intake:1,cam:1,crackle:.5,seq:1,mass:1550,drv:'AWD'},
  {id:'muscle',name:'Lumpy-Cam V8',tag:'6.2 L cross-plane V8, big cam',layout:'V8',disp:6.2,redline:6800,idle:780,tq:640,cP:.6,cW:.5,cA:.55,Ie:.27,ex:3,intake:1,cam:3,crackle:.5,limiter:'hard',mass:1650,drv:'RWD'},
  {id:'blown',name:'Blown Big-Block',tag:'8.2 L V8, roots blower, 125-shot',layout:'V8',disp:8.2,redline:7200,idle:900,tq:780,cP:.55,cW:.55,cA:.6,Ie:.32,fi:'roots',boost:.9,ex:4,intake:2,cam:3,crackle:.6,nos:3,launch:1,launchRpm:4800,limiter:'hard',mass:1500,drv:'RWD',mu:1.45},
  {id:'flatplane',name:'Flat-Plane V8',tag:'4.5 L flat-plane V8, 9,000 rpm',layout:'V8F',disp:4.5,redline:9000,idle:1000,tq:540,cP:.72,cW:.45,cA:.5,Ie:.16,ex:2,intake:2,cam:2,crackle:.35,seq:1,mass:1450,drv:'RWD'},
  {id:'v10',name:'V10 Supercar',tag:'5.2 L V10, even-firing, 8,700 rpm',layout:'V10',disp:5.2,redline:8700,idle:950,tq:560,cP:.75,cW:.45,cA:.5,Ie:.17,ex:2,intake:1,cam:2,crackle:.45,seq:1,mass:1550,drv:'AWD'},
  {id:'gp',name:'Grand Prix V10',tag:'3.0 L V10, 19,000 rpm',layout:'V10',disp:3.0,redline:19000,idle:4200,tq:345,cP:.82,cW:.34,cA:.42,Ie:.022,ex:4,intake:3,cam:3,crackle:.25,seq:1,gearWhine:1,limiter:'hard',mass:610,drv:'RWD',cdA:1.0,mu:1.8,gears:GEARS7},
  {id:'v12',name:'V12 Grand Tourer',tag:'6.5 L V12, 8,900 rpm',layout:'V12',disp:6.5,redline:8900,idle:900,tq:720,cP:.72,cW:.48,cA:.5,Ie:.2,ex:2,intake:1,cam:2,crackle:.35,seq:1,mass:1650,drv:'RWD'},
  {id:'boxer',name:'Boxer Rally',tag:'2.0 L flat-4, turbo, anti-lag',layout:'F4',disp:2.0,redline:7800,idle:950,tq:225,cP:.6,cW:.46,cA:.45,Ie:.12,fi:'turbo',boost:1.3,tsize:1,antilag:1,bov:'valve',ex:2,intake:1,cam:1,crackle:.7,seq:1,gearWhine:1,launch:1,launchRpm:5200,mass:1230,drv:'AWD'},
  {id:'flat6',name:'Flat-Six Wail',tag:'4.0 L flat-6, 9,000 rpm',layout:'F6',disp:4.0,redline:9000,idle:950,tq:470,cP:.74,cW:.45,cA:.5,Ie:.15,ex:2,intake:2,cam:2,crackle:.3,seq:1,mass:1420,drv:'RWD'},
  {id:'rotary2',name:'Bridge-Port Twin Rotor',tag:'1.3 L two-rotor, bridge port',layout:'R2',disp:1.3,redline:9200,idle:1300,tq:215,cP:.7,cW:.45,cA:.45,Ie:.08,ex:3,intake:1,cam:3,crackle:.75,mass:1150,drv:'RWD'},
  {id:'rotary3',name:'Three-Rotor Shriek',tag:'2.6 L three-rotor, peripheral ports',layout:'R3',disp:2.6,redline:9500,idle:1400,tq:340,cP:.78,cW:.42,cA:.42,Ie:.1,ex:4,intake:3,cam:3,crackle:.5,seq:1,gearWhine:1,mass:900,drv:'RWD',mu:1.6}
];
const DEFAULTS={fi:'none',boost:1,tsize:1,antilag:0,bov:'valve',ex:1,intake:0,cam:0,crackle:.3,seq:0,gearWhine:0,nos:0,launch:0,launchRpm:5000,limiter:'hard',mass:1350,drv:'RWD',cdA:.68,mu:1.15};

/* fill in a full engine spec from a preset plus any edits */
function makeSpec(base){
  const e=Object.assign({},DEFAULTS,base),L=LAYOUTS[e.layout];
  e.cyl=L.fire.length;e.rotary=!!L.rotary;e.limiterRpm=Math.round(e.redline*1.022+40);
  e.ch=Object.assign({tr:1,td:1,scatter:.18,rasp:1,bright:1,lope:0},L.ch||{});
  e.turbo=e.fi==='turbo'||e.fi==='twin';e.sup=['roots','screw','cent'].includes(e.fi)?e.fi:'';
  const ts=TURBO_SIZE[e.tsize|0];e.s0=e.redline*ts.s0;e.s1=e.redline*ts.s1;e.lag=ts.lag*(e.fi==='twin'?.8:1);
  e.fiBoost=e.fi==='none'?0:e.boost;
  e.nosKw=[0,26,56,93,186][e.nos|0];e.nosT=8;
  e.resp=[1,1.1,1.25,1.7][e.intake|0];
  e.gears=(e.gears||(e.seq?GEARS6R:GEARS6)).slice();e.nG=e.gears.length;
  e.shiftT=e.seq?.06:.3;
  /* gearing: the top gear runs out near a top speed that suits the power */
  e.peak=peakPower(e);
  const vTop=clamp(46+e.peak.hp*.06,62,98);e.R=.33;e.fd=(e.limiterRpm*TAU/60)*e.R/(e.gears[e.nG-1]*vTop);
  e.shiftRpm=e.redline*.99;
  return e;
}
/* crank torque (N m): bell-shaped NA curve x (1 + boost), friction and pumping when off throttle */
function engTq(e,rpm,thr,boost){
  const x=rpm/e.redline;
  const base=e.tq*(e.cA+(1-e.cA)*Math.exp(-Math.pow((x-e.cP)/e.cW,2)));
  const fade=rpm>e.redline?Math.max(0,1-(rpm-e.redline)/(e.redline*.18)):1;
  const wot=base*(1+boost*.62)*fade-(e.sup?e.tq*.03*x:0);
  const fric=e.tq*(.08+.13*x);
  return thr*wot-(1-thr)*fric;
}
function steadyBoost(e,rpm){
  if(!e.fiBoost)return 0;
  if(e.sup==='roots'||e.sup==='screw')return e.fiBoost*Math.pow(Math.min(1,rpm/(e.redline*.38)),.6);
  if(e.sup==='cent')return e.fiBoost*Math.pow(rpm/e.redline,2);
  return e.fiBoost*sstep(e.s0,e.s1,rpm);
}
function peakPower(e){let pk=0,pr=0,tk=0,tr=0;for(let rpm=e.idle;rpm<=e.redline*1.02;rpm+=e.redline/200){const t=engTq(e,rpm,1,steadyBoost(e,rpm)),p=t*rpm*TAU/60;if(p>pk){pk=p;pr=rpm;}if(t>tk){tk=t;tr=rpm;}}return {kw:pk/1000,hp:pk/745.7,rpm:pr,tq:tk,tqRpm:tr};}
function curve(e,n=120){const out=[];for(let i=0;i<=n;i++){const rpm=e.idle+(e.limiterRpm-e.idle)*i/n,b=steadyBoost(e,rpm),t=engTq(e,rpm,1,b);out.push({rpm,tq:t,hp:t*rpm*TAU/60/745.7,boost:b});}return out;}
/* bank firing intervals, for the crank diagram */
function bankIntervals(L){const out=[[],[]];for(const b of [0,1]){const a=L.fire.filter((_,i)=>L.bank[i]===b);for(let i=0;i<a.length;i++)out[b].push(((a[(i+1)%a.length]-a[i])+720)%720||720);}return out;}

/* the synth's configuration for a spec */
function dspCfg(e){
  const L=LAYOUTS[e.layout],n=L.fire.length;
  return {layout:e.layout,ang:L.fire.slice(),bank:L.bank.slice(),amp:L.amp?L.amp.slice():Array.from({length:n},(_,i)=>1+.03*Math.sin(i*2.39+n)),
    ch:e.ch,lope:CAM_LOPE[e.cam|0]+(e.ch.lope||0),split:L.split,dual:L.dual,rumble:L.rumble|0,
    ex:e.ex|0,intake:e.intake|0,disp:e.disp,redline:e.redline,idle:e.idle,turbo:e.turbo?1:0,twin:e.fi==='twin'?1:0,sup:e.sup,fiBoost:e.fiBoost,
    crackle:e.crackle,gearWhine:e.gearWhine|0,seq:e.seq|0,gain:L.fire.length>=10?.85:L.fire.length<=3?1.15:1};
}

/* ---------- the engine and car ---------- */
class EngineSim{
  constructor(spec){this.st='off';this.t=0;this.we=0;this.rpm=0;this.thr=0;this.boost=0;this.gear=0;this.v=0;this.cutT=0;this.cutFrac=0;
    this.shiftT=0;this.shiftTo=0;this.clutch='open';this.engage=0;this.spin=false;this.nos=1;this.nosOn=false;this.thrPrev=0;this.load=0;
    this.twostep=false;this.events=[];this.pos=-40;this.ww=0;this.launching=false;this.launchT=0;this.wHold=0;this.slip=0;this.tc=true;this.tcOn=false;this.jump=false;this.held=false;this.aPrev=0;this.lopeT=0;this.rpmOut=0;this.mode='free';this.auto=true;
    if(spec)this.setSpec(spec);}
  setSpec(e){const keep=this.e;this.e=e;if(keep&&this.gear>e.nG)this.gear=e.nG;}
  start(){if(this.st==='off'||this.st==='stopping'){this.st='crank';this.t=0;this.nos=1;}}
  stop(){if(this.st!=='off')this.st='stopping';}
  get running(){return this.st==='run'||this.st==='catch';}
  shift(dir){
    const e=this.e;if(this.mode!=='drive'||this.shiftT>0||!this.running)return false;
    const to=this.gear+dir;if(to<1||to>e.nG)return false;
    if(this.gear===0){this.gear=to;this.clutch='open';return true;}
    this.shiftTo=to;this.shiftT=e.shiftT;this.clutch='open';this.engage=0;
    if(dir>0&&e.seq&&this.thr>.6)this.events.push({type:'shift'});
    return true;
  }
  /* inp: {thr 0..1, brk 0..1, nos bool} */
  step(dt,inp){
    const e=this.e,idleW=e.idle*TAU/60,limW=e.limiterRpm*TAU/60;this.t+=dt;this.lopeT+=dt;
    this.twostep=false;this.cutFrac=0;let thrIn=clamp(inp.thr||0,0,1);const brk=clamp(inp.brk||0,0,1);
    /* ---- starting and stopping ---- */
    if(this.st==='off'){this.we=0;this.v=Math.max(0,this.v-dt*3);this._out();return;}
    if(this.st==='crank'){this.we=(235+70*Math.sin(this.t*38))*TAU/60;this.thr=0;if(this.t>.8){this.st='catch';this.t=0;}this._out();return;}
    if(this.st==='catch'){const t=this.t;this.we=idleW*(1+.95*Math.sin(Math.min(1,t/.22)*Math.PI/2)*Math.exp(-Math.max(0,t-.22)*2.6));this.load=t<.22?.6:0;
      if(t>1.1)this.st='run';this.rpm=this.we*60/TAU;this._out();return;}
    if(this.st==='stopping')thrIn=0;
    /* ---- throttle body ---- */
    this.thr+=(thrIn-this.thr)*Math.min(1,dt*(thrIn>this.thr?9:14)*e.resp);
    let thr=this.thr,thrSnd=this.thr;const rpm=this.we*60/TAU;
    /* ---- the rev limiter ---- */
    if(this.cutT>0){this.cutT-=dt;thr=0;this.cutFrac=1;}
    else if(e.limiter==='hard'&&rpm>e.limiterRpm){this.cutT=clamp(24/e.cyl*60/rpm*2,.025,.07);thr=0;this.cutFrac=1;}
    else if(e.limiter==='soft'&&rpm>e.limiterRpm-160){const k=clamp((e.limiterRpm-rpm)/160,0,1);thr*=k;this.cutFrac=1-k;}
    /* ---- shifting ---- */
    const drive=this.mode==='drive',R=e.R;
    if(!drive)this.ww=this.v/R;
    if(this.shiftT>0){this.shiftT-=dt;
      if(this.shiftTo>this.gear){if(!(e.seq&&thrIn>.7)){thr=0;thrSnd=0;}else{thr=0;this.cutFrac=1;}}
      else{const tgt=e.gears[this.shiftTo-1]*e.fd*this.ww;thr=Math.max(thr,clamp((tgt-this.we)*.03,0,1));thrSnd=thr;}
      if(this.shiftT<=0){this.gear=this.shiftTo;this.clutch='slip';this.launching=false;this.engage=e.seq?.85:.3;this.engT=e.seq?.05:.18;}}
    /* ---- launch: hold the brake at a standstill, rev against the two-step, let go to launch ---- */
    if(drive&&this.v<.4&&brk>.5){this.held=true;this.clutch='open';this.launching=false;if(this.gear===0)this.gear=1;
      if(e.launch&&rpm>e.launchRpm){thr=0;this.cutFrac=.75;this.twostep=thrIn>.4;}}
    else if(drive&&this.held&&brk<.3)this.held=false;
    if(drive&&this.gear===0&&thrIn>.1&&this.running)this.gear=1;
    /* pulling away: the driver's left foot slips the clutch to hold the revs and lets it go as the car catches up */
    if(drive&&this.clutch==='open'&&!this.held&&this.shiftT<=0&&this.gear>0&&thrIn>.1&&this.running){
      this.clutch='slip';this.launching=this.v<4;this.launchT=0;this.engage=this.launching?.6:.2;this.engT=.25;
      this.wHold=e.launch?e.launchRpm*TAU/60:lerp(idleW*1.4,e.redline*.55*TAU/60,thrIn);}
    /* ---- traction control: cut sparks while the driven tyres spin past their peak (the rally-car stutter) ---- */
    this.tcOn=false;
    if(this.tc&&drive&&this.gear>0&&this.clutch!=='open'&&this.slip>.16&&this.v>.5){const k=clamp((this.slip-.16)*4.5,0,.85);thr*=1-k;this.cutFrac=Math.max(this.cutFrac,k);this.tcOn=k>.05;}
    /* ---- forced induction ---- */
    if(e.turbo){const spool=sstep(e.s0,e.s1,rpm),tgt=thrSnd>.15?e.fiBoost*spool*(.35+.65*thrSnd):e.antilag&&this.running?e.fiBoost*.75*sstep(e.s0*.7,e.s1,rpm):0;
      if(this.boost>.35&&this.thrPrev>.6&&thrIn<.2&&!e.antilag&&e.bov!=='none'){this.events.push({type:'bov',flutter:e.bov==='flutter'});}
      this.boost+=(tgt-this.boost)*Math.min(1,dt*(tgt>this.boost?(.5+1.5*rpm/e.redline)/e.lag:6));}
    else this.boost=steadyBoost(e,rpm)*(thrSnd>.05?1:.2);
    this.thrPrev=thrIn;
    /* ---- torque ---- */
    let Te=engTq(e,Math.max(rpm,1),thr,this.boost);
    this.nosOn=false;
    if(inp.nos&&e.nosKw&&this.nos>0&&thrIn>.5&&this.running&&this.shiftT<=0&&!this.held&&this.cutFrac<.5){this.nosOn=true;this.nos=Math.max(0,this.nos-dt/e.nosT);Te+=Math.min(e.nosKw*1000/Math.max(this.we,150),e.tq*1.6);}
    if(this.st==='run'&&this.we<idleW*1.1&&thr<.3)Te+=Math.max(0,(idleW-this.we)*e.Ie*28);
    /* what the cylinders that do fire are breathing: the limiter drops events, it does not close the throttle */
    const TeS=engTq(e,Math.max(rpm,1),thrSnd,this.boost);
    this.load=this.st==='run'?clamp(thrSnd*(TeS>0?1:0)*(.42+.58*Math.min(1,TeS/e.tq)),0,1):0;
    /* ---- drivetrain: engine, clutch, gearbox, driven wheels with their own speed, tyre slip ---- */
    const m=e.mass,eta=.9,G=drive&&this.gear>0?e.gears[this.gear-1]*e.fd:0,Iw=e.drv==='AWD'?4.8:2.4;
    const drvF=e.drv==='AWD'?1:e.drv==='FWD'?.6-.15*this.aPrev/G0:.56+.18*this.aPrev/G0,Fmax=e.mu*m*G0*clamp(drvF,.35,1);
    /* tyre: force rises with slip to a peak at 12 percent, then falls away to a sliding plateau */
    const vn=Math.max(this.v,3),kap=(this.ww*R-this.v)/vn,KP=.12,sl=kap/KP,as=Math.abs(sl);
    let tf,tdf;if(as<1){tf=sl*(2-as);tdf=2-2*as;}else{tf=Math.sign(sl)*(.82+.18*Math.exp(-(as-1)*.8));tdf=0;}
    const F0=Fmax*tf,K=Fmax*tdf/KP;
    const res=.5*1.2*e.cdA*this.v*this.v+(this.v>.05?.013*m*G0+brk*m*G0*.95:0);
    /* semi-implicit wheel update: the tyre's own stiffness goes into the denominator */
    const wheel=(Tw,J)=>{const dww=dt*(Tw-F0*R)/(J+dt*K*R*R/vn);this.ww+=dww;return F0+K*dww*R/vn;};
    let F=0;
    if(!drive||this.gear===0||this.clutch==='open'){this.we+=dt*Te/e.Ie;F=wheel(0,Iw);}
    else if(this.clutch==='slip'){
      this.engage=Math.min(1,this.engage+dt/Math.max(.03,this.engT||.2));
      const cap=e.tq*(1.6+e.fiBoost*.7)*this.engage,wG=G*this.ww;let Tc;
      const wCar=G*this.v/R;if(this.launching&&wCar>=this.we-15)this.launching=false;
      if(this.launching){this.launchT+=dt;const wT=Math.max(wCar,this.wHold*Math.max(.8,1-.25*this.launchT));Tc=clamp(Te+30*e.Ie*(this.we-wT),0,cap);}
      else{Tc=cap*clamp((this.we-wG)/14,-1,1);if(Tc>0&&this.we<idleW*1.25)Tc=Math.min(Tc,Math.max(0,Te+e.Ie*30*(this.we-idleW*1.05)));}
      this.we+=dt*(Te-Tc)/e.Ie;F=wheel(Tc*G*eta,Iw);
      if(this.engage>=1&&!this.launching&&Math.abs(this.we-G*this.ww)<8){this.clutch='lock';this.launching=false;this.we=G*this.ww;}
      if(this.launching&&this.launchT>3)this.launching=false;
    }else{
      F=wheel(Te*G*eta,Iw+e.Ie*G*G*eta);this.we=G*this.ww;
      if(this.we<idleW*.8&&this.v<6)this.clutch='open';
    }
    if(brk>.1)this.ww+=(this.v/R-this.ww)*Math.min(1,dt*25*brk);
    let dv=(F-res)/(m+2.4/(R*R));
    if(this.held){dv=Math.min(0,dv);this.ww=0;}
    this.v=Math.max(0,this.v+dv*dt);if(this.v<.05&&brk>.1){this.v=0;this.ww=0;}
    this.ww=Math.max(0,this.ww);this.aPrev=dv;this.spin=kap>.2;this.slip=kap;
    if(this.we>limW*1.08)this.we=limW*1.08;
    if(this.st==='stopping'){if(this.we<idleW*.35){this.st='off';this.we=0;}}
    else if(this.we<idleW*.6)this.we=idleW*.6;
    this.rpm=this.we*60/TAU;
    /* ---- the automatic gearbox ---- */
    if(drive&&this.auto&&this.shiftT<=0&&!this.held&&this.gear>0){
      if(this.clutch!=='open'&&!this.launching&&this.gear<e.nG&&this.rpm>e.shiftRpm&&thrIn>.3)this.shift(1);
      else if(this.gear>1){const after=this.rpm*e.gears[this.gear-2]/e.gears[this.gear-1];if(after<e.redline*.86&&(this.rpm<e.redline*.42||(brk>.3&&after<e.redline*.8)))this.shift(-1);}
    }
    if(drive&&this.v<.5&&this.gear>1&&this.shiftT<=0)this.gear=1;
    /* ---- where the car is, for the trackside listener ---- */
    this.pos+=this.v*dt;if(this.pos>170){this.pos=-170;this.jump=true;}
    this._out();
  }
  _out(){
    const e=this.e,w=1-clamp((this.rpm-e.idle)/(e.idle*.9),0,1),lope=CAM_LOPE[e.cam|0]*1.4+(e.ch.lope||0);
    /* lumpy cams hunt at idle: the needle and the sound both bob */
    const mod=this.running&&lope?lope*w*(Math.sin(this.lopeT*TAU*1.55)+.6*Math.sin(this.lopeT*TAU*.62+1.3)):0;
    this.rpmOut=this.st==='off'?0:this.st==='crank'?this.we*60/TAU:this.we*60/TAU*(1+mod);
  }
  /* parameters for the synth. listener: 0 behind the car, 1 in the cabin, 2 trackside */
  params(listener,vol=1){
    const e=this.e;let dist=3,pan=0,rear=1;
    if(listener===1){dist=1.4;rear=.35;}
    else if(listener===2){const y=7;dist=Math.hypot(this.pos,y);pan=clamp(this.pos/dist,-1,1);rear=.5+.5*this.pos/dist;}
    return {on:this.st!=='off'&&this.st!=='crank'?1:0,firing:this.st==='run'||this.st==='catch'?1:0,crank:this.st==='crank'?1:0,crankT:this.st==='crank'?this.t:0,
      rpm:this.rpmOut,load:this.load,cutFrac:this.cutFrac,boost:this.boost,nos:this.nosOn?1:0,speed:this.v,gear:this.gear,twostep:this.twostep?1:0,
      antilag:e.antilag&&e.turbo&&this.thr<.2&&this.running?1:0,view:listener,dist,pan,rear,vol,jump:this._jump()};
  }
  _jump(){const j=this.jump?1:0;this.jump=false;return j;}
  takeEvents(){const ev=this.events;this.events=[];return ev;}
}
return {LAYOUTS,LAYOUT_IDS,PRESETS,DEFAULTS,EXHAUSTS,INTAKES,CAMS,INDUCTION,NOS_SHOTS,TURBO_SIZE,makeSpec,engTq,steadyBoost,curve,bankIntervals,dspCfg,EngineSim,clamp};
})();
